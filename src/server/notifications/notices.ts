// Avisos por e-mail que não são convite — seção 15.2 (assinou_remetente, recusado_remetente,
// recusado_destinatario; concluido_destinatario, concluido_remetente e finalizacao_falhou_admin
// desde o 8.6) e regra 11.16. Mesmo mecanismo do convite: a linha em as_notificacoes
// (criada pela transação que causou o aviso) é reservada no banco antes do envio, então um aviso
// não sai duas vezes. Nada de e-mail, nome ou motivo em log (seção 20.2).
import "server-only";
import { copy } from "@/lib/copy";
import { ANEXO_EMAIL_MAX_BYTES, MAX_TENTATIVAS_EMAIL } from "@/lib/limits";
import { db } from "@/server/db/client";
import { errorCode } from "@/server/error-code";
import { mailer, type EmailMessage } from "@/server/email/mailer";
import { completedEmail, declinedRecipientEmail, declinedSenderEmail, finalizationFailedEmail, signedNoticeEmail } from "@/server/email/templates";
import { finalDownloadLink } from "@/server/envelopes/final-link";
import { storage } from "@/server/files/storage";

const NOTICE_TYPES = [
  "assinou_remetente",
  "recusado_remetente",
  "recusado_destinatario",
  "concluido_destinatario",
  "concluido_remetente",
  "finalizacao_falhou_admin",
] as const;

// O PDF final para anexar, se tiver até 7 MB (critério 8.6). Devolve: os bytes ou null (maior).
async function finalAttachment(path: string): Promise<Uint8Array | null> {
  try {
    return await storage().read(path, ANEXO_EMAIL_MAX_BYTES);
  } catch (e) {
    if (e instanceof Error && e.message === "arquivo_grande") return null;
    throw e;
  }
}

// Nome do anexo: o título do envelope, sem caracteres que quebram nome de arquivo.
const attachmentName = (titulo: string) => `${titulo.replace(/[\\/:*?"<>|\x00-\x1f]/g, " ").trim() || copy.emailNotices.completed.fileFallback}.pdf`;

// E-mails do fim do envelope (concluido_*, finalizacao_falhou_admin). Devolve: a mensagem ou null.
async function buildCompletion(note: { tipo: string; envelope_id: string | null; signatario_id: string | null }): Promise<EmailMessage | null> {
  if (!note.envelope_id) return null;
  const { data: e } = await db()
    .from("as_envelopes")
    .select("id, titulo, status, codigo_verificacao, hash_final, arquivo_final_path, erro_finalizacao, as_contas!inner(nome, email, suspensa_em)")
    .eq("id", note.envelope_id)
    .maybeSingle();
  if (!e) return null;
  if (note.tipo === "finalizacao_falhou_admin") {
    const to = process.env.ADMIN_EMAIL;
    if (!to) {
      // Sem destino o alerta fica pendente; o log avisa (só o código, seção 20.2).
      console.error("alerta_admin_sem_destino", "ADMIN_EMAIL ausente");
      return null;
    }
    return { to, ...finalizationFailedEmail({ envelopeId: e.id, erro: e.erro_finalizacao ?? copy.emailNotices.finalizationFailed.unknown }) };
  }
  if (e.status !== "concluido" || !e.arquivo_final_path || !e.hash_final || e.as_contas.suspensa_em) return null;

  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const pdf = await finalAttachment(e.arquivo_final_path);
  const attachments = pdf ? [{ filename: attachmentName(e.titulo), content: pdf }] : undefined;
  const base = { titulo: e.titulo, codigo: e.codigo_verificacao, hashFinal: e.hash_final, site, anexo: !!pdf };

  if (note.tipo === "concluido_remetente") {
    const link = `${site}/painel/envelopes/${e.id}`;
    return { to: e.as_contas.email, attachments, ...completedEmail({ ...base, link, detail: true }) };
  }
  if (!note.signatario_id) return null;
  const { data: s } = await db().from("as_signatarios").select("id, email").eq("id", note.signatario_id).eq("envelope_id", e.id).maybeSingle();
  if (!s) return null;
  // Sem anexo (acima de 7 MB), o botão leva ao link de download próprio, estável e só do final
  // (30 dias, regra 11.14). O link de assinatura não muda (src/server/envelopes/final-link.ts).
  const link = pdf ? null : finalDownloadLink(s.id);
  return { to: s.email, fromName: e.as_contas.nome, replyTo: e.as_contas.email, attachments, ...completedEmail({ ...base, link, detail: false }) };
}

