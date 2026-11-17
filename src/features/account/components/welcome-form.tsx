"use client";
// Boas-vindas — critério 8.1 e seção 6.1: sem marcar o aceite, "Continuar" fica desabilitado.
// Ao aceitar, grava pelo POST /api/painel/conta/boas-vindas e recarrega o painel a partir do
// servidor (toda escrita invalida a leitura; nada de copiar o valor para o estado local).
// Os links de Termos e Privacidade apontam para as páginas do épico 8.12.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { copy } from "@/lib/copy";
import styles from "./welcome.module.css";

export function WelcomeForm() {
  const router = useRouter();
  const [accepted, setAccepted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const [before, rest] = copy.welcome.accept.split(copy.welcome.terms);
  const [middle, after] = rest.split(copy.welcome.privacy);

  // Grava o aceite. Só mostra sucesso (o painel) depois que o servidor confirmou.
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!accepted || saving) return;
    setSaving(true);
    setFailed(false);
    try {
      const res = await fetch("/api/painel/conta/boas-vindas", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ aceite: true }),
      });
      if (!res.ok) throw new Error(String(res.status));
      router.refresh();
    } catch {
      setFailed(true);
      setSaving(false);
    }
  }

  return (
    <form className={styles.card} onSubmit={submit}>
      <h1 className={styles.title}>{copy.welcome.title}</h1>
      <label className={styles.accept}>
        <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
        <span>
          {before}
          <Link href="/termos" target="_blank">{copy.welcome.terms}</Link>
          {middle}
          <Link href="/privacidade" target="_blank">{copy.welcome.privacy}</Link>
          {after}
        </span>
      </label>
      {failed ? <p className={styles.error} role="alert">{copy.errors.generic}</p> : null}
      <button className={styles.button} type="submit" disabled={!accepted || saving} aria-busy={saving}>
        {copy.welcome.button}
      </button>
    </form>
  );
}
