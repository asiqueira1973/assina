// Contexto do signatário a partir do link — seções 5, 6.2 e 8.5. O link traz o token em claro;
// o banco tem só o SHA-256 (token_hash). requireSignatarioPorToken() é a primeira linha de toda
// rota /api/assinar/{token}/*: link desconhecido ou de conta suspensa → 404 (como inexistente).
import "server-only";
import type { NextRequest } from "next/server";
import { hashCredential } from "@/server/credentials/api-key";
import { db } from "@/server/db/client";
import type { Database } from "@/server/db/types";
import { signerCookieName, verifySignerSession } from "@/server/auth/signer-session";

type Tables = Database["public"]["Tables"];
export type SignerContext = {
  tokenHash: string;
  signer: Tables["as_signatarios"]["Row"];
  envelope: Tables["as_envelopes"]["Row"];
  sender: { nome: string; email: string; suspensa: boolean };
};

// Resolve o link. Recebe: o token em claro. Devolve: o contexto, ou null se o link não existe.
export async function loadSignerByToken(token: string): Promise<SignerContext | null> {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  const tokenHash = hashCredential(token);
  const { data, error } = await db()
    .from("as_signatarios")
    .select("*, as_envelopes!inner(*), as_contas!inner(nome, email, suspensa_em)")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { as_envelopes: envelope, as_contas: conta, ...signer } = data;
  return { tokenHash, signer, envelope, sender: { nome: conta.nome, email: conta.email, suspensa: !!conta.suspensa_em } };
}

// Seção 20.3 (CSRF): escritas do signatário só com Origin = NEXT_PUBLIC_SITE_URL.
function originAllowed(req: NextRequest): boolean {
  if (req.method === "GET" || req.method === "HEAD") return true;
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  return !!site && req.headers.get("origin") === new URL(site).origin;
}

// Guardião das rotas do signatário. Recebe: requisição e token. Devolve: o contexto (com o jti
// da sessão, se houver) ou uma Response 403/404 pronta.
export async function requireSignatarioPorToken(req: NextRequest, token: string): Promise<(SignerContext & { sessionJti: string | null }) | Response> {
  if (!originAllowed(req)) return Response.json({ codigo: "origem_invalida" }, { status: 403 });
  const ctx = await loadSignerByToken(token);
  if (!ctx || ctx.sender.suspensa) return Response.json({ codigo: "link_invalido" }, { status: 404 });
  const sessionJti = await verifySignerSession(req.cookies.get(signerCookieName(ctx.signer.id))?.value, ctx.signer.id, ctx.tokenHash);
  return { ...ctx, sessionJti };
}
