// Critério 8.11 e seção 21: os eventos saem do servidor sem segurar o fluxo, com o tipo de
// propriedades fechado e sem dado pessoal; o ingest fora do ar (recusa, 500 ou pendurado) não
// quebra nem atrasa nada; a amostragem da API e o padrão da rota.
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST as visualizou } from "@/app/api/assinar/[token]/visualizou/route";
import { POST as recusar } from "@/app/api/assinar/[token]/recusar/route";
import { POST as assinar } from "@/app/api/assinar/[token]/assinar/route";
import { CONSENTIMENTO_VERSAO } from "@/lib/limits";
import { db } from "@/server/db/client";
import { setMailerForTests, type EmailMessage } from "@/server/email/mailer";
import { ApiCreateInput, createEnvelopeFromApi } from "@/server/envelopes/api-create";
import { cancelEnvelope, remindSigner } from "@/server/envelopes/manage";
import { rotateApiKey, saveWebhookUrl } from "@/server/integrations/settings";
import { verifyDocument } from "@/server/verification/lookup";
import { GET as listEnvelopes } from "@/app/api/v1/envelopes/route";
import { generateApiKey } from "@/server/credentials/api-key";
import { createAuthorizationCode, exchangeCode, registerClient, s256 } from "@/server/oauth/server";
import { apiRequest, createTestAccount, deleteTestAccounts } from "../../../tests/helpers";
import { fakeOutbox, linkFor, openSession, sentEnvelope, signAs, tctx } from "../../../tests/signing";
import { apiRoutePattern, eventId, flushAnalytics, sampleApiCall, sendToIngest, setAnalyticsSinkForTests, track, type IngestEvent } from "./client";
import { EVENT_SCHEMAS, EVENT_SCREENS, type EventName } from "./events";

const accounts: string[] = [];
let outbox: EmailMessage[] = [];
let events: IngestEvent[] = [];

beforeEach(() => {
  outbox = fakeOutbox();
  events = [];
});
afterEach(() => {
  setMailerForTests(null);
  setAnalyticsSinkForTests(null);
  delete process.env.VISAO_INGEST_URL;
  delete process.env.VISAO_API_KEY;
});
afterAll(() => deleteTestAccounts(accounts));

const names = () => events.map((e) => e.nome);
const byName = (n: EventName) => events.filter((e) => e.nome === n);
const senderEmail = async (contaId: string) => (await db().from("as_contas").select("email").eq("id", contaId).single()).data!.email;

describe("catálogo fechado (seção 21)", () => {
  it("todo evento da seção 21 tem tela e esquema; nenhuma propriedade pessoal existe no catálogo", () => {
    expect(Object.keys(EVENT_SCHEMAS).sort()).toEqual(Object.keys(EVENT_SCREENS).sort());
    expect(Object.keys(EVENT_SCHEMAS)).toHaveLength(16);
    const forbidden = /titulo|nome|email|e_mail|^cpf$|mensagem|motivo|^ip$|valor|arquivo|token|codigo$/;
    for (const schema of Object.values(EVENT_SCHEMAS)) {
      for (const key of Object.keys(schema.shape)) expect(key).not.toMatch(forbidden);
    }
  });

  it("propriedade fora do esquema é recusada (no tipo e em tempo de execução)", async () => {
    setAnalyticsSinkForTests((e) => events.push(e));
    // @ts-expect-error — titulo não é propriedade de assina_envelope_criado.
    track("assina_envelope_criado", { quem: { email: "a@b.dev" }, propriedades: { origem: "painel", titulo: "Contrato" } });
    // @ts-expect-error — e-mail nunca é propriedade.
    track("assina_documento_recusado", { quem: { signatario: "x" }, propriedades: { email: "ana@x.dev" } });
    // @ts-expect-error — origem fora da lista.
    track("assina_envelope_cancelado", { quem: { email: "a@b.dev" }, propriedades: { origem: "whatsapp" } });
    track("assina_envelope_criado", { quem: { email: "a@b.dev" }, propriedades: { origem: "api" } });
    await flushAnalytics();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ nome: "assina_envelope_criado", tela: "novo envelope", distinct_id: "a@b.dev", propriedades: { origem: "api" } });
  });

  it("id: estável por evento e registro, no formato UUID; sem registro, aleatório", async () => {
    const a = eventId("assina_envelope_enviado", "e1");
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(eventId("assina_envelope_enviado", "e1")).toBe(a);
    expect(eventId("assina_envelope_criado", "e1")).not.toBe(a);
    setAnalyticsSinkForTests((e) => events.push(e));
    track("assina_chave_api_gerada", { quem: { email: "a@b.dev" }, propriedades: {} });
    track("assina_chave_api_gerada", { quem: { email: "a@b.dev" }, propriedades: {} });
    await flushAnalytics();
    expect(events[0].id).not.toBe(events[1].id);
  });
});

