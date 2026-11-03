import { gunzipSync } from "node:zlib";
import { erroJson, rpc, tokenAgenteValido } from "@/lib/servidor";

export const maxDuration = 60;

// Corpo: JSON {cabecalho, linhas} compactado com gzip. Query: modulo, parte, linhas.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!tokenAgenteValido(req)) return Response.json({ erro: "token inválido" }, { status: 401 });
  try {
    const { id } = await params;
    const url = new URL(req.url);
    const modulo = url.searchParams.get("modulo") || "";
    const parte = Number(url.searchParams.get("parte"));
    const linhas = Number(url.searchParams.get("linhas") || 0);
    if (!/^[a-z_]{2,20}$/.test(modulo) || !Number.isInteger(parte) || parte < 0) {
      return Response.json({ erro: "modulo/parte inválidos" }, { status: 400 });
    }
    const gz = Buffer.from(await req.arrayBuffer());
    const json = JSON.parse(gunzipSync(gz).toString("utf8")); // confere que chegou íntegro
    if (!Array.isArray(json.cabecalho) || !Array.isArray(json.linhas)) {
      return Response.json({ erro: "formato inválido" }, { status: 400 });
    }
    await rpc("ext_salvar_parte", {
      p_extracao: id, p_modulo: modulo, p_parte: parte, p_linhas: linhas || json.linhas.length, p_dados: gz.toString("base64"),
    });
    return Response.json({ ok: true });
  } catch (e) {
    return erroJson(e);
  }
}
