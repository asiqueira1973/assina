// [Remetente] Conta — seção 10. No épico 8.1: nome, e-mail e Sair (POST /sair, nunca link).
// Nível e uso (regra 11.20) desde o 8.4; "Excluir minha conta" desde o 8.12.
import { Suspense } from "react";
import { copy } from "@/lib/copy";
import { DeleteAccount } from "@/features/account/components/delete-account";
import { UsageLine } from "@/features/envelopes/components/usage-line";
import { getCurrentAccount } from "@/server/auth/require-conta";
import { getUsage } from "@/server/envelopes/usage";
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
      <div className={conta.usage}>
        <UsageLine usage={await getUsage(account.id, account.nivel)} />
      </div>
    </div>
  );
}

// "Excluir minha conta", com o e-mail da conta como dica do campo de confirmação.
async function DeleteAccountAction() {
  const account = await getCurrentAccount();
  return account ? <DeleteAccount email={account.email} /> : null;
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
      <div className={conta.actions}>
        <form action="/sair" method="post">
          <button className={conta.signOut} type="submit">{copy.account.signOut}</button>
        </form>
        <Suspense fallback={null}>
          <DeleteAccountAction />
        </Suspense>
      </div>
    </>
  );
}
