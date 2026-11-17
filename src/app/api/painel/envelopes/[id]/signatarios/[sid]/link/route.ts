// POST /api/painel/envelopes/{id}/signatarios/{sid}/link — "Copiar link de assinatura" (critério
// 8.7): gera um link novo, o anterior deixa de valer, e registra convite_enviado
// {canal: link_copiado}. Resposta: { link } (sem cache). Erros: 404; 409 status_mudou.
import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireConta } from "@/server/auth/require-conta";
import { DraftError } from "@/server/envelopes/drafts";
import { copySignerLink } from "@/server/envelopes/manage";
import { errorResponse, requestMeta } from "@/server/http";

export async function POST(req: NextRequest, ctx: RouteContext<"/api/painel/envelopes/[id]/signatarios/[sid]/link">) {
  const account = await requireConta(req);
  if (account instanceof Response) return account;
  try {
    const { id, sid } = await ctx.params;
    if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(sid).success) throw new DraftError("nao_encontrado");
    const link = await copySignerLink(account.id, id, sid, requestMeta(req));
    return Response.json({ link }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
