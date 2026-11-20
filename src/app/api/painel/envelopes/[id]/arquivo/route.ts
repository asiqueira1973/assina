// POST /api/painel/envelopes/{id}/arquivo — valida o PDF que o navegador acabou de subir e o
// promove a original (seção 13.1, critério 8.2, regra 11.1). Corpo: { nome_arquivo, renomear? }.
// renomear: o título passa a vir deste arquivo (nova tentativa do novo envelope, depois de um
// arquivo recusado; achado em produção, 20/11/2026).
// Resposta: { envelope, campos_removidos, ja_assinado }; inválido → 400 { codigo: "arquivo_invalido", motivo }.
// GET /api/painel/envelopes/{id}/arquivo?versao=original|final — download pelo remetente (13.1,
// critério 8.7): registra baixou_* e responde 302 para a URL assinada de 5 min; sem arquivo → 404.
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { NOME_ARQUIVO_MAX } from "@/lib/limits";
import { requireConta } from "@/server/auth/require-conta";
import { attachUploadedFile } from "@/server/envelopes/drafts";
import { downloadUrl } from "@/server/envelopes/manage";
import { errorResponse, invalidData, readJson, requestMeta } from "@/server/http";

const Body = z.object({ nome_arquivo: z.string().trim().min(1).max(NOME_ARQUIVO_MAX), renomear: z.boolean().optional() });

export async function POST(req: NextRequest, ctx: RouteContext<"/api/painel/envelopes/[id]/arquivo">) {
  const account = await requireConta(req);
  if (account instanceof Response) return account;
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) return invalidData();
  try {
    const { id } = await ctx.params;
    const result = await attachUploadedFile(account.id, id, parsed.data.nome_arquivo, { retitle: parsed.data.renomear });
    return Response.json({ envelope: result.envelope, campos_removidos: result.fieldsRemoved, ja_assinado: result.alreadySigned });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function GET(req: NextRequest, ctx: RouteContext<"/api/painel/envelopes/[id]/arquivo">) {
  const account = await requireConta(req);
  if (account instanceof Response) return account;
  const versao = req.nextUrl.searchParams.get("versao") === "final" ? "final" : "original";
  try {
    const { id } = await ctx.params;
    return NextResponse.redirect(await downloadUrl(account.id, id, versao, requestMeta(req)), 302);
  } catch (e) {
    return errorResponse(e);
  }
}
