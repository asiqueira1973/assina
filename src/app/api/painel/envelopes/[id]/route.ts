// PATCH /api/painel/envelopes/{id} — configurações do rascunho (seção 13.1, critério 8.2): título,
// mensagem, ordem, prazo e lembrete. Salvamento automático da tela chama esta rota.
// DELETE /api/painel/envelopes/{id} — exclusão (seção 7.4, critério 8.7). Corpo: { titulo }, o
// título digitado. Resposta: { excluido: true }. Erros: 400 titulo_nao_confere; 404; 409
// status_mudou (enviado ou finalizando: primeiro cancela).
import type { NextRequest } from "next/server";
import { z } from "zod";
import { TITULO_MAX } from "@/lib/limits";
import { requireConta } from "@/server/auth/require-conta";
import { DraftSettings, updateDraftSettings } from "@/server/envelopes/drafts";
import { deleteEnvelope } from "@/server/envelopes/manage";
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

const DeleteBody = z.object({ titulo: z.string().max(TITULO_MAX * 2) });

export async function DELETE(req: NextRequest, ctx: RouteContext<"/api/painel/envelopes/[id]">) {
  const account = await requireConta(req);
  if (account instanceof Response) return account;
  const parsed = DeleteBody.safeParse(await readJson(req));
  if (!parsed.success) return invalidData();
  try {
    const { id } = await ctx.params;
    if (!z.uuid().safeParse(id).success) return Response.json({ codigo: "nao_encontrado" }, { status: 404 });
    await deleteEnvelope(account.id, id, parsed.data.titulo);
    return Response.json({ excluido: true });
  } catch (e) {
    return errorResponse(e);
  }
}
