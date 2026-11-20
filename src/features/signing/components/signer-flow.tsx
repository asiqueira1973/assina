"use client";
// Fluxo do signatário — épico 8.5 (princípio 3: do link à assinatura em até três passos).
// 1) Identificação: remetente, título e "Enviar código para a***@…".
// 2) Código de 6 dígitos (autocomplete one-time-code) → consentimento (texto versionado).
// 3) Documento (pdf.js, só depois do código) com os campos do signatário destacados, barra fixa
//    "Campos: n de m", "Próximo campo" e "Assinar"; a folha "Sua assinatura" (Digitar ou
//    Desenhar, CPF quando exigido). Alternativa: "Recusar" com motivo.
// O que vale é o servidor: "Documento assinado." só depois da resposta 200.
import "@fontsource/dancing-script/400.css";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { PdfPageCanvas, usePdfDocument } from "@/features/pdf/pdf-page";
import { copy } from "@/lib/copy";
import { isValidBirthdate } from "@/lib/birthdate";
import { isValidCpf } from "@/lib/cpf";
import { signerColor } from "@/lib/fields";
import { CODIGO_INTERVALO_S, CONSENTIMENTO_VERSAO, MOTIVO_MAX } from "@/lib/limits";
import { SignatureSheet, type Mark } from "./signature-sheet";
import styles from "./signing.module.css";

type Field = { id: string; tipo: "assinatura" | "rubrica" | "data" | "nome" | "texto" | "caixa"; pagina: number; x: number; y: number; largura: number; altura: number; obrigatorio: boolean; rotulo: string | null };

type Props = {
  token: string;
  senderName: string;
  title: string;
  maskedEmail: string;
  signerName: string;
  requireCpf: boolean;
  requireBirthdate: boolean;
  hasSession: boolean;
  colorIndex: number;
  pages: { l: number; a: number }[];
  fields: Field[];
};

type Step = "identificar" | "codigo" | "consentir" | "documento" | "assinado" | "recusado";
type Sheet = { kind: "assinatura" } | { kind: "rubrica" } | { kind: "texto"; fieldId: string } | null;

// Assinatura vazia para o useSyncExternalStore: só distingue servidor (false) de cliente (true).
const noSubscribe = () => () => {};

// Iniciais para a rubrica digitada ("Ana Maria Souza" → "AMS").
function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase())
    .join("")
    .slice(0, 4);
}

// Data de hoje em Brasília, só para mostrar no campo (o valor gravado é feito no banco).
function todayBr(): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

