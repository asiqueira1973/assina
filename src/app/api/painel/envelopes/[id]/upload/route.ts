// POST /api/painel/envelopes/{id}/upload — URL nova de upload para trocar o arquivo do rascunho
// (critério 8.2, "Trocar"). Resposta: { upload_url, upload_expira_em }.
import type { NextRequest } from "next/server";
import { requireConta } from "@/server/auth/require-conta";
import { newUploadUrl } from "@/server/envelopes/drafts";
import { errorResponse } from "@/server/http";

export async function POST(req: NextRequest, ctx: RouteContext<"/api/painel/envelopes/[id]/upload">) {
  const account = await requireConta(req);
  if (account instanceof Response) return account;
  try {
    const { id } = await ctx.params;
    const upload = await newUploadUrl(account.id, id);
    return Response.json({ upload_url: upload.url, upload_expira_em: upload.expiresAt.toISOString() });
  } catch (e) {
    return errorResponse(e);
  }
}
