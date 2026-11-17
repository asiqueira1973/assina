// POST /api/assinar/{token}/recusar — recusa com motivo (critério 8.5). Exige sessão.
// Corpo: { motivo }. Resposta: { ok }. Erros: 400 motivo_invalido; 409 status_mudou | prazo_encerrado.
import type { NextRequest } from "next/server";
import { z } from "zod";
import { MOTIVO_ENTRADA_MAX } from "@/lib/limits";
import { readJson, requestMeta } from "@/server/http";
import { decline } from "@/server/signing/actions";
import { requireSignatarioPorToken } from "@/server/signing/context";
import { noSession, signerErrorResponse } from "@/server/signing/http";

const Body = z.object({ motivo: z.string().max(MOTIVO_ENTRADA_MAX) });

export async function POST(req: NextRequest, ctx: RouteContext<"/api/assinar/[token]/recusar">) {
  const signer = await requireSignatarioPorToken(req, (await ctx.params).token);
  if (signer instanceof Response) return signer;
  if (!signer.sessionJti) return noSession();
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) return Response.json({ codigo: "dados_invalidos" }, { status: 400 });
  try {
    await decline(signer, parsed.data.motivo, requestMeta(req));
    return Response.json({ ok: true });
  } catch (e) {
    return signerErrorResponse(e);
  }
}
