// Critérios do épico 8.5 pelas rotas do signatário: envelope enviado de verdade (rotas do painel),
// link e código lidos dos e-mails de um driver de e-mail falso.
import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { ASSINATURA_PNG_MAX_BYTES } from "@/lib/limits";
import { db } from "@/server/db/client";
import { setMailerForTests, type EmailMessage } from "@/server/email/mailer";
import { generateSignerToken } from "@/server/envelopes/signer-token";
import { storage } from "@/server/files/storage";
import { apiRequest, createTestAccount, deleteTestAccounts, SITE } from "../../../../../tests/helpers";
import { uploadTo } from "../../../../../tests/envelopes";
import { makePdf } from "../../../../../tests/fixtures/pdfs";
import { POST as createEnvelope } from "../../painel/envelopes/route";
import { POST as attachFile } from "../../painel/envelopes/[id]/arquivo/route";
import { PATCH } from "../../painel/envelopes/[id]/route";
import { PUT as putSigners } from "../../painel/envelopes/[id]/signatarios/route";
import { PUT as putFields } from "../../painel/envelopes/[id]/campos/route";
import { POST as send } from "../../painel/envelopes/[id]/enviar/route";
import { POST as codigo } from "./codigo/route";
import { POST as validar } from "./validar/route";
import { POST as visualizou } from "./visualizou/route";
import { POST as assinar } from "./assinar/route";
import { POST as recusar } from "./recusar/route";
import { GET as documento } from "./documento/route";

const ids: string[] = [];
let outbox: EmailMessage[] = [];
beforeEach(() => {
  outbox = [];
  setMailerForTests({
    async send(m) {
      outbox.push(m);
      return { id: `fake-${outbox.length}` };
    },
  });
});
afterEach(() => setMailerForTests(null));
afterAll(() => deleteTestAccounts(ids));

const pctx = (id: string) => ({ params: Promise.resolve({ id }) });
const tctx = (token: string) => ({ params: Promise.resolve({ token }) });
const PNG_1PX = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

// Envelope enviado. Recebe: destinatários, ordem e campos por e-mail. Devolve: id, conta e a
// função que acha o link de um destinatário no e-mail.
async function sentEnvelope(signatarios: { nome: string; email: string; papel?: string; exigir_cpf?: boolean }[], opts: { emOrdem?: boolean; campos?: (ids: Record<string, string>) => unknown[] } = {}) {
  const a = await createTestAccount({ accepted: true });
  ids.push(a.id);
  const res = await createEnvelope(apiRequest("/api/painel/envelopes", { method: "POST", cookie: a.cookie, body: { nome_arquivo: "Contrato.pdf" } }));
  const { envelope, upload_url } = await res.json();
  await uploadTo(upload_url, await makePdf(1));
  await attachFile(apiRequest("/x", { method: "POST", cookie: a.cookie, body: { nome_arquivo: "Contrato.pdf" } }), pctx(envelope.id));
  const put = await putSigners(apiRequest("/x", { method: "PUT", cookie: a.cookie, body: { signatarios } }), pctx(envelope.id));
  const byEmail = Object.fromEntries(((await put.json()).signatarios as { id: string; email: string }[]).map((s) => [s.email, s.id]));
  if (opts.emOrdem) await PATCH(apiRequest("/x", { method: "PATCH", cookie: a.cookie, body: { em_ordem: true } }), pctx(envelope.id));
  if (opts.campos) await putFields(apiRequest("/x", { method: "PUT", cookie: a.cookie, body: { campos: opts.campos(byEmail) } }), pctx(envelope.id));
  await send(apiRequest("/x", { method: "POST", cookie: a.cookie }), pctx(envelope.id));
  return { id: envelope.id as string, cookie: a.cookie, byEmail };
}

