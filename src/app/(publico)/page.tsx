// [Público] Página inicial — critério 8.12 e seção 15.1: o que é o Assina, "Entrar com Google",
// "Verificar um documento", a seção "A assinatura vale?" (com o aviso sobre atos que exigem ICP,
// de LEGAL_NEGATIVAS) e o rodapé.
// Quem tem sessão é mandado ao painel pelo proxy. Indexável (seção 17).
import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/features/public/components/site-footer";
import styles from "@/features/public/components/public.module.css";
import { copy, LEGAL_NEGATIVAS } from "@/lib/copy";

export const metadata: Metadata = {
  title: copy.appName,
  description: copy.home.subtitle,
  robots: { index: true, follow: true },
};

export default function HomePage() {
  const t = copy.home;
  return (
    <main className={styles.page}>
      <div className={styles.column}>
        <section className={styles.hero}>
          <p className={styles.brand}>{copy.appName}</p>
          <h1 className={styles.title}>{t.title}</h1>
          <p className={styles.subtitle}>{t.subtitle}</p>
          <div className={styles.actions}>
            {/* Rota de API que redireciona ao Google: <a> de propósito (Link faria pré-carregamento). */}
            <a className={styles.primary} href="/api/auth/google">{t.signIn}</a>
            <Link className={styles.secondary} href="/verificar">{t.verify}</Link>
          </div>
        </section>
        {/* A assinatura vale? (25/11/2026): a validade em linguagem simples, com o aviso sobre ICP-Brasil. */}
        <section className={styles.section} aria-labelledby="validade">
          <h2 id="validade">{t.validityTitle}</h2>
          {t.validity.map((p) => (
            <p key={p}>{p}</p>
          ))}
          <p>{LEGAL_NEGATIVAS.homeNotice}</p>
          <p>
            <Link href="/termos">{t.validityTerms}</Link>
          </p>
        </section>
      </div>
      <SiteFooter />
    </main>
  );
}
