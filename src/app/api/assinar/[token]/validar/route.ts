// POST /api/assinar/{token}/validar — confere o código e abre a sessão do signatário (seção 6.2,
// regra 11.4). Corpo: { codigo }. 200 com o cookie as_sig_{id}; 400 errado (restantes) |
// bloqueado | expirado | sem_codigo; 409 indisponivel.
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { signSignerSession, signerCookieName } from "@/server/auth/signer-session";
import { readJson, requestMeta } from "@/server/http";
import { validateCode } from "@/server/signing/actions";
import { requireSignatarioPorToken } from "@/server/signing/context";
import { signerErrorResponse } from "@/server/signing/http";

const Body = z.object({ codigo: z.string().trim().max(10) });

export async function POST(req: NextRequest, ctx: RouteContext<"/api/assinar/[token]/validar">) {
  const signer = await requireSignatarioPorToken(req, (await ctx.params).token);
  if (signer instanceof Response) return signer;
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) return Response.json({ codigo: "dados_invalidos" }, { status: 400 });
  try {
    await validateCode(signer, parsed.data.codigo, requestMeta(req));
    const session = await signSignerSession(signer.signer.id, signer.tokenHash);
    const res = NextResponse.json({ ok: true });
    res.cookies.set(signerCookieName(signer.signer.id), session.value, session.options);
    return res;
  } catch (e) {
    return signerErrorResponse(e);
  }
}
