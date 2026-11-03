import { erroJson, rpc } from "@/lib/servidor";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await rpc("ext_excluir_regra", { p_id: id });
    return Response.json({ ok: true });
  } catch (e) {
    return erroJson(e);
  }
}
