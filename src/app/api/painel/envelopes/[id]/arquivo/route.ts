// POST /api/painel/envelopes/{id}/arquivo — valida o PDF que o navegador acabou de subir e o
// promove a original (seção 13.1, critério 8.2, regra 11.1). Corpo: { nome_arquivo }.
// Resposta: { envelope, campos_removidos, ja_assinado }; inválido → 400 { codigo: "arquivo_invalido", motivo }.
import type { NextRequest } from "next/server";
import { z } from "zod";
import { NOME_ARQUIVO_MAX } from "@/lib/limits";
import { requireConta } from "@/server/auth/require-conta";
import { attachUploadedFile } from "@/server/envelopes/drafts";
import { errorResponse, invalidData, readJson } from "@/server/http";

const Body = z.object({ nome_arquivo: z.string().trim().min(1).max(NOME_ARQUIVO_MAX) });

export async function POST(req: NextRequest, ctx: RouteContext<"/api/painel/envelopes/[id]/arquivo">) {
  const account = await requireConta(req);
  if (account instanceof Response) return account;
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) return invalidData();
  try {
    const { id } = await ctx.params;
    const result = await attachUploadedFile(account.id, id, parsed.data.nome_arquivo);
    return Response.json({ envelope: result.envelope, campos_removidos: result.fieldsRemoved, ja_assinado: result.alreadySigned });
  } catch (e) {
    return errorResponse(e);
  }
}
