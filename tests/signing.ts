// Fluxo de assinatura pelas rotas, para os testes da finalização (épico 8.6): cria a conta,
// envia o envelope pelo painel, lê link e código dos e-mails de um driver falso e assina.
import { expect } from "vitest";
import { CONSENTIMENTO_VERSAO } from "@/lib/limits";
import { setMailerForTests, type EmailMessage } from "@/server/email/mailer";
import { apiRequest, createTestAccount } from "./helpers";
import { uploadTo } from "./envelopes";
import { makePdf } from "./fixtures/pdfs";
import { POST as createEnvelope } from "@/app/api/painel/envelopes/route";
import { POST as attachFile } from "@/app/api/painel/envelopes/[id]/arquivo/route";
import { PATCH } from "@/app/api/painel/envelopes/[id]/route";
import { PUT as putSigners } from "@/app/api/painel/envelopes/[id]/signatarios/route";
import { PUT as putFields } from "@/app/api/painel/envelopes/[id]/campos/route";
import { POST as send } from "@/app/api/painel/envelopes/[id]/enviar/route";
import { POST as codigo } from "@/app/api/assinar/[token]/codigo/route";
import { POST as validar } from "@/app/api/assinar/[token]/validar/route";
import { POST as assinar } from "@/app/api/assinar/[token]/assinar/route";

export const PNG_1PX = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
const pctx = (id: string) => ({ params: Promise.resolve({ id }) });
export const tctx = (token: string) => ({ params: Promise.resolve({ token }) });

// Caixa de saída falsa. Devolve: a lista (zerada a cada chamada) e a instala no mailer.
export function fakeOutbox(): EmailMessage[] {
  const outbox: EmailMessage[] = [];
  setMailerForTests({
    async send(m) {
      outbox.push(m);
      return { id: `fake-${outbox.length}` };
    },
  });
  return outbox;
}

type SignerSpec = { nome: string; email: string; papel?: string; exigir_cpf?: boolean; exigir_nascimento?: boolean };

// Envelope enviado pelo painel. Recebe: ids das contas criadas (para o afterAll), destinatários,
// PDF e campos. Devolve: id, conta e o id de cada destinatário por e-mail.
export async function sentEnvelope(
  accounts: string[],
  signatarios: SignerSpec[],
  opts: { pdf?: Uint8Array; emOrdem?: boolean; campos?: (ids: Record<string, string>) => unknown[]; account?: { id: string; cookie: string }; nomeArquivo?: string } = {},
) {
  // Conta nova por envelope, ou uma conta já criada (vários envelopes na mesma lista).
  const a = opts.account ?? (await createTestAccount({ accepted: true }));
  if (!opts.account) accounts.push(a.id);
  const nome = opts.nomeArquivo ?? "Contrato.pdf";
  const res = await createEnvelope(apiRequest("/api/painel/envelopes", { method: "POST", cookie: a.cookie, body: { nome_arquivo: nome } }));
  const { envelope, upload_url } = await res.json();
  await uploadTo(upload_url, opts.pdf ?? (await makePdf(1)));
  expect((await attachFile(apiRequest("/x", { method: "POST", cookie: a.cookie, body: { nome_arquivo: nome } }), pctx(envelope.id))).status).toBe(200);
  const put = await putSigners(apiRequest("/x", { method: "PUT", cookie: a.cookie, body: { signatarios } }), pctx(envelope.id));
  const byEmail = Object.fromEntries(((await put.json()).signatarios as { id: string; email: string }[]).map((s) => [s.email, s.id]));
  if (opts.emOrdem) await PATCH(apiRequest("/x", { method: "PATCH", cookie: a.cookie, body: { em_ordem: true } }), pctx(envelope.id));
  if (opts.campos) {
    const r = await putFields(apiRequest("/x", { method: "PUT", cookie: a.cookie, body: { campos: opts.campos(byEmail) } }), pctx(envelope.id));
    expect(r.status).toBe(200);
  }
  expect((await send(apiRequest("/x", { method: "POST", cookie: a.cookie }), pctx(envelope.id))).status).toBe(200);
  return { id: envelope.id as string, contaId: a.id, cookie: a.cookie, byEmail };
}

// O link mais recente mandado a um e-mail.
export function linkFor(outbox: EmailMessage[], email: string): string {
  const mail = [...outbox].reverse().find((m) => m.to === email && /\/assinar\//.test(m.text));
  return mail!.text.match(/\/assinar\/([A-Za-z0-9_-]{43})/)![1];
}

// Pede o código, valida e devolve o cookie da sessão do signatário.
export async function openSession(outbox: EmailMessage[], token: string, email: string): Promise<string> {
  expect((await codigo(apiRequest("/x", { method: "POST" }), tctx(token))).status).toBe(200);
  const mail = [...outbox].reverse().find((m) => m.to === email && /^Seu código/.test(m.subject));
  const res = await validar(apiRequest("/x", { method: "POST", body: { codigo: mail!.subject.match(/(\d{6})/)![1] } }), tctx(token));
  expect(res.status).toBe(200);
  return res.headers.get("set-cookie")!.split(";")[0];
}

// Assina pelo link mais recente. Recebe: a caixa, o e-mail e o corpo (sem o consentimento).
// Devolve: o status do envelope que a rota respondeu.
export async function signAs(outbox: EmailMessage[], email: string, body: Record<string, unknown>): Promise<string> {
  const token = linkFor(outbox, email);
  const cookie = await openSession(outbox, token, email);
  const res = await assinar(apiRequest("/x", { method: "POST", cookie, body: { consentimento: CONSENTIMENTO_VERSAO, campos: [], ...body } }), tctx(token));
  const json = await res.json();
  expect(res.status, JSON.stringify(json)).toBe(200);
  return json.envelope_status;
}
