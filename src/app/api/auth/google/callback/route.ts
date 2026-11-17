// GET /api/auth/google/callback — retorno do Google (seção 6.1, passos 1–6; critérios 8.1).
// 1) confere o state; 2) troca o código (PKCE) e valida o id_token com email_verified;
// 3) aplica as proteções da regra 11.12 sem gravar nada se recusar; 4–5) cria ou atualiza a conta,
// com a chave de API nascendo junto (regra 11.8); 6) abre a sessão e volta para a rota pedida.
// Erros voltam para /entrar?erro=sem_acesso|suspensa|cadastros_pausados|falha.
// Nunca registra e-mail nem token em log (seção 20.2).
import { NextResponse, type NextRequest } from "next/server";
import type { LoginErrorCode } from "@/lib/copy";
import { dailySignupLimit, isEmailAllowed, isEmailBlocked } from "@/server/auth/allowlist";
import { exchangeCode, verifyIdToken } from "@/server/auth/google";
import { OAUTH_COOKIE, OAUTH_COOKIE_PATH, decodeOAuthCookie } from "@/server/auth/oauth-state";
import { SESSION_COOKIE, sessionCookieOptions, signSession } from "@/server/auth/session";
import { generateApiKey } from "@/server/credentials/api-key";
import { accountStatusForGoogle, countAccountsCreatedSince, enterAccount } from "@/server/db/accounts";

// Redireciona para /entrar com o código de erro e apaga o cookie do OAuth.
function fail(req: NextRequest, code: LoginErrorCode) {
  const res = NextResponse.redirect(new URL(`/entrar?erro=${code}`, req.url), 302);
  res.cookies.delete({ name: OAUTH_COOKIE, path: OAUTH_COOKIE_PATH });
  return res;
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const code = params.get("code");
  const state = params.get("state");
  const saved = decodeOAuthCookie(req.cookies.get(OAUTH_COOKIE)?.value);
  if (!code || !state || !saved || state !== saved.state) return fail(req, "falha");

  try {
    const identity = await verifyIdToken(await exchangeCode(code, saved.verifier));
    // Regra 11.12: lista opcional de permitidos e bloqueados; nada é gravado antes disso.
    if (!isEmailAllowed(identity.email) || isEmailBlocked(identity.email)) return fail(req, "sem_acesso");
    // Conta suspensa não entra. Freio de cadastro: conta nova só se o limite das últimas 24 h não
    // foi atingido; quem já tem conta entra sempre.
    const status = await accountStatusForGoogle(identity.sub);
    if (status === "suspensa") return fail(req, "suspensa");
    if (status === "nova") {
      const recent = await countAccountsCreatedSince(new Date(Date.now() - 24 * 3600_000));
      if (recent >= dailySignupLimit()) return fail(req, "cadastros_pausados");
    }

    // A chave só é usada se a conta for nova; o valor em claro não sai desta função.
    const apiKey = generateApiKey();
    const entered = await enterAccount({ sub: identity.sub, email: identity.email, name: identity.name, apiKey });
    if (entered.suspensa) return fail(req, "suspensa");

    const res = NextResponse.redirect(new URL(saved.volta, req.url), 302);
    res.cookies.set(SESSION_COOKIE, await signSession(entered.contaId), sessionCookieOptions());
    res.cookies.delete({ name: OAUTH_COOKIE, path: OAUTH_COOKIE_PATH });
    return res;
  } catch (e) {
    console.error("auth_callback_falhou", e instanceof Error ? e.message : "erro");
    return fail(req, "falha");
  }
}
