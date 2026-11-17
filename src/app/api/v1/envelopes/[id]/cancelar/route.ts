// POST /api/v1/envelopes/{id}/cancelar — seção 13.2: {motivo?} → {envelope}. 409 status_mudou
// fora de "enviado". Avisa quem já foi convidado e dispara o webhook envelope.cancelado.
import type { NextRequest } from "next/server";
import { z } from "zod";
import { MOTIVO_CANCELAMENTO_MAX } from "@/lib/limits";
import { apiRoute, envelopeJson, invalidFields } from "@/server/api/v1";
import { getEnvelope } from "@/server/envelopes/drafts";
import { cancelEnvelope } from "@/server/envelopes/manage";
import { readJson, requestMeta } from "@/server/http";

const Body = z.object({ motivo: z.string().trim().max(MOTIVO_CANCELAMENTO_MAX).nullish() }).strict();

export async function POST(req: NextRequest, ctx: RouteContext<"/api/v1/envelopes/[id]/cancelar">) {
  return apiRoute(req, async ({ account }) => {
    const parsed = Body.safeParse((await readJson(req)) ?? {});
    if (!parsed.success) return invalidFields(parsed.error);
    const { id } = await ctx.params;
    await cancelEnvelope(account.id, id, parsed.data.motivo || null, requestMeta(req), "api");
    return Response.json({ envelope: envelopeJson((await getEnvelope(account.id, id))!) });
  });
}
