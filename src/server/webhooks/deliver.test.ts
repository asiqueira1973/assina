// Regra 11.17 e critério 8.9: os webhooks saem com a assinatura HMAC certa e os cabeçalhos, para
// assinou, concluído, recusado e cancelado; falha conta tentativa e a faxina reentrega; para no
// 6º; URL com IP privado não recebe nada; "Enviar teste".
import { createHmac } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { encryptSecret } from "@/server/crypto/aes";
import { db } from "@/server/db/client";
import { setMailerForTests, type EmailMessage } from "@/server/email/mailer";
import { setRemoteFetchTestMode } from "@/server/files/fetch-remote";
import { cancelEnvelope } from "@/server/envelopes/manage";
import { deleteTestAccounts, apiRequest } from "../../../tests/helpers";
import { startHttps } from "../../../tests/https-server";
import { fakeOutbox, linkFor, openSession, sentEnvelope, signAs, tctx } from "../../../tests/signing";
import { POST as recusar } from "@/app/api/assinar/[token]/recusar/route";
import { generateWebhookSecret, retryWebhooks, sendTestWebhook } from "./deliver";

const accounts: string[] = [];
let outbox: EmailMessage[] = [];
let status = 200;
let bigBody = false;
let hook: Awaited<ReturnType<typeof startHttps>>;
const SECRET = generateWebhookSecret();

beforeAll(async () => {
  setRemoteFetchTestMode(true);
  hook = await startHttps((_req, res) => res.writeHead(status).end(bigBody ? Buffer.alloc(200 * 1024, 120) : "ok"));
});
afterAll(async () => {
  await hook.close();
  setRemoteFetchTestMode(false);
  await deleteTestAccounts(accounts);
});
beforeEach(() => {
  outbox = fakeOutbox();
  status = 200;
  bigBody = false;
  hook.received.length = 0;
});
afterEach(() => setMailerForTests(null));

async function withWebhook(contaId: string, url = `${hook.base}/hook`) {
  await db().from("as_contas").update({ webhook_url: url, webhook_segredo_cifrado: encryptSecret(SECRET) }).eq("id", contaId);
}
const deliveries = async (envelopeId: string) =>
  (await db().from("as_entregas_webhook").select("evento, status, tentativas, ultimo_status_http").eq("envelope_id", envelopeId).order("criado_em")).data!;

