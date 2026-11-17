"use client";
// Ações por destinatário no detalhe (critério 8.7): "Lembrar" (regra 11.5) e "Copiar link de
// assinatura" (gera link novo; o anterior deixa de valer). O resultado aparece ao lado, e o
// detalhe é relido do servidor (nada de estado local com o que acabou de ir para o banco).
import { useRouter } from "next/navigation";
import { useState } from "react";
import { copy } from "@/lib/copy";
import styles from "./detail.module.css";

const MESSAGES: Record<string, string> = {
  lembrete_recente: copy.detail.remindTooSoon,
  limite_lembretes: copy.detail.remindLimit,
  status_mudou: copy.detail.changed,
  prazo_encerrado: copy.detail.deadlinePassed,
};

export function SignerActions({ envelopeId, signerId }: { envelopeId: string; signerId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"remind" | "link" | null>(null);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [manualLink, setManualLink] = useState<string | null>(null);

  async function call(kind: "remind" | "link") {
    setBusy(kind);
    setMessage(null);
    setManualLink(null);
    const res = await fetch(`/api/painel/envelopes/${envelopeId}/signatarios/${signerId}/${kind === "remind" ? "lembrar" : "link"}`, { method: "POST" }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { codigo?: string; link?: string } | null;
    if (res?.ok && kind === "link" && data?.link) {
      // O link só existe nesta resposta: vai direto para a área de transferência.
      const copied = await navigator.clipboard?.writeText(data.link).then(() => true, () => false);
      if (copied) setMessage({ text: copy.detail.linkCopied, ok: true });
      else {
        setMessage({ text: copy.detail.linkManual, ok: true });
        setManualLink(data.link);
      }
    } else if (res?.ok) {
      setMessage({ text: copy.detail.reminded, ok: true });
    } else {
      setMessage({ text: MESSAGES[data?.codigo ?? ""] ?? copy.errors.generic, ok: false });
    }
    setBusy(null);
    router.refresh();
  }

  return (
    <div className={styles.signerActions}>
      <button type="button" className={styles.smallButton} disabled={!!busy} aria-busy={busy === "remind"} onClick={() => call("remind")}>
        {copy.detail.remind}
      </button>
      <button type="button" className={styles.smallButton} disabled={!!busy} aria-busy={busy === "link"} onClick={() => call("link")}>
        {copy.detail.copyLink}
      </button>
      {message ? (
        <p className={message.ok ? styles.okText : styles.errorText} role={message.ok ? "status" : "alert"}>
          {message.text}
        </p>
      ) : null}
      {manualLink ? (
        <input className={styles.linkInput} readOnly value={manualLink} aria-label={copy.detail.linkLabel} autoFocus onFocus={(e) => e.currentTarget.select()} />
      ) : null}
    </div>
  );
}
