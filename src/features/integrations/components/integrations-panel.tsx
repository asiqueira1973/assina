"use client";
// Tela Integrações (critério 8.9): chave de API mascarada com "Mostrar" e "Copiar", "Gerar nova
// chave" com confirmação; webhook com URL, "Salvar", "Remover", "Enviar teste" e o segredo
// (mostrar e copiar). Os valores em claro vêm de /api/painel/integracoes/revelar só quando a
// pessoa pede; depois de cada escrita a página é relida do servidor.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { copy } from "@/lib/copy";
import { WEBHOOK_URL_MAX } from "@/lib/limits";
import styles from "./integrations.module.css";

const t = copy.integrations;
const MASK = "••••••••••••••••••••••••••••••";

async function postJson(path: string, body?: unknown) {
  const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }).catch(() => null);
  const data = (await res?.json().catch(() => null)) as Record<string, unknown> | null;
  return { ok: !!res?.ok, data };
}

// Valor secreto com Mostrar/Ocultar e Copiar.
function Secret({ item, prefix, fresh }: { item: "chave" | "segredo"; prefix: string; fresh: string | null }) {
  const [shown, setShown] = useState<string | null>(fresh);
  const [msg, setMsg] = useState<string | null>(null);
  async function value(): Promise<string | null> {
    if (shown) return shown;
    const r = await postJson("/api/painel/integracoes/revelar", { item });
    return r.ok ? (r.data?.valor as string) : null;
  }
  return (
    <>
      <code className={styles.value}>{shown ?? `${prefix}${MASK}`}</code>
      <div className={styles.row}>
        <button
          type="button"
          className={styles.button}
          onClick={async () => {
            if (shown) return setShown(null);
            const v = await value();
            if (v) setShown(v);
            else setMsg(copy.errors.generic);
          }}
        >
          {shown ? t.hide : t.show}
        </button>
        <button
          type="button"
          className={styles.button}
          onClick={async () => {
            const v = await value();
            const ok = v ? await navigator.clipboard?.writeText(v).then(() => true, () => false) : false;
            if (ok) setMsg(t.copied);
            else if (v) setShown(v); // sem área de transferência: mostra para copiar à mão
            else setMsg(copy.errors.generic);
          }}
        >
          {t.copy}
        </button>
        {msg ? (
          <span className={styles.ok} role="status">
            {msg}
          </span>
        ) : null}
      </div>
    </>
  );
}

export function IntegrationsPanel({ keyPrefix, webhookUrl, hasSecret }: { keyPrefix: string | null; webhookUrl: string | null; hasSecret: boolean }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [keyMsg, setKeyMsg] = useState<string | null>(null);
  const [url, setUrl] = useState(webhookUrl ?? "");
  const [hookMsg, setHookMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  async function rotate() {
    setBusy(true);
    const r = await postJson("/api/painel/integracoes/chave");
    setBusy(false);
    setConfirming(false);
    if (r.ok) {
      setNewKey(r.data?.chave as string);
      setKeyMsg(t.newKeyDone);
      router.refresh();
    } else setKeyMsg(copy.errors.generic);
  }

  async function save(value: string | null) {
    setBusy(true);
    const r = await postJson("/api/painel/integracoes/webhook", { url: value });
    setBusy(false);
    if (r.ok) {
      setHookMsg({ text: value ? t.saved : t.removed, ok: true });
      if (!value) setUrl("");
      router.refresh();
    } else setHookMsg({ text: r.data?.codigo === "url_invalida" ? t.invalidUrl : copy.errors.generic, ok: false });
  }

  async function test() {
    setBusy(true);
    const r = await postJson("/api/painel/integracoes/webhook/teste");
    setBusy(false);
    const n = Number(r.data?.status_http ?? 0);
    setHookMsg(r.ok ? (n >= 200 && n < 300 ? { text: t.testOk(n), ok: true } : { text: t.testFail(n), ok: false }) : { text: copy.errors.generic, ok: false });
  }

  return (
    <>
      <section className={styles.card} aria-labelledby="chave-titulo">
        <h2 id="chave-titulo" className={styles.heading}>
          {t.apiKey}
        </h2>
        <p className={styles.help}>{t.apiKeyHelp}</p>
        {/* Logo depois de gerar, a chave nova aparece em claro (uma vez), antes mesmo de a página reler o prefixo. */}
        {keyPrefix || newKey ? <Secret key={newKey ?? "atual"} item="chave" prefix={keyPrefix ?? newKey!.slice(0, 12)} fresh={newKey} /> : null}
        {confirming ? (
          <div className={styles.confirm} role="alertdialog" aria-label={t.newKeyConfirm}>
            <span>{t.newKeyConfirm}</span>
            <button type="button" className={styles.button} onClick={() => setConfirming(false)}>
              {t.cancel}
            </button>
            <button type="button" className={`${styles.button} ${styles.primary}`} disabled={busy} onClick={rotate}>
              {t.confirm}
            </button>
          </div>
        ) : (
          <div className={styles.row}>
            <button type="button" className={styles.button} onClick={() => setConfirming(true)}>
              {t.newKey}
            </button>
          </div>
        )}
        {keyMsg ? (
          <p className={styles.ok} role="status">
            {keyMsg}
          </p>
        ) : null}
        <p className={styles.help}>
          <Link href="/docs/api">{t.docs}</Link>
        </p>
      </section>

      <section className={styles.card} aria-labelledby="webhook-titulo">
        <h2 id="webhook-titulo" className={styles.heading}>
          {t.webhook}
        </h2>
        <p className={styles.help}>{t.webhookHelp}</p>
        <form
          className={styles.row}
          onSubmit={(e) => {
            e.preventDefault();
            void save(url.trim() || null);
          }}
        >
          <label className={styles.label} htmlFor="webhook-url">
            {t.webhookUrl}
          </label>
          <input id="webhook-url" className={styles.input} type="url" inputMode="url" value={url} maxLength={WEBHOOK_URL_MAX} placeholder={t.webhookPlaceholder} onChange={(e) => setUrl(e.target.value)} />
          <button type="submit" className={`${styles.button} ${styles.primary}`} disabled={busy}>
            {t.save}
          </button>
          {webhookUrl ? (
            <>
              <button type="button" className={styles.button} disabled={busy} onClick={test}>
                {t.test}
              </button>
              <button type="button" className={`${styles.button} ${styles.danger}`} disabled={busy} onClick={() => save(null)}>
                {t.remove}
              </button>
            </>
          ) : null}
        </form>
        {hookMsg ? (
          <p className={hookMsg.ok ? styles.ok : styles.error} role={hookMsg.ok ? "status" : "alert"}>
            {hookMsg.text}
          </p>
        ) : null}
        {hasSecret ? (
          <>
            <p className={styles.label}>{t.secret}</p>
            <p className={styles.help}>{t.secretHelp}</p>
            <Secret item="segredo" prefix="whsec_" fresh={null} />
          </>
        ) : null}
      </section>
    </>
  );
}
