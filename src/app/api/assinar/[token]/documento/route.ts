// GET /api/assinar/{token}/documento — o PDF para o signatário (critério 8.5, regras 11.4 e 11.14).
// - Original: só com sessão (depois do código) e com o envelope em andamento. Nunca antes.
// - ?versao=final: com o envelope concluído, até 30 dias depois da conclusão, só com o link
//   (o mesmo arquivo foi por e-mail); registra "baixou_final".
// Responde 302 para uma URL assinada de 5 min.
import { NextResponse, type NextRequest } from "next/server";
import { DOWNLOAD_FINAL_DIAS, DOWNLOAD_URL_SEGUNDOS } from "@/lib/limits";
import { db } from "@/server/db/client";
import { storage } from "@/server/files/storage";
import { requestMeta } from "@/server/http";
import { requireSignatarioPorToken } from "@/server/signing/context";
import { noSession } from "@/server/signing/http";

export async function GET(req: NextRequest, ctx: RouteContext<"/api/assinar/[token]/documento">) {
  const signer = await requireSignatarioPorToken(req, (await ctx.params).token);
  if (signer instanceof Response) return signer;
  const { envelope } = signer;

  if (req.nextUrl.searchParams.get("versao") === "final") {
    const fresh = envelope.concluido_em && Date.now() - new Date(envelope.concluido_em).getTime() < DOWNLOAD_FINAL_DIAS * 86400_000;
    if (envelope.status !== "concluido" || !envelope.arquivo_final_path || !fresh) return Response.json({ codigo: "indisponivel" }, { status: 404 });
    const meta = requestMeta(req);
    // Princípio 1: sem o evento na trilha, o arquivo não sai.
    const { error } = await db().rpc("as_fn_registra_evento", {
      p_envelope_id: envelope.id,
      p_tipo: "baixou_final",
      p_ator: "signatario",
      p_signatario_id: signer.signer.id,
      p_ip: meta.ip ?? undefined,
      p_user_agent: meta.userAgent ?? undefined,
    });
    if (error) {
      console.error("erro_interno_signatario", error.code);
      return Response.json({ codigo: "erro_interno" }, { status: 500 });
    }
    const url = await storage().createDownloadUrl(envelope.arquivo_final_path, DOWNLOAD_URL_SEGUNDOS, `${envelope.titulo}.pdf`);
    return NextResponse.redirect(url.url, 302);
  }

  if (!signer.sessionJti) return noSession();
  if (envelope.status !== "enviado" || !envelope.arquivo_original_path) return Response.json({ codigo: "indisponivel" }, { status: 409 });
  // Regra 11.7: vale o prazo_em, não o status (a faxina muda o status depois).
  if (envelope.prazo_em && new Date(envelope.prazo_em).getTime() <= Date.now()) return Response.json({ codigo: "prazo_encerrado" }, { status: 409 });
  const url = await storage().createDownloadUrl(envelope.arquivo_original_path, DOWNLOAD_URL_SEGUNDOS);
  return NextResponse.redirect(url.url, 302);
}
