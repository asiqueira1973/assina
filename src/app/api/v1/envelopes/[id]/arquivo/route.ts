// /api/v1/envelopes/{id}/arquivo — seção 13.2.
// POST: valida o PDF enviado pela upload_url (regra 11.1) e o anexa ao rascunho → {envelope}.
// GET ?versao=original|final: {url, expira_em} (5 min) e registra baixou_* com o ator "api".
import type { NextRequest } from "next/server";
import { DOWNLOAD_URL_SEGUNDOS } from "@/lib/limits";
import { apiError, apiRoute, envelopeJson } from "@/server/api/v1";
import { attachUploadedFile, DraftError, getEnvelope } from "@/server/envelopes/drafts";
import { downloadUrl } from "@/server/envelopes/manage";
import { requestMeta } from "@/server/http";

export async function POST(req: NextRequest, ctx: RouteContext<"/api/v1/envelopes/[id]/arquivo">) {
  return apiRoute(req, async ({ account }) => {
    const { id } = await ctx.params;
    const envelope = await getEnvelope(account.id, id);
    if (!envelope) throw new DraftError("nao_encontrado");
    const r = await attachUploadedFile(account.id, id, envelope.nome_arquivo ?? `${envelope.titulo}.pdf`);
    return Response.json({ envelope: envelopeJson(r.envelope) });
  });
}

export async function GET(req: NextRequest, ctx: RouteContext<"/api/v1/envelopes/[id]/arquivo">) {
  return apiRoute(req, async ({ account }) => {
    const { id } = await ctx.params;
    const raw = req.nextUrl.searchParams.get("versao") ?? "original";
    if (raw !== "original" && raw !== "final") return apiError("dados_invalidos", 400, { campos: [{ campo: "versao", motivo: "invalid_value" }] });
    const versao = raw;
    const url = await downloadUrl(account.id, id, versao, requestMeta(req), "api");
    return Response.json({ url, expira_em: new Date(Date.now() + DOWNLOAD_URL_SEGUNDOS * 1000).toISOString() }, { headers: { "cache-control": "no-store" } });
  });
}
