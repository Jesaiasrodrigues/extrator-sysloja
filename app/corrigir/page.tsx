"use client";
import { useState } from "react";
import { MODULOS, POR_CHAVE, detectarModulo } from "@/lib/modulos";
import { Linha } from "@/lib/regras";
import { lerPlanilha } from "@/lib/planilha";
import { useRegras } from "@/lib/useRegras";
import PainelModulo from "@/components/PainelModulo";

// Para planilhas já geradas pelo Conversor de banco desktop (sem o agente).
export default function Corrigir() {
  const [arquivo, setArquivo] = useState("");
  const [modulo, setModulo] = useState("produtos");
  const [dados, setDados] = useState<{ cabecalho: string[]; linhas: Linha[] } | null>(null);
  const [erro, setErro] = useState("");
  const { regras, recarregar } = useRegras();

  const abrir = async (f?: File) => {
    if (!f) return;
    setErro("");
    try {
      const d = await lerPlanilha(f);
      if (!d.cabecalho.length) throw new Error("A primeira aba está vazia.");
      setModulo(detectarModulo(d.cabecalho));
      setArquivo(f.name);
      setDados(d);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <>
      <h1>Corrigir planilha</h1>
      <div className="caixa">
        <p className="suave">Abra uma planilha exportada pelo Conversor de banco. As regras aprendidas são aplicadas e você pode mandar o log de erro para a IA.</p>
        <div className="linha">
          <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => abrir(e.target.files?.[0])} />
          {dados && (
            <select value={modulo} onChange={(e) => setModulo(e.target.value)}>
              {MODULOS.filter((m) => m.importacao).map((m) => <option key={m.chave} value={m.chave}>{m.nome}</option>)}
            </select>
          )}
          {arquivo && <span className="suave">{arquivo} · {dados?.linhas.length.toLocaleString("pt-BR")} linhas</span>}
        </div>
        {erro && <div className="falha">{erro}</div>}
      </div>
      {dados && (
        <PainelModulo
          key={`${arquivo}-${modulo}`}
          modulo={POR_CHAVE[modulo]}
          cabecalho={dados.cabecalho}
          linhas={dados.linhas}
          banco={arquivo.replace(/\.[^.]+$/, "").replace(/^Exportacao_\w+?_/, "")}
          regras={regras}
          onRegrasMudaram={recarregar}
        />
      )}
    </>
  );
}
