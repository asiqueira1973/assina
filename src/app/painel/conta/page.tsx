// [Remetente] Conta — seção 10. No épico 8.1: nome, e-mail e Sair (POST /sair, nunca link).
// Nível e uso chegam no 8.4; excluir a conta, no 8.12.
import { Suspense } from "react";
import { copy } from "@/lib/copy";
import { getCurrentAccount } from "@/server/auth/require-conta";
import styles from "../painel.module.css";
import conta from "./conta.module.css";

// Lê a conta da sessão (dentro de <Suspense>, Cache Components).
async function AccountDetails() {
  const account = await getCurrentAccount();
  if (!account) return null;
  return (
    <div className={conta.card}>
      <p className={conta.name}>{account.nome}</p>
      <p className={conta.email}>{account.email}</p>
    </div>
  );
}

// Página do painel: depende da sessão, fica fora da validação de navegação instantânea (ver o
// comentário em src/app/painel/layout.tsx e a pegadinha no CLAUDE.md).
export const instant = false;

export default function ContaPage() {
  return (
    <>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>{copy.account.title}</h1>
      </div>
      <Suspense fallback={<div className={conta.card} aria-busy="true" />}>
        <AccountDetails />
      </Suspense>
      <form action="/sair" method="post">
        <button className={conta.signOut} type="submit">{copy.account.signOut}</button>
      </form>
    </>
  );
}
