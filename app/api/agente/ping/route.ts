import { tokenAgenteValido } from "@/lib/servidor";

export async function GET(req: Request) {
  if (!tokenAgenteValido(req)) return Response.json({ erro: "token inválido" }, { status: 401 });
  return Response.json({ ok: true, versao_minima_agente: "1.0" });
}