describe("eventos nos fluxos", () => {
  it("remetente e signatário: nomes, telas, distinct_id e nenhum dado pessoal no que sai", async () => {
    setAnalyticsSinkForTests((e) => events.push(e));
    const env = await sentEnvelope(accounts, [{ nome: "Ana Souza", email: "ana@analytics.dev", exigir_cpf: true }, { nome: "Bia Lima", email: "bia@analytics.dev", papel: "copia" }]);
    const sender = await senderEmail(env.contaId);
    const token = linkFor(outbox, "ana@analytics.dev");
    const cookie = await openSession(outbox, token, "ana@analytics.dev");
    expect((await visualizou(apiRequest("/x", { method: "POST", cookie }), tctx(token))).status).toBe(200);
    expect((await visualizou(apiRequest("/x", { method: "POST", cookie }), tctx(token))).status).toBe(200);
    const signed = await assinar(
      apiRequest("/x", { method: "POST", cookie, body: { consentimento: CONSENTIMENTO_VERSAO, campos: [], metodo: "digitada", assinatura_texto: "Ana Souza", cpf: "52998224725" } }),
      tctx(token),
    );
    expect(signed.status).toBe(200);
    await flushAnalytics();

    expect(names()).toEqual(
      expect.arrayContaining(["assina_envelope_criado", "assina_envelope_enviado", "assina_codigo_validado", "assina_documento_aberto", "assina_documento_assinado", "assina_envelope_concluido"]),
    );
    expect(byName("assina_documento_aberto")).toHaveLength(1); // uma vez por sessão
    const sid = env.byEmail["ana@analytics.dev"];
    expect(byName("assina_envelope_enviado")[0]).toMatchObject({
      id: eventId("assina_envelope_enviado", env.id),
      distinct_id: sender,
      tela: "revisar",
      propriedades: { origem: "painel", nivel: 1, assinantes: 1, copias: 1, em_ordem: false, com_campos: false, paginas: 1, prazo_dias: 30 },
    });
    expect(byName("assina_codigo_validado")[0]).toMatchObject({ distinct_id: `sig_${sid}`, propriedades: { tentativas: 1 } });
    expect(byName("assina_documento_assinado")[0]).toMatchObject({
      distinct_id: `sig_${sid}`,
      propriedades: { metodo: "digitada", campos: 0, cpf_exigido: true, nascimento_exigido: false, minutos_desde_convite: 0 },
    });
    expect(byName("assina_envelope_concluido")[0]).toMatchObject({ distinct_id: sender, tela: "sistema", propriedades: { origem: "painel", selo: "B-B" } });

    // Nada de título, nome, e-mail do signatário, CPF ou nome de arquivo em evento nenhum.
    const wire = JSON.stringify(events);
    for (const s of ["Contrato", "Ana", "Bia", "ana@analytics.dev", "bia@analytics.dev", "52998224725", ".pdf"]) expect(wire).not.toContain(s);

    // Verificação pública: anônima, por código.
    const { data: e } = await db().from("as_envelopes").select("codigo_verificacao").eq("id", env.id).single();
    events = [];
    await verifyDocument({ codigo: e!.codigo_verificacao });
    await verifyDocument({ hash: "0".repeat(64) });
    await flushAnalytics();
    expect(events.map((x) => x.propriedades)).toEqual([
      { por: "codigo", resultado: "final" },
      { por: "arquivo", resultado: "nao_encontrado" },
    ]);
    expect(events[0].distinct_id).toMatch(/^anon_[0-9a-f-]{36}$/);
  });

  it("criação pela API desfeita (arquivo_url recusada) não conta como envelope criado", async () => {
    setAnalyticsSinkForTests((e) => events.push(e));
    const a = await createTestAccount({ accepted: true });
    accounts.push(a.id);
    const input = ApiCreateInput.parse({ titulo: "Contrato", arquivo_url: "https://10.0.0.1/contrato.pdf", signatarios: [{ nome: "Ana", email: "ana@analytics5.dev" }] });
    await expect(createEnvelopeFromApi(a.id, input, null, { ip: null, userAgent: null })).rejects.toThrow();
    const ok = await createEnvelopeFromApi(a.id, ApiCreateInput.parse({ titulo: "Contrato", signatarios: [{ nome: "Ana", email: "ana@analytics5.dev" }] }), null, { ip: null, userAgent: null });
    await flushAnalytics();
    expect(byName("assina_envelope_criado")).toEqual([expect.objectContaining({ id: eventId("assina_envelope_criado", ok.envelope.id), propriedades: { origem: "api" } })]);
  });

  it("recusa, lembrete, cancelamento, chave de API e webhook", async () => {
    setAnalyticsSinkForTests((e) => events.push(e));
    const env = await sentEnvelope(accounts, [{ nome: "Ana", email: "ana@analytics2.dev" }]);
    const token = linkFor(outbox, "ana@analytics2.dev");
    const cookie = await openSession(outbox, token, "ana@analytics2.dev");
    expect((await recusar(apiRequest("/x", { method: "POST", cookie, body: { motivo: "Valor errado" } }), tctx(token))).status).toBe(200);

    const env2 = await sentEnvelope(accounts, [{ nome: "Bia", email: "bia@analytics2.dev" }]);
    await remindSigner(env2.contaId, env2.id, env2.byEmail["bia@analytics2.dev"], { ip: null, userAgent: null });
    await cancelEnvelope(env2.contaId, env2.id, "Mudou tudo", { ip: null, userAgent: null }, "api");
    await rotateApiKey(env2.contaId);
    expect(await saveWebhookUrl(env2.contaId, "https://exemplo.com.br/hook")).toBe("ok");
    expect(await saveWebhookUrl(env2.contaId, null)).toBe("ok");
    await flushAnalytics();

    expect(byName("assina_documento_recusado")[0]).toMatchObject({ distinct_id: `sig_${env.byEmail["ana@analytics2.dev"]}`, propriedades: {} });
    const sender2 = await senderEmail(env2.contaId);
    expect(byName("assina_envelope_cancelado")[0]).toMatchObject({ distinct_id: sender2, propriedades: { origem: "api" } });
    expect(byName("assina_lembrete_enviado")[0]).toMatchObject({ distinct_id: sender2, tela: "detalhe", propriedades: { automatico: false } });
    expect(byName("assina_chave_api_gerada")).toHaveLength(1);
    expect(byName("assina_webhook_configurado")).toHaveLength(1); // remover a URL não conta
    const wire = JSON.stringify(events);
    for (const s of ["Valor errado", "Mudou tudo", "exemplo.com.br", "Contrato"]) expect(wire).not.toContain(s);
  });
});

