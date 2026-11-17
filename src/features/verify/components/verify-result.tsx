// Resultado da verificação (critério 8.8, regra 11.11). Só apresentação, sem estado: a página do
// código (servidor) e o formulário (cliente) usam o mesmo componente. Mostra a frase da seção 15
// e o resumo permitido: título, situação, enviado e concluído em (Brasília), selo, e os nomes
// dos assinantes com a data e a hora da assinatura.
import { StatusPill } from "@/features/envelopes/components/status-pill";
import { copy } from "@/lib/copy";
import { formatDateTime } from "@/lib/format";
import type { PublicSummary, VerificationResult } from "@/server/verification/lookup";
import styles from "./verify.module.css";

function Summary({ e }: { e: PublicSummary }) {
  const v = copy.verify;
  return (
    <section className={styles.card} aria-label={e.titulo}>
      <div className={styles.cardHeader}>
        <h2 className={styles.docTitle}>{e.titulo}</h2>
        <StatusPill status={e.status} />
      </div>
      {/* Só enquanto pode concluir: recusado, cancelado e expirado já dizem tudo pela pílula. */}
      {e.status === "enviado" || e.status === "finalizando" ? <p className={styles.notice}>{v.notConcluded}</p> : null}
      <dl className={styles.rows}>
        {e.enviado_em ? (
          <>
            <dt>{v.sentAt}</dt>
            <dd>{formatDateTime(e.enviado_em)}</dd>
          </>
        ) : null}
        {e.concluido_em ? (
          <>
            <dt>{v.completedAt}</dt>
            <dd>{formatDateTime(e.concluido_em)}</dd>
          </>
        ) : null}
        {e.selo ? (
          <>
            <dt>{v.seal}</dt>
            <dd>{v.sealLevel[e.selo]}</dd>
          </>
        ) : null}
      </dl>
      <div>
        <p className={styles.muted}>{v.signers}</p>
        <ul className={styles.people}>
          {e.assinantes.map((s, i) => (
            <li key={i}>
              <span>{s.nome}</span>
              <span className={styles.muted}>{s.assinado_em ? v.signedAt(formatDateTime(s.assinado_em)) : v.notSigned}</span>
            </li>
          ))}
        </ul>
      </div>
      <p className={styles.muted}>{v.timezone}</p>
    </section>
  );
}

export function VerifyResult({ result }: { result: VerificationResult }) {
  const v = copy.verify;
  if (result.resultado === "nao_encontrado") {
    return <p className={`${styles.headline} ${styles.none}`}>{v.notFound}</p>;
  }
  if (result.resultado === "original_multiplo") {
    return (
      <div className={styles.column}>
        <p className={`${styles.headline} ${styles.info}`}>{v.original}</p>
        <p className={styles.intro}>{v.originalMany}</p>
      </div>
    );
  }
  return (
    <div className={styles.column}>
      {result.resultado === "final" ? <p className={`${styles.headline} ${styles.ok}`}>{v.final}</p> : null}
      {result.resultado === "original" ? <p className={`${styles.headline} ${styles.info}`}>{v.original}</p> : null}
      {result.envelopes.map((e, i) => (
        <Summary key={i} e={e} />
      ))}
    </div>
  );
}
