"use client";
// Área de arrastar ou escolher o PDF — épico 8.2 (passo 2 e 3 do fluxo).
// Mostra progresso do envio, "Conferindo o arquivo…" e o erro com a frase da seção 15.
// Com envelopeId, troca o arquivo de um rascunho existente; sem, cria o rascunho.
import { useRef, useState } from "react";
import { FileUp } from "lucide-react";
import { copy } from "@/lib/copy";
import { UploadError, uploadPdf, type AttachResult } from "../upload";
import styles from "./draft.module.css";

type Props = {
  envelopeId?: string;
  compact?: boolean;
  onDone: (result: AttachResult) => void;
};

export function Dropzone({ envelopeId, compact, onDone }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Rascunho criado numa tentativa que falhou: a próxima tentativa troca o arquivo dele.
  const [draftId, setDraftId] = useState<string | undefined>(envelopeId);
  const busy = progress !== null;

  // Sobe o arquivo escolhido e avisa o pai quando o servidor validou.
  async function handle(file: File | undefined) {
    if (!file || busy) return;
    setError(null);
    setProgress(0);
    setChecking(false);
    try {
      // Rascunho que nasceu de uma tentativa recusada aqui: o título acompanha o novo arquivo.
      const result = await uploadPdf(file, { envelopeId: draftId, retitle: !!draftId && draftId !== envelopeId, onProgress: setProgress, onChecking: () => setChecking(true) });
      onDone(result);
    } catch (e) {
      const failedDraft = (e as UploadError & { envelopeId?: string }).envelopeId;
      if (failedDraft) setDraftId(failedDraft);
      setError(e instanceof UploadError ? e.message : copy.errors.generic);
    } finally {
      setProgress(null);
      setChecking(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div>
      <label
        className={`${styles.dropzone} ${compact ? styles.dropzoneCompact : ""} ${dragging ? styles.dragging : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void handle(e.dataTransfer.files[0]);
        }}
        aria-busy={busy}
      >
        <input ref={input} type="file" accept="application/pdf,.pdf" className={styles.fileInput} disabled={busy} onChange={(e) => void handle(e.target.files?.[0])} />
        <FileUp size={compact ? 20 : 32} strokeWidth={1.5} aria-hidden="true" />
        {busy ? (
          <span className={styles.dropzoneText}>{checking ? copy.draft.checking : copy.draft.uploading.replace("{n}", String(progress))}</span>
        ) : (
          <>
            <span className={styles.dropzoneText}>{copy.draft.dropzone}</span>
            {!compact && <span className={styles.dropzoneHint}>{copy.draft.dropzoneHint}</span>}
          </>
        )}
        {busy && !checking ? (
          <span className={styles.progress} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress ?? 0}>
            <span style={{ width: `${progress}%` }} />
          </span>
        ) : null}
      </label>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