describe("máquinas: MCP conectado e chamada da API", () => {
  it("troca do código OAuth gera assina_mcp_conectado com o nome do cliente; a v1 gera assina_api_chamada amostrada", async () => {
    setAnalyticsSinkForTests((e) => events.push(e));
    const a = await createTestAccount({ accepted: true });
    accounts.push(a.id);
    const email = await senderEmail(a.id);
    const client = await registerClient("Claude", ["https://claude.ai/api/mcp/auth_callback"]);
    try {
      const verifier = "v".repeat(50);
      const code = await createAuthorizationCode(client, a.id, client.redirect_uris[0], s256(verifier));
      expect(await exchangeCode(code, client.id, client.redirect_uris[0], verifier)).toMatch(/^assina_mcp_/);

      const key = generateApiKey();
      await db().from("as_credenciais").insert({ conta_id: a.id, tipo: "api", nome: "Chave de API", prefixo: key.prefix, valor_hash: key.hash, valor_cifrado: key.sealed });
      const req = () => {
        const r = apiRequest("/api/v1/envelopes");
        r.headers.set("authorization", `Bearer ${key.value}`);
        return r;
      };
      expect((await listEnvelopes(req())).status).toBe(200);
      expect((await listEnvelopes(req())).status).toBe(200); // dentro dos 10 s: não conta
      await flushAnalytics();
    } finally {
      await db().from("as_oauth_clientes").delete().eq("id", client.id);
    }
    expect(byName("assina_mcp_conectado")).toEqual([expect.objectContaining({ distinct_id: email, tela: "autorizar", propriedades: { cliente: "Claude" } })]);
    expect(byName("assina_api_chamada")).toEqual([expect.objectContaining({ distinct_id: email, tela: "api", propriedades: { rota: "/api/v1/envelopes", status: 200 } })]);
  });
});

