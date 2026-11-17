// GET /api/v1/envelopes/{id}/eventos — seção 13.2: a trilha com seq, tipo, ator,
// signatario_id, ip, ocorrido_em e hash (e a integridade: divergencia = null quando íntegra).
import type { NextRequest } from "next/server";
import { apiRoute } from "@/server/api/v1";
import { getTrail } from "@/server/envelopes/manage";

export async function GET(req: NextRequest, ctx: RouteContext<"/api/v1/envelopes/[id]/eventos">) {
  return apiRoute(req, async ({ account }) => {
    const { id } = await ctx.params;
    const { events, divergence } = await getTrail(account.id, id);
    return Response.json({
      eventos: events.map((e) => ({ seq: e.seq, tipo: e.tipo, ator: e.ator, signatario_id: e.signatario_id, ip: e.ip, ocorrido_em: e.ocorrido_em, hash: e.hash })),
      divergencia: divergence,
    });
  });
}
