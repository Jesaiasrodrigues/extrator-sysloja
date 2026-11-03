import { COOKIE } from "@/lib/sessao";

export async function POST() {
  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json", "Set-Cookie": `${COOKIE}=; Path=/; Max-Age=0` },
  });
}
