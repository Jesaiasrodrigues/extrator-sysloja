"use client";
import { useMemo, useState } from "react";
import { Modulo } from "@/lib/modulos";
import { aplicarRegras, descreverRegra, Linha, RegraSalva } from "@/lib/regras";
import { estatisticas, linhasCitadas, resumirLog } from "@/lib/contexto-ia";
import { lerLog } from "@/lib/planilha";

interface Proposta {
  resumo: string;
  causas: { descricao: string; campo?: string; ocorrencias: number }[];
  regras: { nome: string; descricao: string; regra: RegraSalva["regra"]; substitui_id?: string; erros: string[] }[];
  desativar_ids?: string[];
  acoes_manuais?: string[];
  confianca: string;
  modelo: string;
}

interface Props {
  modulo: Modulo;
  cabecalho: string[];
  linhasExportadas: Linha[];
  regrasModulo: RegraSalva[];
  regrasAplicadas: string[];
  extracaoId?: string;
  onTestar: (regras: RegraSalva[]) => void;
  onAprovado: () => void;
}

const json = { "Content-Type": "application/json" };

export default function FeedbackIA(p: Props) {
  const [modo, setModo] = useState<"" | "ok" | "erro">("");
  const [log, setLog] = useState("");
  const [obs, setObs] = useState("");
  const [ocupado, setOcupado] = useState("");
  const [msg, setMsg] = useState<{ tipo: string; texto: string } | null>(null);
  const [proposta, setProposta] = useState<Proposta | null>(null);
  const [feedbackId, setFeedbackId] = useState("");
  const [marcadas, setMarcadas] = useState<Set<number>>(new Set());
  const [desativar, setDesativar] = useState<Set<string>>(new Set());
  const [testando, setTestando] = useState(false);

  const efeito = useMemo(() => {
    if (!proposta) return [];
    return proposta.regras.map((r) =>
      r.erros.length ? 0 : aplicarRegras(p.linhasExportadas, [{ modulo: p.modulo.chave, nome: r.nome, regra: r.regra }]).porRegra["nova-0"] || 0,
    );
  }, [proposta, p.linhasExportadas, p.modulo.chave]);

  const selecionadas = (): RegraSalva[] =>
    (proposta?.regras || []).filter((_, i) => marcadas.has(i)).map((r) => ({
      modulo: p.modulo.chave, nome: r.nome, descricao: r.descricao, regra: r.regra, status: "ativa", origem: "ia",
    }));

  const confirmarOk = async () => {
    setOcupado("Registrando...");
    const r = await fetch("/api/feedbacks", {
      method: "POST", headers: json,
      body: JSON.stringify({ extracao_id: p.extracaoId, modulo: p.modulo.chave, tipo: "ok", regras_aplicadas: p.regrasAplicadas }),
    });
    setOcupado("");
    setMsg(r.ok
      ? { tipo: "sucesso", texto: `Registrado. ${p.regrasAplicadas.length} regra(s) usada(s) ganharam um acerto.` }
      : { tipo: "falha", texto: (await r.json()).erro });
    setModo("");
  };

  const carregarArquivo = async (f?: File) => {
    if (f) setLog(await lerLog(f));
  };

  const analisar = async () => {
    setMsg(null);
    setProposta(null);
    setOcupado("A IA está lendo o log...");
    const { padroes, totalLinhas } = resumirLog(log);
    const corpo = {
      modulo: p.modulo.chave,
      cabecalho: p.cabecalho,
      totalLinhas: p.linhasExportadas.length,
      estatisticas: estatisticas(p.cabecalho, p.linhasExportadas),
      padroesLog: padroes,
      totalLinhasLog: totalLinhas,
      linhasCitadas: linhasCitadas(log, p.linhasExportadas, p.modulo.colunaChave),
      regrasAtuais: p.regrasModulo.map((r) => ({ id: r.id, nome: r.nome, status: r.status, regra: r.regra, acertos: r.acertos, falhas: r.falhas })),
      observacao: obs,
    };
    try {
      const r = await fetch("/api/ia/analisar", { method: "POST", headers: json, body: JSON.stringify(corpo) });
      const dados = await r.json();
      if (!r.ok) throw new Error(dados.erro);
      setProposta(dados);
      setMarcadas(new Set(dados.regras.map((_: unknown, i: number) => i).filter((i: number) => !dados.regras[i].erros.length)));
      setDesativar(new Set(dados.desativar_ids || []));
      const fb = await fetch("/api/feedbacks", {
        method: "POST", headers: json,
        body: JSON.stringify({
          extracao_id: p.extracaoId, modulo: p.modulo.chave, tipo: "erro", log,
          regras_aplicadas: p.regrasAplicadas,
          diagnostico: { resumo: dados.resumo, causas: dados.causas, confianca: dados.confianca, acoes_manuais: dados.acoes_manuais },
        }),
      });
      if (fb.ok) setFeedbackId((await fb.json()).id);
    } catch (e) {
      setMsg({ tipo: "falha", texto: e instanceof Error ? e.message : String(e) });
    }
    setOcupado("");
  };

  const alternarTeste = () => {
    const novo = !testando;
    setTestando(novo);
    p.onTestar(novo ? selecionadas() : []);
  };

  const aprovar = async () => {
    if (!proposta) return;
    setOcupado("Salvando o aprendizado...");
    try {
      const criadas: string[] = [];
      const paraDesativar = new Set(desativar);
      for (const i of marcadas) {
        const r = proposta.regras[i];
        const resp = await fetch("/api/regras", {
          method: "POST", headers: json,
          body: JSON.stringify({
            modulo: p.modulo.chave, nome: r.nome, descricao: r.descricao, regra: r.regra,
            status: "ativa", origem: "ia", feedback_id: feedbackId, cabecalho: p.cabecalho,
          }),
        });
        const d = await resp.json();
        if (!resp.ok) throw new Error(`${r.nome}: ${d.erro}`);
        criadas.push(d.id);
        if (r.substitui_id) paraDesativar.add(r.substitui_id);
      }
      for (const id of paraDesativar) {
        await fetch("/api/regras", { method: "POST", headers: json, body: JSON.stringify({ id, status: "desativada" }) });
      }
      if (feedbackId) {
        await fetch("/api/feedbacks", { method: "POST", headers: json, body: JSON.stringify({ id: feedbackId, tipo: "erro", regras_criadas: criadas }) });
      }
      p.onTestar([]);
      setTestando(false);
      p.onAprovado();
      setProposta(null);
      setModo("");
      setLog("");
      setMsg({ tipo: "sucesso", texto: `${criadas.length} regra(s) salva(s) e já aplicada(s). Baixe a planilha corrigida e importe de novo; depois diga se deu certo.` });
    } catch (e) {
      setMsg({ tipo: "falha", texto: e instanceof Error ? e.message : String(e) });
    }
    setOcupado("");
  };

  const marcar = (i: number) => {
    const s = new Set(marcadas);
    if (s.has(i)) s.delete(i); else s.add(i);
    setMarcadas(s);
    if (testando) p.onTestar((proposta?.regras || []).filter((_, j) => s.has(j)).map((r) => ({ modulo: p.modulo.chave, nome: r.nome, regra: r.regra })));
  };

  return (
    <div className="caixa">
      <h3>Como foi a importação no sistema?</h3>
      <div className="linha">
        <button className="btn ok" disabled={!!ocupado} onClick={() => setModo("ok")}>✅ Importou sem erro</button>
        <button className="btn erro" disabled={!!ocupado} onClick={() => setModo("erro")}>❌ Deu erro</button>
      </div>

      {modo === "ok" && (
        <div style={{ marginTop: 12 }}>
          <p className="suave">Confirma que a planilha de {p.modulo.nome.toLowerCase()} importou sem erro? As regras usadas ficam mais confiáveis.</p>
          <button className="btn prim" onClick={confirmarOk} disabled={!!ocupado}>Confirmar</button>
        </div>
      )}

      {modo === "erro" && (
        <div style={{ marginTop: 12 }}>
          <p className="suave">Envie o log de erro da importação (arquivo .txt, .csv, .xlsx) ou cole o texto.</p>
          <div className="linha" style={{ marginBottom: 8 }}>
            <input type="file" accept=".txt,.log,.csv,.xlsx,.xls,.json" onChange={(e) => carregarArquivo(e.target.files?.[0])} />
            {log && <span className="suave">{log.split("\n").length.toLocaleString("pt-BR")} linhas no log</span>}
          </div>
          <textarea value={log} onChange={(e) => setLog(e.target.value)} placeholder="Cole o log de erro aqui" />
          <input style={{ width: "100%", marginTop: 8 }} value={obs} onChange={(e) => setObs(e.target.value)}
            placeholder="Observação para a IA (opcional) — ex.: cliente é Simples Nacional / CE" />
          <p><button className="btn prim" disabled={!log.trim() || !!ocupado} onClick={analisar}>Analisar com IA</button></p>
        </div>
      )}

      {ocupado && <p className="suave">{ocupado}</p>}
      {msg && <div className={msg.tipo}>{msg.texto}</div>}

      {proposta && (
        <div style={{ marginTop: 16 }}>
          <h3>Diagnóstico <span className="tag">{proposta.confianca} confiança</span></h3>
          <p>{proposta.resumo}</p>
          {proposta.causas?.length > 0 && (
            <ul>{proposta.causas.map((c, i) => <li key={i}>{c.descricao}{c.campo ? ` (${c.campo})` : ""} — {c.ocorrencias.toLocaleString("pt-BR")} ocorrência(s)</li>)}</ul>
          )}
          {!!proposta.acoes_manuais?.length && (
            <div className="aviso"><strong>Precisa de uma pessoa:</strong><ul style={{ margin: "4px 0 0" }}>{proposta.acoes_manuais.map((a, i) => <li key={i}>{a}</li>)}</ul></div>
          )}
          <h3 style={{ marginTop: 14 }}>Regras propostas</h3>
          {proposta.regras.length === 0 && <p className="suave">Nenhuma regra automática segura para este erro.</p>}
          {proposta.regras.map((r, i) => (
            <label key={i} className="regra" style={{ display: "block", cursor: r.erros.length ? "default" : "pointer" }}>
              <div className="linha">
                <input type="checkbox" checked={marcadas.has(i)} disabled={!!r.erros.length} onChange={() => marcar(i)} />
                <strong>{r.nome}</strong>
                <span className="suave">afeta {efeito[i]?.toLocaleString("pt-BR") ?? 0} linha(s)</span>
                {r.substitui_id && <span className="tag pendente">substitui regra existente</span>}
              </div>
              <div className="suave" style={{ margin: "4px 0" }}>{r.descricao}</div>
              <code>{descreverRegra(r.regra)}</code>
              {r.erros.length > 0 && <div className="falha">Regra inválida: {r.erros.join("; ")}</div>}
            </label>
          ))}
          {[...(proposta.desativar_ids || [])].map((id) => {
            const r = p.regrasModulo.find((x) => x.id === id);
            if (!r) return null;
            return (
              <label key={id} className="regra" style={{ display: "block" }}>
                <input type="checkbox" checked={desativar.has(id)} onChange={() => {
                  const s = new Set(desativar);
                  if (s.has(id)) s.delete(id); else s.add(id);
                  setDesativar(s);
                }} /> Desativar regra <strong>{r.nome}</strong> (a IA acha que ela causou o erro)
              </label>
            );
          })}
          <div className="linha" style={{ marginTop: 10 }}>
            <button className="btn" onClick={alternarTeste} disabled={!marcadas.size}>{testando ? "Parar teste" : "Testar no painel"}</button>
            <button className="btn prim" onClick={aprovar} disabled={(!marcadas.size && !desativar.size) || !!ocupado}>Aprovar e aprender</button>
            <span className="suave">modelo: {proposta.modelo}</span>
          </div>
        </div>
      )}
    </div>
  );
}
