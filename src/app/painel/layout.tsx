// Layout do painel do remetente — seções 10 e 16: menu lateral + conteúdo.
// O proxy já barrou quem não tem cookie; aqui a sessão é validada no banco (getCurrentAccount,
// que também recusa conta suspensa) e, sem conta, volta para /entrar. Sem o aceite dos Termos,
// o painel mostra só as boas-vindas (critério 8.1). Com Cache Components, a leitura fica dentro
// de <Suspense>.
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/nav/sidebar";
import { WelcomeForm } from "@/features/account/components/welcome-form";
import welcome from "@/features/account/components/welcome.module.css";
import { getCurrentAccount } from "@/server/auth/require-conta";
import styles from "./painel.module.css";

// O painel inteiro depende da sessão (cookie lido a cada requisição), então não entra na casca
// estática da navegação instantânea do Next 16.4: o fallback do <Suspense> descartaria a página.
// Opt-out documentado em node_modules/next/dist/docs/01-app/02-guides/instant-navigation.md.
export const instant = false;

// Lê a conta da sessão e monta o menu com nome e e-mail, ou as boas-vindas.
async function PanelShell({ children }: { children: React.ReactNode }) {
  const account = await getCurrentAccount();
  if (!account) redirect("/entrar");
  if (!account.termsAcceptedAt) {
    return (
      <main className={welcome.page}>
        <WelcomeForm />
      </main>
    );
  }
  return (
    <>
      <Sidebar name={account.nome} email={account.email} />
      <main className={styles.content}>{children}</main>
    </>
  );
}

// Casca do painel: menu + conteúdo, com a sessão lida em streaming.
export default function PainelLayout({ children }: LayoutProps<"/painel">) {
  return (
    <div className={styles.shell}>
      <Suspense fallback={<main className={styles.content} aria-busy="true" />}>
        <PanelShell>{children}</PanelShell>
      </Suspense>
    </div>
  );
}
