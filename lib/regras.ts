// Motor de regras declarativas. A IA propõe regras neste formato; nada de código livre é executado.

export type Operador =
  | "vazio" | "preenchido" | "igual" | "diferente" | "em" | "nao_em"
  | "regex" | "nao_regex" | "menor" | "menor_igual" | "maior" | "maior_igual"
  | "tamanho_diferente";

export interface Condicao { campo: string; op: Operador; valor?: unknown }

export type Acao =
  | { tipo: "definir"; campo: string; valor: unknown }
  | { tipo: "copiar"; campo: string; de: string }
  | { tipo: "extrair"; campo: string; de: string; inicio: number; tamanho: number }
  | { tipo: "mapear"; campo: string; mapa: Record<string, string>; padrao?: string }
  | { tipo: "substituir"; campo: string; padrao: string; por: string }
  | { tipo: "so_digitos"; campo: string }
  | { tipo: "completar_zeros"; campo: string; tamanho: number }
  | { tipo: "maiusculo"; campo: string }
  | { tipo: "aparar"; campo: string }
  | { tipo: "cortar"; campo: string; tamanho: number }
  | { tipo: "arredondar"; campo: string; casas: number }
  | { tipo: "pendencia"; motivo: string }
  | { tipo: "remover_linha"; motivo?: string };

export interface DefinicaoRegra { quando: Condicao[]; acoes: Acao[] }

export interface RegraSalva {
  id?: string;
  modulo: string;
  nome: string;
  descricao?: string;
  regra: DefinicaoRegra;
  status?: "ativa" | "pendente" | "desativada";
  origem?: "ia" | "manual";
  acertos?: number;
  falhas?: number;
}

export type Linha = Record<string, unknown>;

export interface ResultadoRegras {
  linhas: Linha[]; // prontas para importar
  pendencias: { linha: Linha; motivos: string[] }[];
  removidas: { linha: Linha; motivo: string }[];
  porRegra: Record<string, number>; // chave da regra -> linhas afetadas
  alteracoes: number; // células modificadas
}

export const OPERADORES: Operador[] = [
  "vazio", "preenchido", "igual", "diferente", "em", "nao_em", "regex", "nao_regex",
  "menor", "menor_igual", "maior", "maior_igual", "tamanho_diferente",
];
export const TIPOS_ACAO = [
  "definir", "copiar", "extrair", "mapear", "substituir", "so_digitos", "completar_zeros",
  "maiusculo", "aparar", "cortar", "arredondar", "pendencia", "remover_linha",
] as const;

export function texto(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString();
  return String(v).trim();
}

export function numero(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const t = texto(v);
  if (!t) return null;
  // aceita 1.234,56 e 1234.56
  const normal = /,\d+$/.test(t) ? t.replace(/\./g, "").replace(",", ".") : t;
  const n = Number(normal);
  return Number.isFinite(n) ? n : null;
}

function lista(v: unknown): string[] {
  return Array.isArray(v) ? v.map(texto) : texto(v).split(",").map((s) => s.trim());
}

function testar(c: Condicao, linha: Linha): boolean {
  const atual = texto(linha[c.campo]);
  switch (c.op) {
    case "vazio": return atual === "";
    case "preenchido": return atual !== "";
    case "igual": return atual.toUpperCase() === texto(c.valor).toUpperCase();
    case "diferente": return atual.toUpperCase() !== texto(c.valor).toUpperCase();
    case "em": return lista(c.valor).map((s) => s.toUpperCase()).includes(atual.toUpperCase());
    case "nao_em": return !lista(c.valor).map((s) => s.toUpperCase()).includes(atual.toUpperCase());
    case "regex": return new RegExp(texto(c.valor), "i").test(atual);
    case "nao_regex": return !new RegExp(texto(c.valor), "i").test(atual);
    case "tamanho_diferente": return atual.length !== Number(c.valor);
    default: {
      const a = numero(linha[c.campo]);
      const b = numero(c.valor);
      if (b === null) return false;
      const x = a ?? 0; // vazio conta como zero
      if (c.op === "menor") return x < b;
      if (c.op === "menor_igual") return x <= b;
      if (c.op === "maior") return x > b;
      if (c.op === "maior_igual") return x >= b;
      return false;
    }
  }
}

function definir(linha: Linha, campo: string, valor: unknown): boolean {
  const antes = linha[campo];
  const novo = valor === "" ? null : valor;
  if (texto(antes) === texto(novo)) return false;
  linha[campo] = novo;
  return true;
}

