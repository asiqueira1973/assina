// Layout raiz: idioma pt-BR, tokens visuais (seção 16) e noindex por padrão (seção 17). As páginas
// indexáveis (/, /verificar, /docs/api, /privacidade, /termos) sobrepõem com index: true.
import type { Metadata } from "next";
import { copy } from "@/lib/copy";
import "./globals.css";

export const metadata: Metadata = {
  title: copy.appName,
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
