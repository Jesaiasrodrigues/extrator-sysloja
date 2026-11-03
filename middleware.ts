import { NextRequest, NextResponse } from "next/server";
import { COOKIE, sessaoValida } from "./lib/sessao";

const LIVRES = ["/login", "/api/login", "/api/agente/"]; // o agente usa token próprio

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (LIVRES.some((p) => pathname.startsWith(p)) || pathname.startsWith("/agente/")) return NextResponse.next();
  if (await sessaoValida(req.cookies.get(COOKIE)?.value)) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ erro: "faça login" }, { status: 401 });
  return NextResponse.redirect(new URL("/login", req.url));
}

export const config = { matcher: ["/((?!_next/|favicon.ico).*)"] };
