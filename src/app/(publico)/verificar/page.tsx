// [Público] Verificar — critério 8.8 e seção 10. Arrastar o PDF (o hash é calculado no navegador)
// ou digitar o código do manifesto. Página indexável (seção 17).
import type { Metadata } from "next";
import { VerifyForm } from "@/features/verify/components/verify-form";
import styles from "@/features/verify/components/verify.module.css";
import { copy } from "@/lib/copy";

export const metadata: Metadata = {
  title: `${copy.verify.title} · ${copy.appName}`,
  description: copy.verify.intro,
  robots: { index: true, follow: true },
};

export default function VerificarPage() {
  return (
    <main className={styles.page}>
      <div className={styles.column}>
        <p className={styles.brand}>{copy.appName}</p>
        <h1 className={styles.title}>{copy.verify.title}</h1>
        <p className={styles.intro}>{copy.verify.intro}</p>
        <VerifyForm />
      </div>
    </main>
  );
}
