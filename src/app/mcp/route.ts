// /mcp — servidor MCP por Streamable HTTP (seções 6.4 e 13.3, épico 8.10). Sem sessão: um
// servidor por requisição, com resposta JSON (função sem estado na Vercel).
// Bearer: token do OAuth (`assina_mcp_…`) ou a chave de API (`assina_…`, para clientes por
// arquivo). Sem credencial válida: 401 com WWW-Authenticate apontando os metadados do recurso
// (RFC 9728), exposto pelo CORS — é o que faz o "Add custom connector" achar o OAuth sozinho.
import type { NextRequest } from "next/server";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { trackApiCall } from "@/server/analytics/client";
import { requireCredential } from "@/server/auth/api-credential";
import { requestMeta } from "@/server/http";
import { buildMcpServer } from "@/server/mcp/tools";
import { corsHeaders, resourceMetadataUrl } from "@/server/oauth/server";

// criar_envelope com arquivo_url (10 s) e enviar_envelope (convites).
export const maxDuration = 60;

function withCors(res: Response, extra: Record<string, string> = {}): Response {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries({ ...corsHeaders(), ...extra })) headers.set(k, v);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

// Método JSON-RPC do corpo, só para o log de pedido recusado. Recebe: o corpo em texto (lido de
// um clone, antes do SDK). Devolve: o método, se for um nome curto e conhecido; senão null.
function rpcMethod(body: string): string | null {
  try {
    const parsed: unknown = JSON.parse(body);
    const first: unknown = Array.isArray(parsed) ? parsed[0] : parsed;
    const method = first && typeof first === "object" ? (first as { method?: unknown }).method : undefined;
    return typeof method === "string" && /^[a-z_/]{1,40}$/i.test(method) ? method : null;
  } catch {
    return null;
  }
}

// Loga o pedido que o SDK recusou (4xx), para achar a causa nos logs da Vercel. Recebe: a
// requisição, o corpo em texto e a resposta. Só a mensagem fixa do SDK, sem `data` (que pode
// trazer trecho do corpo), e o user-agent; nunca e-mail nem token.
async function logRejected(req: NextRequest, body: string, res: Response): Promise<void> {
  let motivo: string | null = null;
  try {
    const parsed = (await res.clone().json()) as { error?: { message?: unknown } };
    if (typeof parsed.error?.message === "string") motivo = parsed.error.message.slice(0, 200);
  } catch {
    // Corpo vazio ou não JSON (ex.: 405): fica só o status.
  }
  console.warn("mcp_rejeitado", {
    status: res.status,
    http: req.method,
    rpc: rpcMethod(body),
    versao: req.headers.get("mcp-protocol-version")?.slice(0, 40) ?? null,
    // Identifica o cliente (Claude desktop, claude.ai, celular, Claude Code); não é dado pessoal.
    cliente: req.headers.get("user-agent")?.slice(0, 120) ?? null,
    motivo,
  });
}

async function handle(req: NextRequest): Promise<Response> {
  const auth = await requireCredential(req, ["api", "mcp"]);
  if (auth instanceof Response) {
    return withCors(auth, { "www-authenticate": `Bearer resource_metadata="${resourceMetadataUrl()}"` });
  }
  const server = buildMcpServer(auth.account, requestMeta(req));
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  // O clone vem antes do SDK, que consome o corpo; GET e DELETE não têm corpo.
  const bodyPromise = req.method === "POST" ? req.clone().text() : Promise.resolve("");
  try {
    const res = await transport.handleRequest(req);
    const body = await bodyPromise.catch(() => "");
    if (res.status >= 400) await logRejected(req, body, res);
    // Seção 21: só uso de ferramenta. A conexão do cliente (initialize, tools/list, notificações)
    // e a sondagem `server/discover` da versão 2026-07-28 do MCP, que o SDK 1.x recusa com 400,
    // se repetem sempre que um Claude com o conector abre ou reconecta; não são uso.
    if (rpcMethod(body) === "tools/call") {
      trackApiCall({ credentialId: auth.credentialId, email: auth.account.email }, "/mcp", res.status);
    }
    return withCors(res);
  } finally {
    await server.close();
  }
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}
