"use client";
// Editor do rascunho — épico 8.2 (passos 4 a 7) e regra 11.2.
// O estado local é o que a pessoa está digitando; cada mudança é gravada no servidor com debounce
// de 800 ms (PATCH das configurações, PUT da lista inteira de destinatários). O que vale é o
// servidor: os botões de avançar só liberam quando a última gravação foi confirmada e há ao menos
// um assinante salvo. Nunca mostra "salvo" se a gravação falhou.
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, FileText, GripVertical, Plus, X } from "lucide-react";
import { copy } from "@/lib/copy";
import {
  LEMBRETES_PERMITIDOS,
  MAX_ASSINANTES,
  MAX_COPIAS,
  MENSAGEM_MAX,
  NOME_MAX,
  PRAZO_DIAS_MAX,
  PRAZO_DIAS_MIN,
  PRAZOS_SUGERIDOS,
  TITULO_MAX,
} from "@/lib/limits";
import { Dropzone } from "./dropzone";
import { useDebouncedSave, type SaveState } from "../use-debounced-save";
import styles from "./draft.module.css";
import panel from "@/app/painel/painel.module.css";

type Settings = { titulo: string; mensagem: string; em_ordem: boolean; prazo_dias: number; lembrete_cada_dias: number | null };
type Signer = { key: string; nome: string; email: string; papel: "assinar" | "copia"; exigir_cpf: boolean };
type FileInfo = { nome: string; paginas: number; tamanho: number };

