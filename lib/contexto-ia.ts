// Monta um resumo compacto da planilha e do log para mandar à IA (roda no navegador).
import { Linha, texto } from "./regras";

export interface PadraoLog { padrao: string; vezes: number; exemplos: string[] }

/** Agrupa linhas repetidas do log (números viram #): 20 mil erros viram poucos padrões. */
export function resumirLog(log: string, maxPadroes = 60): { padroes: PadraoLog[]; totalLinhas: number } {
  const linhas = log.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const mapa = new Map<string, PadraoLog>();
  for (const l of linhas) {
    const padrao = l.replace(/\d+([.,]\d+)?/g, "#").replace(/\s+/g, " ").slice(0, 300);
    const p = mapa.get(padrao) || { padrao, vezes: 0, exemplos: [] };
    p.vezes++;
    if (p.exemplos.length < 3) p.exemplos.push(l.slice(0, 400));
    mapa.set(padrao, p);
  }
  const padroes = [...mapa.values()].sort((a, b) => b.vezes - a.vezes).slice(0, maxPadroes);
  return { padroes, totalLinhas: linhas.length };
}

/** Linhas da planilha citadas no log (por número de linha do Excel ou pelo código). */
export function linhasCitadas(log: string, linhas: Linha[], colunaChave: string, max = 25): { linhaExcel: number; dados: Linha }[] {
  const achadas = new Map<number, Linha>();
  for (const m of log.matchAll(/linha\s*[:#nº°]*\s*(\d+)/gi)) {
    const n = Number(m[1]);
    const idx = n - 2; // linha 1 do Excel é o cabeçalho
    if (idx >= 0 && idx < linhas.length) achadas.set(n, linhas[idx]);
    if (achadas.size >= max) break;
  }
  if (achadas.size < max) {
    const porChave = new Map<string, number>();
    linhas.forEach((l, i) => {
      const k = texto(l[colunaChave]);
      if (k && !porChave.has(k)) porChave.set(k, i);
    });
    for (const m of log.matchAll(/[A-Za-z0-9./-]{3,}/g)) {
      const i = porChave.get(m[0]);
      if (i !== undefined && !achadas.has(i + 2)) achadas.set(i + 2, linhas[i]);
      if (achadas.size >= max) break;
    }
  }
  return [...achadas.entries()].map(([linhaExcel, dados]) => ({ linhaExcel, dados: enxugar(dados) }));
}

function enxugar(l: Linha): Linha {
  return Object.fromEntries(Object.entries(l).filter(([, v]) => texto(v) !== ""));
}

export interface EstatisticaColuna { coluna: string; vazios: number; exemplos: string[]; distintos: number }

export function estatisticas(cabecalho: string[], linhas: Linha[]): EstatisticaColuna[] {
  return cabecalho.map((coluna) => {
    const valores = new Map<string, number>();
    let vazios = 0;
    for (const l of linhas) {
      const t = texto(l[coluna]);
      if (!t) vazios++;
      else valores.set(t, (valores.get(t) || 0) + 1);
    }
    const exemplos = [...valores.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([v, n]) => `${v.slice(0, 60)} (${n})`);
    return { coluna, vazios, exemplos, distintos: valores.size };
  });
}
