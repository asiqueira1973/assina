// Tela Integrações — épico 8.9 (seção 6.3, regras 11.8 e 11.17). Chave de API (mostrar sob
// pedido, gerar nova) e webhook (URL, segredo, teste). Os valores em claro só saem por pedido
// explícito (rota sem cache), nunca no HTML da página. Sempre filtrado pela conta da sessão.
import "server-only";
import { track } from "@/server/analytics/client";
import { generateApiKey } from "@/server/credentials/api-key";
import { decryptSecret, encryptSecret } from "@/server/crypto/aes";
import { db } from "@/server/db/client";
import { isAcceptableWebhookUrl } from "@/server/files/fetch-remote";
import { generateWebhookSecret } from "@/server/webhooks/deliver";

export type McpConnection = { id: string; nome: string; criado_em: string; ultimo_uso_em: string | null };
export type IntegrationsView = { keyPrefix: string | null; webhookUrl: string | null; hasSecret: boolean; connections: McpConnection[] };

// O que a tela mostra sem revelar nada: o prefixo da chave e a URL do webhook.
export async function integrationsView(contaId: string): Promise<IntegrationsView> {
  const [{ data: key }, { data: conta }, { data: mcp }] = await Promise.all([
    db().from("as_credenciais").select("prefixo").eq("conta_id", contaId).eq("tipo", "api").is("revogada_em", null).maybeSingle(),
    db().from("as_contas").select("webhook_url, webhook_segredo_cifrado").eq("id", contaId).single(),
    // Conexões MCP ativas (seção 6.3): nome do cliente, criada em, último uso.
    db().from("as_credenciais").select("id, nome, criado_em, ultimo_uso_em").eq("conta_id", contaId).eq("tipo", "mcp").is("revogada_em", null).order("criado_em", { ascending: false }),
  ]);
  return { keyPrefix: key?.prefixo ?? null, webhookUrl: conta?.webhook_url ?? null, hasSecret: !!conta?.webhook_segredo_cifrado, connections: mcp ?? [] };
}

// Revela a chave de API ou o segredo do webhook. Devolve: o valor ou null.
export async function revealSecret(contaId: string, item: "chave" | "segredo"): Promise<string | null> {
  if (item === "chave") {
    const { data } = await db().from("as_credenciais").select("valor_cifrado").eq("conta_id", contaId).eq("tipo", "api").is("revogada_em", null).maybeSingle();
    return data?.valor_cifrado ? decryptSecret(data.valor_cifrado) : null;
  }
  const { data } = await db().from("as_contas").select("webhook_segredo_cifrado").eq("id", contaId).single();
  return data?.webhook_segredo_cifrado ? decryptSecret(data.webhook_segredo_cifrado) : null;
}

// "Gerar nova chave" (regra 11.8): revoga a atual e grava a nova numa transação.
// Devolve: a chave nova em claro (para a tela mostrar uma vez).
export async function rotateApiKey(contaId: string): Promise<string> {
  const key = generateApiKey();
  const { error } = await db().rpc("as_fn_troca_chave_api", { p_conta_id: contaId, p_hash: key.hash, p_prefixo: key.prefix, p_cifrado: key.sealed });
  if (error) throw error;
  track("assina_chave_api_gerada", { quem: { conta: contaId }, propriedades: {} });
  return key.value;
}

// Salva (ou remove, com null) a URL do webhook. Um segredo nasce junto com a primeira URL e
// continua o mesmo quando a URL muda; remover a URL apaga o segredo (o banco exige os dois juntos).
// Devolve: "ok" ou "url_invalida".
export async function saveWebhookUrl(contaId: string, url: string | null): Promise<"ok" | "url_invalida"> {
  if (url === null) {
    const { error } = await db().from("as_contas").update({ webhook_url: null, webhook_segredo_cifrado: null }).eq("id", contaId);
    if (error) throw error;
    return "ok";
  }
  if (!isAcceptableWebhookUrl(url)) return "url_invalida";
  const { data: conta } = await db().from("as_contas").select("webhook_segredo_cifrado").eq("id", contaId).single();
  const { error } = await db()
    .from("as_contas")
    .update({ webhook_url: url, webhook_segredo_cifrado: conta?.webhook_segredo_cifrado ?? encryptSecret(generateWebhookSecret()) })
    .eq("id", contaId);
  if (error) throw error;
  track("assina_webhook_configurado", { quem: { conta: contaId }, propriedades: {} });
  return "ok";
}

// "Revogar" uma conexão MCP (critério 8.10): o token para na próxima chamada. Só da própria conta
// e só do tipo mcp (a chave de API se troca por "Gerar nova chave"). Devolve: true se revogou.
export async function revokeMcpConnection(contaId: string, credentialId: string): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/.test(credentialId)) return false;
  const { data, error } = await db()
    .from("as_credenciais")
    .update({ revogada_em: new Date().toISOString() })
    .eq("id", credentialId)
    .eq("conta_id", contaId)
    .eq("tipo", "mcp")
    .is("revogada_em", null)
    .select("id");
  if (error) throw error;
  return !!data?.length;
}
