// Critérios do épico 8.10: o fluxo OAuth 2.1 (metadados, registro, autorização com PKCE, troca,
// código reutilizado, PKCE errado, redirect_uri diferente) e o /mcp (401 com WWW-Authenticate,
// ferramentas da 13.3 com ator "mcp", criar nunca envia, chave de API também vale, revogar).
import { createHash, randomBytes } from "node:crypto";
import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateApiKey } from "@/server/credentials/api-key";
import { db } from "@/server/db/client";
import { setMailerForTests, type EmailMessage } from "@/server/email/mailer";
import { integrationsView } from "@/server/integrations/settings";
import { checkAuthorizeParams } from "@/server/oauth/authorize";
import { apiRequest, createTestAccount, deleteTestAccounts, SITE } from "../../../tests/helpers";
import { fakeOutbox, sentEnvelope } from "../../../tests/signing";
import { GET as asMeta } from "../.well-known/oauth-authorization-server/route";
import { GET as prMeta } from "../.well-known/oauth-protected-resource/[[...recurso]]/route";
import { POST as register } from "../oauth/registrar/route";
import { POST as decide } from "../oauth/autorizar/decidir/route";
import { POST as token } from "../oauth/token/route";
import { POST as revoke } from "../api/painel/integracoes/conexoes/[id]/revogar/route";
import { POST as mcp } from "./route";

const accounts: string[] = [];
let outbox: EmailMessage[] = [];
beforeEach(() => {
  outbox = fakeOutbox();
});
afterEach(() => setMailerForTests(null));
afterAll(() => deleteTestAccounts(accounts));

const REDIRECT = "https://claude.ai/api/mcp/auth_callback";
const pkce = () => {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
};

async function account() {
  const a = await createTestAccount({ accepted: true });
  accounts.push(a.id);
  return a;
}
async function newClient(uris = [REDIRECT]) {
  const r = await register(new Request(`${SITE}/oauth/registrar`, { method: "POST", body: JSON.stringify({ client_name: "Claude", redirect_uris: uris }), headers: { "content-type": "application/json" } }));
  return { status: r.status, body: await r.json() };
}
// "Permitir" (ou "Cancelar") na tela de consentimento, com a sessão da conta.
async function consent(cookie: string, fields: Record<string, string>) {
  const form = new URLSearchParams({ response_type: "code", code_challenge_method: "S256", state: "xyz", ...fields });
  return decide(new NextRequest(`${SITE}/oauth/autorizar/decidir`, { method: "POST", body: form, headers: { cookie, origin: SITE, "content-type": "application/x-www-form-urlencoded" } }));
}
async function exchange(fields: Record<string, string>) {
  const r = await token(new Request(`${SITE}/oauth/token`, { method: "POST", body: new URLSearchParams({ grant_type: "authorization_code", ...fields }), headers: { "content-type": "application/x-www-form-urlencoded" } }));
  return { status: r.status, body: await r.json() };
}
// Fluxo completo. Devolve: o token e o client_id.
async function oauthToken(cookie: string) {
  const { body: client } = await newClient();
  const { verifier, challenge } = pkce();
  const r = await consent(cookie, { client_id: client.client_id, redirect_uri: REDIRECT, code_challenge: challenge, decisao: "permitir" });
  const code = new URL(r.headers.get("location")!).searchParams.get("code")!;
  const t = await exchange({ code, code_verifier: verifier, client_id: client.client_id, redirect_uri: REDIRECT });
  return t.body.access_token as string;
}

let rpcId = 0;
async function rpc(bearer: string | null, method: string, params: Record<string, unknown> = {}) {
  const headers: Record<string, string> = { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18" };
  if (bearer) headers.authorization = `Bearer ${bearer}`;
  const res = await mcp(new NextRequest(`${SITE}/mcp`, { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }) }));
  const text = await res.text();
  return { res, body: text ? JSON.parse(text) : null };
}
const call = async (bearer: string, name: string, args: Record<string, unknown>) => (await rpc(bearer, "tools/call", { name, arguments: args })).body.result;

