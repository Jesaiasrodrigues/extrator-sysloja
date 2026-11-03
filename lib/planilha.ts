"use client";
// Leitura e geração de planilhas no navegador (SheetJS).
import * as XLSX from "xlsx";
import { Linha, texto } from "./regras";
import { Modulo } from "./modulos";

const MARCA_DATA = "@d:";

/** O agente manda datas como "@d:2024-01-31T00:00:00". */
export function valorReal(v: unknown): unknown {
  if (typeof v === "string" && v.startsWith(MARCA_DATA)) {
    const d = new Date(v.slice(MARCA_DATA.length));
    return Number.isNaN(d.getTime()) ? v.slice(MARCA_DATA.length) : d;
  }
  return v;
}

export function mostrar(v: unknown): string {
  const r = valorReal(v);
  if (r instanceof Date) {
    const p = (n: number) => String(n).padStart(2, "0");
    const hora = r.getHours() || r.getMinutes() ? ` ${p(r.getHours())}:${p(r.getMinutes())}` : "";
    return `${p(r.getDate())}/${p(r.getMonth() + 1)}/${r.getFullYear()}${hora}`;
  }
  if (typeof r === "number") return r.toLocaleString("pt-BR", { maximumFractionDigits: 4 });
  return texto(r);
}

function baixar(blob: Blob, nome: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

const DIA = 86400000;
const BASE_EXCEL = Date.UTC(1899, 11, 30);

/** Data local -> número de série do Excel (o conversor do SheetJS desloca alguns segundos). */
function serialExcel(d: Date): number {
  return (Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()) - BASE_EXCEL) / DIA;
}

function dataDoSerial(n: number): Date {
  const u = new Date(BASE_EXCEL + Math.round(n * DIA / 1000) * 1000);
  return new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate(), u.getUTCHours(), u.getUTCMinutes(), u.getUTCSeconds());
}

function folha(cabecalho: string[], linhas: Linha[], moeda: string[] = []): XLSX.WorkSheet {
  const ws: XLSX.WorkSheet = {};
  cabecalho.forEach((c, j) => (ws[XLSX.utils.encode_cell({ r: 0, c: j })] = { t: "s", v: c }));
  linhas.forEach((l, i) => {
    cabecalho.forEach((c, j) => {
      const v = valorReal(l[c]);
      if (v === null || v === undefined || v === "") return;
      const end = XLSX.utils.encode_cell({ r: i + 1, c: j });
      if (v instanceof Date) {
        const comHora = v.getHours() || v.getMinutes() || v.getSeconds();
        ws[end] = { t: "n", v: serialExcel(v), z: comHora ? "dd/mm/yyyy hh:mm:ss" : "dd/mm/yyyy" };
      }
      else if (typeof v === "number") ws[end] = { t: "n", v, ...(moeda.includes(c) ? { z: "#,##0.00" } : {}) };
      else ws[end] = { t: "s", v: String(v), z: "@" }; // texto: códigos mantêm zeros
    });
  });
  ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(linhas.length, 1), c: Math.max(cabecalho.length - 1, 0) } });
  ws["!cols"] = cabecalho.map(() => ({ wch: 18 }));
  return ws;
}

