import { erroJson, rpc } from "@/lib/servidor";

export async function GET() {
  try {
    return Response.json(await rpc("ext_listar_extracoes", { p_limite: 100 }));
  } catch (e) {
    return erroJson(e);
  }
}
