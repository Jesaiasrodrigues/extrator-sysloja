import assert from "node:assert/strict";
import { aplicarRegras, descreverRegra, RegraSalva, validarRegra } from "../lib/regras";
import { linhasCitadas, resumirLog } from "../lib/contexto-ia";

const cab = ["CODIGO", "DESCRICAO", "PRECO", "PRECO_CUSTO", "UNIDADE_VENDA", "ICMS_SAIDA", "ORIGEM_ICMS", "TIPO_PRODUTO", "NCM"];
const linhas = [
  { CODIGO: "1", DESCRICAO: "COCA 2L", PRECO: 10, PRECO_CUSTO: 6, UNIDADE_VENDA: null, ICMS_SAIDA: "500", ORIGEM_ICMS: null, TIPO_PRODUTO: "V", NCM: "22021000" },
  { CODIGO: "2", DESCRICAO: "ARROZ", PRECO: 0, PRECO_CUSTO: "3,50", UNIDADE_VENDA: "KG", ICMS_SAIDA: "102", ORIGEM_ICMS: "0", TIPO_PRODUTO: "E", NCM: "1006" },
  { CODIGO: "3", DESCRICAO: "LIXO", PRECO: 5, PRECO_CUSTO: 1, UNIDADE_VENDA: "UN", ICMS_SAIDA: "", ORIGEM_ICMS: null, TIPO_PRODUTO: "P", NCM: "" },
];

const r = (nome: string, regra: RegraSalva["regra"], id?: string): RegraSalva => ({ id, modulo: "produtos", nome, regra });
const regras: RegraSalva[] = [
  r("remove lixo", { quando: [{ campo: "DESCRICAO", op: "igual", valor: "lixo" }], acoes: [{ tipo: "remover_linha", motivo: "teste" }] }, "a"),
  r("origem do ICMS", { quando: [{ campo: "ORIGEM_ICMS", op: "vazio" }, { campo: "ICMS_SAIDA", op: "regex", valor: "^\\d{3}$" }],
    acoes: [{ tipo: "extrair", campo: "ORIGEM_ICMS", de: "ICMS_SAIDA", inicio: 0, tamanho: 1 }] }, "b"),
  r("unidade padrão", { quando: [{ campo: "UNIDADE_VENDA", op: "vazio" }], acoes: [{ tipo: "definir", campo: "UNIDADE_VENDA", valor: "UN" }] }, "c"),
  r("tipo", { quando: [], acoes: [{ tipo: "mapear", campo: "TIPO_PRODUTO", mapa: { V: "P", E: "A", B: "A" } }] }, "d"),
  r("sem preço", { quando: [{ campo: "PRECO", op: "menor_igual", valor: 0 }], acoes: [{ tipo: "pendencia", motivo: "sem preço" }] }, "e"),
  r("ncm 8", { quando: [{ campo: "NCM", op: "preenchido" }], acoes: [{ tipo: "completar_zeros", campo: "NCM", tamanho: 8 }] }, "f"),
];

const res = aplicarRegras(linhas, regras);
assert.equal(res.linhas.length, 1);
assert.equal(res.pendencias.length, 1);
assert.equal(res.removidas.length, 1);
const coca = res.linhas[0];
assert.equal(coca.ORIGEM_ICMS, "5"); // 1º dígito de 500
assert.equal(coca.UNIDADE_VENDA, "UN");
assert.equal(coca.TIPO_PRODUTO, "P");
const arroz = res.pendencias[0];
assert.deepEqual(arroz.motivos, ["sem preço"]);
assert.equal(arroz.linha.TIPO_PRODUTO, "A");
assert.equal(arroz.linha.NCM, "00001006");
assert.equal(linhas[0].ORIGEM_ICMS, null, "não altera as linhas originais");
assert.equal(res.porRegra.b, 1);
assert.equal(res.porRegra.a, 1);

// número em formato brasileiro
const precos = aplicarRegras(linhas, [r("custo", { quando: [{ campo: "PRECO_CUSTO", op: "maior", valor: 3 }], acoes: [{ tipo: "pendencia", motivo: "x" }] })]);
assert.equal(precos.pendencias.length, 2); // 6 e 3,50

// validação
assert.deepEqual(validarRegra(regras[1].regra, cab), []);
assert.ok(validarRegra({ quando: [{ campo: "NAO_EXISTE", op: "vazio" }], acoes: [{ tipo: "definir", campo: "NCM", valor: 1 }] }, cab)[0].includes("NAO_EXISTE"));
assert.ok(validarRegra({ quando: [], acoes: [{ tipo: "eval", campo: "NCM" }] }, cab).length > 0);
assert.ok(validarRegra({ quando: [{ campo: "NCM", op: "regex", valor: "(" }], acoes: [{ tipo: "aparar", campo: "NCM" }] }, cab).length > 0);

// regex inválida não derruba o lote
const quebrada = aplicarRegras(linhas, [r("x", { quando: [{ campo: "NCM", op: "regex", valor: "(" }], acoes: [{ tipo: "remover_linha" }] })]);
assert.equal(quebrada.linhas.length, 3);

assert.match(descreverRegra(regras[1].regra), /ORIGEM_ICMS está vazio/);

// log: 20 mil linhas viram poucos padrões
const log = Array.from({ length: 20000 }, (_, i) => `Linha ${i + 2}: campo ORIGEM_ICMS obrigatório`).join("\n") + "\nLinha 3: preço inválido";
const resumo = resumirLog(log);
assert.equal(resumo.totalLinhas, 20001);
assert.equal(resumo.padroes[0].vezes, 20000);
assert.equal(resumo.padroes.length, 2);
const citadas = linhasCitadas("Linha 3: preço inválido\nproduto 1 sem unidade", linhas, "CODIGO");
assert.equal(citadas[0].linhaExcel, 3);
assert.equal(citadas[0].dados.CODIGO, "2");

console.log("regras: todos os testes passaram");
