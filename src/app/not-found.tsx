// 404 geral (endereço que não existe), no padrão das páginas públicas (seção 16): título, uma
// frase e o caminho de volta. Substitui a tela padrão do Next, que é em inglês.
import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/features/public/components/site-footer";
import styles from "@/features/public/components/public.module.css";
import { copy } from "@/lib/copy";

export const metadata: Metadata = { title: `${copy.notFound.title.replace(/\.$/, "")} · ${copy.appName}` };

export default function NotFound() {
  const t = copy.notFound;
  return (
    <main className={styles.page}>
      <div className={styles.column}>
        <section className={styles.hero}>
          <p className={styles.brand}>{copy.appName}</p>
          <h1 className={styles.legalTitle}>{t.title}</h1>
          <p className={styles.subtitle}>{t.text}</p>
          <div className={styles.actions}>
            <Link className={styles.primary} href="/">{t.home}</Link>
          </div>
        </section>
      </div>
      <SiteFooter />
    </main>
  );
}