/** Aplica uma ação; devolve quantas células mudaram, ou um marcador de pendência/remoção. */
function executar(a: Acao, linha: Linha): number | { pendencia: string } | { remover: string } {
  switch (a.tipo) {
    case "definir": return definir(linha, a.campo, a.valor) ? 1 : 0;
    case "copiar": return definir(linha, a.campo, linha[a.de] ?? null) ? 1 : 0;
    case "extrair": {
      const t = texto(linha[a.de]);
      return definir(linha, a.campo, t.substr(a.inicio, a.tamanho)) ? 1 : 0;
    }
    case "mapear": {
      const t = texto(linha[a.campo]);
      const mapa = Object.fromEntries(Object.entries(a.mapa).map(([k, v]) => [k.toUpperCase(), v]));
      const novo = mapa[t.toUpperCase()] ?? (a.padrao !== undefined ? a.padrao : t);
      return definir(linha, a.campo, novo) ? 1 : 0;
    }
    case "substituir":
      return definir(linha, a.campo, texto(linha[a.campo]).replace(new RegExp(a.padrao, "g"), a.por)) ? 1 : 0;
    case "so_digitos": return definir(linha, a.campo, texto(linha[a.campo]).replace(/\D/g, "")) ? 1 : 0;
    case "completar_zeros": {
      const t = texto(linha[a.campo]);
      return t ? (definir(linha, a.campo, t.padStart(a.tamanho, "0")) ? 1 : 0) : 0;
    }
    case "maiusculo": return definir(linha, a.campo, texto(linha[a.campo]).toUpperCase()) ? 1 : 0;
    case "aparar": {
      const v = linha[a.campo];
      return typeof v === "string" ? (definir(linha, a.campo, v.replace(/\s+/g, " ").trim()) ? 1 : 0) : 0;
    }
    case "cortar": {
      const t = texto(linha[a.campo]);
      return t.length > a.tamanho ? (definir(linha, a.campo, t.slice(0, a.tamanho)) ? 1 : 0) : 0;
    }
    case "arredondar": {
      const n = numero(linha[a.campo]);
      if (n === null) return 0;
      const f = 10 ** a.casas;
      return definir(linha, a.campo, Math.round(n * f) / f) ? 1 : 0;
    }
    case "pendencia": return { pendencia: a.motivo };
    case "remover_linha": return { remover: a.motivo || "removida por regra" };
  }
}

export function chaveRegra(r: RegraSalva, i: number): string {
  return r.id || `nova-${i}`;
}

/** Aplica as regras em ordem sobre uma cópia das linhas. */
export function aplicarRegras(linhasOriginais: Linha[], regras: RegraSalva[]): ResultadoRegras {
  const res: ResultadoRegras = { linhas: [], pendencias: [], removidas: [], porRegra: {}, alteracoes: 0 };
  const validas = regras.map((r, i) => ({ r, chave: chaveRegra(r, i) }));
  for (const original of linhasOriginais) {
    const linha: Linha = { ...original };
    const motivos: string[] = [];
    let remover: string | null = null;
    for (const { r, chave } of validas) {
      let casou = false;
      try {
        casou = (r.regra.quando || []).every((c) => testar(c, linha));
      } catch {
        casou = false; // regex inválida não derruba o lote
      }
      if (!casou) continue;
      let afetou = false;
      for (const acao of r.regra.acoes || []) {
        let saida: ReturnType<typeof executar>;
        try {
          saida = executar(acao, linha);
        } catch {
          continue;
        }
        if (typeof saida === "number") {
          res.alteracoes += saida;
          if (saida) afetou = true;
        } else if ("pendencia" in saida) {
          motivos.push(saida.pendencia);
          afetou = true;
        } else {
          remover = saida.remover;
          afetou = true;
        }
      }
      if (afetou) res.porRegra[chave] = (res.porRegra[chave] || 0) + 1;
      if (remover) break;
    }
    if (remover) res.removidas.push({ linha, motivo: remover });
    else if (motivos.length) res.pendencias.push({ linha, motivos });
    else res.linhas.push(linha);
  }
  return res;
}