describe("OAuth 2.1 (seção 6.4)", () => {
  it("metadados com URLs do site, S256 e o recurso /mcp", async () => {
    const as = await (await asMeta()).json();
    expect(as).toMatchObject({
      issuer: SITE,
      authorization_endpoint: `${SITE}/oauth/autorizar`,
      token_endpoint: `${SITE}/oauth/token`,
      registration_endpoint: `${SITE}/oauth/registrar`,
      code_challenge_methods_supported: ["S256"],
      grant_types_supported: ["authorization_code"],
      token_endpoint_auth_methods_supported: ["none"],
    });
    expect(await (await prMeta()).json()).toMatchObject({ resource: `${SITE}/mcp`, authorization_servers: [SITE] });
  });

  it("registro: só https ou http em localhost/127.0.0.1", async () => {
    expect((await newClient(["http://exemplo.com/cb"])).body.error).toBe("invalid_redirect_uri");
    expect((await newClient(["claude://cb"])).body.error).toBe("invalid_redirect_uri");
    expect((await newClient([])).body.error).toBe("invalid_client_metadata");
    const ok = await newClient(["http://localhost:6274/callback", REDIRECT]);
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ client_name: "Claude", token_endpoint_auth_method: "none" });
  });

  it("autorizar e trocar; código reutilizado, PKCE errado e redirect diferente → invalid_grant; redirect não registrado → invalid_request sem redirecionar", async () => {
    const a = await account();
    const { body: client } = await newClient();
    const bad = await consent(a.cookie, { client_id: client.client_id, redirect_uri: "https://evil.example/cb", code_challenge: pkce().challenge, decisao: "permitir" });
    expect([bad.status, bad.headers.get("location"), (await bad.json()).error]).toEqual([400, null, "invalid_request"]);

    const denied = await consent(a.cookie, { client_id: client.client_id, redirect_uri: REDIRECT, code_challenge: pkce().challenge, decisao: "cancelar" });
    expect(new URL(denied.headers.get("location")!).searchParams.get("error")).toBe("access_denied");

    const { verifier, challenge } = pkce();
    const r = await consent(a.cookie, { client_id: client.client_id, redirect_uri: REDIRECT, code_challenge: challenge, decisao: "permitir" });
    expect(r.status).toBe(303);
    const loc = new URL(r.headers.get("location")!);
    expect(`${loc.origin}${loc.pathname}`).toBe(REDIRECT);
    expect(loc.searchParams.get("state")).toBe("xyz");
    const code = loc.searchParams.get("code")!;

    expect((await exchange({ code, code_verifier: pkce().verifier, client_id: client.client_id, redirect_uri: REDIRECT })).body.error).toBe("invalid_grant");
    expect((await exchange({ code, code_verifier: verifier, client_id: client.client_id, redirect_uri: "https://claude.ai/outro" })).body.error).toBe("invalid_grant");
    const t = await exchange({ code, code_verifier: verifier, client_id: client.client_id, redirect_uri: REDIRECT });
    expect(t.status).toBe(200);
    expect(t.body.access_token).toMatch(/^assina_mcp_[A-Za-z0-9_-]{43}$/);
    expect(t.body.token_type).toBe("Bearer");
    expect(t.body).not.toHaveProperty("expires_in");
    expect(t.body).not.toHaveProperty("refresh_token");
    expect((await exchange({ code, code_verifier: verifier, client_id: client.client_id, redirect_uri: REDIRECT })).body.error).toBe("invalid_grant");
    // O reuso revogou o token que o código tinha gerado (RFC 9700).
    expect((await rpc(t.body.access_token, "tools/list")).res.status).toBe(401);
  });

  it("pedido malformado nunca redireciona (nem sem sessão): sem redirecionador aberto", async () => {
    const { body: client } = await newClient(["https://evil.example/login"]);
    for (const p of [{ response_type: "token" }, { code_challenge_method: "plain" }, { code_challenge: "curto" }]) {
      const check = await checkAuthorizeParams({ response_type: "code", client_id: client.client_id, redirect_uri: "https://evil.example/login", code_challenge: pkce().challenge, code_challenge_method: "S256", ...p });
      expect(check).toEqual({ ok: false, error: expect.any(String) });
      expect(check).not.toHaveProperty("redirect");
    }
    const a = await account();
    const r = await consent(a.cookie, { client_id: client.client_id, redirect_uri: "https://evil.example/login", code_challenge: pkce().challenge, response_type: "token", decisao: "permitir" });
    expect([r.status, r.headers.get("location")]).toEqual([400, null]);
  });

  it("token: corpo JSON nulo e code_verifier fora do formato → invalid_request (nunca 500)", async () => {
    const r = await token(new Request(`${SITE}/oauth/token`, { method: "POST", body: "null", headers: { "content-type": "application/json" } }));
    expect(r.status).toBe(400);
    expect((await r.json()).error).toBe("unsupported_grant_type");
    expect((await exchange({ code: "x", code_verifier: "curto", client_id: "y", redirect_uri: REDIRECT })).body.error).toBe("invalid_request");
  });

  it("sem sessão, a decisão não passa; Origin estranho também não", async () => {
    const { body: client } = await newClient();
    const r = await decide(new NextRequest(`${SITE}/oauth/autorizar/decidir`, { method: "POST", body: new URLSearchParams({ client_id: client.client_id }), headers: { origin: SITE, "content-type": "application/x-www-form-urlencoded" } }));
    expect(r.status).toBe(401);
    const a = await account();
    const evil = await decide(new NextRequest(`${SITE}/oauth/autorizar/decidir`, { method: "POST", body: new URLSearchParams({ client_id: client.client_id }), headers: { cookie: a.cookie, origin: "https://evil.example", "content-type": "application/x-www-form-urlencoded" } }));
    expect(evil.status).toBe(403);
  });
});

