import { erroJson, rpc } from "@/lib/servidor";
import { RegraSalva, validarRegra } from "@/lib/regras";

export async function GET() {
  try {
    return Response.json(await rpc("ext_listar_regras"));
  } catch (e) {
    return erroJson(e);
  }
}

// Cria ou atualiza uma regra. Body: RegraSalva (+ cabecalho para validar campos, opcional).
export async function POST(req: Request) {
  try {
    const corpo = (await req.json()) as RegraSalva & { cabecalho?: string[]; feedback_id?: string };
    if (corpo.regra && corpo.cabecalho) {
      const erros = validarRegra(corpo.regra, corpo.cabecalho);
      if (erros.length) return Response.json({ erro: erros.join("; ") }, { status: 400 });
    }
    const { cabecalho: _c, ...regra } = corpo;
    const id = await rpc<string>("ext_salvar_regra", { p_regra: regra });
    return Response.json({ id });
  } catch (e) {
    return erroJson(e);
  }
}
