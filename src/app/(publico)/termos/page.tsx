// [Público] Termos de uso — critério 8.12 e seção 20.1. Texto em copy.legal.termsSections.
// Indexável (seção 17).
import type { Metadata } from "next";
import { LegalPage } from "@/features/public/components/legal-page";
import { copy } from "@/lib/copy";

export const metadata: Metadata = {
  title: `${copy.legal.terms} · ${copy.appName}`,
  robots: { index: true, follow: true },
};

export default function TermosPage() {
  return <LegalPage title={copy.legal.terms} sections={copy.legal.termsSections} />;
}
