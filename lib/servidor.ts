// Só roda no servidor (rotas /api). O segredo do banco nunca chega ao navegador.
import "server-only";

const URL_SB = process.env.SUPABASE_URL!;
const CHAVE_SB = process.env.SUPABASE_ANON_KEY!;
const SEGREDO = process.env.DB_SEGREDO!;

export async function rpc<T = unknown>(funcao: string, args: Record<string, unknown> = {}): Promise<T> {
  const r = await fetch(`${URL_SB}/rest/v1/rpc/${funcao}`, {
    method: "POST",
    headers: { apikey: CHAVE_SB, Authorization: `Bearer ${CHAVE_SB}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_segredo: SEGREDO, ...args }),
    cache: "no-store",
  });
  const corpo = await r.text();
  if (!r.ok) throw new Error(`Banco (${funcao}): ${corpo.slice(0, 300)}`);
  return (corpo ? JSON.parse(corpo) : null) as T;
}

export function tokenAgenteValido(req: Request): boolean {
  const t = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return !!t && !!process.env.AGENTE_TOKEN && t === process.env.AGENTE_TOKEN;
}

export function erroJson(e: unknown, status = 500) {
  const msg = e instanceof Error ? e.message : String(e);
  return Response.json({ erro: msg }, { status });
}
