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

async function handle(req: NextRequest): Promise<Response> {
  const auth = await requireCredential(req, ["api", "mcp"]);
  if (auth instanceof Response) {
    return withCors(auth, { "www-authenticate": `Bearer resource_metadata="${resourceMetadataUrl()}"` });
  }
  const server = buildMcpServer(auth.account, requestMeta(req));
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    const res = await transport.handleRequest(req);
    trackApiCall({ credentialId: auth.credentialId, email: auth.account.email }, "/mcp", res.status);
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
