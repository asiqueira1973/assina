// POST /api/painel/envelopes/{id}/enviar — envia o envelope para assinatura (seção 13.1,
// critério 8.4). Resposta: { envelope, convites: { enviados, falharam } }.
// Já enviado → 409 status_mudou; limites → 429 limite_diario | limite_do_nivel.
import type { NextRequest } from "next/server";
import { requireConta } from "@/server/auth/require-conta";
import { sendEnvelope } from "@/server/envelopes/send";
import { errorResponse, requestMeta } from "@/server/http";

export async function POST(req: NextRequest, ctx: RouteContext<"/api/painel/envelopes/[id]/enviar">) {
  const account = await requireConta(req);
  if (account instanceof Response) return account;
  try {
    const { id } = await ctx.params;
    const result = await sendEnvelope(account.id, id, { ator: "remetente", meta: requestMeta(req) });
    return Response.json({ envelope: result.envelope, convites: { enviados: result.invites.sent, falharam: result.invites.failed } });
  } catch (e) {
    return errorResponse(e);
  }
}
