import { erroJson, rpc, tokenAgenteValido } from "@/lib/servidor";

// O agente local abre uma extração e recebe o id para mandar as partes.
export async function POST(req: Request) {
  if (!tokenAgenteValido(req)) return Response.json({ erro: "token inválido" }, { status: 401 });
  try {
    const { banco, maquina, versao } = await req.json();
    if (!banco) return Response.json({ erro: "banco obrigatório" }, { status: 400 });
    const id = await rpc<string>("ext_criar_extracao", {
      p_banco: String(banco).slice(0, 120), p_maquina: String(maquina || "").slice(0, 120), p_versao: String(versao || ""),
    });
    return Response.json({ id });
  } catch (e) {
    return erroJson(e);
  }
}
