// /api/v1/envelopes/{id} — seção 13.2.
// GET: {envelope, signatarios:[{id, nome, email, papel, ordem, status, assinado_em, recusado_em, motivo_recusa}]}.
// DELETE: 204; só rascunho (409 envelope_nao_e_rascunho fora disso). Envelope de outra conta → 404.
import type { NextRequest } from "next/server";
import { apiError, apiRoute, envelopeJson, signerJson } from "@/server/api/v1";
import { DraftError, getEnvelope, getSigners } from "@/server/envelopes/drafts";
import { deleteEnvelope } from "@/server/envelopes/manage";

export async function GET(req: NextRequest, ctx: RouteContext<"/api/v1/envelopes/[id]">) {
  return apiRoute(req, async ({ account }) => {
    const { id } = await ctx.params;
    const envelope = await getEnvelope(account.id, id);
    if (!envelope) throw new DraftError("nao_encontrado");
    const signers = await getSigners(account.id, id);
    return Response.json({ envelope: envelopeJson(envelope), signatarios: signers.map(signerJson) });
  });
}

export async function DELETE(req: NextRequest, ctx: RouteContext<"/api/v1/envelopes/[id]">) {
  return apiRoute(req, async ({ account }) => {
    const { id } = await ctx.params;
    const envelope = await getEnvelope(account.id, id);
    if (!envelope) throw new DraftError("nao_encontrado");
    if (envelope.status !== "rascunho") return apiError("envelope_nao_e_rascunho", 409);
    await deleteEnvelope(account.id, id, envelope.titulo);
    return new Response(null, { status: 204 });
  });
}
