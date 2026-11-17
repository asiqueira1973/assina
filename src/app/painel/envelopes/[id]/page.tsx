// [Remetente] Detalhe do envelope — épicos 8.4 e 8.7. Mostra:
// - cabeçalho com título, status e código de verificação; "Enviado." quando vem do envio;
// - a faixa laranja de convite que falhou, com "Tentar de novo" (8.4);
// - as ações: Baixar original, Baixar assinado, Exportar trilha, Cancelar e Excluir (8.7);
// - os destinatários com status e data, e "Lembrar" / "Copiar link de assinatura" para quem
//   está aguardando num envelope enviado;
// - a trilha em linha do tempo (data em Brasília, quem, ação e IP) com o selo de integridade
//   (as_fn_verifica_trilha).
// Rascunho volta para a edição. Tudo lido no servidor; as ações releem a página.
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import detail from "@/features/envelopes/components/detail.module.css";
import { EnvelopeActions } from "@/features/envelopes/components/envelope-actions";
import { RetryInviteButton } from "@/features/envelopes/components/retry-invite-button";
import styles from "@/features/envelopes/components/review.module.css";
import { SignerActions } from "@/features/envelopes/components/signer-actions";
import { StatusPill } from "@/features/envelopes/components/status-pill";
import panel from "@/app/painel/painel.module.css";
import { copy } from "@/lib/copy";
import { formatDateTime, formatDateTimeSeconds } from "@/lib/format";
import { getCurrentAccount } from "@/server/auth/require-conta";
import { getEnvelope, getSigners, type EnvelopeRow, type SignerRow } from "@/server/envelopes/drafts";
import { getTrail, type TrailEvent } from "@/server/envelopes/manage";
import { formatVerificationCode } from "@/server/envelopes/verification-code";
import { invitesWithProblem } from "@/server/notifications/invites";

// Página do painel: fica fora da validação de navegação instantânea (CLAUDE.md, pegadinhas).
export const instant = false;

type Props = PageProps<"/painel/envelopes/[id]">;

const FINAL = new Set(["concluido", "recusado", "cancelado", "expirado"]);

// Texto do status de um destinatário (seção 15).
function signerStatus(envelope: EnvelopeRow, s: SignerRow): string {
  if (s.papel === "copia") return copy.status.signerCopy;
  if (s.status === "assinou" && s.assinado_em) return copy.status.signerSigned(formatDateTime(s.assinado_em));
  if (s.status === "recusou" && s.recusado_em) return copy.status.signerDeclined(formatDateTime(s.recusado_em));
  // "Aguardando" só enquanto o envelope está enviado: cancelado ou expirado, ninguém aguarda mais.
  if (envelope.status !== "enviado") return "";
  return s.status === "aguardando" ? copy.status.signerWaiting : copy.status.signerWaitingTurn;
}

// Quem fez o evento: a pessoa (signatário), a conta (remetente) ou o rótulo do ator.
function who(e: TrailEvent, accountName: string): string {
  if (e.pessoa) return e.pessoa;
  if (e.ator === "remetente") return accountName;
  return copy.trailActors[e.ator];
}

async function Detail({ params, searchParams }: Props) {
  const account = await getCurrentAccount();
  if (!account) redirect("/entrar");
  const { id } = await params;
  const envelope = await getEnvelope(account.id, id);
  if (!envelope) notFound();
  if (envelope.status === "rascunho") redirect(`/painel/envelopes/${id}/editar`);
  const [signers, failedIds, trail] = await Promise.all([getSigners(account.id, id), invitesWithProblem(account.id, id), getTrail(account.id, id)]);
  const { enviado } = await searchParams;
  const ordered = [...signers.filter((s) => s.papel === "assinar"), ...signers.filter((s) => s.papel === "copia")];
  const active = (s: SignerRow) => envelope.status === "enviado" && s.papel === "assinar" && s.status === "aguardando";

  return (
    <div className={styles.page}>
      {enviado ? <p className={styles.success}>{copy.review.sent}</p> : null}
      <div className={styles.headerRow}>
        <h1 className={panel.pageTitle}>{envelope.titulo}</h1>
        <StatusPill status={envelope.status} />
      </div>
      <p className={styles.code}>
        {copy.detail.verificationCode}: {formatVerificationCode(envelope.codigo_verificacao)}
      </p>
      {envelope.status === "cancelado" && envelope.motivo_cancelamento ? (
        <p className={`${styles.value} ${styles.muted}`}>{copy.detail.canceledReason(envelope.motivo_cancelamento)}</p>
      ) : null}

      {ordered
        .filter((s) => active(s) && failedIds.has(s.id))
        .map((s) => (
          <div key={s.id} className={`${styles.warning} ${styles.banner}`} role="alert">
            <span>{copy.detail.inviteFailed(s.email)}</span>
            <RetryInviteButton envelopeId={id} signerId={s.id} />
          </div>
        ))}

      <EnvelopeActions
        envelopeId={id}
        titulo={envelope.titulo}
        canDownloadOriginal={!!envelope.arquivo_original_path}
        canDownloadSigned={envelope.status === "concluido" && !!envelope.arquivo_final_path}
        canCancel={envelope.status === "enviado"}
        canDelete={FINAL.has(envelope.status)}
      />

      <div className={styles.card}>
        <p className={styles.label}>{copy.draft.recipients}</p>
        <ul className={styles.people}>
          {ordered.map((s) => (
            <li key={s.id} className={styles.person}>
              <span className={styles.order}>{envelope.em_ordem && s.papel === "assinar" ? s.ordem : ""}</span>
              <div className={styles.personText}>
                <p className={styles.personName}>{s.nome}</p>
                <p className={styles.personMeta}>{s.email}</p>
                {active(s) ? <SignerActions envelopeId={id} signerId={s.id} /> : null}
              </div>
              <span className={styles.side}>{signerStatus(envelope, s)}</span>
            </li>
          ))}
        </ul>
      </div>

      <section className={styles.card} aria-labelledby="trail-title">
        <div className={detail.trailHeader}>
          <p id="trail-title" className={styles.label}>{copy.detail.trail}</p>
          {trail.divergence === null ? (
            <span className={`${detail.integrity} ${detail.integrityOk}`}>{copy.detail.trailOk}</span>
          ) : (
            <span className={`${detail.integrity} ${detail.integrityBad}`} role="alert">{copy.detail.trailBroken(trail.divergence)}</span>
          )}
        </div>
        <ol className={detail.timeline}>
          {trail.events.map((e) => (
            <li key={e.seq} className={detail.event}>
              <span className={detail.when}>{formatDateTimeSeconds(e.ocorrido_em)}</span>
              <span className={detail.what}>
                {copy.events[e.tipo]}
                <span className={detail.who}>{who(e, account.nome)}</span>
              </span>
              <span className={detail.ip}>{e.ip ?? copy.detail.noIp}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

export default function EnvelopePage(props: Props) {
  return (
    <Suspense fallback={<div className={styles.card} aria-busy="true" />}>
      <Detail {...props} />
    </Suspense>
  );
}
