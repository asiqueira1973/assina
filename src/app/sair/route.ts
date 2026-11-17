// POST /sair — encerra a sessão (seção 6.1). É formulário POST; nunca <Link href="/sair">.
// Confere o Origin (seção 20.3): sem isso, um formulário em outro site derrubaria a sessão de
// quem o visitasse (achado do verifier no 8.1). Apaga o cookie as_sessao e volta para /entrar.
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/server/auth/session";

export async function POST(req: NextRequest) {
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  if (!site || req.headers.get("origin") !== new URL(site).origin) {
    return NextResponse.json({ codigo: "origem_invalida" }, { status: 403 });
  }
  const res = NextResponse.redirect(new URL("/entrar", req.url), 303);
  res.cookies.delete({ name: SESSION_COOKIE, path: "/" });
  return res;
}