function escapar(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Mesmo formato do modelo contas.xls (tabela HTML que o Excel abre como .xls). */
function xlsHtml(aba: string, cabecalho: string[], linhas: Linha[]): Blob {
  const cab = cabecalho.map((c) => `<th>${escapar(c)}</th>`).join("");
  const corpo = linhas.map((l) => "<tr>" + cabecalho.map((c) => `<td>${escapar(mostrar(l[c]))}</td>`).join("") + "</tr>").join("");
  const html =
    '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" ' +
    'xmlns="http://www.w3.org/TR/REC-html40"><head><meta name=ProgId content=Excel.Sheet> ' +
    '<meta name=Generator content="Microsoft Excel 11"><meta http-equiv="Content-Type" content="text/html; charset=UTF-8">' +
    `<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>${escapar(aba)}</x:Name>` +
    "<x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->" +
    `<style>br {mso-data-placement: same-cell;}</style></head><body><table><thead><tr>${cab}</tr></thead><tbody>${corpo}</tbody></table></body></html>`;
  return new Blob([html], { type: "application/vnd.ms-excel" });
}

export function carimbo() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

/** Planilha de importação no layout do módulo. */
export function baixarImportacao(m: Modulo, cabecalho: string[], linhas: Linha[], banco: string) {
  const cols = m.colunasArquivo || cabecalho;
  const nome = `Exportacao_${m.prefixo}_${banco.replace(/[^\w-]+/g, "_")}_${carimbo()}`;
  if (m.formato === "xls-html") return baixar(xlsHtml(m.aba, cols, linhas), `${nome}.xls`);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, folha(cols, linhas, m.moeda), m.aba.slice(0, 31));
  baixar(new Blob([XLSX.write(wb, { type: "array", bookType: "xlsx" })]), `${nome}.xlsx`);
}

/** Pendências e linhas removidas, com o motivo, para revisão manual. */
export function baixarPendencias(
  m: Modulo, cabecalho: string[], pendencias: { linha: Linha; motivos: string[] }[],
  removidas: { linha: Linha; motivo: string }[], banco: string,
) {
  const wb = XLSX.utils.book_new();
  const cols = ["MOTIVO", ...cabecalho];
  const p = pendencias.map((x) => ({ MOTIVO: x.motivos.join(" | "), ...x.linha }));
  XLSX.utils.book_append_sheet(wb, folha(cols, p), "Pendencias");
  if (removidas.length) {
    XLSX.utils.book_append_sheet(wb, folha(cols, removidas.map((x) => ({ MOTIVO: x.motivo, ...x.linha }))), "Removidas");
  }
  baixar(new Blob([XLSX.write(wb, { type: "array", bookType: "xlsx" })]), `Pendencias_${m.prefixo}_${banco.replace(/[^\w-]+/g, "_")}_${carimbo()}.xlsx`);
}

/** Lê a primeira aba de uma planilha avulsa (xlsx, xls, xls-html, csv). */
export async function lerPlanilha(arquivo: File): Promise<{ cabecalho: string[]; linhas: Linha[] }> {
  const wb = XLSX.read(await arquivo.arrayBuffer(), { type: "array", cellDates: false, cellNF: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws["!ref"]) return { cabecalho: [], linhas: [] };
  const faixa = XLSX.utils.decode_range(ws["!ref"]);
  const valor = (r: number, c: number): unknown => {
    const cel = ws[XLSX.utils.encode_cell({ r, c })] as XLSX.CellObject | undefined;
    if (!cel || cel.v === undefined || cel.v === "") return null;
    if (cel.t === "n" && cel.z && XLSX.SSF.is_date(String(cel.z))) return `${MARCA_DATA}${isoLocal(dataDoSerial(cel.v as number))}`;
    return cel.v;
  };
  const cabecalho: string[] = [];
  for (let c = faixa.s.c; c <= faixa.e.c; c++) cabecalho.push(texto(valor(faixa.s.r, c)));
  const linhas: Linha[] = [];
  for (let r = faixa.s.r + 1; r <= faixa.e.r; r++) {
    const l: Linha = {};
    let algo = false;
    cabecalho.forEach((nome, j) => {
      const v = valor(r, faixa.s.c + j);
      if (texto(v) !== "") algo = true;
      l[nome] = v;
    });
    if (algo) linhas.push(l);
  }
  return { cabecalho, linhas };
}

function isoLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** Log de erro em texto, csv ou planilha: tudo vira texto, uma linha por registro. */
export async function lerLog(arquivo: File): Promise<string> {
  if (/\.(xlsx|xls|ods)$/i.test(arquivo.name)) {
    const wb = XLSX.read(await arquivo.arrayBuffer(), { type: "array" });
    return wb.SheetNames.map((n) =>
      XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[n], { header: 1, defval: "" })
        .map((l) => l.map(texto).filter(Boolean).join(" | ")).filter(Boolean).join("\n"),
    ).join("\n");
  }
  return arquivo.text();
}
