import { erroJson, rpc } from "@/lib/servidor";

export async function GET() {
  try {
    return Response.json(await rpc("ext_listar_feedbacks", { p_limite: 50 }));
  } catch (e) {
    return erroJson(e);
  }
}

// Body: { extracao_id?, modulo, tipo: 'ok'|'erro', log?, diagnostico?, regras_aplicadas?, regras_criadas? }
export async function POST(req: Request) {
  try {
    const fb = await req.json();
    if (fb.tipo !== "ok" && fb.tipo !== "erro") return Response.json({ erro: "tipo inválido" }, { status: 400 });
    if (typeof fb.log === "string") fb.log = fb.log.slice(0, 200_000);
    if (fb.id && Array.isArray(fb.regras_criadas)) {
      await rpc("ext_atualizar_feedback", { p_id: fb.id, p_regras_criadas: fb.regras_criadas });
      return Response.json({ id: fb.id });
    }
    const id = await rpc<string>("ext_registrar_feedback", { p_fb: fb });
    return Response.json({ id });
  } catch (e) {
    return erroJson(e);
  }
}
