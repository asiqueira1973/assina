// Rodapé das páginas públicas (seção 15.1, critério 8.12): Privacidade · Termos · Código aberto no
// GitHub · Um produto DabLab.
import Link from "next/link";
import { copy } from "@/lib/copy";
import styles from "./public.module.css";

export function SiteFooter() {
  const t = copy.footer;
  const sep = <span className={styles.separator} aria-hidden="true">·</span>;
  // Dois pares que não se quebram; no celular, um par por linha (sem "·" sobrando no começo).
  return (
    <footer className={styles.footer}>
      <span className={styles.group}>
        <Link href="/privacidade">{t.privacy}</Link>
        {sep}
        <Link href="/termos">{t.terms}</Link>
      </span>
      <span className={`${styles.separator} ${styles.groupSeparator}`} aria-hidden="true">·</span>
      <span className={styles.group}>
        <a href={t.sourceUrl} rel="noopener">{t.source}</a>
        {sep}
        <a href={t.madeByUrl} rel="noopener">{t.madeBy}</a>
      </span>
    </footer>
  );
}