describe("ingest fora do ar não quebra nem atrasa (critério 8.11)", () => {
  let server: Server;
  let base = "";
  let mode: "ok" | "500" | "hang" = "ok";
  const received: { headers: IncomingMessage["headers"]; body: string }[] = [];

  beforeAll(async () => {
    server = createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        received.push({ headers: req.headers, body });
        if (mode === "hang") return; // nunca responde
        res.writeHead(mode === "500" ? 500 : 202, { "content-type": "application/json" }).end(JSON.stringify({ aceitos: 1, rejeitados: [] }));
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  });
  beforeEach(() => {
    received.length = 0;
    mode = "ok";
    process.env.VISAO_API_KEY = "vp_chave_de_teste";
  });

  it("no ar: POST {eventos} com x-api-key; 202", async () => {
    process.env.VISAO_INGEST_URL = `${base}/functions/v1/ingest`;
    const ev: IngestEvent = { id: eventId("assina_conta_criada", "c1"), nome: "assina_conta_criada", distinct_id: "a@b.dev", ocorrido_em: new Date().toISOString(), tela: "entrar", propriedades: {} };
    expect(await sendToIngest([ev])).toBe(202);
    expect(received[0].headers["x-api-key"]).toBe("vp_chave_de_teste");
    expect(JSON.parse(received[0].body)).toEqual({ eventos: [ev] });
  });

  it("500 e conexão recusada: o fluxo segue e o envio só devolve o status", async () => {
    mode = "500";
    process.env.VISAO_INGEST_URL = `${base}/ingest`;
    const env = await sentEnvelope(accounts, [{ nome: "Ana", email: "ana@analytics3.dev" }]);
    await signAs(outbox, "ana@analytics3.dev", { metodo: "digitada", assinatura_texto: "Ana" });
    await flushAnalytics();
    expect((await db().from("as_envelopes").select("status").eq("id", env.id).single()).data!.status).toBe("concluido");
    expect(received.length).toBeGreaterThanOrEqual(4);

    process.env.VISAO_INGEST_URL = "http://127.0.0.1:1/ingest"; // ninguém escuta
    const env2 = await sentEnvelope(accounts, [{ nome: "Bia", email: "bia@analytics3.dev" }]);
    await cancelEnvelope(env2.contaId, env2.id, null, { ip: null, userAgent: null });
    await flushAnalytics();
    expect((await db().from("as_envelopes").select("status").eq("id", env2.id).single()).data!.status).toBe("cancelado");
  });

  it("pendurado: a ação volta na hora; o envio desiste em 4 s", async () => {
    const env = await sentEnvelope(accounts, [{ nome: "Ana", email: "ana@analytics4.dev" }]);
    await flushAnalytics();
    mode = "hang";
    process.env.VISAO_INGEST_URL = `${base}/ingest`;
    const t0 = Date.now();
    await cancelEnvelope(env.contaId, env.id, null, { ip: null, userAgent: null });
    expect(Date.now() - t0).toBeLessThan(2000);
    await flushAnalytics();
    const waited = Date.now() - t0;
    expect(waited).toBeGreaterThanOrEqual(3900);
    expect(waited).toBeLessThan(6000);
    expect(received).toHaveLength(1);
  }, 15_000);
});

describe("amostragem da API e padrão da rota (seção 21)", () => {
  it("no máximo 1 a cada 10 s por credencial", () => {
    const t = 1_000_000;
    expect(sampleApiCall("cred-a", t)).toBe(true);
    expect(sampleApiCall("cred-a", t + 9_999)).toBe(false);
    expect(sampleApiCall("cred-b", t + 1)).toBe(true);
    expect(sampleApiCall("cred-a", t + 10_000)).toBe(true);
  });

  it("rota sem id (nem lixo que veio na URL)", () => {
    expect(apiRoutePattern("/api/v1/envelopes")).toBe("/api/v1/envelopes");
    expect(apiRoutePattern("/api/v1/envelopes/6f1c2a7e-0000-4000-8000-000000000000/enviar")).toBe("/api/v1/envelopes/{id}/enviar");
    expect(apiRoutePattern("/api/v1/envelopes/ana@x.dev/arquivo")).toBe("/api/v1/envelopes/{id}/arquivo");
    expect(apiRoutePattern("/mcp")).toBe("/mcp");
  });
});
