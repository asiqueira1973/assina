"use client";
// "Tentar de novo" da faixa laranja de convite que falhou (critério 8.4). Reenvia com link novo
// e recarrega o detalhe a partir do servidor; se falhar, a faixa continua e mostra o erro.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { copy } from "@/lib/copy";
import styles from "./review.module.css";

export function RetryInviteButton({ envelopeId, signerId }: { envelopeId: string; signerId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <>
      {failed ? (
        <span className={styles.inlineError} role="alert">
          {copy.errors.generic}
        </span>
      ) : null}
      <button
      type="button"
      className={styles.retry}
      disabled={busy}
      aria-busy={busy}
      onClick={async () => {
        setBusy(true);
        setFailed(false);
        const res = await fetch(`/api/painel/envelopes/${envelopeId}/signatarios/${signerId}/convite`, { method: "POST" }).catch(() => null);
        // Sucesso: a faixa some ao reler o detalhe. Falha: a faixa fica, com o aviso.
        if (!res?.ok) setFailed(true);
        router.refresh();
        setBusy(false);
      }}
    >
      {copy.detail.retry}
      </button>
    </>
  );
}