export function SignerFlow(p: Props) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(p.hasSession ? "consentir" : "identificar");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [resendIn, setResendIn] = useState(0);
  const [consent, setConsent] = useState(false);
  const [signature, setSignature] = useState<Mark | null>(null);
  const [initials, setInitials] = useState<Mark | null>(null);
  const [cpf, setCpf] = useState("");
  const [birthdate, setBirthdate] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [sheet, setSheet] = useState<Sheet>(null);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const viewed = useRef(false);
  const [lastSigner, setLastSigner] = useState(false);
  // O botão "Enviar código" vem pronto do servidor, mas só funciona depois que o JavaScript
  // carrega: até lá fica desativado, para nenhum clique se perder (achado em produção, 20/11/2026).
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  const color = signerColor(p.colorIndex);
  const api = (path: string) => `/api/assinar/${p.token}/${path}`;

  // Contagem regressiva do "Reenviar código" (regra 11.4: 60 s entre envios).
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  // O PDF só é pedido no passo do documento (depois do código).
  const { pdf, failed: pdfFailed } = usePdfDocument(step === "documento" ? api("documento") : null);

  // Respostas que mudam a situação (link trocado, prazo, alguém recusou): relê a página do
  // servidor, que mostra o estado certo. Sem sessão: volta para o código.
  function handleSituation(codigo: string): boolean {
    if (codigo === "sem_sessao") {
      setStep("identificar");
      return true;
    }
    if (["status_mudou", "prazo_encerrado", "link_invalido", "indisponivel"].includes(codigo)) {
      router.refresh();
      return true;
    }
    return false;
  }

  async function post(path: string, body?: unknown) {
    const res = await fetch(api(path), { method: "POST", headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data } as { ok: boolean; data: { codigo?: string; restantes?: number; envelope_status?: string } };
  }

  // Passo 1: pede o código.
  async function sendCode() {
    setBusy(true);
    setError(null);
    const { ok, data } = await post("codigo").catch(() => ({ ok: false, data: {} as { codigo?: string } }));
    setBusy(false);
    if (ok) {
      setStep("codigo");
      setResendIn(CODIGO_INTERVALO_S);
      return;
    }
    if (data.codigo && handleSituation(data.codigo)) return;
    if (data.codigo === "aguarde") {
      setStep("codigo");
      setResendIn(CODIGO_INTERVALO_S);
    } else setError(data.codigo === "limite_hora" ? copy.signer.codeTooMany : copy.signer.codeSendFailed);
  }

  // Passo 2: valida o código (abre a sessão no servidor).
  async function checkCode() {
    setBusy(true);
    setError(null);
    const { ok, data } = await post("validar", { codigo: code }).catch(() => ({ ok: false, data: {} as { codigo?: string; restantes?: number } }));
    setBusy(false);
    if (ok) {
      setStep("consentir");
      return;
    }
    if (data.codigo && handleSituation(data.codigo)) return;
    const messages: Record<string, string> = {
      bloqueado: copy.signer.codeBlocked,
      expirado: copy.signer.codeExpired,
      sem_codigo: copy.signer.codeExpired,
    };
    setError(data.codigo === "errado" && typeof data.restantes === "number" ? copy.signer.codeWrong(data.restantes) : (messages[data.codigo ?? ""] ?? copy.errors.generic));
  }

  // Situação de cada campo: preenchido ou não (data e nome são automáticos).
  function isDone(f: Field): boolean {
    if (f.tipo === "assinatura") return !!signature;
    if (f.tipo === "rubrica") return !!initials;
    if (f.tipo === "texto") return !f.obrigatorio || !!values[f.id]?.trim();
    if (f.tipo === "caixa") return !f.obrigatorio || values[f.id] === "sim";
    return true;
  }
  // Sem campos (assina só no manifesto), a assinatura conta como o único campo.
  const total = p.fields.length || 1;
  const done = p.fields.length ? p.fields.filter(isDone).length : signature ? 1 : 0;
  const ready = consent && !!signature && p.fields.every(isDone) && (!p.requireCpf || isValidCpf(cpf)) && (!p.requireBirthdate || isValidBirthdate(birthdate));

  // Abre o que falta: o próximo campo pendente (rolando até ele), ou a assinatura.
  function openField(f: Field) {
    if (f.tipo === "assinatura") setSheet({ kind: "assinatura" });
    else if (f.tipo === "rubrica") setSheet({ kind: "rubrica" });
    else if (f.tipo === "texto") setSheet({ kind: "texto", fieldId: f.id });
    else if (f.tipo === "caixa") setValues((v) => ({ ...v, [f.id]: v[f.id] === "sim" ? "nao" : "sim" }));
  }
  function nextField() {
    const pending = p.fields.find((f) => !isDone(f));
    if (!pending) {
      if (!signature || (p.requireCpf && !isValidCpf(cpf)) || (p.requireBirthdate && !isValidBirthdate(birthdate))) setSheet({ kind: "assinatura" });
      return;
    }
    document.querySelector(`[data-field-id="${pending.id}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    openField(pending);
  }

  // Passo 3: assina. Só mostra sucesso com a resposta do servidor.
  async function submit() {
    if (!ready || !signature) return;
    setBusy(true);
    setError(null);
    const body = {
      consentimento: CONSENTIMENTO_VERSAO,
      metodo: signature.metodo,
      assinatura_texto: signature.metodo === "digitada" ? signature.texto : undefined,
      assinatura_png: signature.metodo === "desenhada" ? signature.png : undefined,
      rubrica_texto: initials?.metodo === "digitada" ? initials.texto : undefined,
      rubrica_png: initials?.metodo === "desenhada" ? initials.png : undefined,
      cpf: p.requireCpf ? cpf : undefined,
      data_nascimento: p.requireBirthdate ? birthdate : undefined,
      campos: p.fields.filter((f) => f.tipo === "texto" || f.tipo === "caixa").map((f) => ({ id: f.id, valor: values[f.id] ?? "" })),
    };
    const { ok, data } = await post("assinar", body).catch(() => ({ ok: false, data: {} as { codigo?: string } }));
    setBusy(false);
    if (ok) {
      // "finalizando": esta foi a última assinatura e o documento final já está sendo gerado.
      setLastSigner((data as { envelope_status?: string }).envelope_status === "finalizando");
      setStep("assinado");
      return;
    }
    if (data.codigo && handleSituation(data.codigo)) return;
    setError(data.codigo === "cpf_invalido" ? copy.signer.cpfInvalid : data.codigo === "nascimento_invalido" ? copy.signer.birthdateInvalid : copy.errors.generic);
  }

  async function submitDecline() {
    setBusy(true);
    setError(null);
    const { ok, data } = await post("recusar", { motivo: reason }).catch(() => ({ ok: false, data: {} as { codigo?: string } }));
    setBusy(false);
    if (ok) {
      setDeclining(false);
      setStep("recusado");
      return;
    }
    if (data.codigo && handleSituation(data.codigo)) return;
    setError(copy.errors.generic);
  }

  // Cartões dos passos 1 e 2 e dos finais.
  if (step === "assinado" || step === "recusado" || step === "identificar" || step === "codigo" || step === "consentir") {
    return (
      <main className={styles.page}>
        <div className={styles.card}>
          <p className={styles.brand}>{p.senderName}</p>
          {step === "assinado" ? (
            <>
              <h1 className={styles.stateTitle}>{copy.signer.signed}</h1>
              <p className={styles.muted}>{lastSigner ? copy.signer.signedLast : copy.signer.signedNext}</p>
            </>
          ) : step === "recusado" ? (
            <h1 className={styles.stateTitle}>{copy.signer.declined(p.senderName)}</h1>
          ) : (
            <>
              <p className={styles.intro}>{copy.signer.intro(p.senderName)}</p>
              <h1 className={styles.docTitle}>{p.title}</h1>
              {step === "identificar" ? (
                <>
                  <p className={styles.muted}>{copy.signer.codeWillGo(p.maskedEmail)}</p>
                  <button type="button" className={styles.primary} disabled={busy || !hydrated} aria-busy={busy} onClick={sendCode}>
                    {copy.signer.sendCode}
                  </button>
                </>
              ) : step === "codigo" ? (
                <form
                  className={styles.form}
                  onSubmit={(e) => {
                    e.preventDefault();
                    void checkCode();
                  }}
                >
                  <label className={styles.field}>
                    <span className={styles.label}>{copy.signer.typeCode}</span>
                    <input
                      className={`${styles.input} ${styles.codeInput}`}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      value={code}
                      autoFocus
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    />
                  </label>
                  <button type="submit" className={styles.primary} disabled={busy || code.length !== 6} aria-busy={busy}>
                    {copy.signer.continue}
                  </button>
                  <button type="button" className={styles.linkButton} disabled={resendIn > 0 || busy} onClick={sendCode}>
                    {resendIn > 0 ? copy.signer.resendIn(resendIn) : copy.signer.resend}
                  </button>
                </form>
              ) : (
                <>
                  <label className={styles.consent}>
                    <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                    <span>{copy.signer.consent}</span>
                  </label>
                  <button type="button" className={styles.primary} disabled={!consent} onClick={() => setStep("documento")}>
                    {copy.signer.continue}
                  </button>
                </>
              )}
            </>
          )}
          {error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </main>
    );
  }

  // Passo 3: o documento.
  return (
    <main className={styles.docPage}>
      <header className={styles.docHeader}>
        <div>
          <p className={styles.brand}>{p.senderName}</p>
          <h1 className={styles.docTitle}>{p.title}</h1>
        </div>
        <button type="button" className={styles.linkButton} onClick={() => setDeclining(true)}>
          {copy.signer.decline}
        </button>
      </header>

      {pdfFailed ? <p className={styles.error}>{copy.fields.loadFailed}</p> : null}
      <div className={styles.pages}>
        {p.pages.map((size, i) => {
          const pagina = i + 1;
          return (
            <div key={pagina} className={styles.pdfPage} style={{ aspectRatio: `${size.l} / ${size.a}` }}>
              <PdfPageCanvas
                pdf={pdf}
                pageNumber={pagina}
                onRendered={() => {
                  // Critério 8.5: "visualizou" quando a primeira página aparece (o servidor grava uma vez por sessão).
                  if (pagina === 1 && !viewed.current) {
                    viewed.current = true;
                    void fetch(api("visualizou"), { method: "POST" });
                  }
                }}
              />
              {!pdf && !pdfFailed ? <span className={styles.loading}>{copy.fields.loading}</span> : null}
              {p.fields
                .filter((f) => f.pagina === pagina)
                .map((f) => {
                  const ok = isDone(f) && (f.tipo !== "texto" || !!values[f.id]) && (f.tipo !== "caixa" || values[f.id] === "sim");
                  const label =
                    f.tipo === "assinatura"
                      ? signature
                      : f.tipo === "rubrica"
                        ? initials
                        : null;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      data-field-id={f.id}
                      className={`${styles.docField} ${ok ? styles.fieldDone : ""}`}
                      style={{
                        left: `${f.x * 100}%`,
                        top: `${f.y * 100}%`,
                        width: `${f.largura * 100}%`,
                        height: `${f.altura * 100}%`,
                        borderColor: ok ? "var(--green)" : color,
                      }}
                      disabled={f.tipo === "data" || f.tipo === "nome"}
                      aria-label={f.rotulo || copy.fields.types[f.tipo]}
                      onClick={() => openField(f)}
                    >
                      {label?.metodo === "desenhada" ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={label.png} alt="" className={styles.fieldImage} />
                      ) : label?.metodo === "digitada" ? (
                        <span className={styles.cursive}>{label.texto}</span>
                      ) : f.tipo === "data" ? (
                        <span>{todayBr()}</span>
                      ) : f.tipo === "nome" ? (
                        <span>{p.signerName}</span>
                      ) : f.tipo === "caixa" ? (
                        <span>{values[f.id] === "sim" ? "✓" : ""}</span>
                      ) : f.tipo === "texto" && values[f.id] ? (
                        <span>{values[f.id]}</span>
                      ) : (
                        <span className={styles.fieldHint}>{f.rotulo || copy.fields.types[f.tipo]}</span>
                      )}
                    </button>
                  );
                })}
            </div>
          );
        })}
      </div>

      <div className={styles.bar}>
        {error ? (
          <p className={styles.barError} role="alert">
            {error}
          </p>
        ) : null}
        <span className={styles.progress}>{copy.signer.progress(done, total)}</span>
        <button type="button" className={styles.secondary} onClick={nextField}>
          {copy.signer.nextField}
        </button>
        <button type="button" className={styles.primary} disabled={!ready || busy} aria-busy={busy} onClick={submit}>
          {copy.signer.sign}
        </button>
      </div>

      {sheet?.kind === "assinatura" ? (
        <SignatureSheet
          kind="assinatura"
          initialText={signature?.metodo === "digitada" ? signature.texto : p.signerName}
          requireCpf={p.requireCpf}
          initialCpf={cpf}
          requireBirthdate={p.requireBirthdate}
          initialBirthdate={birthdate}
          onClose={() => setSheet(null)}
          onDone={(mark, newCpf, newBirthdate) => {
            setSignature(mark);
            setCpf(newCpf);
            setBirthdate(newBirthdate);
            setSheet(null);
          }}
        />
      ) : sheet?.kind === "rubrica" ? (
        <SignatureSheet
          kind="rubrica"
          initialText={initials?.metodo === "digitada" ? initials.texto : initialsOf(p.signerName)}
          requireCpf={false}
          initialCpf=""
          requireBirthdate={false}
          initialBirthdate=""
          onClose={() => setSheet(null)}
          onDone={(mark) => {
            setInitials(mark);
            setSheet(null);
          }}
        />
      ) : sheet?.kind === "texto" ? (
        <SignatureSheet
          kind="texto"
          label={p.fields.find((f) => f.id === sheet.fieldId)?.rotulo || copy.fields.types.texto}
          initialText={values[sheet.fieldId] ?? ""}
          onClose={() => setSheet(null)}
          onDone={(value) => {
            setValues((v) => ({ ...v, [sheet.fieldId]: value }));
            setSheet(null);
          }}
        />
      ) : null}

      {declining ? (
        <div className={styles.sheetBackdrop} role="dialog" aria-modal="true" aria-label={copy.signer.declineTitle} onClick={() => setDeclining(false)}>
          <div className={styles.sheet} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.sheetTitle}>{copy.signer.declineTitle}</h2>
            <label className={styles.field}>
              <span className={styles.label}>{copy.signer.declineAsk(p.senderName)}</span>
              <textarea className={styles.textarea} value={reason} maxLength={MOTIVO_MAX} autoFocus onChange={(e) => setReason(e.target.value)} />
            </label>
            <button type="button" className={styles.danger} disabled={!reason.trim() || busy} aria-busy={busy} onClick={submitDecline}>
              {copy.signer.decline}
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
