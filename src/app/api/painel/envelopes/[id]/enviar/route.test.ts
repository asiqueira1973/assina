// Critérios do épico 8.4 pelas rotas, com o Supabase local, o driver local de arquivos e um
// driver de e-mail falso (registra ou falha).
import { createHash } from "node:crypto";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { setMailerForTests, type EmailMessage } from "@/server/email/mailer";
import { storage } from "@/server/files/storage";
import { retryFailedInvites } from "@/server/notifications/invites";
import { hashCredential } from "@/server/credentials/api-key";
import { generateVerificationCode } from "@/server/envelopes/verification-code";
import { apiRequest, createTestAccount, deleteTestAccounts } from "../../../../../../../tests/helpers";
import { uploadTo } from "../../../../../../../tests/envelopes";
import { makePdf } from "../../../../../../../tests/fixtures/pdfs";
import { POST as createEnvelope } from "../../route";
import { POST as attachFile } from "../arquivo/route";
import { PATCH } from "../route";
import { PUT as putSigners } from "../signatarios/route";
import { POST as send } from "./route";
import { POST as retryInvite } from "../signatarios/[sid]/convite/route";

const ids: string[] = [];
afterAll(() => deleteTestAccounts(ids));
afterEach(() => setMailerForTests(null));

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

// Caixa de saída falsa: guarda os e-mails; com fail = true, o provedor recusa.
function fakeMailer(opts: { fail?: boolean } = {}) {
  const outbox: EmailMessage[] = [];
  setMailerForTests({
    async send(m) {
      if (opts.fail) throw new Error("resend_500");
      outbox.push(m);
      return { id: `fake-${outbox.length}` };
    },
  });
  return outbox;
}

async function account() {
  const a = await createTestAccount({ accepted: true });
  ids.push(a.id);
  return a;
}

// Rascunho pronto para enviar: PDF válido e destinatários. Devolve: id e os bytes do PDF.
async function readyDraft(cookie: string, signatarios: unknown[], opts: { emOrdem?: boolean } = {}) {
  const res = await createEnvelope(apiRequest("/api/painel/envelopes", { method: "POST", cookie, body: { nome_arquivo: "Contrato.pdf" } }));
  const { envelope, upload_url } = await res.json();
  const pdf = await makePdf(1);
  await uploadTo(upload_url, pdf);
  await attachFile(apiRequest(`/api/painel/envelopes/${envelope.id}/arquivo`, { method: "POST", cookie, body: { nome_arquivo: "Contrato.pdf" } }), ctx(envelope.id));
  await putSigners(apiRequest(`/api/painel/envelopes/${envelope.id}/signatarios`, { method: "PUT", cookie, body: { signatarios } }), ctx(envelope.id));
  if (opts.emOrdem) await PATCH(apiRequest(`/api/painel/envelopes/${envelope.id}`, { method: "PATCH", cookie, body: { em_ordem: true } }), ctx(envelope.id));
  return { id: envelope.id as string, pdf };
}

const sendReq = (id: string, cookie: string) => send(apiRequest(`/api/painel/envelopes/${id}/enviar`, { method: "POST", cookie }), ctx(id));

