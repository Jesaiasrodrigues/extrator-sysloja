"use client";
import { useMemo, useState } from "react";
import { Modulo } from "@/lib/modulos";
import { aplicarRegras, chaveRegra, Linha, RegraSalva, texto } from "@/lib/regras";
import { baixarImportacao, baixarPendencias, mostrar } from "@/lib/planilha";
import FeedbackIA from "./FeedbackIA";

interface Props {
  modulo: Modulo;
  cabecalho: string[];
  linhas: Linha[];
  banco: string;
  regras: RegraSalva[];
  extracaoId?: string;
  onRegrasMudaram: () => void;
}

const MAX_TABELA = 300;

export default function PainelModulo({ modulo, cabecalho, linhas, banco, regras, extracaoId, onRegrasMudaram }: Props) {
  const [usarRegras, setUsarRegras] = useState(true);
  const [teste, setTeste] = useState<RegraSalva[]>([]);
  const [visao, setVisao] = useState<"prontas" | "pendencias" | "originais">("prontas");
  const [busca, setBusca] = useState("");

  const regrasModulo = useMemo(() => regras.filter((r) => r.modulo === modulo.chave), [regras, modulo.chave]);
  const ativas = useMemo(() => regrasModulo.filter((r) => r.status === "ativa"), [regrasModulo]);
  const emUso = useMemo(() => [...(usarRegras ? ativas : []), ...teste], [usarRegras, ativas, teste]);
  const res = useMemo(() => aplicarRegras(linhas, emUso), [linhas, emUso]);
  // o que foi (ou seria) importado sem as regras em teste: base para a IA e para medir as propostas
  const semTeste = useMemo(() => (teste.length ? aplicarRegras(linhas, usarRegras ? ativas : []) : res), [teste.length, linhas, usarRegras, ativas, res]);
  const idsAplicados = emUso.map(chaveRegra).filter((k) => semTeste.porRegra[k] && !k.startsWith("nova-"));

  const colunasArquivo = modulo.colunasArquivo || cabecalho;
  const qualidade = useMemo(() => {
    return colunasArquivo
      .map((c) => ({ c, vazios: res.linhas.filter((l) => texto(l[c]) === "").length }))
      .filter((q) => q.vazios > 0 && q.vazios < res.linhas.length) // colunas sempre vazias são do modelo
      .sort((a, b) => b.vazios - a.vazios)
      .slice(0, 10);
  }, [res.linhas, colunasArquivo]);

  const extras = cabecalho.includes("PENDENCIAS")
    ? [
        { n: linhas.filter((l) => texto(l.INATIVO) === "S").length, l: "inativos" },
        { n: linhas.filter((l) => texto(l.PENDENCIAS)).length, l: "com pendência fiscal (extrator)" },
        { n: linhas.filter((l) => texto(l.FISCAL) === "Automático").length, l: "fiscal todo automático" },
      ]
    : [];

  const base: Linha[] =
    visao === "prontas" ? res.linhas
      : visao === "originais" ? linhas
        : [...res.pendencias.map((p) => ({ MOTIVO: p.motivos.join(" | "), ...p.linha })), ...res.removidas.map((r) => ({ MOTIVO: `[removida] ${r.motivo}`, ...r.linha }))];
  const termo = busca.trim().toUpperCase();
  const filtradas = termo ? base.filter((l) => Object.values(l).some((v) => texto(v).toUpperCase().includes(termo))) : base;
  const colunasTabela = visao === "pendencias" ? ["MOTIVO", ...cabecalho] : cabecalho;

  return (
    <>
      <div className="grade" style={{ marginBottom: 16 }}>
        <div className="cartao"><div className="n">{linhas.length.toLocaleString("pt-BR")}</div><div className="l">linhas extraídas</div></div>
        <div className="cartao"><div className="n" style={{ color: "var(--verde)" }}>{res.linhas.length.toLocaleString("pt-BR")}</div><div className="l">prontas para importar</div></div>
        <div className="cartao"><div className="n" style={{ color: "var(--amarelo)" }}>{(res.pendencias.length + res.removidas.length).toLocaleString("pt-BR")}</div><div className="l">pendências / removidas</div></div>
        <div className="cartao"><div className="n" style={{ color: "var(--roxo)" }}>{res.alteracoes.toLocaleString("pt-BR")}</div><div className="l">células corrigidas por {Object.keys(res.porRegra).length} regra(s)</div></div>
        {extras.map((e) => <div className="cartao" key={e.l}><div className="n">{e.n.toLocaleString("pt-BR")}</div><div className="l">{e.l}</div></div>)}
      </div>

      <div className="caixa">
        <div className="linha" style={{ justifyContent: "space-between" }}>
          <div className="linha">
            {modulo.importacao ? (
              <button className="btn prim" onClick={() => baixarImportacao(modulo, cabecalho, res.linhas, banco)}>
                Baixar planilha de importação ({modulo.formato === "xls-html" ? ".xls" : ".xlsx"})
              </button>
            ) : (
              <button className="btn prim" onClick={() => baixarImportacao(modulo, cabecalho, res.linhas, banco)}>Baixar relatório (.xlsx)</button>
            )}
            {(res.pendencias.length > 0 || res.removidas.length > 0) && (
              <button className="btn" onClick={() => baixarPendencias(modulo, cabecalho, res.pendencias, res.removidas, banco)}>Baixar pendências</button>
            )}
          </div>
          <label className="linha suave">
            <input type="checkbox" checked={usarRegras} onChange={(e) => setUsarRegras(e.target.checked)} />
            aplicar {ativas.length} regra(s) aprendida(s)
          </label>
        </div>
        {teste.length > 0 && <div className="aviso">Testando {teste.length} regra(s) proposta(s) pela IA — ainda não salvas.</div>}
      </div>

      {modulo.importacao && (
        <FeedbackIA
          modulo={modulo}
          cabecalho={cabecalho}
          linhasExportadas={semTeste.linhas}
          regrasModulo={regrasModulo}
          regrasAplicadas={idsAplicados}
          extracaoId={extracaoId}
          onTestar={setTeste}
          onAprovado={onRegrasMudaram}
        />
      )}

      {qualidade.length > 0 && (
        <div className="caixa">
          <h3>Colunas com campos vazios</h3>
          <div className="qualidade">
            {qualidade.map((q) => (
              <FragmentoQualidade key={q.c} coluna={q.c} vazios={q.vazios} total={res.linhas.length} />
            ))}
          </div>
        </div>
      )}

      <div className="caixa">
        <div className="linha" style={{ marginBottom: 10 }}>
          <div className="abas" style={{ margin: 0, border: "none" }}>
            {(["prontas", "pendencias", "originais"] as const).map((v) => (
              <button key={v} className={visao === v ? "ativa" : ""} onClick={() => setVisao(v)}>
                {v === "prontas" ? "Prontas" : v === "pendencias" ? "Pendências" : "Como veio do banco"}
              </button>
            ))}
          </div>
          <input placeholder="Buscar..." value={busca} onChange={(e) => setBusca(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
          <span className="suave">{filtradas.length.toLocaleString("pt-BR")} linha(s){filtradas.length > MAX_TABELA ? ` · mostrando ${MAX_TABELA}` : ""}</span>
        </div>
        <div className="tabela">
          <table>
            <thead><tr>{colunasTabela.map((c) => <th key={c}>{c}</th>)}</tr></thead>
            <tbody>
              {filtradas.slice(0, MAX_TABELA).map((l, i) => (
                <tr key={i}>{colunasTabela.map((c) => <td key={c} title={mostrar(l[c])}>{mostrar(l[c])}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function FragmentoQualidade({ coluna, vazios, total }: { coluna: string; vazios: number; total: number }) {
  const pct = total ? (vazios / total) * 100 : 0;
  return (
    <>
      <span>{coluna}</span>
      <div className="barra"><div style={{ width: `${pct}%` }} /></div>
      <span className="suave">{vazios.toLocaleString("pt-BR")}</span>
    </>
  );
}
