// Épico 8.12: conta suspensa (sessão, chave de API, MCP e links de assinatura deixam de valer, e
// reativar devolve tudo) e "Excluir minha conta" (e-mail confere; cascata no banco e nos arquivos;
// sessão encerrada).
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as arquivo } from "@/app/api/painel/envelopes/[id]/arquivo/route";
import { POST as pedirCodigo } from "@/app/api/assinar/[token]/codigo/route";
import { GET as listarV1 } from "@/app/api/v1/envelopes/route";
import { POST as mcp } from "@/app/mcp/route";
import { generateApiKey } from "@/server/credentials/api-key";
import { db } from "@/server/db/client";
import { setMailerForTests, type EmailMessage } from "@/server/email/mailer";
import { storage } from "@/server/files/storage";
import { loadSignerByToken } from "@/server/signing/context";
import { signerPageState } from "@/server/signing/state";
import { apiRequest, deleteTestAccounts } from "../../../../../tests/helpers";
import { fakeOutbox, linkFor, sentEnvelope, tctx } from "../../../../../tests/signing";
import { POST as excluir } from "./excluir/route";

const accounts: string[] = [];
let outbox: EmailMessage[] = [];
beforeEach(() => {
  outbox = fakeOutbox();
});
afterEach(() => setMailerForTests(null));
afterAll(() => deleteTestAccounts(accounts));

const pctx = (id: string) => ({ params: Promise.resolve({ id }) });
const bearer = (path: string, key: string, body?: unknown) => {
  const r = apiRequest(path, { method: body ? "POST" : "GET", body, origin: null });
  r.headers.set("authorization", `Bearer ${key}`);
  if (body) r.headers.set("accept", "application/json, text/event-stream");
  return r;
};

async function withApiKey(contaId: string): Promise<string> {
  const key = generateApiKey();
  const { error } = await db().from("as_credenciais").insert({ conta_id: contaId, tipo: "api", nome: "Chave de API", prefixo: key.prefix, valor_hash: key.hash, valor_cifrado: key.sealed });
  if (error) throw error;
  return key.value;
}

describe("conta suspensa (critério 8.12)", () => {
  it("sessão, chave de API, MCP e links de assinatura deixam de valer; reativar devolve tudo", async () => {
    const env = await sentEnvelope(accounts, [{ nome: "Ana", email: "ana@suspensa.dev" }]);
    const key = await withApiKey(env.contaId);
    const token = linkFor(outbox, "ana@suspensa.dev");
    const mcpBody = { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} };

    const check = async () => ({
      painel: (await arquivo(apiRequest(`/api/painel/envelopes/${env.id}/arquivo?versao=original`, { cookie: env.cookie }), pctx(env.id))).status,
      v1: (await listarV1(bearer("/api/v1/envelopes", key))).status,
      mcp: (await mcp(bearer("/mcp", key, mcpBody))).status,
      pagina: (await signerPageState(await loadSignerByToken(token))).kind,
      codigo: (await pedirCodigo(apiRequest("/x", { method: "POST" }), tctx(token))).status,
    });

    await db().from("as_contas").update({ suspensa_em: new Date().toISOString() }).eq("id", env.contaId);
    expect(await check()).toEqual({ painel: 401, v1: 401, mcp: 401, pagina: "indisponivel", codigo: 404 });

    await db().from("as_contas").update({ suspensa_em: null }).eq("id", env.contaId);
    const back = await check();
    expect(back.painel).toBe(302); // redireciona para a URL assinada do original
    expect(back.v1).toBe(200);
    expect(back.mcp).toBe(200);
    expect(back.pagina).toBe("ativo");
    expect(back.codigo).toBe(200);
  });
});

describe("Excluir minha conta (épico 8.12)", () => {
  it("e-mail que não confere: 400 e nada apagado; sem Origin: 403", async () => {
    const env = await sentEnvelope(accounts, [{ nome: "Ana", email: "ana@excluir1.dev" }]);
    const res = await excluir(apiRequest("/api/painel/conta/excluir", { method: "POST", cookie: env.cookie, body: { email: "outra@pessoa.dev" } }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ codigo: "email_nao_confere" });
    expect((await excluir(apiRequest("/x", { method: "POST", cookie: env.cookie, origin: null, body: { email: "x" } }))).status).toBe(403);
    expect((await db().from("as_contas").select("id").eq("id", env.contaId)).data).toHaveLength(1);
  });

  it("e-mail certo (sem diferença de maiúsculas): apaga conta, envelopes em andamento, trilha, credenciais e arquivos; encerra a sessão", async () => {
    const env = await sentEnvelope(accounts, [{ nome: "Ana", email: "ana@excluir2.dev" }]);
    await withApiKey(env.contaId);
    const { data: e } = await db().from("as_envelopes").select("arquivo_original_path, status").eq("id", env.id).single();
    expect(e!.status).toBe("enviado");
    expect(await storage().read(e!.arquivo_original_path!, 20 * 1024 * 1024)).not.toBeNull();
    const { data: conta } = await db().from("as_contas").select("email").eq("id", env.contaId).single();

    const res = await excluir(apiRequest("/x", { method: "POST", cookie: env.cookie, body: { email: `  ${conta!.email.toUpperCase()} ` } }));
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toMatch(/as_sessao=;.*(Max-Age=0|Expires=Thu, 01 Jan 1970)/i);

    expect((await db().from("as_contas").select("id").eq("id", env.contaId)).data).toEqual([]);
    expect((await db().from("as_envelopes").select("id").eq("id", env.id)).data).toEqual([]);
    expect((await db().from("as_eventos").select("id").eq("envelope_id", env.id)).data).toEqual([]);
    expect((await db().from("as_credenciais").select("id").eq("conta_id", env.contaId)).data).toEqual([]);
    expect(await storage().read(e!.arquivo_original_path!, 20 * 1024 * 1024)).toBeNull();

    // A sessão antiga não vale mais (a conta não existe).
    expect((await excluir(apiRequest("/x", { method: "POST", cookie: env.cookie, body: { email: conta!.email } }))).status).toBe(401);
  });
});