type Props = {
  envelopeId: string;
  initialSettings: Settings;
  initialFile: FileInfo | null;
  initialSigners: Signer[];
  alreadySigned: boolean;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEADLINES = PRAZOS_SUGERIDOS.filter((d) => d >= PRAZO_DIAS_MIN && d <= PRAZO_DIAS_MAX);

// Tamanho legível: KB abaixo de 1 MB (um PDF pequeno não aparece como "0 MB").
function formatSize(bytes: number): string {
  const mb = bytes / 1024 / 1024;
  if (mb < 1) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${mb.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
}

// Linha em branco (recém-adicionada) não conta nem é enviada.
function isBlank(s: Signer) {
  return !s.nome.trim() && !s.email.trim();
}

// Erros de cada linha: nome vazio, e-mail inválido ou repetido. Devolve: mapa key → mensagem.
function signerErrors(list: Signer[]): Record<string, string> {
  const errors: Record<string, string> = {};
  const seen = new Map<string, string>();
  for (const s of list) {
    if (isBlank(s)) continue;
    const email = s.email.trim().toLowerCase();
    if (!s.nome.trim() || !EMAIL.test(email)) errors[s.key] = "";
    if (email && seen.has(email)) errors[s.key] = copy.draft.emailRepeated;
    seen.set(email, s.key);
  }
  return errors;
}

export function DraftEditor({ envelopeId, initialSettings, initialFile, initialSigners, alreadySigned }: Props) {
  const [settings, setSettings] = useState<Settings>(initialSettings);
  const [file, setFile] = useState<FileInfo | null>(initialFile);
  const [signers, setSigners] = useState<Signer[]>(
    initialSigners.length ? initialSigners : [{ key: crypto.randomUUID(), nome: "", email: "", papel: "assinar", exigir_cpf: false }],
  );
  const [savedSigners, setSavedSigners] = useState<number>(initialSigners.filter((s) => s.papel === "assinar").length);
  const [notice, setNotice] = useState<{ fieldsRemoved?: boolean; alreadySigned?: boolean }>({ alreadySigned });
  const [replacing, setReplacing] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const saveSettings = useCallback(
    async (value: Settings) => {
      if (!value.titulo.trim()) return false;
      const res = await fetch(`/api/painel/envelopes/${envelopeId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...value, mensagem: value.mensagem.trim() || null }),
      });
      return res.ok;
    },
    [envelopeId],
  );
  const saveSigners = useCallback(
    async (list: Signer[]) => {
      const payload = list.filter((s) => !isBlank(s)).map(({ nome, email, papel, exigir_cpf }) => ({ nome: nome.trim(), email: email.trim().toLowerCase(), papel, exigir_cpf }));
      const res = await fetch(`/api/painel/envelopes/${envelopeId}/signatarios`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ signatarios: payload }),
      });
      if (res.ok) setSavedSigners(payload.filter((s) => s.papel === "assinar").length);
      return res.ok;
    },
    [envelopeId],
  );
  const settingsSave = useDebouncedSave(saveSettings);
  const signersSave = useDebouncedSave(saveSigners);

  // Mudança nas configurações: atualiza a tela e agenda a gravação (título vazio não se grava).
  function changeSettings(patch: Partial<Settings>) {
    const next = { ...settings, ...patch };
    setSettings(next);
    if (next.titulo.trim()) settingsSave.schedule(next);
    else settingsSave.invalidate();
  }

  // Mudança na lista: atualiza a tela e só agenda a gravação se a lista estiver válida; inválida,
  // tira o "Rascunho salvo." (o que está na tela não é o que está no servidor).
  function changeSigners(next: Signer[]) {
    setSigners(next);
    if (Object.keys(signerErrors(next)).length === 0) signersSave.schedule(next);
    else signersSave.invalidate();
  }

  const errors = signerErrors(signers);
  const signerCount = signers.filter((s) => s.papel === "assinar" && !isBlank(s)).length;
  const copyCount = signers.filter((s) => s.papel === "copia" && !isBlank(s)).length;
  const signerRows = signers.filter((s) => s.papel === "assinar");
  // Critério 8.2: com 10 assinantes, o botão de adicionar some e aparece o aviso.
  const canAdd = signerCount < MAX_ASSINANTES && signers.length < MAX_ASSINANTES + MAX_COPIAS;

  function update(key: string, patch: Partial<Signer>) {
    changeSigners(signers.map((s) => (s.key === key ? { ...s, ...patch, ...(patch.papel === "copia" ? { exigir_cpf: false } : {}) } : s)));
  }
  function remove(key: string) {
    changeSigners(signers.filter((s) => s.key !== key));
  }
  function add() {
    setSigners([...signers, { key: crypto.randomUUID(), nome: "", email: "", papel: "assinar", exigir_cpf: false }]);
  }
  // Move um destinatário de posição na lista (ordem de assinatura, regra 11.2).
  function move(from: number, to: number) {
    if (to < 0 || to >= signers.length || from === to) return;
    const next = [...signers];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    changeSigners(next);
  }

  // Avisa a saída da página com gravação pendente.
  useEffect(() => {
    const pending = settingsSave.state === "saving" || signersSave.state === "saving";
    const warn = (e: BeforeUnloadEvent) => pending && e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [settingsSave.state, signersSave.state]);

  const states = [settingsSave.state, signersSave.state];
  const saveState: SaveState = states.includes("error") ? "error" : states.includes("saving") ? "saving" : states.includes("saved") ? "saved" : "idle";
  const ready = !!file && savedSigners > 0 && signerCount > 0 && Object.keys(errors).length === 0 && saveState !== "saving" && saveState !== "error" && !!settings.titulo.trim();
  let orderNumber = 0;

  return (
    <>
      <div className={panel.pageHeader}>
        <h1 className={panel.pageTitle}>{settings.titulo || copy.draft.uploadTitle}</h1>
      </div>

      {notice.alreadySigned ? <p className={styles.warning}>{copy.draft.alreadySigned}</p> : null}
      {notice.fieldsRemoved ? <p className={styles.notice}>{copy.draft.fieldsRemoved}</p> : null}

      <section className={styles.section}>
        {file && !replacing ? (
          <div className={styles.fileCard}>
            <FileText size={28} strokeWidth={1.5} aria-hidden="true" />
            <div className={styles.fileText}>
              <p className={styles.fileName}>{file.nome}</p>
              <p className={styles.fileMeta}>
                {copy.draft.pages(file.paginas)} · {formatSize(file.tamanho)}
              </p>
            </div>
            <button type="button" className={styles.secondaryButton} onClick={() => setReplacing(true)}>
              {copy.draft.replace}
            </button>
          </div>
        ) : (
          <Dropzone
            envelopeId={envelopeId}
            compact={!!file}
            onDone={(result) => {
              // Dados do arquivo como o servidor validou e gravou (resposta do POST /arquivo).
              setFile(result.file);
              setReplacing(false);
              setNotice({ fieldsRemoved: result.fieldsRemoved, alreadySigned: result.alreadySigned });
            }}
          />
        )}
      </section>

      <section className={styles.section}>
        <label className={styles.field}>
          <span className={styles.label}>{copy.draft.title}</span>
          <input
            className={styles.input}
            value={settings.titulo}
            maxLength={TITULO_MAX}
            aria-invalid={!settings.titulo.trim()}
            onChange={(e) => changeSettings({ titulo: e.target.value })}
          />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>{copy.draft.message}</span>
          <textarea className={styles.textarea} value={settings.mensagem} maxLength={MENSAGEM_MAX} onChange={(e) => changeSettings({ mensagem: e.target.value })} />
        </label>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{copy.draft.recipients}</h2>
        <label className={styles.toggle}>
          <input type="checkbox" checked={settings.em_ordem} onChange={(e) => changeSettings({ em_ordem: e.target.checked })} />
          {copy.draft.inOrder}
        </label>
        <ul className={styles.signers}>
          {signers.map((s, index) => {
            const isSigner = s.papel === "assinar";
            if (isSigner) orderNumber++;
            const signerFull = signerCount >= MAX_ASSINANTES && !isSigner;
            return (
              <li
                key={s.key}
                className={`${styles.signer} ${dragIndex === index ? styles.signerDragging : ""}`}
                draggable={settings.em_ordem}
                onDragStart={() => setDragIndex(index)}
                onDragOver={(e) => settings.em_ordem && e.preventDefault()}
                onDrop={() => {
                  if (dragIndex !== null) move(dragIndex, index);
                  setDragIndex(null);
                }}
                onDragEnd={() => setDragIndex(null)}
              >
                <div className={styles.order}>
                  {settings.em_ordem && isSigner ? (
                    <>
                      <GripVertical className={styles.handle} size={18} aria-hidden="true" />
                      <span className={styles.orderNumber}>{orderNumber}</span>
                    </>
                  ) : null}
                </div>
                <label className={styles.field}>
                  <span className={styles.label}>{copy.draft.name}</span>
                  <input className={styles.input} value={s.nome} maxLength={NOME_MAX} autoComplete="off" onChange={(e) => update(s.key, { nome: e.target.value })} />
                </label>
                <label className={`${styles.field} ${styles.emailCell}`}>
                  <span className={styles.label}>{copy.draft.email}</span>
                  <input
                    className={styles.input}
                    type="email"
                    value={s.email}
                    autoComplete="off"
                    aria-invalid={s.key in errors && !!s.email.trim()}
                    onChange={(e) => update(s.key, { email: e.target.value })}
                  />
                  {errors[s.key] ? <span className={styles.fieldError}>{errors[s.key]}</span> : null}
                </label>
                <button type="button" className={styles.iconButton} aria-label={copy.draft.remove} onClick={() => remove(s.key)}>
                  <X size={18} />
                </button>
                <div className={styles.signerOptions}>
                  <select
                    className={styles.select}
                    value={s.papel}
                    onChange={(e) => update(s.key, { papel: e.target.value as Signer["papel"] })}
                  >
                    <option value="assinar" disabled={signerFull}>
                      {copy.draft.signs}
                    </option>
                    <option value="copia" disabled={!isSigner && copyCount >= MAX_COPIAS}>
                      {copy.draft.copy}
                    </option>
                  </select>
                  {isSigner ? (
                    <label className={styles.toggle}>
                      <input type="checkbox" checked={s.exigir_cpf} onChange={(e) => update(s.key, { exigir_cpf: e.target.checked })} />
                      {copy.draft.requireCpf}
                    </label>
                  ) : null}
                  {settings.em_ordem && isSigner ? (
                    <>
                      <button type="button" className={styles.iconButton} aria-label={copy.draft.moveUp} disabled={index === 0} onClick={() => move(index, index - 1)}>
                        <ArrowUp size={18} />
                      </button>
                      <button type="button" className={styles.iconButton} aria-label={copy.draft.moveDown} disabled={index === signers.length - 1} onClick={() => move(index, index + 1)}>
                        <ArrowDown size={18} />
                      </button>
                    </>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
        {signerCount >= MAX_ASSINANTES ? <p className={styles.notice}>{copy.draft.maxSigners}</p> : null}
        {canAdd ? (
          <button type="button" className={styles.secondaryButton} style={{ marginTop: 12 }} onClick={add}>
            <Plus size={18} aria-hidden="true" />
            {copy.draft.addPerson}
          </button>
        ) : null}
        {signerRows.every(isBlank) ? <p className={styles.fieldError}>{copy.draft.needSigner}</p> : null}
      </section>

      <section className={`${styles.section} ${styles.settings}`}>
        <label className={styles.field}>
          <span className={styles.label}>{copy.draft.deadline}</span>
          <select className={styles.select} value={settings.prazo_dias} onChange={(e) => changeSettings({ prazo_dias: Number(e.target.value) })}>
            {[...new Set([...DEADLINES, settings.prazo_dias])].sort((a, b) => a - b).map((d) => (
              <option key={d} value={d}>
                {copy.draft.deadlineDays(d)}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span className={styles.label}>{copy.draft.reminder}</span>
          <select
            className={styles.select}
            value={settings.lembrete_cada_dias ?? ""}
            onChange={(e) => changeSettings({ lembrete_cada_dias: e.target.value ? Number(e.target.value) : null })}
          >
            {LEMBRETES_PERMITIDOS.map((d) => (
              <option key={d} value={d}>
                {copy.draft.reminderEvery(d)}
              </option>
            ))}
            <option value="">{copy.draft.noReminder}</option>
          </select>
        </label>
      </section>

      <div className={styles.footer}>
        <span className={`${styles.saveStatus} ${saveState === "error" ? styles.saveStatusError : ""}`} role="status">
          {saveState === "saving" ? copy.draft.saving : saveState === "saved" ? copy.draft.saved : saveState === "error" ? copy.draft.saveFailed : ""}
        </span>
        <Link className={styles.secondaryButton} href={`/painel/envelopes/${envelopeId}/revisar`} aria-disabled={!ready} tabIndex={ready ? undefined : -1}>
          {copy.draft.sendWithoutFields}
        </Link>
        <Link className={styles.primaryLink} href={`/painel/envelopes/${envelopeId}/campos`} aria-disabled={!ready} tabIndex={ready ? undefined : -1}>
          {copy.draft.nextFields}
        </Link>
      </div>
    </>
  );
}
