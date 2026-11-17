// GET /api/final/{signatario_id}.{hmac} — baixa o PDF final pelo link do e-mail de conclusão
// (critério 8.6, quando o PDF passa de 7 MB e não vai anexo). Vale enquanto o envelope estiver
// concluído e até 30 dias depois de concluido_em (regra 11.14); conta suspensa não baixa.
// Registra "baixou_final" na trilha antes de liberar (princípio 1) e responde 302 para uma URL
// assinada de 5 min. Link inválido ou vencido: 404 sem detalhe.
import { NextResponse, type NextRequest } from "next/server";
import { DOWNLOAD_FINAL_DIAS, DOWNLOAD_URL_SEGUNDOS } from "@/lib/limits";
import { db } from "@/server/db/client";
import { readFinalDownloadKey } from "@/server/envelopes/final-link";
import { errorCode } from "@/server/error-code";
import { storage } from "@/server/files/storage";
import { requestMeta } from "@/server/http";

const notFound = () => Response.json({ codigo: "indisponivel" }, { status: 404 });

export async function GET(req: NextRequest, ctx: RouteContext<"/api/final/[chave]">) {
  let signatarioId: string | null;
  try {
    signatarioId = readFinalDownloadKey((await ctx.params).chave);
  } catch (e) {
    console.error("erro_interno_final", errorCode(e)); // CHAVES_ENC_KEY ausente
    return Response.json({ codigo: "erro_interno" }, { status: 500 });
  }
  if (!signatarioId) return notFound();
  const { data: s } = await db()
    .from("as_signatarios")
    .select("id, as_envelopes!inner(id, titulo, status, arquivo_final_path, concluido_em), as_contas!inner(suspensa_em)")
    .eq("id", signatarioId)
    .maybeSingle();
  const e = s?.as_envelopes;
  const fresh = !!e?.concluido_em && Date.now() - new Date(e.concluido_em).getTime() < DOWNLOAD_FINAL_DIAS * 86400_000;
  if (!s || !e || s.as_contas.suspensa_em || e.status !== "concluido" || !e.arquivo_final_path || !fresh) return notFound();

  const meta = requestMeta(req);
  const { error } = await db().rpc("as_fn_registra_evento", {
    p_envelope_id: e.id,
    p_tipo: "baixou_final",
    p_ator: "signatario",
    p_signatario_id: s.id,
    p_ip: meta.ip ?? undefined,
    p_user_agent: meta.userAgent ?? undefined,
  });
  if (error) {
    console.error("erro_interno_final", errorCode(error));
    return Response.json({ codigo: "erro_interno" }, { status: 500 });
  }
  const url = await storage().createDownloadUrl(e.arquivo_final_path, DOWNLOAD_URL_SEGUNDOS, `${e.titulo}.pdf`);
  return NextResponse.redirect(url.url, 302);
}
