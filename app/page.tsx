"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { POR_CHAVE } from "@/lib/modulos";

interface Extracao {
  id: string; criado_em: string; banco: string; maquina: string; status: string;
  resumo: Record<string, { linhas?: number; erro?: string }>; feedbacks: number;
}

const ROTULO: Record<string, string> = { recebendo: "recebendo", pronta: "pronta", validada: "importou ok", com_erro: "com erro" };

export default function Inicio() {
  const [lista, setLista] = useState<Extracao[] | null>(null);
  const [erro, setErro] = useState("");
  useEffect(() => {
    fetch("/api/extracoes").then(async (r) => (r.ok ? setLista(await r.json()) : setErro((await r.json()).erro)));
  }, []);
  return (
    <>
      <h1>Extrações</h1>
      {erro && <div className="falha">{erro}</div>}
      <div className="caixa">
        {lista === null ? <p className="suave">Carregando...</p> : lista.length === 0 ? (
          <p className="suave">Nenhuma extração ainda. Rode o agente na máquina da loja (passo a passo abaixo) ou use <Link href="/corrigir">Corrigir planilha</Link> com um arquivo já exportado.</p>
        ) : (
          <div className="tabela" style={{ maxHeight: "none" }}>
            <table>
              <thead><tr><th>Quando</th><th>Banco</th><th>Máquina</th><th>Módulos</th><th>Situação</th><th>Feedbacks</th></tr></thead>
              <tbody>
                {lista.map((e) => (
                  <tr key={e.id}>
                    <td><Link href={`/extracao/${e.id}`}>{new Date(e.criado_em).toLocaleString("pt-BR")}</Link></td>
                    <td>{e.banco}</td>
                    <td className="suave">{e.maquina}</td>
                    <td>{Object.entries(e.resumo || {}).map(([k, v]) => `${POR_CHAVE[k]?.nome || k}: ${v.erro ? "erro" : (v.linhas ?? 0).toLocaleString("pt-BR")}`).join(" · ")}</td>
                    <td><span className={`tag ${e.status}`}>{ROTULO[e.status] || e.status}</span></td>
                    <td>{e.feedbacks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <h2>Agente local (máquina da loja)</h2>
      <div className="caixa">
        <p>O agente lê o MySQL do SysLoja com o mesmo código do Conversor de banco e envia o resultado para cá. A correção, o painel e a IA ficam na web.</p>
        <ol>
          <li>Baixe <a href="/agente/agente_web.py" download>agente_web.py</a>, <a href="/agente/agente_web.bat" download>agente_web.bat</a> e o seu <a href="/api/agente/config">agente_config.json</a> (contém o token — não compartilhe).</li>
          <li>Coloque os três arquivos na pasta <code>SYSLOJA_EXTRAIR</code>, junto do <code>exportar_produtos.py</code> e da pasta <code>pacotes</code>.</li>
          <li>Dê dois cliques em <code>agente_web.bat</code>, digite a senha do MySQL e escolha o banco.</li>
          <li>Quando terminar, ele abre esta página na extração nova.</li>
        </ol>
      </div>
    </>
  );
}
