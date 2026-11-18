// GET /.well-known/oauth-protected-resource (e /…/mcp) — RFC 9728, seção 6.4 passo 1: diz ao
// cliente MCP qual é o recurso e onde autorizar. Sem autenticação. A forma com o sufixo do
// caminho do recurso (/mcp) é a que alguns clientes pedem primeiro.
import { corsHeaders, mcpResource, oauthJson, siteOrigin } from "@/server/oauth/server";

export function GET() {
  return oauthJson({
    resource: mcpResource(),
    authorization_servers: [siteOrigin()],
    bearer_methods_supported: ["header"],
    resource_documentation: `${siteOrigin()}/docs/api`,
  });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}
