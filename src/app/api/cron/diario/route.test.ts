// Critério 8.13: a faxina diária, limitada às contas da fixture (runDailyCleanup({ contaIds })),
// expira, lembra, retenta, expurga e apaga, nesta ordem; rodar duas vezes seguidas não reenvia
// nada. A rota exige o Bearer CRON_SECRET.
import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { flushAnalytics, setAnalyticsSinkForTests, type IngestEvent } from "@/server/analytics/client";
import { encryptSecret } from "@/server/crypto/aes";
import { deleteOrphanOAuthClients, runDailyCleanup } from "@/server/cron";
import { db } from "@/server/db/client";
import { setMailerForTests, type EmailMessage } from "@/server/email/mailer";
import { generateVerificationCode } from "@/server/envelopes/verification-code";
import { cancelEnvelope } from "@/server/envelopes/manage";
import { setRemoteFetchTestMode } from "@/server/files/fetch-remote";
import { envelopePaths, storage } from "@/server/files/storage";
import { registerClient } from "@/server/oauth/server";
import { generateWebhookSecret } from "@/server/webhooks/deliver";
import { createTestAccount, deleteTestAccounts } from "../../../../../tests/helpers";
import { startHttps } from "../../../../../tests/https-server";
import { fakeOutbox, sentEnvelope } from "../../../../../tests/signing";
import { GET } from "./route";

const accounts: string[] = [];
const clients: string[] = [];
let outbox: EmailMessage[] = [];
let hook: Awaited<ReturnType<typeof startHttps>>;
const DAY = 86_400_000;
const META = { ip: null, userAgent: null };
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

beforeAll(async () => {
  setRemoteFetchTestMode(true);
  hook = await startHttps((_req, res) => res.writeHead(200).end("ok"));
});
afterAll(async () => {
  await hook.close();
  setRemoteFetchTestMode(false);
  if (clients.length) await db().from("as_oauth_clientes").delete().in("id", clients);
  await deleteTestAccounts(accounts);
});
beforeEach(() => {
  outbox = fakeOutbox();
});
afterEach(() => {
  setMailerForTests(null);
  setAnalyticsSinkForTests(null);
});

const request = (auth: string | null) =>
  new NextRequest("http://localhost:3030/api/cron/diario", { headers: auth === null ? {} : { authorization: auth } });

describe("rota /api/cron/diario", () => {
  it("sem o Bearer certo: 401 e nada roda", async () => {
    for (const auth of [null, "Bearer errado", `Basic ${process.env.CRON_SECRET}`]) {
      const res = await GET(request(auth));
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ codigo: "nao_autorizado" });
    }
  });
});

