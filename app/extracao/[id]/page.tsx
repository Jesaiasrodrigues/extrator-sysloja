"use client";
import { use, useEffect, useState } from "react";
import { MODULOS, POR_CHAVE } from "@/lib/modulos";
import { Linha } from "@/lib/regras";
import { useRegras } from "@/lib/useRegras";
import PainelModulo from "@/components/PainelModulo";

interface Meta {
  id: string; banco: string; maquina: string; criado_em: string; status: string;
  resumo: Record<string, { linhas?: number; erro?: string; aviso?: string }>;
  partes: { modulo: string; parte: number; linhas: number }[];
  feedbacks: { id: string; tipo: string; modulo: string; criado_em: string; diagnostico?: { resumo?: string } }[];
}
interface Dados { cabecalho: string[]; linhas: Linha[] }

async function emLotes<T>(tarefas: (() => Promise<T>)[], limite = 4): Promise<T[]> {
  const saida: T[] = new Array(tarefas.length);
  let i = 0;
  await Promise.all(Array.from({ length: limite }, async () => {
    while (i < tarefas.length) {
      const j = i++;
      saida[j] = await tarefas[j]();
    }
  }));
  return saida;
}

export default function PaginaExtracao({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [dados, setDados] = useState<Record<string, Dados>>({});
  const [aba, setAba] = useState("");
  const [progresso, setProgresso] = useState("");
  const [erro, setErro] = useState("");
  const { regras, recarregar } = useRegras();

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`/api/extracoes/${id}`);
        const m: Meta = await r.json();
        if (!r.ok) throw new Error((m as unknown as { erro: string }).erro);
        setMeta(m);
        const modulos = MODULOS.map((x) => x.chave).filter((k) => m.partes.some((p) => p.modulo === k));
        setAba(modulos[0] || "");
        let feitas = 0;
        const tarefas = m.partes.map((p) => async () => {
          const resp = await fetch(`/api/extracoes/${id}/partes/${p.modulo}/${p.parte}`);
          if (!resp.ok) throw new Error(`Falha ao baixar ${p.modulo} parte ${p.parte}`);
          const fluxo = resp.body!.pipeThrough(new DecompressionStream("gzip"));
          const json = (await new Response(fluxo).json()) as { cabecalho: string[]; linhas: unknown[][] };
          setProgresso(`Baixando dados... ${++feitas}/${m.partes.length}`);
          return { ...p, json };
        });
        const partes = await emLotes(tarefas);
        const junto: Record<string, Dados> = {};
        for (const p of partes.sort((a, b) => a.parte - b.parte)) {
          const d = (junto[p.modulo] ||= { cabecalho: p.json.cabecalho, linhas: [] });
          for (const l of p.json.linhas) d.linhas.push(Object.fromEntries(d.cabecalho.map((c, j) => [c, l[j] ?? null])));
        }
        setDados(junto);
        setProgresso("");
      } catch (e) {
        setErro(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [id]);

  if (erro) return <div className="falha">{erro}</div>;
  if (!meta) return <p className="suave">Carregando...</p>;
  const modulos = MODULOS.filter((m) => dados[m.chave]);
  const atual = POR_CHAVE[aba];

  return (
    <>
      <h1>{meta.banco} <span className={`tag ${meta.status}`}>{meta.status.replace("_", " ")}</span></h1>
      <p className="suave">Extraído em {new Date(meta.criado_em).toLocaleString("pt-BR")} na máquina {meta.maquina || "?"}</p>
      {Object.entries(meta.resumo || {}).filter(([, v]) => v.erro || v.aviso).map(([k, v]) => (
        <div key={k} className={v.erro ? "falha" : "aviso"}>{POR_CHAVE[k]?.nome || k}: {v.erro || v.aviso}</div>
      ))}
      {progresso && <p className="suave">{progresso}</p>}
      {meta.partes.length === 0 && <div className="aviso">Esta extração não tem mais os dados guardados (só as 30 mais recentes ficam).</div>}
      <div className="abas">
        {modulos.map((m) => (
          <button key={m.chave} className={aba === m.chave ? "ativa" : ""} onClick={() => setAba(m.chave)}>
            {m.nome} ({dados[m.chave].linhas.length.toLocaleString("pt-BR")})
          </button>
        ))}
      </div>
      {atual && dados[aba] && (
        <PainelModulo
          key={aba}
          modulo={atual}
          cabecalho={dados[aba].cabecalho}
          linhas={dados[aba].linhas}
          banco={meta.banco}
          regras={regras}
          extracaoId={meta.id}
          onRegrasMudaram={recarregar}
        />
      )}
    </>
  );
}
