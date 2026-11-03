import { erroJson, rpc, tokenAgenteValido } from "@/lib/servidor";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!tokenAgenteValido(req)) return Response.json({ erro: "token inválido" }, { status: 401 });
  try {
    const { id } = await params;
    const resumo = await req.json().catch(() => ({}));
    await rpc("ext_concluir_extracao", { p_extracao: id, p_resumo: resumo });
    return Response.json({ ok: true, url: `/extracao/${id}` });
  } catch (e) {
    return erroJson(e);
  }
}
