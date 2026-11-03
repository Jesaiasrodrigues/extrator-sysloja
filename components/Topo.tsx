"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Topo() {
  const caminho = usePathname();
  if (caminho === "/login") return null;
  const sair = async () => {
    await fetch("/api/logout", { method: "POST" });
    location.href = "/login";
  };
  return (
    <header className="topo">
      <strong>Extrator SysLoja</strong>
      <nav>
        <Link href="/">Extrações</Link>
        <Link href="/corrigir">Corrigir planilha</Link>
        <Link href="/regras">Aprendizado</Link>
      </nav>
      <button className="btn peq" onClick={sair}>Sair</button>
    </header>
  );
}
