// [Público] Política de privacidade — critério 8.12 e seção 20.2. Texto em
// copy.legal.privacySections. Indexável (seção 17).
import type { Metadata } from "next";
import { LegalPage } from "@/features/public/components/legal-page";
import { copy } from "@/lib/copy";

export const metadata: Metadata = {
  title: `${copy.legal.privacy} · ${copy.appName}`,
  robots: { index: true, follow: true },
};

export default function PrivacidadePage() {
  return <LegalPage title={copy.legal.privacy} sections={copy.legal.privacySections} />;
}
