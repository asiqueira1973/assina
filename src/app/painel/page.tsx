// [Remetente] Envelopes — seção 10. No épico 8.1 só existe o estado vazio; a lista, os filtros e
// a busca chegam no 8.7.
import Link from "next/link";
import { Plus } from "lucide-react";
import { copy } from "@/lib/copy";
import styles from "./painel.module.css";

// Página do painel: depende da sessão, fica fora da validação de navegação instantânea (ver o
// comentário em src/app/painel/layout.tsx e a pegadinha no CLAUDE.md).
export const instant = false;

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
      <div className={styles.empty}>
        <p className={styles.emptyText}>{copy.envelopes.emptyAll}</p>
        <Link className={styles.emptyAction} href="/painel/envelopes/novo">
          {copy.envelopes.emptyAllAction}
        </Link>
      </div>
    </>
  );
}
