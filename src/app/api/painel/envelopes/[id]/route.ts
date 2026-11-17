// PATCH /api/painel/envelopes/{id} — configurações do rascunho (seção 13.1, critério 8.2): título,
// mensagem, ordem, prazo e lembrete. Salvamento automático da tela chama esta rota.
import type { NextRequest } from "next/server";
import { requireConta } from "@/server/auth/require-conta";
import { DraftSettings, updateDraftSettings } from "@/server/envelopes/drafts";
import { errorResponse, invalidData, readJson } from "@/server/http";

export async function PATCH(req: NextRequest, ctx: RouteContext<"/api/painel/envelopes/[id]">) {
  const account = await requireConta(req);
  if (account instanceof Response) return account;
  const parsed = DraftSettings.strict().safeParse(await readJson(req));
  if (!parsed.success) return invalidData();
  try {
    const { id } = await ctx.params;
    return Response.json({ envelope: await updateDraftSettings(account.id, id, parsed.data) });
  } catch (e) {
    return errorResponse(e);
  }
}
