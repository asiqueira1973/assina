// Servidor de autorização OAuth 2.1 do MCP — seção 6.4 (mesmo desenho do Visão de Produto).
// Regras compartilhadas pelas rotas do fluxo: metadados (RFC 8414 e 9728), registro de cliente
// público (RFC 7591), código de autorização com PKCE S256 e troca pelo token `assina_mcp_…`.
// O token é uma credencial comum (as_credenciais, tipo mcp): só o hash fica no banco, vale até
// ser revogado na tela Integrações, sem expires_in nem refresh token (6.3).
// Os endereços vêm sempre de NEXT_PUBLIC_SITE_URL, nunca do Host da requisição (6.4).
import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { ANALYTICS_CLIENTE_MAX, OAUTH_CLIENTE_NOME_MAX, OAUTH_CODIGO_SEGUNDOS, OAUTH_REDIRECT_URIS_MAX, OAUTH_REDIRECT_URI_MAX } from "@/lib/limits";
import { track } from "@/server/analytics/client";
import { hashCredential } from "@/server/credentials/api-key";
import { db } from "@/server/db/client";

export const MCP_TOKEN_PREFIX = "assina_mcp_";

// Origem pública do site (emissor e recurso).
export function siteOrigin(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3030").replace(/\/+$/, "");
}
export const mcpResource = () => `${siteOrigin()}/mcp`;
export const resourceMetadataUrl = () => `${siteOrigin()}/.well-known/oauth-protected-resource`;

// S256 do PKCE. Recebe: o code_verifier. Devolve: base64url do SHA-256.
export function s256(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

// Diz se um redirect_uri pode ser registrado (6.4, passo 3): https, ou http só em localhost e
// 127.0.0.1 (cliente de desktop). Sem fragmento e sem credenciais.
export function acceptableRedirectUri(uri: string): boolean {
  if (uri.length > OAUTH_REDIRECT_URI_MAX) return false;
  let u: URL;
  try {
    u = new URL(uri);
  } catch {
    return false;
  }
  if (u.hash || u.username || u.password) return false;
  if (u.protocol === "https:") return true;
  return u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1");
}

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, content-type, mcp-protocol-version, mcp-session-id",
  "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
  "access-control-expose-headers": "www-authenticate, mcp-session-id",
};

// Resposta JSON do fluxo OAuth (sem cache, com CORS: clientes de navegador também usam).
export function oauthJson(body: unknown, status = 200): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...CORS } });
}

// Erro no formato do OAuth 2.1 ({error, error_description}).
export function oauthError(error: string, description: string, status = 400): Response {
  return oauthJson({ error, error_description: description }, status);
}

export function corsHeaders(): Record<string, string> {
  return CORS;
}

export type OAuthClient = { id: string; nome: string; redirect_uris: string[] };

// Registra um cliente (RFC 7591). Recebe: nome e redirect_uris já conferidos. Devolve: o cliente.
export async function registerClient(nome: string, uris: string[]): Promise<OAuthClient> {
  const { data, error } = await db()
    .from("as_oauth_clientes")
    .insert({ nome: nome.slice(0, OAUTH_CLIENTE_NOME_MAX), redirect_uris: uris.slice(0, OAUTH_REDIRECT_URIS_MAX) })
    .select("id, nome, redirect_uris")
    .single();
  if (error) throw error;
  return data;
}

// Busca um cliente pelo client_id (o id da linha). Devolve: o cliente ou null.
export async function findClient(clientId: string | null | undefined): Promise<OAuthClient | null> {
  if (!clientId || !/^[0-9a-f-]{36}$/.test(clientId)) return null;
  const { data } = await db().from("as_oauth_clientes").select("id, nome, redirect_uris").eq("id", clientId).maybeSingle();
  return data;
}

// "Permitir" (6.4, passo 4): grava o código e devolve o valor em claro (vai só no redirect).
export async function createAuthorizationCode(client: OAuthClient, contaId: string, redirectUri: string, codeChallenge: string): Promise<string> {
  const code = randomBytes(32).toString("base64url");
  const { error } = await db().rpc("as_fn_cria_codigo_oauth", {
    p_codigo_hash: hashCredential(code),
    p_cliente_id: client.id,
    p_conta_id: contaId,
    p_redirect_uri: redirectUri,
    p_code_challenge: codeChallenge,
    p_validade_s: OAUTH_CODIGO_SEGUNDOS,
  });
  if (error) throw new Error(error.message === "invalid_request" || error.message === "invalid_client" ? error.message : "server_error");
  return code;
}

// Troca do código pelo token (6.4, passo 5). Devolve: o token em claro ou null (invalid_grant).
export async function exchangeCode(code: string, clientId: string, redirectUri: string, verifier: string): Promise<string | null> {
  const token = MCP_TOKEN_PREFIX + randomBytes(32).toString("base64url");
  const { data, error } = await db().rpc("as_fn_troca_codigo_oauth", {
    p_codigo_hash: hashCredential(code),
    p_cliente_id: clientId,
    p_redirect_uri: redirectUri,
    p_challenge_do_verifier: s256(verifier),
    p_token_hash: hashCredential(token),
    p_token_prefixo: token.slice(0, 16),
  });
  if (error) throw error;
  if (!data) return null;
  const contaId = data;
  track("assina_mcp_conectado", {
    quem: { conta: contaId },
    propriedades: async () => {
      const { data: c } = await db().from("as_oauth_clientes").select("nome").eq("id", clientId).maybeSingle();
      return c ? { cliente: c.nome.slice(0, ANALYTICS_CLIENTE_MAX) } : null;
    },
  });
  return token;
}
