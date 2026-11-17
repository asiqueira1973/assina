// [Remetente] Envelopes — seção 10. Uso do nível no topo (regra 11.20, épico 8.4). Por enquanto
// só o estado vazio; a lista, os filtros e a busca chegam no 8.7.
import Link from "next/link";
import { Suspense } from "react";
import { Plus } from "lucide-react";
import { UsageLine } from "@/features/envelopes/components/usage-line";
import { getCurrentAccount } from "@/server/auth/require-conta";
import { getUsage } from "@/server/envelopes/usage";
import { copy } from "@/lib/copy";
import styles from "./painel.module.css";

// Página do painel: depende da sessão, fica fora da validação de navegação instantânea (ver o
// comentário em src/app/painel/layout.tsx e a pegadinha no CLAUDE.md).
export const instant = false;

// Uso do nível da conta (regra 11.20), lido do servidor.
async function Usage() {
  const account = await getCurrentAccount();
  if (!account) return null;
  return <UsageLine usage={await getUsage(account.id, account.nivel)} />;
}

export default function EnvelopesPage() {
  return (
    <>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>{copy.envelopes.title}</h1>
        <Link className={styles.primaryButton} href="/painel/envelopes/novo">
          <Plus size={18} strokeWidth={2.25} aria-hidden="true" />
          {copy.envelopes.newButton}
        </Link>
      </div>
      <Suspense fallback={null}>
        <Usage />
      </Suspense>
      <div className={styles.empty}>
        <p className={styles.emptyText}>{copy.envelopes.emptyAll}</p>
        <Link className={styles.emptyAction} href="/painel/envelopes/novo">
          {copy.envelopes.emptyAllAction}
        </Link>
      </div>
    </>
  );
}
