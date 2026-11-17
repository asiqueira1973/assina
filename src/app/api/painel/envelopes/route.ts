// POST /api/painel/envelopes — cria o rascunho e devolve a URL de upload (seção 13.1, critério 8.2).
// Corpo: { nome_arquivo } (vira o título, sem .pdf). Resposta 201: { envelope, upload_url, upload_expira_em }.
import type { NextRequest } from "next/server";
import { z } from "zod";
import { NOME_ARQUIVO_MAX } from "@/lib/limits";
import { requireConta } from "@/server/auth/require-conta";
import { createDraft, titleFromFilename } from "@/server/envelopes/drafts";
import { errorResponse, invalidData, readJson, requestMeta } from "@/server/http";

const Body = z.object({ nome_arquivo: z.string().trim().min(1).max(NOME_ARQUIVO_MAX) });

export async function POST(req: NextRequest) {
  const account = await requireConta(req);
  if (account instanceof Response) return account;
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) return invalidData();
  try {
    const { envelope, upload } = await createDraft(account.id, {
      titulo: titleFromFilename(parsed.data.nome_arquivo),
      origem: "painel",
      ator: "remetente",
      meta: requestMeta(req),
    });
    return Response.json({ envelope, upload_url: upload.url, upload_expira_em: upload.expiresAt.toISOString() }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
