"use client";
import { useEffect, useState } from "react";
import { MODULOS, POR_CHAVE } from "@/lib/modulos";
import { descreverRegra, RegraSalva } from "@/lib/regras";
import { useRegras } from "@/lib/useRegras";

interface Feedback {
  id: string; criado_em: string; tipo: string; modulo: string; banco?: string;
  diagnostico?: { resumo?: string; acoes_manuais?: string[] }; regras_criadas: string[]; regras_aplicadas: string[];
}

const json = { "Content-Type": "application/json" };

export default function Aprendizado() {
  const { regras, recarregar } = useRegras();
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [editando, setEditando] = useState<string>("");
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState("");

  useEffect(() => {
    fetch("/api/feedbacks").then(async (r) => r.ok && setFeedbacks(await r.json()));
  }, []);

  const salvar = async (corpo: Partial<RegraSalva> & { cabecalho?: string[] }) => {
    setErro("");
    const r = await fetch("/api/regras", { method: "POST", headers: json, body: JSON.stringify(corpo) });
    if (!r.ok) setErro((await r.json()).erro);
    await recarregar();
    return r.ok;
  };

  const excluir = async (r: RegraSalva) => {
    if (!confirm(`Excluir a regra "${r.nome}"? Para só pausar, use Desativar.`)) return;
    await fetch(`/api/regras/${r.id}`, { method: "DELETE" });
    recarregar();
  };

  const salvarEdicao = async (r: RegraSalva) => {
    try {
      const regra = JSON.parse(texto);
      const cab = POR_CHAVE[r.modulo]?.colunasArquivo;
      if (await salvar({ id: r.id, regra, ...(cab ? { cabecalho: cab } : {}) })) setEditando("");
    } catch {
      setErro("JSON inválido");
    }
  };

  const nomeRegra = (id: string) => regras.find((r) => r.id === id)?.nome || "regra excluída";

  return (
    <>
      <h1>Aprendizado</h1>
      <p className="suave">Regras que a IA aprendeu com os logs de erro. Elas rodam em ordem sobre cada extração antes de gerar a planilha.</p>
      {erro && <div className="falha">{erro}</div>}
      {MODULOS.filter((m) => m.importacao).map((m) => {
        const lista = regras.filter((r) => r.modulo === m.chave);
        return (
          <div className="caixa" key={m.chave}>
            <h3>{m.nome} <span className="suave">({lista.length})</span></h3>
            {lista.length === 0 && <p className="suave">Nenhuma regra ainda.</p>}
            {lista.map((r) => (
              <div className="regra" key={r.id}>
                <div className="linha" style={{ justifyContent: "space-between" }}>
                  <div className="linha">
                    <strong>{r.nome}</strong>
                    <span className={`tag ${r.status}`}>{r.status}</span>
                    <span className="suave">✅ {r.acertos ?? 0} · ❌ {r.falhas ?? 0} · {r.origem}</span>
                  </div>
                  <div className="linha">
                    <button className="btn peq" onClick={() => salvar({ id: r.id, status: r.status === "ativa" ? "desativada" : "ativa" })}>
                      {r.status === "ativa" ? "Desativar" : "Ativar"}
                    </button>
                    <button className="btn peq" onClick={() => { setEditando(r.id!); setTexto(JSON.stringify(r.regra, null, 2)); }}>Editar</button>
                    <button className="btn peq" onClick={() => excluir(r)}>Excluir</button>
                  </div>
                </div>
                {r.descricao && <div className="suave" style={{ margin: "4px 0" }}>{r.descricao}</div>}
                <code>{descreverRegra(r.regra)}</code>
                {editando === r.id && (
                  <div style={{ marginTop: 8 }}>
                    <textarea value={texto} onChange={(e) => setTexto(e.target.value)} style={{ minHeight: 200 }} />
                    <div className="linha">
                      <button className="btn prim peq" onClick={() => salvarEdicao(r)}>Salvar</button>
                      <button className="btn peq" onClick={() => setEditando("")}>Cancelar</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        );
      })}

      <h2>Histórico de feedbacks</h2>
      <div className="caixa">
        {feedbacks.length === 0 && <p className="suave">Nenhum feedback ainda.</p>}
        {feedbacks.map((f) => (
          <div className="regra" key={f.id}>
            <div className="linha">
              <span className={`tag ${f.tipo}`}>{f.tipo === "ok" ? "importou ok" : "erro"}</span>
              <span>{POR_CHAVE[f.modulo]?.nome || f.modulo}</span>
              <span className="suave">{f.banco} · {new Date(f.criado_em).toLocaleString("pt-BR")}</span>
            </div>
            {f.diagnostico?.resumo && <p style={{ margin: "6px 0" }}>{f.diagnostico.resumo}</p>}
            {f.regras_criadas?.length > 0 && <div className="suave">Aprendeu: {f.regras_criadas.map(nomeRegra).join(", ")}</div>}
            {f.tipo === "ok" && f.regras_aplicadas?.length > 0 && <div className="suave">Confirmou: {f.regras_aplicadas.map(nomeRegra).join(", ")}</div>}
          </div>
        ))}
      </div>
    </>
  );
}