// Monta o e-mail de um aviso. Recebe: a notificação. Devolve: a mensagem ou null (dados sumiram).
async function buildNotice(note: { tipo: string; envelope_id: string | null; signatario_id: string | null }): Promise<EmailMessage | null> {
  if (["concluido_destinatario", "concluido_remetente", "finalizacao_falhou_admin"].includes(note.tipo)) return buildCompletion(note);
  if (!note.envelope_id || !note.signatario_id) return null;
  const { data: e } = await db().from("as_envelopes").select("id, titulo, as_contas!inner(nome, email, suspensa_em)").eq("id", note.envelope_id).maybeSingle();
  const { data: s } = await db().from("as_signatarios").select("nome, email, motivo_recusa").eq("id", note.signatario_id).maybeSingle();
  if (!e || !s || e.as_contas.suspensa_em) return null;
  const link = `${process.env.NEXT_PUBLIC_SITE_URL}/painel/envelopes/${e.id}`;
  const toSender = { to: e.as_contas.email };

  if (note.tipo === "assinou_remetente") {
    const { data: all } = await db().from("as_signatarios").select("status").eq("envelope_id", e.id).eq("papel", "assinar");
    const total = all?.length ?? 0;
    const signed = (all ?? []).filter((x) => x.status === "assinou").length;
    return { ...toSender, ...signedNoticeEmail({ nome: s.nome, titulo: e.titulo, assinaram: signed, total, link }) };
  }
  if (note.tipo === "recusado_remetente") {
    return { ...toSender, ...declinedSenderEmail({ nome: s.nome, titulo: e.titulo, motivo: s.motivo_recusa ?? "", link }) };
  }
  if (note.tipo === "recusado_destinatario") {
    return { to: s.email, fromName: e.as_contas.nome, replyTo: e.as_contas.email, ...declinedRecipientEmail({ titulo: e.titulo }) };
  }
  return null;
}

// Manda um aviso pela chave (ex. "assinou_remetente:{id}"). Devolve: "sent" | "failed" | "skipped".
export async function sendNotice(chave: string): Promise<"sent" | "failed" | "skipped"> {
  const { data: note } = await db().from("as_notificacoes").select("id, tipo, envelope_id, signatario_id").eq("chave", chave).maybeSingle();
  if (!note || !(NOTICE_TYPES as readonly string[]).includes(note.tipo)) return "skipped";
  const { data: claimed, error } = await db().rpc("as_fn_reserva_notificacao", { p_id: note.id, p_max_tentativas: MAX_TENTATIVAS_EMAIL });
  if (error) throw error;
  if (!claimed) return "skipped";

  const message = await buildNotice(note);
  if (!message) {
    await db().from("as_notificacoes").update({ reservada_em: null }).eq("id", note.id);
    return "skipped";
  }
  try {
    const sent = await mailer().send(message);
    await db().from("as_notificacoes").update({ status: "enviada", resend_id: sent.id, enviada_em: new Date().toISOString(), erro: null, reservada_em: null }).eq("id", note.id);
    return "sent";
  } catch (e) {
    const erro = errorCode(e); // só o código do erro, sem dado pessoal
    await db().from("as_notificacoes").update({ status: "falhou", erro, reservada_em: null }).eq("id", note.id);
    return "failed";
  }
}

// Reenvia os avisos pendentes ou que falharam (faxina, regra 11.16; rota do cron no 8.13).
// Recebe: contas a limitar (testes). Devolve: quantos saíram.
export async function retryFailedNotices(opts: { contaIds?: string[] } = {}): Promise<number> {
  let q = db().from("as_notificacoes").select("chave").in("tipo", [...NOTICE_TYPES]).in("status", ["pendente", "falhou"]).lt("tentativas", MAX_TENTATIVAS_EMAIL);
  if (opts.contaIds) q = q.in("conta_id", opts.contaIds);
  const { data, error } = await q;
  if (error) throw error;
  let sent = 0;
  for (const row of data ?? []) if ((await sendNotice(row.chave)) === "sent") sent++;
  return sent;
}