describe("/mcp (seção 13.3)", () => {
  it("sem token: 401 com WWW-Authenticate apontando os metadados, exposto pelo CORS", async () => {
    const { res } = await rpc(null, "tools/list");
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toBe(`Bearer resource_metadata="${SITE}/.well-known/oauth-protected-resource"`);
    expect(res.headers.get("access-control-expose-headers")).toContain("www-authenticate");
  });

  it("ferramentas: lista com anotações; criar nunca envia; enviar, ver, lembrar, link e cancelar com ator mcp", async () => {
    const a = await account();
    const bearer = await oauthToken(a.cookie);
    const init = await rpc(bearer, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "teste", version: "1" } });
    expect(init.body.result.serverInfo.name).toBe("assina");

    const tools = (await rpc(bearer, "tools/list")).body.result.tools as { name: string; annotations?: Record<string, boolean> }[];
    expect(tools.map((t) => t.name).sort()).toEqual(["cancelar_envelope", "criar_envelope", "enviar_envelope", "lembrar_signatarios", "link_do_documento", "listar_envelopes", "ver_envelope"]);
    expect(tools.find((t) => t.name === "listar_envelopes")!.annotations).toMatchObject({ readOnlyHint: true });
    expect(tools.find((t) => t.name === "cancelar_envelope")!.annotations).toMatchObject({ destructiveHint: true });
    expect(tools.some((t) => /exclu/i.test(t.name))).toBe(false);

    const created = await call(bearer, "criar_envelope", { titulo: "Pelo Claude", signatarios: [{ nome: "Ana", email: "ana@mcp.dev", exigir_nascimento: true }] });
    const id = created.structuredContent.envelope.id as string;
    // Épico 8.14: o MCP também aceita exigir_nascimento.
    expect((await db().from("as_signatarios").select("exigir_nascimento").eq("envelope_id", id).single()).data).toEqual({ exigir_nascimento: true });
    expect(created.content[0].text).toContain("O envelope não foi enviado.");
    // Emenda de 22/11/2026: o MCP não posiciona campos, então avisa onde a assinatura aparece.
    expect(created.content[0].text).toContain("Sem campo de assinatura posicionado");
    expect(created.structuredContent.envelope.assinatura_visivel_no_documento).toBe(false);
    expect(created.content[0].text).toContain(`/painel/envelopes/${id}/editar`);
    expect(outbox).toHaveLength(0);
    const { data: e } = await db().from("as_envelopes").select("status, origem").eq("id", id).single();
    expect(e).toEqual({ status: "rascunho", origem: "mcp" });

    // Enviar exige o arquivo (rascunho sem PDF).
    const noFile = await call(bearer, "enviar_envelope", { id });
    expect(noFile.isError).toBe(true);

    // Um envelope com arquivo (criado pelo painel na mesma conta) é enviado pelo MCP.
    const env = await sentEnvelopeDraft(a);
    const sent = await call(bearer, "enviar_envelope", { id: env });
    expect(sent.isError).toBeFalsy();
    expect(sent.structuredContent.envelope.status).toBe("enviado");
    expect(sent.structuredContent.envelope.assinatura_visivel_no_documento).toBe(false);
    expect(sent.content[0].text).toContain("selo no rodapé de cada página");
    const { data: ev } = await db().from("as_eventos").select("ator").eq("envelope_id", env).eq("tipo", "enviado").single();
    expect(ev!.ator).toBe("mcp");

    const list = await call(bearer, "listar_envelopes", { status: "pendentes" });
    expect(list.structuredContent.envelopes.map((x: { id: string }) => x.id)).toEqual([env]);
    const seen = await call(bearer, "ver_envelope", { id: env });
    expect(seen.content[0].text).toContain("Bia <bia@mcp.dev>");
    expect(seen.structuredContent.eventos.length).toBeGreaterThan(0);
    expect((await call(bearer, "lembrar_signatarios", { id: env })).structuredContent).toEqual({ lembrados: 1 });
    expect((await call(bearer, "link_do_documento", { id: env, versao: "original" })).content[0].text).toMatch(/Link válido por 5 minutos: http/);
    expect((await call(bearer, "cancelar_envelope", { id: env, motivo: "Mudou" })).structuredContent.envelope.status).toBe("cancelado");
    const { data: last } = await db().from("as_eventos").select("tipo, ator").eq("envelope_id", env).order("seq", { ascending: false }).limit(1).single();
    expect(last).toEqual({ tipo: "cancelado", ator: "mcp" });

    // Envelope de outra conta: toda ferramenta recusa, nada vaza e nada muda.
    const other = await sentEnvelope(accounts, [{ nome: "X", email: "x@mcp.dev" }]);
    for (const [name, args] of [
      ["ver_envelope", { id: other.id }],
      ["enviar_envelope", { id: other.id }],
      ["lembrar_signatarios", { id: other.id }],
      ["cancelar_envelope", { id: other.id }],
      ["link_do_documento", { id: other.id, versao: "original" }],
    ] as const) {
      const r = await call(bearer, name, args);
      expect(r.isError, name).toBe(true);
      expect(JSON.stringify(r)).not.toContain("x@mcp.dev");
    }
    const { data: still } = await db().from("as_envelopes").select("status").eq("id", other.id).single();
    expect(still!.status).toBe("enviado");
    const { count: notMine } = await db().from("as_eventos").select("id", { count: "exact", head: true }).eq("envelope_id", other.id).eq("ator", "mcp");
    expect(notMine).toBe(0);
    // Rascunho com arquivo de outra conta: enviar recusa pela conta, não pelo status.
    const otherAccount = await account();
    const otherDraft = await sentEnvelopeDraft(otherAccount);
    expect((await call(bearer, "enviar_envelope", { id: otherDraft })).isError).toBe(true);
    expect((await db().from("as_envelopes").select("status").eq("id", otherDraft).single()).data!.status).toBe("rascunho");
  });

  it("a chave de API também vale no /mcp; revogar a conexão dá 401 na próxima chamada; a tela lista a conexão", async () => {
    const a = await account();
    const key = generateApiKey();
    await db().from("as_credenciais").insert({ conta_id: a.id, tipo: "api", nome: "Chave de API", prefixo: key.prefix, valor_hash: key.hash, valor_cifrado: key.sealed });
    expect((await rpc(key.value, "tools/list")).res.status).toBe(200);

    const bearer = await oauthToken(a.cookie);
    expect((await rpc(bearer, "tools/list")).res.status).toBe(200);
    const view = await integrationsView(a.id);
    expect(view.connections).toEqual([{ id: expect.any(String), nome: "Claude", criado_em: expect.any(String), ultimo_uso_em: expect.any(String) }]);
    // Outra conta não revoga a conexão (com ela ainda ativa) e a conexão continua valendo.
    const b = await account();
    expect((await revoke(apiRequest("/x", { method: "POST", cookie: b.cookie }), { params: Promise.resolve({ id: view.connections[0].id }) })).status).toBe(404);
    expect((await rpc(bearer, "tools/list")).res.status).toBe(200);
    // "Revogar" não serve para a chave de API (ela se troca por "Gerar nova chave").
    const { data: apiCred } = await db().from("as_credenciais").select("id").eq("valor_hash", key.hash).single();
    expect((await revoke(apiRequest("/x", { method: "POST", cookie: a.cookie }), { params: Promise.resolve({ id: apiCred!.id }) })).status).toBe(404);
    expect((await rpc(key.value, "tools/list")).res.status).toBe(200);
    const r = await revoke(apiRequest("/x", { method: "POST", cookie: a.cookie }), { params: Promise.resolve({ id: view.connections[0].id }) });
    expect(r.status).toBe(200);
    expect((await rpc(bearer, "tools/list")).res.status).toBe(401);
  });

  it("pedido recusado pelo SDK (4xx) deixa no log o motivo, o método HTTP, o método JSON-RPC e a versão, sem e-mail nem token", async () => {
    const a = await account();
    const key = generateApiKey();
    await db().from("as_credenciais").insert({ conta_id: a.id, tipo: "api", nome: "Chave de API", prefixo: key.prefix, valor_hash: key.hash, valor_cifrado: key.sealed });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const headers = { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2099-01-01", authorization: `Bearer ${key.value}` };
      const res = await mcp(new NextRequest(`${SITE}/mcp`, { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) }));
      expect(res.status).toBe(400);
      const logged = warn.mock.calls.filter((c) => c[0] === "mcp_rejeitado");
      expect(logged).toHaveLength(1);
      expect(logged[0][1]).toEqual({ status: 400, http: "POST", rpc: "tools/list", versao: "2099-01-01", motivo: expect.stringContaining("Unsupported protocol version") });
      const text = JSON.stringify(warn.mock.calls);
      expect(text).not.toContain("@teste.dev");
      expect(text).not.toContain(key.value);

      // Pedido aceito não loga nada.
      warn.mockClear();
      expect((await rpc(key.value, "tools/list")).res.status).toBe(200);
      expect(warn.mock.calls.filter((c) => c[0] === "mcp_rejeitado")).toHaveLength(0);
    } finally {
      warn.mockRestore();
    }
  });
});

