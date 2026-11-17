// GET /api/painel/envelopes/{id}/trilha.csv — trilha em CSV (seção 14, critério 8.7): UTF-8 com
// BOM, separador ";", download com o nome trilha-{codigo_verificacao}.csv.
import type { NextRequest } from "next/server";
import { requireConta } from "@/server/auth/require-conta";
import { DraftError, getEnvelope } from "@/server/envelopes/drafts";
import { getTrail } from "@/server/envelopes/manage";
import { trailCsv, trailCsvFilename } from "@/server/envelopes/trail-csv";
import { errorResponse } from "@/server/http";

export async function GET(req: NextRequest, ctx: RouteContext<"/api/painel/envelopes/[id]/trilha.csv">) {
  const account = await requireConta(req);
  if (account instanceof Response) return account;
  try {
    const { id } = await ctx.params;
    const envelope = await getEnvelope(account.id, id);
    if (!envelope) throw new DraftError("nao_encontrado");
    const { events } = await getTrail(account.id, id);
    return new Response(trailCsv(events), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${trailCsvFilename(envelope.codigo_verificacao)}"`,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
