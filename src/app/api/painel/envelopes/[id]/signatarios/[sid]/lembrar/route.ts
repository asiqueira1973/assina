// POST /api/painel/envelopes/{id}/signatarios/{sid}/lembrar — lembrete manual (critério 8.7,
// regra 11.5). Resposta: { enviado: true }. Erros: 404; 409 status_mudou | limite_lembretes;
// 429 lembrete_recente (menos de 24 h); 502 email_falhou (o link antigo continua valendo).
import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireConta } from "@/server/auth/require-conta";
import { DraftError } from "@/server/envelopes/drafts";
import { remindSigner } from "@/server/envelopes/manage";
import { errorResponse, requestMeta } from "@/server/http";

export async function POST(req: NextRequest, ctx: RouteContext<"/api/painel/envelopes/[id]/signatarios/[sid]/lembrar">) {
  const account = await requireConta(req);
  if (account instanceof Response) return account;
  try {
    const { id, sid } = await ctx.params;
    if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(sid).success) throw new DraftError("nao_encontrado");
    await remindSigner(account.id, id, sid, requestMeta(req));
    return Response.json({ enviado: true });
  } catch (e) {
    return errorResponse(e);
  }
}
