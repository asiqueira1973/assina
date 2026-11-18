// POST /oauth/token — seção 6.4 passo 5: troca o código pelo token, conferindo (numa transação)
// código existente, não usado, não vencido, do mesmo cliente, mesmo redirect_uri e PKCE S256.
// Aceita form-urlencoded (o padrão) ou JSON. Resposta {access_token, token_type: "Bearer"}, sem
// expires_in e sem refresh token. Erros no formato do OAuth; código reutilizado (que também revoga
// o token já emitido com ele) ou PKCE errado → invalid_grant.
import { copy } from "@/lib/copy";
import { PKCE_VERIFIER_MAX, PKCE_VERIFIER_MIN } from "@/lib/limits";
import { errorCode } from "@/server/error-code";
import { corsHeaders, exchangeCode, findClient, oauthError, oauthJson } from "@/server/oauth/server";

async function fields(req: Request): Promise<Record<string, string>> {
  const type = req.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const body: unknown = await req.json().catch(() => null);
    // Corpo que não é objeto (null, lista, texto) vira "sem campos": invalid_request, não 500.
    if (!body || typeof body !== "object" || Array.isArray(body)) return {};
    return Object.fromEntries(Object.entries(body).map(([k, v]) => [k, typeof v === "string" ? v : ""]));
  }
  const form = await req.formData().catch(() => null);
  return form ? Object.fromEntries([...form.entries()].map(([k, v]) => [k, typeof v === "string" ? v : ""])) : {};
}

// code_verifier do PKCE (RFC 7636): 43 a 128 caracteres do conjunto sem reserva.
const VERIFIER = new RegExp(`^[A-Za-z0-9\\-._~]{${PKCE_VERIFIER_MIN},${PKCE_VERIFIER_MAX}}$`);

export async function POST(req: Request) {
  const f = await fields(req);
  const e = copy.oauthErrors;
  if (f.grant_type !== "authorization_code") return oauthError("unsupported_grant_type", e.grantType);
  if (!f.code || !f.client_id || !f.redirect_uri || !VERIFIER.test(f.code_verifier ?? "")) return oauthError("invalid_request", e.missing);
  try {
    if (!(await findClient(f.client_id))) return oauthError("invalid_client", e.client, 401);
    const token = await exchangeCode(f.code, f.client_id, f.redirect_uri, f.code_verifier);
    if (!token) return oauthError("invalid_grant", e.grant);
    return oauthJson({ access_token: token, token_type: "Bearer" });
  } catch (err) {
    console.error("erro_interno_oauth", errorCode(err));
    return oauthError("server_error", e.server, 500);
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}
