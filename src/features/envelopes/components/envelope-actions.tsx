"use client";
// Ações do envelope no detalhe (critério 8.7): downloads e "Exportar trilha" são links GET
// (as rotas registram o download na trilha); "Cancelar envelope" pede um motivo opcional;
// "Excluir" pede o título digitado (seção 7.4); quem confere é o servidor (o título do rascunho
// pode ter mudado depois de a tela carregar). Diálogos nativos (<dialog>), com foco e Esc.
// Depois de cancelar, o detalhe é relido do servidor; depois de excluir, volta para a lista.
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { MOTIVO_CANCELAMENTO_MAX, TITULO_MAX } from "@/lib/limits";
import { copy } from "@/lib/copy";
import styles from "./detail.module.css";

type Props = {
  envelopeId: string;
  titulo: string;
  canDownloadOriginal: boolean;
  canDownloadSigned: boolean;
  canCancel: boolean;
  canDelete: boolean;
  /** Rascunho não tem trilha a exportar. */
  canExport?: boolean;
};

export function EnvelopeActions(p: Props) {
  const router = useRouter();
  const cancelRef = useRef<HTMLDialogElement>(null);
  const deleteRef = useRef<HTMLDialogElement>(null);
  const [motivo, setMotivo] = useState("");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const base = `/api/painel/envelopes/${p.envelopeId}`;

  function open(ref: React.RefObject<HTMLDialogElement | null>) {
    setError(null);
    ref.current?.showModal();
  }

  async function submit(kind: "cancel" | "delete") {
    setBusy(true);
    setError(null);
    const res = await fetch(kind === "cancel" ? `${base}/cancelar` : base, {
      method: kind === "cancel" ? "POST" : "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(kind === "cancel" ? { motivo: motivo.trim() || null } : { titulo: typed }),
    }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { codigo?: string } | null;
    setBusy(false);
    if (res?.ok) {
      if (kind === "delete") {
        router.replace("/painel?excluido=1");
        return;
      }
      cancelRef.current?.close();
      router.refresh();
      return;
    }
    setError(data?.codigo === "status_mudou" ? copy.detail.changed : data?.codigo === "titulo_nao_confere" ? copy.detail.deleteMismatch : copy.errors.generic);
  }

  return (
    <>
      <div className={styles.actions}>
        {p.canDownloadOriginal ? (
          <a className={styles.actionButton} href={`${base}/arquivo?versao=original`}>
            {copy.detail.downloadOriginal}
          </a>
        ) : null}
        {p.canDownloadSigned ? (
          <a className={styles.actionButton} href={`${base}/arquivo?versao=final`}>
            {copy.detail.downloadSigned}
          </a>
        ) : null}
        {p.canExport !== false ? (
          <a className={styles.actionButton} href={`${base}/trilha.csv`}>
            {copy.detail.exportTrail}
          </a>
        ) : null}
        {p.canCancel ? (
          <button type="button" className={`${styles.actionButton} ${styles.danger}`} onClick={() => open(cancelRef)}>
            {copy.detail.cancel}
          </button>
        ) : null}
        {p.canDelete ? (
          <button type="button" className={`${styles.actionButton} ${styles.danger}`} onClick={() => open(deleteRef)}>
            {copy.detail.delete}
          </button>
        ) : null}
      </div>

      <dialog ref={cancelRef} className={styles.dialog} aria-labelledby="cancel-title">
        <form method="dialog" onSubmit={(e) => { e.preventDefault(); void submit("cancel"); }}>
          <h2 id="cancel-title" className={styles.dialogTitle}>{copy.detail.cancelTitle}</h2>
          <label className={styles.dialogLabel} htmlFor="cancel-reason">{copy.detail.cancelBody}</label>
          <textarea id="cancel-reason" className={styles.textarea} value={motivo} maxLength={MOTIVO_CANCELAMENTO_MAX} onChange={(e) => setMotivo(e.target.value)} />
          {error ? <p className={styles.errorText} role="alert">{error}</p> : null}
          <div className={styles.dialogButtons}>
            <button type="button" className={styles.actionButton} onClick={() => cancelRef.current?.close()}>{copy.detail.close}</button>
            <button type="submit" className={styles.dangerFilled} disabled={busy} aria-busy={busy}>{copy.detail.cancelConfirm}</button>
          </div>
        </form>
      </dialog>

      <dialog ref={deleteRef} className={styles.dialog} aria-labelledby="delete-title">
        <form method="dialog" onSubmit={(e) => { e.preventDefault(); void submit("delete"); }}>
          <h2 id="delete-title" className={styles.dialogTitle}>{copy.detail.deleteTitle}</h2>
          <label className={styles.dialogLabel} htmlFor="delete-title-input">{copy.detail.deleteBody}</label>
          <input id="delete-title-input" className={styles.input} value={typed} maxLength={TITULO_MAX} autoComplete="off" placeholder={p.titulo} onChange={(e) => setTyped(e.target.value)} />
          {error ? <p className={styles.errorText} role="alert">{error}</p> : null}
          <div className={styles.dialogButtons}>
            <button type="button" className={styles.actionButton} onClick={() => deleteRef.current?.close()}>{copy.detail.close}</button>
            <button type="submit" className={styles.dangerFilled} disabled={busy || !typed.trim()} aria-busy={busy}>{copy.detail.deleteConfirm}</button>
          </div>
        </form>
      </dialog>
    </>
  );
}
