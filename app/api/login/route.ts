import { COOKIE, criarSessao } from "@/lib/sessao";

export async function POST(req: Request) {
  const { senha } = await req.json().catch(() => ({ senha: "" }));
  if (!process.env.APP_SENHA || senha !== process.env.APP_SENHA) {
    await new Promise((r) => setTimeout(r, 800)); // freia tentativa e erro
    return Response.json({ erro: "Senha incorreta" }, { status: 401 });
  }
  const valor = await criarSessao();
  return new Response(JSON.stringify({ ok: true }), {
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": `${COOKIE}=${valor}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`,
    },
  });
}