describe("webhooks (regra 11.17)", () => {
  it("assinou e concluído: corpo, cabeçalhos e assinatura HMAC conferem", async () => {
    const env = await sentEnvelope(accounts, [{ nome: "Ana", email: "ana@hook.dev" }]);
    await withWebhook(env.contaId);
    await signAs(outbox, "ana@hook.dev", { metodo: "digitada", assinatura_texto: "Ana" });

    expect(hook.received.map((r) => r.headers["assina-evento"])).toEqual(["signatario.assinou", "envelope.concluido"]);
    for (const r of hook.received) {
      const m = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(String(r.headers["assina-assinatura"]))!;
      expect(m).not.toBeNull();
      expect(Math.abs(Date.now() / 1000 - Number(m[1]))).toBeLessThan(60);
      expect(m[2]).toBe(createHmac("sha256", SECRET).update(`${m[1]}.${r.body}`).digest("hex"));
      expect(r.headers["content-type"]).toBe("application/json");
      expect(r.headers["assina-entrega"]).toMatch(/^[0-9a-f-]{36}$/);
    }
    const signed = JSON.parse(hook.received[0].body);
    expect(signed).toMatchObject({ evento: "signatario.assinou", envelope: { id: env.id, titulo: "Contrato" }, signatario: { id: env.byEmail["ana@hook.dev"], email: "ana@hook.dev" } });
    const done = JSON.parse(hook.received[1].body);
    expect(done).toMatchObject({ evento: "envelope.concluido", envelope: { status: "concluido", hash_final: expect.stringMatching(/^[0-9a-f]{64}$/) } });
    expect(hook.received[1].body).not.toContain("%PDF");
    expect(await deliveries(env.id)).toEqual([
      { evento: "signatario.assinou", status: "entregue", tentativas: 1, ultimo_status_http: 200 },
      { evento: "envelope.concluido", status: "entregue", tentativas: 1, ultimo_status_http: 200 },
    ]);
  });

  it("falha (500) conta tentativa; a faxina reentrega; no 6º para", async () => {
    const env = await sentEnvelope(accounts, [{ nome: "Ana", email: "ana@hook2.dev" }, { nome: "Bia", email: "bia@hook2.dev" }]);
    await withWebhook(env.contaId);
    status = 500;
    await signAs(outbox, "ana@hook2.dev", { metodo: "digitada", assinatura_texto: "Ana" });
    expect(await deliveries(env.id)).toEqual([{ evento: "signatario.assinou", status: "falhou", tentativas: 1, ultimo_status_http: 500 }]);
    status = 200;
    expect(await retryWebhooks({ contaIds: [env.contaId] })).toBe(1);
    expect((await deliveries(env.id))[0]).toMatchObject({ status: "entregue", tentativas: 2, ultimo_status_http: 200 });

    // Esgotada: 6 tentativas e nada mais.
    await db().from("as_entregas_webhook").update({ status: "falhou", tentativas: 6 }).eq("envelope_id", env.id);
    hook.received.length = 0;
    expect(await retryWebhooks({ contaIds: [env.contaId] })).toBe(0);
    expect(hook.received).toHaveLength(0);
  });

  it("recusado e cancelado saem na hora; conta sem URL não enfileira", async () => {
    const env = await sentEnvelope(accounts, [{ nome: "Ana", email: "ana@hook3.dev" }]);
    await withWebhook(env.contaId);
    const token = linkFor(outbox, "ana@hook3.dev");
    const cookie = await openSession(outbox, token, "ana@hook3.dev");
    expect((await recusar(apiRequest("/x", { method: "POST", cookie, body: { motivo: "Não" } }), tctx(token))).status).toBe(200);
    expect(hook.received.map((r) => r.headers["assina-evento"])).toEqual(["envelope.recusado"]);

    const env2 = await sentEnvelope(accounts, [{ nome: "Bia", email: "bia@hook3.dev" }]);
    await withWebhook(env2.contaId);
    await cancelEnvelope(env2.contaId, env2.id, null, { ip: null, userAgent: null });
    expect(hook.received.map((r) => r.headers["assina-evento"])).toEqual(["envelope.recusado", "envelope.cancelado"]);

    const env3 = await sentEnvelope(accounts, [{ nome: "Caio", email: "caio@hook3.dev" }]);
    await signAs(outbox, "caio@hook3.dev", { metodo: "digitada", assinatura_texto: "Caio" });
    expect(await deliveries(env3.id)).toEqual([]);
  });

  it("2xx com corpo grande (200 KB) é entregue; sem URL, a faxina não pega a entrega", async () => {
    const env = await sentEnvelope(accounts, [{ nome: "Ana", email: "ana@hook5.dev" }, { nome: "Bia", email: "bia@hook5.dev" }]);
    await withWebhook(env.contaId);
    bigBody = true;
    await signAs(outbox, "ana@hook5.dev", { metodo: "digitada", assinatura_texto: "Ana" });
    expect((await deliveries(env.id))[0]).toMatchObject({ status: "entregue", tentativas: 1, ultimo_status_http: 200 });

    status = 500;
    bigBody = false;
    await signAs(outbox, "bia@hook5.dev", { metodo: "digitada", assinatura_texto: "Bia" });
    const failed = (await deliveries(env.id)).filter((d) => d.status === "falhou").length;
    expect(failed).toBeGreaterThan(0);
    await db().from("as_contas").update({ webhook_url: null, webhook_segredo_cifrado: null }).eq("id", env.contaId);
    hook.received.length = 0;
    expect(await retryWebhooks({ contaIds: [env.contaId] })).toBe(0);
    expect(hook.received).toHaveLength(0);
  });

  it("URL que aponta para IP privado não recebe nada (SSRF); Enviar teste", async () => {
    const env = await sentEnvelope(accounts, [{ nome: "Ana", email: "ana@hook4.dev" }]);
    await withWebhook(env.contaId, "https://10.0.0.1/hook");
    await signAs(outbox, "ana@hook4.dev", { metodo: "digitada", assinatura_texto: "Ana" });
    expect((await deliveries(env.id))[0]).toMatchObject({ status: "falhou", ultimo_status_http: null });
    expect(await sendTestWebhook(env.contaId)).toBe(0);

    await withWebhook(env.contaId);
    expect(await sendTestWebhook(env.contaId)).toBe(200);
    expect(hook.received.at(-1)!.headers["assina-evento"]).toBe("teste");
  });
});
