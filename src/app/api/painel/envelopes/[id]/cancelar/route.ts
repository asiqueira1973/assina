// POST /api/painel/envelopes/{id}/cancelar — cancela (critério 8.7, seção 12: enviado →
// cancelado). Corpo: { motivo? }. Resposta: { cancelado: true }. Erros: 404; 409 status_mudou.
import type { NextRequest } from "next/server";
import { z } from "zod";
import { MOTIVO_CANCELAMENTO_MAX } from "@/lib/limits";
import { requireConta } from "@/server/auth/require-conta";
import { DraftError } from "@/server/envelopes/drafts";
import { cancelEnvelope } from "@/server/envelopes/manage";
import { errorResponse, invalidData, readJson, requestMeta } from "@/server/http";

const Body = z.object({ motivo: z.string().trim().max(MOTIVO_CANCELAMENTO_MAX).nullish() });

export async function POST(req: NextRequest, ctx: RouteContext<"/api/painel/envelopes/[id]/cancelar">) {
  const account = await requireConta(req);
  if (account instanceof Response) return account;
  const parsed = Body.safeParse((await readJson(req)) ?? {});
  if (!parsed.success) return invalidData();
  try {
    const { id } = await ctx.params;
    if (!z.uuid().safeParse(id).success) throw new DraftError("nao_encontrado");
    await cancelEnvelope(account.id, id, parsed.data.motivo || null, requestMeta(req));
    return Response.json({ cancelado: true });
  } catch (e) {
    return errorResponse(e);
  }
}
