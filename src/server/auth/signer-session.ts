// Sessão do signatário — seção 6.2. Depois do código, cookie as_sig_{signatario_id} com JWT de
// 2 h, HttpOnly, SameSite=Lax e Path=/ (divergência: o spec diz /assinar, mas as rotas ficam em
// /api/assinar e não receberiam o cookie). O JWT leva o token_hash do link: link trocado derruba
// a sessão. Leva também um jti, para o evento "visualizou" sair uma vez por sessão.
import "server-only";
import { randomUUID } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { SESSAO_SIGNATARIO_S } from "@/lib/limits";

export function signerCookieName(signatarioId: string): string {
  return `as_sig_${signatarioId}`;
}

function key(): Uint8Array {
  const raw = process.env.SESSION_SECRET;
  if (!raw || raw.length < 32) throw new Error("SESSION_SECRET ausente ou curto (mín. 32 caracteres)");
  return new TextEncoder().encode(raw);
}

// Abre a sessão. Recebe: signatário e o token_hash atual. Devolve: JWT e opções do cookie.
export async function signSignerSession(signatarioId: string, tokenHash: string) {
  const jwt = await new SignJWT({ sid: signatarioId, th: tokenHash, typ: "signatario" })
    .setProtectedHeader({ alg: "HS256" })
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime(`${SESSAO_SIGNATARIO_S}s`)
    .sign(key());
  return {
    value: jwt,
    options: { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge: SESSAO_SIGNATARIO_S },
  };
}

// Confere a sessão. Recebe: JWT, signatário e token_hash atual. Devolve: o jti, ou null.
export async function verifySignerSession(jwt: string | undefined, signatarioId: string, tokenHash: string): Promise<string | null> {
  if (!jwt) return null;
  try {
    const { payload } = await jwtVerify(jwt, key(), { algorithms: ["HS256"] });
    if (payload.typ !== "signatario" || payload.sid !== signatarioId || payload.th !== tokenHash || typeof payload.jti !== "string") return null;
    return payload.jti;
  } catch {
    return null;
  }
}
