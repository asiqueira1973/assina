// [Remetente] Detalhe do envelope — versão do épico 8.4 (o 8.7 acrescenta trilha, ações e
// downloads). Mostra o status, "Enviado." quando vem do envio, o código de verificação, os
// destinatários com o status de cada um e a faixa laranja de convite que falhou, com
// "Tentar de novo". Rascunho volta para a edição.
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { RetryInviteButton } from "@/features/envelopes/components/retry-invite-button";
import styles from "@/features/envelopes/components/review.module.css";
import { StatusPill } from "@/features/envelopes/components/status-pill";
import panel from "@/app/painel/painel.module.css";
import { copy } from "@/lib/copy";
import { formatDateTime } from "@/lib/format";
import { getCurrentAccount } from "@/server/auth/require-conta";
import { getEnvelope, getSigners, type EnvelopeRow, type SignerRow } from "@/server/envelopes/drafts";
import { formatVerificationCode } from "@/server/envelopes/verification-code";
import { invitesWithProblem } from "@/server/notifications/invites";

// Página do painel: fica fora da validação de navegação instantânea (CLAUDE.md, pegadinhas).
export const instant = false;

type Props = PageProps<"/painel/envelopes/[id]">;

// Texto do status de um destinatário (seção 15).
function signerStatus(envelope: EnvelopeRow, s: SignerRow): string {
  if (s.papel === "copia") return copy.status.signerCopy;
  if (s.status === "assinou" && s.assinado_em) return copy.status.signerSigned(formatDateTime(s.assinado_em));
  if (s.status === "recusou" && s.recusado_em) return copy.status.signerDeclined(formatDateTime(s.recusado_em));
  if (s.status === "aguardando") return copy.status.signerWaiting;
  return envelope.status === "enviado" ? copy.status.signerWaitingTurn : "";
}

async function Detail({ params, searchParams }: Props) {
  const account = await getCurrentAccount();
  if (!account) redirect("/entrar");
  const { id } = await params;
  const envelope = await getEnvelope(account.id, id);
  if (!envelope) notFound();
  if (envelope.status === "rascunho") redirect(`/painel/envelopes/${id}/editar`);
  const signers = await getSigners(account.id, id);
  const failedIds = await invitesWithProblem(account.id, id);
  const { enviado } = await searchParams;
  const ordered = [...signers.filter((s) => s.papel === "assinar"), ...signers.filter((s) => s.papel === "copia")];

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

      {ordered
        .filter((s) => envelope.status === "enviado" && failedIds.has(s.id) && s.status === "aguardando")
        .map((s) => (
          <div key={s.id} className={`${styles.warning} ${styles.banner}`} role="alert">
            <span>{copy.detail.inviteFailed(s.email)}</span>
            <RetryInviteButton envelopeId={id} signerId={s.id} />
          </div>
        ))}

      <div className={styles.card}>
        <p className={styles.label}>{copy.draft.recipients}</p>
        <ul className={styles.people}>
          {ordered.map((s) => (
            <li key={s.id} className={styles.person}>
              <span className={styles.order}>{envelope.em_ordem && s.papel === "assinar" ? s.ordem : ""}</span>
              <div className={styles.personText}>
                <p className={styles.personName}>{s.nome}</p>
                <p className={styles.personMeta}>{s.email}</p>
              </div>
              <span className={styles.side}>{signerStatus(envelope, s)}</span>
            </li>
          ))}
        </ul>
      </div>
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
