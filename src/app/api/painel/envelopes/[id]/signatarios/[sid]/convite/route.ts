// POST /api/painel/envelopes/{id}/signatarios/{sid}/convite — "Tentar de novo" da faixa laranja
// (critério 8.4): reenvia o convite que falhou, com link novo. Resposta: { enviado: true }.
// Sem convite a reenviar → 409 convite_indisponivel; o provedor falhou de novo → 502 email_falhou.
import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireConta } from "@/server/auth/require-conta";
import { db } from "@/server/db/client";
import { DraftError } from "@/server/envelopes/drafts";
import { errorResponse } from "@/server/http";
import { sendInvite } from "@/server/notifications/invites";

export async function POST(req: NextRequest, ctx: RouteContext<"/api/painel/envelopes/[id]/signatarios/[sid]/convite">) {
  const account = await requireConta(req);
  if (account instanceof Response) return account;
  try {
    const { id, sid } = await ctx.params;
    if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(sid).success) throw new DraftError("nao_encontrado");
    // Só destinatário de envelope da conta (seção 6.5).
    const { data } = await db().from("as_signatarios").select("id").eq("id", sid).eq("envelope_id", id).eq("conta_id", account.id).maybeSingle();
    if (!data) throw new DraftError("nao_encontrado");
    const result = await sendInvite(sid);
    // Tentou agora e o provedor falhou: 502. Não havia o que reenviar (já enviado, tentativas
    // esgotadas, envelope encerrado, outro envio em andamento): 409.
    if (result === "failed") return Response.json({ codigo: "email_falhou" }, { status: 502 });
    if (result === "skipped") throw new DraftError("convite_indisponivel");
    return Response.json({ enviado: true });
  } catch (e) {
    return errorResponse(e);
  }
}
