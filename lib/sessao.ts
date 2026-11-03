// Sessão por cookie assinado (HMAC). Funciona no middleware (edge) e nas rotas.
export const COOKIE = "extrator_sessao";
const DURACAO = 1000 * 60 * 60 * 24 * 30; // 30 dias

async function chave() {
  const segredo = process.env.SESSAO_SEGREDO || "defina-SESSAO_SEGREDO";
  return crypto.subtle.importKey("raw", new TextEncoder().encode(segredo), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}

async function assinar(dado: string) {
  const sig = await crypto.subtle.sign("HMAC", await chave(), new TextEncoder().encode(dado));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/[+/=]/g, (c) => ({ "+": "-", "/": "_", "=": "" })[c]!);
}

export async function criarSessao(): Promise<string> {
  const expira = String(Date.now() + DURACAO);
  return `${expira}.${await assinar(expira)}`;
}

export async function sessaoValida(valor: string | undefined): Promise<boolean> {
  if (!valor) return false;
  const [expira, sig] = valor.split(".");
  if (!expira || !sig || Number(expira) < Date.now()) return false;
  return (await assinar(expira)) === sig;
}
