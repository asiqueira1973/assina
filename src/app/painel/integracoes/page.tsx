// [Remetente] Integrações — seção 10 e critérios 8.9 e 8.10: chave de API, webhook e o MCP
// ("Conectar ao Claude ou ao ChatGPT", "Pelo aplicativo" e "Por arquivo", conexões autorizadas).
// Os valores em claro não vão no HTML: a página só passa o prefixo da chave e a URL.
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { IntegrationsPanel } from "@/features/integrations/components/integrations-panel";
import { McpSection } from "@/features/integrations/components/mcp-section";
import styles from "@/features/integrations/components/integrations.module.css";
import { copy } from "@/lib/copy";
import { getCurrentAccount } from "@/server/auth/require-conta";
import { integrationsView } from "@/server/integrations/settings";
import { mcpResource } from "@/server/oauth/server";
import panel from "../painel.module.css";

// Página do painel: depende da sessão (CLAUDE.md, pegadinhas).
export const instant = false;

async function Body() {
  const account = await getCurrentAccount();
  if (!account) redirect("/entrar");
  const view = await integrationsView(account.id);
  return (
    <>
      <IntegrationsPanel keyPrefix={view.keyPrefix} webhookUrl={view.webhookUrl} hasSecret={view.hasSecret} />
      <McpSection mcpUrl={mcpResource()} connections={view.connections} />
    </>
  );
}

export default function IntegracoesPage() {
  return (
    <>
      <div className={panel.pageHeader}>
        <h1 className={panel.pageTitle}>{copy.integrations.title}</h1>
      </div>
      <Suspense fallback={<div className={styles.card} aria-busy="true" />}>
        <Body />
      </Suspense>
    </>
  );
}