// O link mais recente mandado a um e-mail.
function linkFor(email: string): string {
  const mail = [...outbox].reverse().find((m) => m.to === email && /\/assinar\//.test(m.text));
  return mail!.text.match(/\/assinar\/([A-Za-z0-9_-]{43})/)![1];
}
function codeFor(email: string): string {
  const mail = [...outbox].reverse().find((m) => m.to === email && /^Seu código/.test(m.subject));
  return mail!.subject.match(/(\d{6})/)![1];
}

// Requisição do signatário, com Origin do site e o cookie de sessão (se houver).
function sreq(path: string, opts: { method?: string; body?: unknown; cookie?: string } = {}) {
  return apiRequest(path, { method: opts.method ?? "POST", body: opts.body, cookie: opts.cookie });
}

// Pede o código, valida e devolve o cookie da sessão.
async function openSession(token: string, email: string): Promise<string> {
  expect((await codigo(sreq("/x"), tctx(token))).status).toBe(200);
  const res = await validar(sreq("/x", { body: { codigo: codeFor(email) } }), tctx(token));
  expect(res.status).toBe(200);
  const cookie = res.headers.get("set-cookie")!.split(";")[0];
  return cookie;
}

// PNG válido no cabeçalho, completado com zeros até o tamanho pedido; devolve base64.
function pngOfSize(bytes: number): string {
  const head = Buffer.from(PNG_1PX.split(",")[1], "base64");
  return Buffer.concat([head, Buffer.alloc(bytes - head.length)]).toString("base64");
}
const signBody = (over: Record<string, unknown> = {}) => ({ consentimento: "2026-11-17", metodo: "digitada", assinatura_texto: "Ana Souza", campos: [], ...over });

describe("signatário (épico 8.5)", () => {
  it("o PDF não é servido antes do código; depois, 302 para a URL assinada", async () => {
    await sentEnvelope([{ nome: "Ana", email: "ana@s.dev" }]);
    const token = linkFor("ana@s.dev");
    expect((await documento(new NextRequest(`${SITE}/api/assinar/${token}/documento`), tctx(token))).status).toBe(401);
    const cookie = await openSession(token, "ana@s.dev");
    const res = await documento(new NextRequest(`${SITE}/api/assinar/${token}/documento`, { headers: { cookie } }), tctx(token));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toMatch(/\/api\/dev\/arquivos\/.+original-.+\.pdf\?op=get/);
  });

  it("link inválido → 404; Origin de outro site → 403", async () => {
    expect((await codigo(sreq("/x"), tctx("x".repeat(43)))).status).toBe(404);
    await sentEnvelope([{ nome: "Ana", email: "ana@s.dev" }]);
    const token = linkFor("ana@s.dev");
    expect((await codigo(apiRequest("/x", { method: "POST", origin: "https://evil.example" }), tctx(token))).status).toBe(403);
  });

  it("código: e-mail com o código e evento; 5 erros bloqueiam; 60 s entre envios; 6º da hora recusado", async () => {
    const { byEmail } = await sentEnvelope([{ nome: "Ana", email: "ana@s.dev" }]);
    const token = linkFor("ana@s.dev");
    expect((await codigo(sreq("/x"), tctx(token))).status).toBe(200);
    expect(outbox.at(-1)!.subject).toMatch(/^Seu código: \d{6}$/);
    expect((await codigo(sreq("/x"), tctx(token))).status).toBe(429);

    for (let i = 4; i >= 1; i--) {
      const r = await validar(sreq("/x", { body: { codigo: "000000" } }), tctx(token));
      expect(await r.json()).toEqual({ codigo: "errado", restantes: i });
    }
    expect(await (await validar(sreq("/x", { body: { codigo: "000000" } }), tctx(token))).json()).toEqual({ codigo: "bloqueado" });
    expect(await (await validar(sreq("/x", { body: { codigo: codeFor("ana@s.dev") } }), tctx(token))).json()).toEqual({ codigo: "bloqueado" });

    // Limite da hora: zera o intervalo e conta os envios.
    const sid = byEmail["ana@s.dev"];
    for (let i = 0; i < 4; i++) {
      await db().from("as_signatarios").update({ codigo_expira_em: null }).eq("id", sid);
      expect((await codigo(sreq("/x"), tctx(token))).status).toBe(200);
    }
    await db().from("as_signatarios").update({ codigo_expira_em: null }).eq("id", sid);
    const sexto = await codigo(sreq("/x"), tctx(token));
    expect(sexto.status).toBe(429);
    expect(await sexto.json()).toEqual({ codigo: "limite_hora" });
  });

  it("visualizou: uma vez por sessão", async () => {
    const { id } = await sentEnvelope([{ nome: "Ana", email: "ana@s.dev" }]);
    const token = linkFor("ana@s.dev");
    expect((await visualizou(sreq("/x"), tctx(token))).status).toBe(401);
    const cookie = await openSession(token, "ana@s.dev");
    expect(await (await visualizou(sreq("/x", { cookie }), tctx(token))).json()).toEqual({ registrado: true });
    expect(await (await visualizou(sreq("/x", { cookie }), tctx(token))).json()).toEqual({ registrado: false });
    const { count } = await db().from("as_eventos").select("id", { count: "exact", head: true }).eq("envelope_id", id).eq("tipo", "visualizou");
    expect(count).toBe(1);
  });

  it("assinar em ordem: obrigatórios, CPF, PNG; a próxima recebe o convite; a última leva a finalizando", async () => {
    const { id, byEmail } = await sentEnvelope(
      [
        { nome: "Ana", email: "ana@s.dev", exigir_cpf: true },
        { nome: "Bia", email: "bia@s.dev" },
      ],
      {
        emOrdem: true,
        campos: (ids) => [
          { signatario_id: ids["ana@s.dev"], tipo: "assinatura", pagina: 1, x: 0.1, y: 0.8, largura: 0.3, altura: 0.06 },
          { signatario_id: ids["ana@s.dev"], tipo: "texto", pagina: 1, x: 0.1, y: 0.1, largura: 0.3, altura: 0.03, obrigatorio: true, rotulo: "Cargo" },
        ],
      },
    );
    const token = linkFor("ana@s.dev");
    expect((await assinar(sreq("/x", { body: signBody() }), tctx(token))).status).toBe(401);
    const cookie = await openSession(token, "ana@s.dev");
    const { data: texto } = await db().from("as_campos").select("id").eq("envelope_id", id).eq("tipo", "texto").single();

    const tries: [Record<string, unknown>, string][] = [
      [{ cpf: "529.982.247-24" }, "cpf_invalido"],
      [{ cpf: "529.982.247-25" }, "campo_obrigatorio"],
      [{ cpf: "529.982.247-25", campos: [{ id: texto!.id, valor: "Diretora" }], metodo: "desenhada", assinatura_png: "data:image/png;base64," + Buffer.from("não é png").toString("base64") }, "imagem_invalida"],
      // PNG de verdade no cabeçalho, com 1 byte acima de 200 KB: passa pelo limite do corpo e só o
      // tamanho decodificado o recusa.
      [{ cpf: "529.982.247-25", campos: [{ id: texto!.id, valor: "Diretora" }], metodo: "desenhada", assinatura_png: "data:image/png;base64," + pngOfSize(ASSINATURA_PNG_MAX_BYTES + 1) }, "imagem_invalida"],
      [{ cpf: "529.982.247-25", campos: [{ id: texto!.id, valor: "Diretora" }], metodo: "desenhada", assinatura_png: "data:image/png;base64," + pngOfSize(ASSINATURA_PNG_MAX_BYTES * 2) }, "dados_invalidos"],
    ];
    for (const [over, codigoEsperado] of tries) {
      const r = await assinar(sreq("/x", { cookie, body: signBody(over) }), tctx(token));
      expect(r.status).toBe(400);
      expect((await r.json()).codigo).toBe(codigoEsperado);
    }

    const ok = await assinar(
      sreq("/x", { cookie, body: signBody({ cpf: "529.982.247-25", metodo: "desenhada", assinatura_png: PNG_1PX, campos: [{ id: texto!.id, valor: "Diretora" }] }) }),
      tctx(token),
    );
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ envelope_status: "enviado" });
    const { data: ana } = await db().from("as_signatarios").select("status, cpf, metodo_assinatura, assinatura_imagem_path").eq("id", byEmail["ana@s.dev"]).single();
    expect(ana).toMatchObject({ status: "assinou", cpf: "52998224725", metodo_assinatura: "desenhada" });
    expect(ana!.assinatura_imagem_path).toMatch(/assinaturas\/.+-assinatura\.png$/);

    // Bia recebeu o convite agora; o remetente, o aviso de que Ana assinou.
    expect(outbox.some((m) => m.to === "bia@s.dev" && /enviou um documento/.test(m.subject))).toBe(true);
    expect(outbox.some((m) => /^Ana assinou Contrato$/.test(m.subject))).toBe(true);

    const tokenBia = linkFor("bia@s.dev");
    const cookieBia = await openSession(tokenBia, "bia@s.dev");
    const fim = await assinar(sreq("/x", { cookie: cookieBia, body: signBody({ assinatura_texto: "Bia" }) }), tctx(tokenBia));
    expect(await fim.json()).toEqual({ envelope_status: "finalizando" });
    const { data: eventos } = await db().from("as_eventos").select("tipo, dados").eq("envelope_id", id).eq("tipo", "assinou").order("seq");
    expect(eventos!.map((e) => e.dados)).toEqual([{ campos: 2, metodo: "desenhada" }, { campos: 0, metodo: "digitada" }]);
    expect(await (await assinar(sreq("/x", { cookie: cookieBia, body: signBody() }), tctx(tokenBia))).json()).toEqual({ codigo: "status_mudou" });
  });

  it("link trocado (reenvio) derruba a sessão antiga", async () => {
    const { id, cookie: owner } = await sentEnvelope([{ nome: "Ana", email: "ana@s.dev" }]);
    void owner;
    const token = linkFor("ana@s.dev");
    const cookie = await openSession(token, "ana@s.dev");
    // Novo token direto no banco (como faz o reenvio).
    const novo = generateSignerToken();
    await db().from("as_signatarios").update({ token_hash: novo.hash }).eq("envelope_id", id);
    expect((await visualizou(sreq("/x", { cookie }), tctx(token))).status).toBe(404);
    // O link novo abre, mas o cookie antigo (do token anterior) não vale como sessão.
    expect((await visualizou(sreq("/x", { cookie }), tctx(novo.value))).status).toBe(401);
    expect((await documento(sreq("/x", { method: "GET", cookie }), tctx(novo.value))).status).toBe(401);
  });

  it("prazo vencido (antes da faxina): sem código, sem documento, sem assinatura", async () => {
    const { id } = await sentEnvelope([{ nome: "Ana", email: "ana@s.dev" }]);
    const token = linkFor("ana@s.dev");
    const cookie = await openSession(token, "ana@s.dev");
    await db().from("as_envelopes").update({ prazo_em: new Date(Date.now() - 1000).toISOString() }).eq("id", id);
    expect((await (await codigo(sreq("/x"), tctx(token))).json()).codigo).toBe("prazo_encerrado");
    expect((await documento(sreq("/x", { method: "GET", cookie }), tctx(token))).status).toBe(409);
    expect((await (await assinar(sreq("/x", { cookie, body: signBody({ assinatura_texto: "Ana" }) }), tctx(token))).json()).codigo).toBe("prazo_encerrado");
  });

  it("e-mail que falha depois do commit não vira erro: assinatura vale e o aviso fica para a faxina", async () => {
    const { id } = await sentEnvelope([{ nome: "Ana", email: "ana@s.dev" }]);
    const token = linkFor("ana@s.dev");
    const cookie = await openSession(token, "ana@s.dev");
    setMailerForTests({
      async send() {
        throw new Error("resend_500");
      },
    });
    const r = await assinar(sreq("/x", { cookie, body: signBody({ assinatura_texto: "Ana" }) }), tctx(token));
    expect(r.status).toBe(200);
    const { data: aviso } = await db().from("as_notificacoes").select("status, erro").eq("envelope_id", id).eq("tipo", "assinou_remetente").single();
    expect(aviso).toEqual({ status: "falhou", erro: "resend_500" });
  });

  it("duas tentativas de assinar: a que perde não apaga a imagem da que ganhou", async () => {
    const { id, byEmail } = await sentEnvelope([{ nome: "Ana", email: "ana@s.dev" }]);
    const token = linkFor("ana@s.dev");
    const cookie = await openSession(token, "ana@s.dev");
    const body = signBody({ metodo: "desenhada", assinatura_png: PNG_1PX });
    const [r1, r2] = await Promise.all([assinar(sreq("/x", { cookie, body }), tctx(token)), assinar(sreq("/x", { cookie, body }), tctx(token))]);
    expect([r1.status, r2.status].sort()).toEqual([200, 409]);
    const { data: ana } = await db().from("as_signatarios").select("assinatura_imagem_path").eq("id", byEmail["ana@s.dev"]).single();
    expect(await storage().read(ana!.assinatura_imagem_path!, 1024)).not.toBeNull();
    void id;
  });

  it("recusar: motivo obrigatório; envelope recusado; avisos ao remetente e a quem já foi convidado", async () => {
    const { id } = await sentEnvelope([
      { nome: "Ana", email: "ana@s.dev" },
      { nome: "Bia", email: "bia@s.dev" },
    ]);
    const token = linkFor("ana@s.dev");
    const cookie = await openSession(token, "ana@s.dev");
    expect((await (await recusar(sreq("/x", { cookie, body: { motivo: "   " } }), tctx(token))).json()).codigo).toBe("motivo_invalido");
    expect((await recusar(sreq("/x", { cookie, body: { motivo: "Valor errado" } }), tctx(token))).status).toBe(200);
    expect((await db().from("as_envelopes").select("status").eq("id", id).single()).data!.status).toBe("recusado");
    expect(outbox.some((m) => m.subject === "Ana recusou Contrato" && m.text.includes("Valor errado"))).toBe(true);
    expect(outbox.some((m) => m.to === "bia@s.dev" && m.subject === "Contrato foi recusado")).toBe(true);
  });

  it("prazo vencido: não assina, mesmo antes da faxina", async () => {
    const { id } = await sentEnvelope([{ nome: "Ana", email: "ana@s.dev" }]);
    const token = linkFor("ana@s.dev");
    const cookie = await openSession(token, "ana@s.dev");
    await db().from("as_envelopes").update({ prazo_em: new Date(Date.now() - 1000).toISOString() }).eq("id", id);
    const r = await assinar(sreq("/x", { cookie, body: signBody() }), tctx(token));
    expect(r.status).toBe(409);
    expect(await r.json()).toEqual({ codigo: "prazo_encerrado" });
  });
});
