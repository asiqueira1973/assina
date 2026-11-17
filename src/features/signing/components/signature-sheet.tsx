"use client";
// Folha "Sua assinatura" / "Sua rubrica" — critério 8.5: abas Digitar (nome em fonte cursiva,
// editável) e Desenhar (canvas, "Limpar"); pede o CPF quando exigido (na assinatura).
// Folha do campo de texto: um campo e "Confirmar". Folha no celular, modal no desktop.
import { useRef, useState } from "react";
import { copy } from "@/lib/copy";
import { isValidCpf } from "@/lib/cpf";
import { ASSINATURA_PNG_MAX_BYTES, NOME_MAX, TEXTO_CAMPO_MAX } from "@/lib/limits";
import { DrawPad, type DrawPadHandle } from "./draw-pad";
import styles from "./signing.module.css";

export type Mark = { metodo: "digitada"; texto: string } | { metodo: "desenhada"; png: string };

type Props =
  | { kind: "assinatura" | "rubrica"; initialText: string; requireCpf: boolean; initialCpf: string; onDone: (mark: Mark, cpf: string) => void; onClose: () => void }
  | { kind: "texto"; label: string; initialText: string; onDone: (value: string) => void; onClose: () => void };

export function SignatureSheet(props: Props) {
  const [tab, setTab] = useState<"digitar" | "desenhar">("digitar");
  const [text, setText] = useState(props.initialText);
  const [cpf, setCpf] = useState(props.kind === "texto" ? "" : props.initialCpf);
  const [ink, setInk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pad = useRef<DrawPadHandle>(null);

  if (props.kind === "texto") {
    return (
      <div className={styles.sheetBackdrop} role="dialog" aria-modal="true" aria-label={props.label} onClick={props.onClose}>
        <div className={styles.sheet} onClick={(e) => e.stopPropagation()}>
          <h2 className={styles.sheetTitle}>{props.label}</h2>
          <input className={styles.input} value={text} maxLength={TEXTO_CAMPO_MAX} autoFocus onChange={(e) => setText(e.target.value)} />
          <button type="button" className={styles.primary} onClick={() => props.onDone(text.trim())}>
            {copy.signer.confirm}
          </button>
        </div>
      </div>
    );
  }

  const needsCpf = props.kind === "assinatura" && props.requireCpf;
  const cpfOk = !needsCpf || isValidCpf(cpf);
  const markOk = tab === "digitar" ? !!text.trim() : ink;

  // Confirma: assinatura digitada ou o PNG do desenho (até 200 KB), e o CPF quando exigido.
  function done() {
    if (!cpfOk) {
      setError(copy.signer.cpfInvalid);
      return;
    }
    if (tab === "digitar") {
      if (props.kind !== "texto") props.onDone({ metodo: "digitada", texto: text.trim() }, cpf);
      return;
    }
    const png = pad.current?.toPng();
    if (!png) return;
    // Conta aproximada do tamanho (base64 → bytes); o servidor confere de novo.
    if ((png.length - 22) * 0.75 > ASSINATURA_PNG_MAX_BYTES) {
      setError(copy.errors.generic);
      return;
    }
    if (props.kind !== "texto") props.onDone({ metodo: "desenhada", png }, cpf);
  }

  const title = props.kind === "assinatura" ? copy.signer.sheetTitle : copy.signer.initialsTitle;
  return (
    <div className={styles.sheetBackdrop} role="dialog" aria-modal="true" aria-label={title} onClick={props.onClose}>
      <div className={styles.sheet} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.sheetTitle}>{title}</h2>
        <div className={styles.tabs} role="tablist">
          {(["digitar", "desenhar"] as const).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} className={`${styles.tab} ${tab === t ? styles.tabActive : ""}`} onClick={() => setTab(t)}>
              {t === "digitar" ? copy.signer.type : copy.signer.draw}
            </button>
          ))}
        </div>
        {tab === "digitar" ? (
          <>
            <input className={styles.input} value={text} maxLength={NOME_MAX} onChange={(e) => setText(e.target.value)} aria-label={title} />
            <p className={styles.cursivePreview} aria-hidden="true">
              {text || " "}
            </p>
          </>
        ) : (
          <>
            <DrawPad ref={pad} onInk={setInk} label={title} />
            <button type="button" className={styles.linkButton} onClick={() => pad.current?.clear()}>
              {copy.signer.clear}
            </button>
          </>
        )}
        {needsCpf ? (
          <label className={styles.field}>
            <span className={styles.label}>{copy.signer.cpf}</span>
            <input
              className={styles.input}
              inputMode="numeric"
              autoComplete="off"
              value={cpf}
              maxLength={14}
              aria-invalid={!!cpf && !cpfOk}
              onChange={(e) => {
                setCpf(e.target.value);
                setError(null);
              }}
            />
            {cpf && !cpfOk ? <span className={styles.fieldError}>{copy.signer.cpfInvalid}</span> : null}
          </label>
        ) : null}
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
        <button type="button" className={styles.primary} disabled={!markOk || !cpfOk} onClick={done}>
          {copy.signer.useSignature}
        </button>
      </div>
    </div>
  );
}