describe("POST /api/painel/envelopes/{id}/enviar (épico 8.4)", () => {
  it("envia: hash do arquivo, prazo, convite só para quem é da vez, link que confere com o hash", async () => {
    const outbox = fakeMailer();
    const a = await account();
    const { id, pdf } = await readyDraft(
      a.cookie,
      [
        { nome: "Ana", email: "ana@envio.dev" },
        { nome: "Bruno", email: "bruno@envio.dev" },
        { nome: "Carla", email: "carla@envio.dev", papel: "copia" },
      ],
      { emOrdem: true },
    );
    const res = await sendReq(id, a.cookie);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.convites).toEqual({ enviados: 1, falharam: 0 });
    expect(body.envelope.status).toBe("enviado");
    expect(body.envelope.hash_original).toBe(createHash("sha256").update(pdf).digest("hex"));

    // Em ordem: só a Ana; a cópia nunca recebe convite.
    expect(outbox.map((m) => m.to)).toEqual(["ana@envio.dev"]);
    const mail = outbox[0];
    expect(mail.subject).toBe("Conta Teste enviou um documento para você assinar: Contrato");
    expect(mail.replyTo).toMatch(/@teste\.dev$/);
    const token = mail.text.match(/\/assinar\/([A-Za-z0-9_-]{43})/)![1];
    const { data: ana } = await db().from("as_signatarios").select("token_hash, status, notificado_em").eq("envelope_id", id).eq("email", "ana@envio.dev").single();
    expect(ana!.token_hash).toBe(hashCredential(token));
    expect(ana!.status).toBe("aguardando");
    expect(ana!.notificado_em).not.toBeNull();

    const { data: eventos } = await db().from("as_eventos").select("tipo, dados").eq("envelope_id", id).order("seq");
    expect(eventos!.map((e) => e.tipo)).toEqual(["criado", "enviado", "convite_enviado"]);
    expect(eventos![2].dados).toEqual({ para: "a***@envio.dev" });
    const { data: notas } = await db().from("as_notificacoes").select("status, tentativas").eq("envelope_id", id);
    expect(notas).toEqual([{ status: "enviada", tentativas: 1 }]);
  });

  it("dois envios em paralelo: um 200 e um 409 status_mudou; um e-mail só", async () => {
    const outbox = fakeMailer();
    const a = await account();
    const { id } = await readyDraft(a.cookie, [{ nome: "Ana", email: "ana@envio.dev" }]);
    const [r1, r2] = await Promise.all([sendReq(id, a.cookie), sendReq(id, a.cookie)]);
    expect([r1.status, r2.status].sort()).toEqual([200, 409]);
    const loser = r1.status === 409 ? r1 : r2;
    expect(await loser.json()).toEqual({ codigo: "status_mudou" });
    expect(outbox).toHaveLength(1);
  });

  it("Resend falhando: envelope enviado, convite 'falhou'; Tentar de novo manda com link novo; a faxina também retenta", async () => {
    fakeMailer({ fail: true });
    const a = await account();
    const { id } = await readyDraft(a.cookie, [{ nome: "Ana", email: "ana@envio.dev" }, { nome: "Bruno", email: "bruno@envio.dev" }]);
    const res = await sendReq(id, a.cookie);
    expect((await res.json()).convites).toEqual({ enviados: 0, falharam: 2 });
    expect((await db().from("as_envelopes").select("status").eq("id", id).single()).data!.status).toBe("enviado");
    const { data: notas } = await db().from("as_notificacoes").select("status, erro").eq("envelope_id", id);
    expect(notas!.every((n) => n.status === "falhou" && n.erro === "resend_500")).toBe(true);

    // "Tentar de novo" da faixa: link novo para a Ana.
    const { data: ana } = await db().from("as_signatarios").select("id, token_hash").eq("envelope_id", id).eq("email", "ana@envio.dev").single();
    const outbox = fakeMailer();
    const retry = await retryInvite(apiRequest(`/api/painel/envelopes/${id}/signatarios/${ana!.id}/convite`, { method: "POST", cookie: a.cookie }), {
      params: Promise.resolve({ id, sid: ana!.id }),
    });
    expect(retry.status).toBe(200);
    const token = outbox[0].text.match(/\/assinar\/([A-Za-z0-9_-]{43})/)![1];
    const { data: anaDepois } = await db().from("as_signatarios").select("token_hash").eq("id", ana!.id).single();
    expect(anaDepois!.token_hash).toBe(hashCredential(token));
    expect(anaDepois!.token_hash).not.toBe(ana!.token_hash);

    // Faxina (regra 11.16): manda o que falta (Bruno) e não repete a Ana.
    expect(await retryFailedInvites({ contaIds: [a.id] })).toBe(1);
    expect(outbox.map((m) => m.to)).toEqual(["ana@envio.dev", "bruno@envio.dev"]);
    expect(await retryFailedInvites({ contaIds: [a.id] })).toBe(0);
  });

  it("reenvios simultâneos do mesmo convite mandam um e-mail só (reserva no banco)", async () => {
    fakeMailer({ fail: true });
    const a = await account();
    const { id } = await readyDraft(a.cookie, [{ nome: "Ana", email: "ana@envio.dev" }]);
    await sendReq(id, a.cookie);
    const { data: ana } = await db().from("as_signatarios").select("id").eq("envelope_id", id).single();
    await db().from("as_notificacoes").update({ reservada_em: null }).eq("chave", `convite:${ana!.id}`);
    const outbox = fakeMailer();
    const p = () => ({ params: Promise.resolve({ id, sid: ana!.id }) });
    const results = await Promise.all([
      retryInvite(apiRequest(`/x`, { method: "POST", cookie: a.cookie }), p()),
      retryInvite(apiRequest(`/x`, { method: "POST", cookie: a.cookie }), p()),
      retryFailedInvites({ contaIds: [a.id] }),
    ]);
    // Um e-mail só, e exatamente um dos três pedidos foi o que mandou; os outros ficaram de fora.
    expect(outbox).toHaveLength(1);
    const routeStatuses = [(results[0] as Response).status, (results[1] as Response).status];
    const winners = routeStatuses.filter((st) => st === 200).length + (results[2] as number);
    expect(winners).toBe(1);
    expect(routeStatuses.every((st) => st === 200 || st === 409)).toBe(true);
  });

  it("conta suspensa: a faxina não manda convite", async () => {
    fakeMailer({ fail: true });
    const a = await account();
    const { id } = await readyDraft(a.cookie, [{ nome: "Ana", email: "ana@envio.dev" }]);
    await sendReq(id, a.cookie);
    await db().from("as_notificacoes").update({ reservada_em: null }).eq("envelope_id", id);
    await db().from("as_contas").update({ suspensa_em: new Date().toISOString() }).eq("id", a.id);
    const outbox = fakeMailer();
    expect(await retryFailedInvites({ contaIds: [a.id] })).toBe(0);
    expect(outbox).toHaveLength(0);
  });

  it("Tentar de novo sem convite pendente → 409; de outra conta → 404", async () => {
    fakeMailer();
    const a = await account();
    const outra = await account();
    const { id } = await readyDraft(a.cookie, [{ nome: "Ana", email: "ana@envio.dev" }]);
    await sendReq(id, a.cookie);
    const { data: ana } = await db().from("as_signatarios").select("id").eq("envelope_id", id).single();
    const p = { params: Promise.resolve({ id, sid: ana!.id }) };
    expect((await retryInvite(apiRequest(`/x`, { method: "POST", cookie: a.cookie }), p)).status).toBe(409);
    expect((await retryInvite(apiRequest(`/x`, { method: "POST", cookie: outra.cookie }), p)).status).toBe(404);
  });

  it("sem assinante → 400; arquivo removido do armazenamento → 400; outra conta → 404", async () => {
    fakeMailer();
    const a = await account();
    const { id } = await readyDraft(a.cookie, [{ nome: "Carla", email: "carla@envio.dev", papel: "copia" }]);
    expect(await (await sendReq(id, a.cookie)).json()).toEqual({ codigo: "sem_assinante" });

    const { id: id2 } = await readyDraft(a.cookie, [{ nome: "Ana", email: "ana@envio.dev" }]);
    const { data } = await db().from("as_envelopes").select("arquivo_original_path").eq("id", id2).single();
    await storage().delete(data!.arquivo_original_path!);
    expect(await (await sendReq(id2, a.cookie)).json()).toEqual({ codigo: "arquivo_invalido", motivo: "arquivo_ausente" });

    const outra = await account();
    expect((await sendReq(id2, outra.cookie)).status).toBe(404);
  });

  it("limite diário (31º envio em 24 h) → 429 limite_diario", async () => {
    fakeMailer();
    const a = await account();
    // 30 envios nas últimas 24 h (registro em as_envios, que sobrevive à exclusão do envelope).
    await db().from("as_envios").insert(Array.from({ length: 30 }, () => ({ conta_id: a.id })));
    const { id } = await readyDraft(a.cookie, [{ nome: "Ana", email: "ana@envio.dev" }]);
    const res = await sendReq(id, a.cookie);
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ codigo: "limite_diario" });
  });

  it("nível 1 com 50 documentos guardados → 429 limite_do_nivel; rascunho continua sendo criado", async () => {
    fakeMailer();
    const a = await account();
    // 50 envelopes encerrados há mais de 24 h (não contam no limite diário, contam no nível).
    const antigo = new Date(Date.now() - 3 * 86400_000).toISOString();
    for (let i = 0; i < 50; i++) {
      const { data: e } = await db().rpc("as_fn_cria_rascunho", { p_conta_id: a.id, p_titulo: `E${i}`, p_origem: "api", p_codigo_verificacao: generateVerificationCode(), p_ator: "api" }).single();
      await db().from("as_envelopes").update({ status: "enviado", hash_original: "a".repeat(64), enviado_em: antigo }).eq("id", (e as unknown as { id: string }).id);
    }
    const { id } = await readyDraft(a.cookie, [{ nome: "Ana", email: "ana@envio.dev" }]);
    const res = await sendReq(id, a.cookie);
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ codigo: "limite_do_nivel" });
    expect((await db().from("as_envelopes").select("status").eq("id", id).single()).data!.status).toBe("rascunho");
  });
});
