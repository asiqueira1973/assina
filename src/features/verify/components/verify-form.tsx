"use client";
// Formulário da verificação (critério 8.8). Dois caminhos:
// - arquivo: o navegador calcula o SHA-256 com a Web Crypto e manda só o hash para
//   /api/verificar (o PDF não sai do computador);
// - código: normaliza (minúsculas, hífens, O→0, I/L→1) e abre /verificar/{codigo}.
// Mostra "Conferindo o arquivo…", o resultado e "Verificar outro documento".
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { FileSearch } from "lucide-react";
import { copy } from "@/lib/copy";
import { normalizeVerificationCode } from "@/lib/verification-code";
import type { VerificationResult } from "../types";
import { VerifyResult } from "./verify-result";
import styles from "./verify.module.css";

// SHA-256 em hexadecimal, no navegador. Recebe: o arquivo. Devolve: 64 caracteres.
async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    await file.arrayBuffer(),
  );
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

export function VerifyForm() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [result, setResult] = useState<VerificationResult | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  // O resultado recebe o foco (a área de arrastar some) e é anunciado pela região viva.
  useEffect(() => {
    if (result) resultRef.current?.focus();
  }, [result]);

  async function check(file: File | undefined) {
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    try {
      const hash = await sha256Hex(file);
      const res = await fetch(`/api/verificar?hash=${hash}`);
      if (!res.ok) throw new Error("falhou");
      setResult((await res.json()) as VerificationResult);
    } catch {
      setError(copy.verify.readFailed);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <>
      <div
        ref={resultRef}
        tabIndex={-1}
        aria-live="polite"
        className={styles.liveRegion}
      >
        {result ? <VerifyResult result={result} /> : null}
      </div>
      {result ? (
        <button
          type="button"
          className={styles.secondary}
          onClick={() => setResult(null)}
        >
          {copy.verify.again}
        </button>
      ) : (
        picker()
      )}
    </>
  );

  function picker() {
    return (
      <>
        <label
          className={`${styles.drop} ${dragging ? styles.dropActive : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void check(e.dataTransfer.files[0]);
          }}
          aria-busy={busy}
        >
          <FileSearch size={28} strokeWidth={1.75} aria-hidden="true" />
          <span>{busy ? copy.verify.checking : copy.verify.drop}</span>
          <input
            ref={input}
            className={styles.hiddenInput}
            type="file"
            accept="application/pdf,.pdf"
            disabled={busy}
            onChange={(e) => void check(e.target.files?.[0])}
          />
        </label>
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
        <p className={styles.or}>{copy.verify.or}</p>
        <form
          className={styles.codeForm}
          onSubmit={(e) => {
            e.preventDefault();
            const normalized = normalizeVerificationCode(code);
            if (!normalized) {
              setCodeError(copy.verify.codeInvalid);
              return;
            }
            router.push(`/verificar/${normalized}`);
          }}
        >
          <label className={styles.codeLabel} htmlFor="codigo">
            {copy.verify.codeLabel}
          </label>
          <div className={styles.codeRow}>
            <input
              id="codigo"
              className={styles.codeInput}
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                setCodeError(null);
              }}
              placeholder={copy.verify.codePlaceholder}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={20}
              aria-invalid={!!codeError}
              aria-describedby={codeError ? "codigo-erro" : undefined}
            />
            <button type="submit" className={styles.button}>
              {copy.verify.codeButton}
            </button>
          </div>
          {codeError ? (
            <p id="codigo-erro" className={styles.error} role="alert">
              {codeError}
            </p>
          ) : null}
        </form>
      </>
    );
  }
}
