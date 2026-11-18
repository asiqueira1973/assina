// Página de texto legal (Termos e Privacidade, seção 20 e critério 8.12): título, data da
// atualização e seções com parágrafos, tudo de copy.legal, com o rodapé público.
import Link from "next/link";
import { copy } from "@/lib/copy";
import { SiteFooter } from "./site-footer";
import styles from "./public.module.css";

type Section = { title: string; paragraphs: readonly string[] };

export function LegalPage({ title, sections }: { title: string; sections: readonly Section[] }) {
  return (
    <main className={styles.page}>
      <article className={styles.column}>
        <Link href="/" className={styles.brand}>{copy.appName}</Link>
        <h1 className={styles.legalTitle}>{title}</h1>
        <p className={styles.updated}>{copy.legal.updated}</p>
        {sections.map((s) => (
          <section key={s.title} className={styles.section}>
            <h2>{s.title}</h2>
            {s.paragraphs.map((p) => <p key={p}>{p}</p>)}
          </section>
        ))}
      </article>
      <SiteFooter />
    </main>
  );
}
