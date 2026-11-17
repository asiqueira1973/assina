"use client";
// Botão "Enviar para assinatura" — épico 8.4. Só mostra sucesso depois que o servidor confirmou
// o envio; os erros saem com as frases da seção 15 (limites, mudou de situação, genérico).
import { useRouter } from "next/navigation";
import { useState } from "react";
import { copy } from "@/lib/copy";
import styles from "./review.module.css";

export function SendButton({ envelopeId, levelLimit }: { envelopeId: string; levelLimit: number }) {
  const router = useRouter();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Envia e, confirmado, vai para o detalhe com o aviso "Enviado.".
  async function send() {
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/painel/envelopes/${envelopeId}/enviar`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        router.push(`/painel/envelopes/${envelopeId}?enviado=1`);
        return;
      }
      const messages: Record<string, string> = {
        limite_diario: copy.review.limitDaily,
        limite_do_nivel: copy.review.limitLevel(levelLimit),
        status_mudou: copy.review.changed,
        envelope_mudou: copy.review.changed,
        sem_assinante: copy.draft.needSigner,
      };
      setError(messages[body.codigo] ?? copy.errors.generic);
    } catch {
      setError(copy.errors.generic);
    }
    setSending(false);
  }

  return (
    <>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      <button type="button" className={styles.sendButton} disabled={sending} aria-busy={sending} onClick={send}>
        {copy.review.send}
      </button>
    </>
  );
}
