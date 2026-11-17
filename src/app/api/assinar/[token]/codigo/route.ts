// POST /api/assinar/{token}/codigo — manda um código novo para o e-mail do signatário (regra 11.4).
// 200 { ok }; 429 aguarde | limite_hora; 409 indisponivel; 502 email_falhou.
import type { NextRequest } from "next/server";
import { requestMeta } from "@/server/http";
import { requestCode } from "@/server/signing/actions";
import { requireSignatarioPorToken } from "@/server/signing/context";
import { signerErrorResponse } from "@/server/signing/http";

export async function POST(req: NextRequest, ctx: RouteContext<"/api/assinar/[token]/codigo">) {
  const signer = await requireSignatarioPorToken(req, (await ctx.params).token);
  if (signer instanceof Response) return signer;
  try {
    await requestCode(signer, requestMeta(req));
    return Response.json({ ok: true });
  } catch (e) {
    return signerErrorResponse(e);
  }
}