/** Confere se a regra é segura e usa campos que existem. Devolve a lista de problemas. */
export function validarRegra(def: unknown, cabecalho: string[]): string[] {
  const erros: string[] = [];
  const d = def as DefinicaoRegra;
  if (!d || typeof d !== "object") return ["regra vazia"];
  if (!Array.isArray(d.quando)) erros.push("'quando' deve ser uma lista");
  if (!Array.isArray(d.acoes) || d.acoes.length === 0) erros.push("'acoes' deve ter ao menos uma ação");
  const campos = new Set(cabecalho);
  const checaCampo = (c: unknown, onde: string) => {
    if (typeof c !== "string" || !campos.has(c)) erros.push(`${onde}: campo '${String(c)}' não existe na planilha`);
  };
  const checaRegex = (p: unknown, onde: string) => {
    try { new RegExp(texto(p)); } catch { erros.push(`${onde}: expressão regular inválida`); }
  };
  (d.quando || []).forEach((c, i) => {
    checaCampo(c.campo, `condição ${i + 1}`);
    if (!OPERADORES.includes(c.op)) erros.push(`condição ${i + 1}: operador '${c.op}' desconhecido`);
    if (c.op === "regex" || c.op === "nao_regex") checaRegex(c.valor, `condição ${i + 1}`);
  });
  (d.acoes || []).forEach((a, i) => {
    const onde = `ação ${i + 1}`;
    if (!TIPOS_ACAO.includes(a.tipo as (typeof TIPOS_ACAO)[number])) {
      erros.push(`${onde}: tipo '${(a as { tipo: string }).tipo}' desconhecido`);
      return;
    }
    if ("campo" in a) checaCampo(a.campo, onde);
    if ("de" in a) checaCampo(a.de, onde);
    if (a.tipo === "substituir") checaRegex(a.padrao, onde);
    if (a.tipo === "mapear" && (typeof a.mapa !== "object" || !a.mapa)) erros.push(`${onde}: 'mapa' obrigatório`);
    if ((a.tipo === "completar_zeros" || a.tipo === "cortar") && !(Number(a.tamanho) > 0)) erros.push(`${onde}: 'tamanho' inválido`);
    if (a.tipo === "pendencia" && !texto(a.motivo)) erros.push(`${onde}: 'motivo' obrigatório`);
  });
  return erros;
}

/** Descreve a regra em português, para o usuário revisar antes de aprovar. */
export function descreverRegra(d: DefinicaoRegra): string {
  const cond = (c: Condicao) => {
    const v = Array.isArray(c.valor) ? c.valor.join(", ") : texto(c.valor);
    const ops: Record<Operador, string> = {
      vazio: "está vazio", preenchido: "está preenchido", igual: `= ${v}`, diferente: `≠ ${v}`,
      em: `está em [${v}]`, nao_em: `não está em [${v}]`, regex: `casa com /${v}/`, nao_regex: `não casa com /${v}/`,
      menor: `< ${v}`, menor_igual: `≤ ${v}`, maior: `> ${v}`, maior_igual: `≥ ${v}`, tamanho_diferente: `não tem ${v} caracteres`,
    };
    return `${c.campo} ${ops[c.op] ?? c.op}`;
  };
  const acao = (a: Acao): string => {
    switch (a.tipo) {
      case "definir": return `${a.campo} = "${texto(a.valor)}"`;
      case "copiar": return `${a.campo} ← ${a.de}`;
      case "extrair": return `${a.campo} ← ${a.de}[${a.inicio}..+${a.tamanho}]`;
      case "mapear": return `${a.campo}: ${Object.entries(a.mapa).map(([k, v]) => `${k}→${v}`).join(", ")}`;
      case "substituir": return `${a.campo}: troca /${a.padrao}/ por "${a.por}"`;
      case "so_digitos": return `${a.campo}: só dígitos`;
      case "completar_zeros": return `${a.campo}: zeros à esquerda até ${a.tamanho}`;
      case "maiusculo": return `${a.campo}: maiúsculas`;
      case "aparar": return `${a.campo}: tira espaços extras`;
      case "cortar": return `${a.campo}: máximo ${a.tamanho} caracteres`;
      case "arredondar": return `${a.campo}: ${a.casas} casas`;
      case "pendencia": return `vai para pendências (${a.motivo})`;
      case "remover_linha": return `remove a linha`;
    }
  };
  const se = d.quando?.length ? `Se ${d.quando.map(cond).join(" e ")}` : "Sempre";
  return `${se} → ${(d.acoes || []).map(acao).join("; ")}`;
}
