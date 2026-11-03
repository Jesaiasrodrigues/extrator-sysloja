"use client";
import { useState } from "react";

export default function Login() {
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const entrar = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    setErro("");
    const r = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ senha }) });
    setEnviando(false);
    if (r.ok) location.href = "/";
    else setErro((await r.json()).erro || "Falha no login");
  };
  return (
    <form className="caixa login" onSubmit={entrar}>
      <h1>Extrator SysLoja</h1>
      <p className="suave">Conversor de banco com IA que aprende com os erros de importação.</p>
      <input type="password" placeholder="Senha" value={senha} onChange={(e) => setSenha(e.target.value)} style={{ width: "100%" }} autoFocus />
      {erro && <div className="falha">{erro}</div>}
      <p><button className="btn prim" disabled={enviando || !senha} style={{ width: "100%" }}>Entrar</button></p>
    </form>
  );
}