describe("faxina diária (critério 8.13)", () => {
  it("expira, lembra, retenta, expurga e apaga; a segunda execução não reenvia nada", async () => {
    // 1. Envelope vencido, numa conta com webhook.
    const venc = await sentEnvelope(accounts, [{ nome: "Ana", email: "ana@faxina.dev" }, { nome: "Bia", email: "bia@faxina.dev" }]);
    await db().from("as_contas").update({ webhook_url: `${hook.base}/hook`, webhook_segredo_cifrado: encryptSecret(generateWebhookSecret()) }).eq("id", venc.contaId);
    await db().from("as_envelopes").update({ prazo_em: ago(60_000) }).eq("id", venc.id);
    const { data: conta } = await db().from("as_contas").select("email").eq("id", venc.contaId).single();

    // 2. Lembrete devido: convite há 4 dias, lembrete a cada 3.
    const lem = await sentEnvelope(accounts, [{ nome: "Caio", email: "caio@faxina.dev" }]);
    const caio = lem.byEmail["caio@faxina.dev"];
    await db().from("as_signatarios").update({ notificado_em: ago(4 * DAY) }).eq("id", caio);

    // 4. Aviso que falhou: o cancelamento com o e-mail fora do ar.
    const canc = await sentEnvelope(accounts, [{ nome: "Duda", email: "duda@faxina.dev" }]);
    setMailerForTests({ send: async () => Promise.reject(new Error("resend_503")) });
    await cancelEnvelope(canc.contaId, canc.id, null, META);
    // A falha foi ontem (a faxina deixa para o dia seguinte o que nasceu no último minuto).
    await db().from("as_notificacoes").update({ criado_em: ago(DAY) }).eq("envelope_id", canc.id).eq("tipo", "cancelado_destinatario");
    outbox = fakeOutbox();

    // 6. Cancelado há 91 dias, com o original no armazenamento.
    const velho = await sentEnvelope(accounts, [{ nome: "Eva", email: "eva@faxina.dev" }]);
    await cancelEnvelope(velho.contaId, velho.id, null, META);
    await db().from("as_envelopes").update({ encerrado_em: ago(91 * DAY) }).eq("id", velho.id);
    const { data: velhoRow } = await db().from("as_envelopes").select("arquivo_original_path").eq("id", velho.id).single();
    expect(await storage().read(velhoRow!.arquivo_original_path!, 20 * 1024 * 1024)).not.toBeNull();

    // 7. Rascunho parado há 31 dias (inserido com a data antiga: o trigger renova a data em UPDATE).
    const { data: draft } = await db()
      .from("as_envelopes")
      .insert({ conta_id: venc.contaId, titulo: "Esquecido", origem: "painel", codigo_verificacao: generateVerificationCode(), atualizado_em: ago(31 * DAY) })
      .select("id")
      .single();
    await storage().write(envelopePaths(venc.contaId, draft!.id).upload, new Uint8Array([37, 80, 68, 70]), "application/pdf");
    const { data: novo } = await db()
      .from("as_envelopes")
      .insert({ conta_id: venc.contaId, titulo: "Recente", origem: "painel", codigo_verificacao: generateVerificationCode() })
      .select("id")
      .single();

    // 8. Código OAuth vencido.
    const client = await registerClient("Faxina", ["https://cliente.example/cb"]);
    clients.push(client.id);
    await db().from("as_oauth_codigos").insert({
      codigo_hash: `faxina-${client.id}`, cliente_id: client.id, conta_id: venc.contaId, redirect_uri: "https://cliente.example/cb",
      code_challenge: "a".repeat(43), expira_em: ago(60_000),
    });

    const scope = { contaIds: [venc.contaId, lem.contaId, canc.contaId, velho.contaId] };
    const events: IngestEvent[] = [];
    setAnalyticsSinkForTests((e) => events.push(e));
    const first = await runDailyCleanup(scope);
    await flushAnalytics();
    // Seção 21: os dois eventos que só a faxina dispara.
    expect(events.find((e) => e.nome === "assina_envelope_expirado")).toMatchObject({ tela: "sistema", propriedades: { assinaram: 0, faltaram: 2 } });
    expect(events.find((e) => e.nome === "assina_lembrete_enviado")).toMatchObject({ propriedades: { automatico: true } });
    expect(first).toMatchObject({ expirados: 1, lembretes: 1, avisos: 1, webhooks: 0, expurgados: 1, rascunhos: 1, codigos_oauth: 1 });

    // 1: expirado, aviso ao remetente com quem assinou e quem não, webhook entregue na hora.
    expect((await db().from("as_envelopes").select("status").eq("id", venc.id).single()).data!.status).toBe("expirado");
    const expired = outbox.find((m) => m.to === conta!.email && /^Prazo encerrado: /.test(m.subject))!;
    expect(expired.text).toContain("Ninguém assinou.");
    expect(expired.text).toContain("Não assinaram: Ana, Bia.");
    expect(hook.received.map((r) => r.headers["assina-evento"])).toContain("envelope.expirado");
    // 2: lembrete ao Caio, com canal automático na trilha.
    expect(outbox.filter((m) => m.to === "caio@faxina.dev" && /^Lembrete: /.test(m.subject))).toHaveLength(1);
    const { data: lev } = await db().from("as_eventos").select("ator, dados").eq("envelope_id", lem.id).eq("tipo", "lembrete_enviado");
    expect(lev).toEqual([{ ator: "sistema", dados: { canal: "automatico" } }]);
    // 4: o aviso de cancelamento saiu na retentativa.
    expect(outbox.filter((m) => m.to === "duda@faxina.dev")).toHaveLength(1);
    // 6: arquivos do cancelado antigo apagados e marcados.
    const { data: purged } = await db().from("as_envelopes").select("arquivos_expurgados_em, arquivo_original_path").eq("id", velho.id).single();
    expect(purged!.arquivos_expurgados_em).not.toBeNull();
    expect(purged!.arquivo_original_path).toBeNull();
    expect(await storage().read(velhoRow!.arquivo_original_path!, 20 * 1024 * 1024)).toBeNull();
    // 7: o rascunho parado sumiu (com o arquivo); o recente ficou.
    expect((await db().from("as_envelopes").select("id").eq("id", draft!.id)).data).toEqual([]);
    expect(await storage().read(envelopePaths(venc.contaId, draft!.id).upload, 1024)).toBeNull();
    expect((await db().from("as_envelopes").select("id").eq("id", novo!.id)).data).toHaveLength(1);
    // 8: o código vencido sumiu.
    expect((await db().from("as_oauth_codigos").select("codigo_hash").eq("cliente_id", client.id)).data).toEqual([]);

    // Segunda execução: nada sai de novo.
    const mails = outbox.length;
    const hooks = hook.received.length;
    const second = await runDailyCleanup(scope);
    expect(second).toEqual({ expirados: 0, lembretes: 0, finalizados: 0, convites: 0, avisos: 0, webhooks: 0, expurgados: 0, rascunhos: 0, codigos_oauth: 0 });
    expect(outbox).toHaveLength(mails);
    expect(hook.received).toHaveLength(hooks);
    expect((await db().from("as_eventos").select("id").eq("envelope_id", venc.id).eq("tipo", "expirado")).data).toHaveLength(1);
  });

  it("lembrete preso no meio do envio vira falhou; quem já foi lembrado há pouco não recebe outro", async () => {
    const env = await sentEnvelope(accounts, [{ nome: "Gabi", email: "gabi@faxina.dev" }]);
    const sid = env.byEmail["gabi@faxina.dev"];
    // Lembrado há 2 dias (cada 3): ainda não é a vez.
    await db().from("as_signatarios").update({ notificado_em: ago(5 * DAY), ultimo_lembrete_em: ago(2 * DAY), lembretes_enviados: 1 }).eq("id", sid);
    const { data: stuck } = await db()
      .from("as_notificacoes")
      .insert({ conta_id: env.contaId, envelope_id: env.id, signatario_id: sid, tipo: "lembrete", chave: `lembrete:${sid}:preso`, tentativas: 1, criado_em: ago(2 * 3600_000) })
      .select("id")
      .single();
    const result = await runDailyCleanup({ contaIds: [env.contaId] });
    expect(result.lembretes).toBe(0);
    expect(outbox.filter((m) => m.to === "gabi@faxina.dev" && /^Lembrete: /.test(m.subject))).toHaveLength(0);
    expect((await db().from("as_notificacoes").select("status, erro").eq("id", stuck!.id).single()).data).toEqual({ status: "falhou", erro: "interrompido" });
  });

  it("rascunho antigo com destinatário salvo hoje não é apagado (o trigger renova a data)", async () => {
    const env = await sentEnvelope(accounts, [{ nome: "Hugo", email: "hugo@faxina.dev" }]);
    const { data: draft } = await db()
      .from("as_envelopes")
      .insert({ conta_id: env.contaId, titulo: "Em uso", origem: "painel", codigo_verificacao: generateVerificationCode(), atualizado_em: ago(40 * DAY) })
      .select("id")
      .single();
    await db().from("as_signatarios").insert({ envelope_id: draft!.id, conta_id: env.contaId, nome: "Iara", email: "iara@faxina.dev", token_hash: `tok-${draft!.id}` });
    expect((await runDailyCleanup({ contaIds: [env.contaId] })).rascunhos).toBe(0);
    expect((await db().from("as_envelopes").select("id").eq("id", draft!.id)).data).toHaveLength(1);
  });

  it("aviso do expirado que falhou na hora não é retentado na mesma execução (uma tentativa por dia)", async () => {
    const env = await sentEnvelope(accounts, [{ nome: "Joana", email: "joana@faxina.dev" }]);
    await db().from("as_envelopes").update({ prazo_em: ago(60_000) }).eq("id", env.id);
    setMailerForTests({ send: async () => Promise.reject(new Error("resend_503")) });
    const result = await runDailyCleanup({ contaIds: [env.contaId] });
    expect(result).toMatchObject({ expirados: 1, avisos: 0 });
    const { data: note } = await db().from("as_notificacoes").select("status, tentativas").eq("chave", `expirado_remetente:${env.id}`).single();
    expect(note).toEqual({ status: "falhou", tentativas: 1 });
  });

  it("cliente OAuth órfão antigo é apagado; com conexão ou recente, fica", async () => {
    const orphan = await registerClient("Órfão", ["https://orfao.example/cb"]);
    const recent = await registerClient("Recente", ["https://recente.example/cb"]);
    const used = await registerClient("Usado", ["https://usado.example/cb"]);
    clients.push(orphan.id, recent.id, used.id);
    await db().from("as_oauth_clientes").update({ criado_em: ago(30 * DAY) }).in("id", [orphan.id, used.id]);
    const a = await createTestAccount({ accepted: true });
    accounts.push(a.id);
    await db().from("as_credenciais").insert({ conta_id: a.id, tipo: "mcp", nome: "Usado", prefixo: "assina_mcp_x", valor_hash: `h-${used.id}`, oauth_cliente_id: used.id });
    expect(await deleteOrphanOAuthClients([orphan.id, recent.id, used.id])).toBe(1);
    const { data: left } = await db().from("as_oauth_clientes").select("id").in("id", [orphan.id, recent.id, used.id]);
    expect(left!.map((c) => c.id).sort()).toEqual([recent.id, used.id].sort());
  });
});
