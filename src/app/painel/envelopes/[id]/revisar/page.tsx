// [Remetente] Revisar e enviar — épico 8.4. Resumo do rascunho (título, mensagem, destinatários
// na ordem com a contagem de campos, prazo e lembrete) e avisos:
// - assinante sem campo de assinatura num envelope com campos (critério 8.3);
// - PDF que já vinha assinado eletronicamente (regra 11.1, recalculado lendo o original);
// - "Depois de enviado, o documento não pode ser alterado.".
// Fora de rascunho vai para o detalhe; sem arquivo ou sem assinante, para a edição.
import Link from "next/link";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { SendButton } from "@/features/envelopes/components/send-button";
import styles from "@/features/envelopes/components/review.module.css";
import panel from "@/app/painel/painel.module.css";
import { copy } from "@/lib/copy";
import { LIMITE_ARQUIVO_BYTES, LIMITE_POR_NIVEL } from "@/lib/limits";
import { getCurrentAccount } from "@/server/auth/require-conta";
import { getEnvelope, getSigners } from "@/server/envelopes/drafts";
import { getFields } from "@/server/envelopes/fields";
import { storage } from "@/server/files/storage";
import { validatePdf } from "@/server/pdf/validate";

// Página do painel: fica fora da validação de navegação instantânea (CLAUDE.md, pegadinhas).
export const instant = false;

type Props = PageProps<"/painel/envelopes/[id]/revisar">;

async function Review({ params }: Props) {
  const account = await getCurrentAccount();
  if (!account) redirect("/entrar");
  const { id } = await params;
  const envelope = await getEnvelope(account.id, id);
  if (!envelope) notFound();
  if (envelope.status !== "rascunho") redirect(`/painel/envelopes/${id}`);
  const signers = await getSigners(account.id, id);
  const assinantes = signers.filter((s) => s.papel === "assinar");
  if (!envelope.arquivo_original_path || assinantes.length === 0) redirect(`/painel/envelopes/${id}/editar`);

  const [fields, bytes] = await Promise.all([getFields(account.id, id), storage().read(envelope.arquivo_original_path, LIMITE_ARQUIVO_BYTES)]);
  const check = bytes ? await validatePdf(bytes) : null;
  const alreadySigned = !!check && check.ok && check.alreadySigned;
  const countBySigner = new Map<string, number>();
  for (const f of fields) countBySigner.set(f.signatario_id, (countBySigner.get(f.signatario_id) ?? 0) + 1);
  const withoutSignature = fields.length
    ? assinantes.filter((s) => !fields.some((f) => f.signatario_id === s.id && f.tipo === "assinatura"))
    : [];
  const ordered = [...assinantes, ...signers.filter((s) => s.papel === "copia")];

  return (
    <div className={styles.page}>
      <div className={panel.pageHeader}>
        <h1 className={panel.pageTitle}>{copy.review.title}</h1>
      </div>

      {withoutSignature.map((s) => (
        <p key={s.id} className={styles.warning}>
          {copy.review.noSignatureField(s.nome)}
        </p>
      ))}
      {alreadySigned ? <p className={styles.warning}>{copy.draft.alreadySigned}</p> : null}

      <div className={styles.card}>
        <p className={styles.label}>{copy.draft.title}</p>
        <p className={styles.value}>{envelope.titulo}</p>
      </div>
      <div className={styles.card}>
        <p className={styles.label}>{copy.review.message}</p>
        <p className={`${styles.value} ${envelope.mensagem ? "" : styles.muted}`}>{envelope.mensagem ?? copy.review.noMessage}</p>
      </div>
      <div className={styles.card}>
        <p className={styles.label}>{envelope.em_ordem ? `${copy.draft.recipients} · ${copy.draft.inOrder}` : copy.draft.recipients}</p>
        <ul className={styles.people}>
          {ordered.map((s) => (
            <li key={s.id} className={styles.person}>
              <span className={styles.order}>{envelope.em_ordem && s.papel === "assinar" ? s.ordem : ""}</span>
              <div className={styles.personText}>
                <p className={styles.personName}>{s.nome}</p>
                <p className={styles.personMeta}>{s.email}</p>
              </div>
              <span className={styles.side}>{s.papel === "copia" ? copy.draft.copy : copy.review.fieldsCount(countBySigner.get(s.id) ?? 0)}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className={`${styles.card} ${styles.settings}`}>
        <div>
          <p className={styles.label}>{copy.draft.deadline}</p>
          <p className={styles.value}>{copy.draft.deadlineDays(envelope.prazo_dias)}</p>
        </div>
        <div>
          <p className={styles.label}>{copy.draft.reminder}</p>
          <p className={styles.value}>{envelope.lembrete_cada_dias ? copy.draft.reminderEvery(envelope.lembrete_cada_dias) : copy.draft.noReminder}</p>
        </div>
      </div>

      <p className={styles.notice}>{copy.review.frozen}</p>
      <div className={styles.footer}>
        <Link className={styles.editLink} href={`/painel/envelopes/${id}/editar`}>
          {copy.review.edit}
        </Link>
        <SendButton envelopeId={id} levelLimit={LIMITE_POR_NIVEL[account.nivel]} />
      </div>
    </div>
  );
}

export default function RevisarPage(props: Props) {
  return (
    <Suspense fallback={<div className={styles.card} aria-busy="true" />}>
      <Review {...props} />
    </Suspense>
  );
}
