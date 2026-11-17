// POST /api/v1/envelopes/{id}/enviar — seção 13.2: congela e manda os convites (o mesmo envio
// do painel, com o ator "api"). → {envelope}. 429 com limite e usados (regras 11.12 e 11.20).
import type { NextRequest } from "next/server";
import { apiRoute, envelopeJson } from "@/server/api/v1";
import { sendEnvelope } from "@/server/envelopes/send";
import { requestMeta } from "@/server/http";

export const maxDuration = 60;

export async function POST(req: NextRequest, ctx: RouteContext<"/api/v1/envelopes/[id]/enviar">) {
  return apiRoute(req, async ({ account }) => {
    const { id } = await ctx.params;
    const r = await sendEnvelope(account.id, id, { ator: "api", meta: requestMeta(req) });
    return Response.json({ envelope: envelopeJson(r.envelope) });
  });
}
