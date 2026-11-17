// POST /api/assinar/{token}/visualizou — a primeira página apareceu na tela (critério 8.5):
// grava "visualizou" uma vez por sessão. Exige sessão. Resposta: { registrado }.
import type { NextRequest } from "next/server";
import { requestMeta } from "@/server/http";
import { recordView } from "@/server/signing/actions";
import { requireSignatarioPorToken } from "@/server/signing/context";
import { noSession, signerErrorResponse } from "@/server/signing/http";

export async function POST(req: NextRequest, ctx: RouteContext<"/api/assinar/[token]/visualizou">) {
  const signer = await requireSignatarioPorToken(req, (await ctx.params).token);
  if (signer instanceof Response) return signer;
  if (!signer.sessionJti) return noSession();
  try {
    return Response.json({ registrado: await recordView(signer, signer.sessionJti, requestMeta(req)) });
  } catch (e) {
    return signerErrorResponse(e);
  }
}
