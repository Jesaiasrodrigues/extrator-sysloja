import { COOKIE, sessaoValida } from "@/lib/sessao";
import { cookies } from "next/headers";

// Arquivo de configuração do agente (só para quem está logado no painel).
export async function GET(req: Request) {
  const jar = await cookies();
  if (!(await sessaoValida(jar.get(COOKIE)?.value))) return Response.json({ erro: "faça login" }, { status: 401 });
  const origem = new URL(req.url).origin;
  const config = { url: origem, token: process.env.AGENTE_TOKEN || "" };
  return new Response(JSON.stringify(config, null, 2), {
    headers: { "Content-Type": "application/json", "Content-Disposition": 'attachment; filename="agente_config.json"' },
  });
}
