import { erroJson, rpc } from "@/lib/servidor";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const dados = await rpc("ext_obter_extracao", { p_id: id });
    if (!dados) return Response.json({ erro: "extração não encontrada" }, { status: 404 });
    return Response.json(dados);
  } catch (e) {
    return erroJson(e);
  }
}
