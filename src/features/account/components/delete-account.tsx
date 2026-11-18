"use client";
// "Excluir minha conta" (seção 15.1, Conta; épico 8.12): diálogo nativo que pede o e-mail da conta.
// Quem confere é o servidor (POST /api/painel/conta/excluir). Excluída, a sessão já foi apagada
// pela resposta e a navegação vai para a página inicial.
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { EMAIL_CONFIRMACAO_MAX } from "@/lib/limits";
import { copy } from "@/lib/copy";
import styles from "./delete-account.module.css";

export function DeleteAccount({ email }: { email: string }) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = copy.account;

  // Pede a exclusão. Só sai da tela depois que o servidor confirmou.
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !typed.trim()) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/painel/conta/excluir", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: typed }),
    }).catch(() => null);
    if (res?.ok) {
      router.replace("/");
      return;
    }
    const data = (await res?.json().catch(() => null)) as { codigo?: string } | null;
    setBusy(false);
    setError(data?.codigo === "email_nao_confere" ? t.deleteMismatch : copy.errors.generic);
  }

  return (
    <>
      <button type="button" className={styles.open} onClick={() => { setError(null); ref.current?.showModal(); }}>
        {t.delete}
      </button>
      <dialog ref={ref} className={styles.dialog} aria-labelledby="delete-account-title">
        <form method="dialog" onSubmit={submit}>
          <h2 id="delete-account-title" className={styles.title}>{t.deleteTitle}</h2>
          <label className={styles.label} htmlFor="delete-account-email">{t.deleteBody}</label>
          <input
            id="delete-account-email"
            className={styles.input}
            type="email"
            value={typed}
            maxLength={EMAIL_CONFIRMACAO_MAX}
            autoComplete="off"
            placeholder={email}
            onChange={(e) => { setTyped(e.target.value); setError(null); }}
          />
          {error ? <p className={styles.error} role="alert">{error}</p> : null}
          <div className={styles.buttons}>
            <button type="button" className={styles.back} onClick={() => ref.current?.close()}>{t.close}</button>
            <button type="submit" className={styles.confirm} disabled={busy || !typed.trim()} aria-busy={busy}>{t.deleteConfirm}</button>
          </div>
        </form>
      </dialog>
    </>
  );
}
