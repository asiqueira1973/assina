// Convites para assinar — épico 8.4, seção 15.2 (convite) e regra 11.16 (até 5 tentativas).
// O banco guarda só o hash do token (seção 6.2): o token em claro vem do envio (8.4) ou é gerado
// de novo aqui ao reenviar. Reenviar troca o link: o anterior deixa de valer (ele não chegou a
// ninguém, porque o e-mail falhou). Nada de e-mail, nome ou token em log (seção 20.2).
import "server-only";
import { formatDateLong } from "@/lib/format";
import { CONVITE_PARADO_MS, FAXINA_LOTE, MAX_TENTATIVAS_EMAIL } from "@/lib/limits";
import { maskEmail } from "@/lib/mask";
import { db } from "@/server/db/client";
import { errorCode } from "@/server/error-code";
import { mailer } from "@/server/email/mailer";
import { inviteEmail } from "@/server/email/templates";
import { generateSignerToken, signerLink, type SignerToken } from "@/server/envelopes/signer-token";

export type InviteResult = "sent" | "failed" | "skipped";

// Manda (ou reenvia) o convite de um destinatário que está aguardando.
// Recebe: id do signatário e, no envio, o token já gravado pela transação.
// Devolve: "sent" se o e-mail saiu; "failed" se o provedor falhou (a notificação fica "falhou");
// "skipped" se não havia o que mandar (já enviado, tentativas esgotadas, envelope fora de
// "enviado", conta suspensa, ou outro pedido com a reserva em andamento).
export async function sendInvite(signatarioId: string, presetToken?: SignerToken): Promise<InviteResult> {
  const { data: s } = await db()
    .from("as_signatarios")
    .select("id, nome, email, status, envelope_id, conta_id, as_envelopes!inner(titulo, mensagem, status, prazo_em), as_contas!inner(nome, email, suspensa_em)")
    .eq("id", signatarioId)
    .maybeSingle();
  // Conta suspensa = como inexistente (regra 11.12): nem a faxina manda convite dela.
  if (!s || s.status !== "aguardando" || s.as_envelopes.status !== "enviado" || s.as_contas.suspensa_em) return "skipped";

  const { data: note } = await db().from("as_notificacoes").select("id").eq("chave", `convite:${signatarioId}`).maybeSingle();
  if (!note) return "skipped";
  // Reserva no banco (as_fn_reserva_notificacao): só um pedido por vez manda o e-mail; um segundo
  // (outra aba, faxina) não passa enquanto a reserva de 2 min vale, e por isso não troca o link
  // de um convite que pode estar chegando (achado do verifier no 8.4).
  const { data: claimed, error: claimError } = await db().rpc("as_fn_reserva_notificacao", { p_id: note.id, p_max_tentativas: MAX_TENTATIVAS_EMAIL });
  if (claimError) throw claimError;
  if (!claimed) return "skipped";

  // Reenvio: link novo. Envio: o token que a transação já gravou.
  const token = presetToken ?? generateSignerToken();
  if (!presetToken) {
    const { error } = await db().from("as_signatarios").update({ token_hash: token.hash }).eq("id", signatarioId);
    if (error) throw error;
  }

  const email = inviteEmail({
    remetente: s.as_contas.nome,
    titulo: s.as_envelopes.titulo,
    mensagem: s.as_envelopes.mensagem,
    link: signerLink(token.value),
    prazo: formatDateLong(s.as_envelopes.prazo_em!),
  });

  try {
    const sent = await mailer().send({ to: s.email, fromName: s.as_contas.nome, replyTo: s.as_contas.email, ...email });
    await db().from("as_notificacoes").update({ status: "enviada", resend_id: sent.id, enviada_em: new Date().toISOString(), erro: null, reservada_em: null }).eq("id", note.id);
    await db().from("as_signatarios").update({ notificado_em: new Date().toISOString() }).eq("id", signatarioId);
    await db().rpc("as_fn_registra_evento", {
      p_envelope_id: s.envelope_id,
      p_tipo: "convite_enviado",
      p_ator: "sistema",
      p_signatario_id: signatarioId,
      p_dados: { para: maskEmail(s.email) },
    });
    return "sent";
  } catch (e) {
    const erro = errorCode(e); // só o código do erro, sem dado pessoal
    await db().from("as_notificacoes").update({ status: "falhou", erro, reservada_em: null }).eq("id", note.id);
    return "failed";
  }
}

// Reenvia os convites que falharam ou ficaram pendentes (a parte de convites da faxina diária,
// regra 11.16; a rota do cron é do épico 8.13). Recebe: contas a limitar (testes) — sem elas,
// todas. Devolve: quantos saíram.
export async function retryFailedInvites(opts: { contaIds?: string[] } = {}): Promise<number> {
  let q = db()
    .from("as_notificacoes")
    .select("signatario_id")
    .eq("tipo", "convite")
    .in("status", ["pendente", "falhou"])
    .lt("tentativas", MAX_TENTATIVAS_EMAIL)
    .order("criado_em")
    .limit(FAXINA_LOTE);
  if (opts.contaIds) q = q.in("conta_id", opts.contaIds);
  const { data, error } = await q;
  if (error) throw error;
  let sent = 0;
  for (const row of data ?? []) if (row.signatario_id && (await sendInvite(row.signatario_id)) === "sent") sent++;
  return sent;
}

// Destinatários do envelope com convite com problema, para a faixa laranja do detalhe (8.4):
// "falhou", ou "pendente" parado há mais de 5 min (servidor caiu entre o envio e o e-mail).
// Recebe: conta e envelope. Devolve: ids dos signatários.
export async function invitesWithProblem(contaId: string, envelopeId: string): Promise<Set<string>> {
  const stuckSince = new Date(Date.now() - CONVITE_PARADO_MS).toISOString();
  const { data, error } = await db()
    .from("as_notificacoes")
    .select("signatario_id")
    .eq("conta_id", contaId)
    .eq("envelope_id", envelopeId)
    .eq("tipo", "convite")
    .or(`status.eq.falhou,and(status.eq.pendente,criado_em.lt.${stuckSince})`);
  if (error) throw error;
  return new Set((data ?? []).map((n) => n.signatario_id).filter((id): id is string => !!id));
}
