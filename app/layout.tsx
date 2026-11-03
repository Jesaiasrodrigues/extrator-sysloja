import "./globals.css";
import type { Metadata } from "next";
import Topo from "@/components/Topo";

export const metadata: Metadata = { title: "Extrator SysLoja", description: "Conversor de banco SysLoja com IA" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <Topo />
        <main className="conteudo">{children}</main>
      </body>
    </html>
  );
}
