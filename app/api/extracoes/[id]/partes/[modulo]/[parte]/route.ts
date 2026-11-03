import { erroJson, rpc } from "@/lib/servidor";

// Devolve a parte ainda compactada (gzip); o navegador descompacta com DecompressionStream.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; modulo: string; parte: string }> }) {
  try {
    const { id, modulo, parte } = await params;
    const b64 = await rpc<string | null>("ext_obter_parte", { p_id: id, p_modulo: modulo, p_parte: Number(parte) });
    if (!b64) return Response.json({ erro: "parte não encontrada" }, { status: 404 });
    return new Response(Buffer.from(b64, "base64"), {
      headers: { "Content-Type": "application/gzip", "Cache-Control": "private, max-age=86400" },
    });
  } catch (e) {
    return erroJson(e);
  }
}
