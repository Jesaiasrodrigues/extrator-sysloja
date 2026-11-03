// Os mesmos módulos do Conversor de banco (exportar_produtos.py).

export interface Modulo {
  chave: string;
  nome: string;
  importacao: boolean; // planilha que vai para o sistema destino (as demais são relatório)
  aba: string; // nome da aba no arquivo gerado
  formato: "xlsx" | "xls-html";
  prefixo: string;
  colunasArquivo?: string[]; // quando definido, só estas colunas vão para o arquivo
  colunaChave: string; // identifica a linha nos logs de erro
  moeda?: string[];
}

export const MODULOS: Modulo[] = [
  {
    chave: "produtos", nome: "Produtos", importacao: true, aba: "Sheet1", formato: "xlsx",
    prefixo: "produtos", colunaChave: "CODIGO",
    colunasArquivo: [
      "CODIGO", "DESCRICAO", "GRUPO", "GTIN", "GTIN_TRIB", "TIPO_PRODUTO", "REFERENCIA", "REFERENCIA2",
      "PRECO_CUSTO", "ALIQ_ICMS_SUB", "FRETE", "ALIQ_IPI_PRC", "OUTRAS_DESPESAS", "PRECO", "COMISSAO",
      "FATOR_COMPRA", "FATOR_TRIB", "UNIDADE_VENDA", "UNIDADE_TRIB", "COMPOSICAO", "CONTROLE_LOTE",
      "BALANCA", "ESTOQUE_NEGATIVO", "PESO_BRUTO", "PESO_LIQUIDO", "QNT_MINIMA", "QNT_MAXIMA", "NCM",
      "CODIGO_CEST", "ORIGEM_ICMS", "ICMS_SAIDA", "REDUCAO", "ALIQ_FCP", "PIS_SAIDA", "COFINS_SAIDA",
      "IPI_SAIDA", "ALIQ_IPI_SAIDA", "ALIQ_PIS_SAIDA", "ALIQ_COFINS_SAIDA", "NATUREZA_RECEITA",
      "CFOP_SAIDA", "PDV_ICMS", "ALIQ_ICMS_PDV", "PDV_PIS", "PDV_COFINS", "ALIQ_PIS_PDV",
      "ALIQ_COFINS_PDV", "PDV_CFOP", "COD_ANVISA", "VR_MAX_CONS", "COD_ANP", "GLP_DERIVADO_PETR",
      "PORC_GAS_NATURAL", "PORC_GAS_IMPORT", "VALOR_PARTIDA", "CODIGO_CTA", "DIFERIMENTO",
      "DESONERACAO", "SALDO", "EXIBIR_TOTEM", "CARACTERISTICAS", "BENEFICIO_FISCAL", "CLASSE_IBS_CBS",
      "ALIQ_EFET_MUN", "ALIQ_IBS_MUN", "REDUCAO_ALIQ_IBS_MUN", "ALIQ_DIF_IBS_MUN", "ALIQ_EFET_UF",
      "ALIQ_IBS_UF", "REDUCAO_ALIQ_IBS_UF", "ALIQ_DIF_IBS_UF", "ALIQ_EFET_CBS", "ALIQ_CBS",
      "REDUCAO_ALIQ_CBS", "ALIQ_DIF_CBS", "REDUCAO_BC_IBS_CBS", "ID", "CADASTRADO_EM", "ATUALIZADO_EM",
      "DELETADO_EM", "GTINS_RELACIONADOS",
    ],
  },
  {
    chave: "pessoas", nome: "Pessoas", importacao: true, aba: "Worksheet", formato: "xlsx",
    prefixo: "pessoas", colunaChave: "Documento", moeda: ["Limite"],
  },
  {
    chave: "contas", nome: "Plano de contas", importacao: true, aba: "Exportação", formato: "xls-html",
    prefixo: "contas", colunaChave: "Nome",
  },
  {
    chave: "cupons", nome: "Cupons fiscais", importacao: false, aba: "Cupons", formato: "xlsx",
    prefixo: "cupons", colunaChave: "NUMERO", moeda: ["VALOR"],
  },
  {
    chave: "prazo", nome: "Vendas a prazo", importacao: false, aba: "Vendas_a_prazo", formato: "xlsx",
    prefixo: "vendas_prazo", colunaChave: "DOCUMENTO",
    moeda: ["VALOR", "VALOR_PAGO", "JUROS", "DESCONTO", "SALDO"],
  },
];

export const POR_CHAVE: Record<string, Modulo> = Object.fromEntries(MODULOS.map((m) => [m.chave, m]));

/** Adivinha o módulo de uma planilha avulsa pelo cabeçalho. */
export function detectarModulo(cabecalho: string[]): string {
  const tem = (c: string) => cabecalho.includes(c);
  if (tem("CODIGO") && tem("DESCRICAO") && tem("NCM")) return "produtos";
  if (tem("Documento") && tem("TipoPessoa")) return "pessoas";
  if (tem("Nome") && tem("Operação")) return "contas";
  if (tem("CHAVE") && tem("EMISSAO")) return "cupons";
  if (tem("DOCUMENTO") && tem("VENCIMENTO")) return "prazo";
  return "produtos";
}
