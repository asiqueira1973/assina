// [Remetente] Verificar documento dentro do painel (sugestão do Petr, 20/11/2026): o mesmo
// formulário da página pública /verificar (critério 8.8), sem sair do sistema. Qualquer documento
// assinado pelo Assina, não só os da conta: a consulta é pública e devolve só o resumo da 11.11.
import type { Metadata } from "next";
import { VerifyForm } from "@/features/verify/components/verify-form";
import verify from "@/features/verify/components/verify.module.css";
import { copy } from "@/lib/copy";
import styles from "../painel.module.css";

// O layout do painel lê a sessão; a página também sai da navegação instantânea (CLAUDE.md).
export const instant = false;

export const metadata: Metadata = { title: `${copy.verify.title} · ${copy.appName}` };

export default function PainelVerificarPage() {
  return (
    <>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>{copy.verify.title}</h1>
      </div>
      <div className={verify.panelColumn}>
        <p className={verify.intro}>{copy.verify.intro}</p>
        <VerifyForm inline />
      </div>
    </>
  );
}