// Rascunho com PDF e um assinante, criado pelo painel na conta dada (sem enviar). Devolve: o id.
async function sentEnvelopeDraft(a: { id: string; cookie: string }): Promise<string> {
  const { POST: createEnvelope } = await import("../api/painel/envelopes/route");
  const { POST: attachFile } = await import("../api/painel/envelopes/[id]/arquivo/route");
  const { PUT: putSigners } = await import("../api/painel/envelopes/[id]/signatarios/route");
  const { uploadTo } = await import("../../../tests/envelopes");
  const { makePdf } = await import("../../../tests/fixtures/pdfs");
  const res = await createEnvelope(apiRequest("/api/painel/envelopes", { method: "POST", cookie: a.cookie, body: { nome_arquivo: "Contrato.pdf" } }));
  const { envelope, upload_url } = await res.json();
  await uploadTo(upload_url, await makePdf(1));
  const ctx = { params: Promise.resolve({ id: envelope.id }) };
  await attachFile(apiRequest("/x", { method: "POST", cookie: a.cookie, body: { nome_arquivo: "Contrato.pdf" } }), ctx);
  await putSigners(apiRequest("/x", { method: "PUT", cookie: a.cookie, body: { signatarios: [{ nome: "Bia", email: "bia@mcp.dev" }] } }), ctx);
  return envelope.id;
}
