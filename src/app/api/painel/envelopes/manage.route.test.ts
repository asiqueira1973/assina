// Critérios do épico 8.7 pelas rotas do painel: lista (filtros, busca, paginação), lembrete,
// copiar link, cancelar, excluir, downloads e trilha em CSV — sempre só na própria conta.
import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { setMailerForTests, type EmailMessage } from "@/server/email/mailer";
import { generateVerificationCode } from "@/server/envelopes/verification-code";
import { listEnvelopes } from "@/server/envelopes/manage";
import { storage } from "@/server/files/storage";
import { apiRequest, createTestAccount, deleteTestAccounts, SITE } from "../../../../../tests/helpers";
import { fakeOutbox, linkFor, openSession, sentEnvelope, signAs, tctx } from "../../../../../tests/signing";
import { DELETE } from "./[id]/route";
import { GET as arquivo } from "./[id]/arquivo/route";
import { POST as cancelar } from "./[id]/cancelar/route";
import { GET as trilhaCsv } from "./[id]/trilha.csv/route";
import { POST as lembrar } from "./[id]/signatarios/[sid]/lembrar/route";
import { POST as copiarLink } from "./[id]/signatarios/[sid]/link/route";
import { POST as visualizou } from "../../assinar/[token]/visualizou/route";

const accounts: string[] = [];
let outbox: EmailMessage[] = [];
beforeEach(() => {
  outbox = fakeOutbox();
});
afterEach(() => setMailerForTests(null));
afterAll(() => deleteTestAccounts(accounts));

const pctx = (id: string) => ({ params: Promise.resolve({ id }) });
const sctx = (id: string, sid: string) => ({ params: Promise.resolve({ id, sid }) });
const get = (path: string, cookie: string) => new NextRequest(`${SITE}${path}`, { headers: { cookie } });
const events = async (id: string) => (await db().from("as_eventos").select("tipo, ator, dados, signatario_id").eq("envelope_id", id).order("seq")).data!;

// O link atual vale? (visualizou com a sessão aberta por esse link)
async function linkWorks(token: string, email: string) {
  try {
    const cookie = await openSession(outbox, token, email);
    return (await visualizou(apiRequest("/x", { method: "POST", cookie }), tctx(token))).status === 200;
  } catch {
    return false;
  }
}

describe("lista (critério 8.7)", () => {
  it("filtros, busca por título ou e-mail (com % literal), progresso, paginação de 30 e só a conta", async () => {
    const env = await sentEnvelope(accounts, [{ nome: "Ana", email: "ana@lista.dev" }, { nome: "Bia", email: "bia@lista.dev" }]);
    await signAs(outbox, "ana@lista.dev", { metodo: "digitada", assinatura_texto: "Ana" });
    // Mais 31 rascunhos direto no banco, um com "%" no título.
    const drafts = Array.from({ length: 31 }, (_, i) => ({ conta_id: env.contaId, titulo: i === 0 ? "Proposta 100% nova" : `Rascunho ${i}`, origem: "painel" as const, codigo_verificacao: generateVerificationCode() }));
    expect((await db().from("as_envelopes").insert(drafts)).error).toBeNull();

    const all = await listEnvelopes(env.contaId, { filtro: "todos", busca: "", pagina: 1 });
    expect(all.total).toBe(32);
    expect(all.rows).toHaveLength(30);
    expect(all.paginas).toBe(2);
    expect((await listEnvelopes(env.contaId, { filtro: "todos", busca: "", pagina: 2 })).rows).toHaveLength(2);
    // Página além do fim cai na última que existe (nunca "Nenhum envelope ainda.").
    expect(await listEnvelopes(env.contaId, { filtro: "todos", busca: "", pagina: 9 })).toMatchObject({ pagina: 2, total: 32, paginas: 2 });

    const waiting = await listEnvelopes(env.contaId, { filtro: "aguardando", busca: "", pagina: 1 });
    expect(waiting.rows.map((r) => [r.id, r.assinaram, r.assinantes])).toEqual([[env.id, 1, 2]]);
    expect((await listEnvelopes(env.contaId, { filtro: "rascunhos", busca: "", pagina: 1 })).total).toBe(31);
    expect((await listEnvelopes(env.contaId, { filtro: "concluidos", busca: "", pagina: 1 })).total).toBe(0);
    expect((await listEnvelopes(env.contaId, { filtro: "encerrados", busca: "", pagina: 1 })).total).toBe(0);

    expect((await listEnvelopes(env.contaId, { filtro: "todos", busca: "BIA@LISTA", pagina: 1 })).rows.map((r) => r.id)).toEqual([env.id]);
    expect((await listEnvelopes(env.contaId, { filtro: "todos", busca: "100%", pagina: 1 })).rows.map((r) => r.titulo)).toEqual(["Proposta 100% nova"]);
    expect((await listEnvelopes(env.contaId, { filtro: "todos", busca: "%", pagina: 1 })).total).toBe(1); // "%" não é curinga

    const other = await createTestAccount({ accepted: true });
    accounts.push(other.id);
    expect((await listEnvelopes(other.id, { filtro: "todos", busca: "", pagina: 1 })).total).toBe(0);
  });
});

describe("lembrete (regra 11.5)", () => {
  it("manda com link novo, registra o evento; o segundo em menos de 24 h é recusado; o 11º também", async () => {
    const env = await sentEnvelope(accounts, [{ nome: "Ana", email: "ana@lem.dev" }]);
    const sid = env.byEmail["ana@lem.dev"];
    const old = linkFor(outbox, "ana@lem.dev");
    const res = await lembrar(apiRequest("/x", { method: "POST", cookie: env.cookie }), sctx(env.id, sid));
    expect(res.status).toBe(200);
    const mail = outbox.findLast((m) => m.to === "ana@lem.dev")!;
    expect(mail.subject).toBe("Lembrete: Contrato aguarda sua assinatura");
    expect(mail.text).toMatch(/Vence em (29|30) dias\./);
    const fresh = linkFor(outbox, "ana@lem.dev");
    expect(fresh).not.toBe(old);
    expect((await events(env.id)).at(-1)).toMatchObject({ tipo: "lembrete_enviado", ator: "remetente", dados: { canal: "manual" }, signatario_id: sid });

    const again = await lembrar(apiRequest("/x", { method: "POST", cookie: env.cookie }), sctx(env.id, sid));
    expect([again.status, (await again.json()).codigo]).toEqual([429, "lembrete_recente"]);

    await db().from("as_signatarios").update({ ultimo_lembrete_em: null, lembretes_enviados: 10 }).eq("id", sid);
    const limit = await lembrar(apiRequest("/x", { method: "POST", cookie: env.cookie }), sctx(env.id, sid));
    expect([limit.status, (await limit.json()).codigo]).toEqual([409, "limite_lembretes"]);
  });

  it("e-mail que falha: 502, a contagem volta e o link antigo continua valendo", async () => {
    const env = await sentEnvelope(accounts, [{ nome: "Ana", email: "ana@lem2.dev" }]);
    const sid = env.byEmail["ana@lem2.dev"];
    const old = linkFor(outbox, "ana@lem2.dev");
    setMailerForTests({
      async send() {
        throw new Error("resend_500");
      },
    });
    const res = await lembrar(apiRequest("/x", { method: "POST", cookie: env.cookie }), sctx(env.id, sid));
    expect([res.status, (await res.json()).codigo]).toEqual([502, "email_falhou"]);
    const { data: s } = await db().from("as_signatarios").select("lembretes_enviados, ultimo_lembrete_em").eq("id", sid).single();
    expect(s).toEqual({ lembretes_enviados: 0, ultimo_lembrete_em: null });
    outbox = fakeOutbox();
    expect(await linkWorks(old, "ana@lem2.dev")).toBe(true);
    // A falha não trava o próximo lembrete.
    expect((await lembrar(apiRequest("/x", { method: "POST", cookie: env.cookie }), sctx(env.id, sid))).status).toBe(200);
  });

  it("prazo vencido (antes da faxina): lembrar e copiar link respondem 409 prazo_encerrado", async () => {
    const env = await sentEnvelope(accounts, [{ nome: "Ana", email: "ana@lem3.dev" }]);
    const sid = env.byEmail["ana@lem3.dev"];
    await db().from("as_envelopes").update({ prazo_em: new Date(Date.now() - 1000).toISOString() }).eq("id", env.id);
    for (const route of [lembrar, copiarLink]) {
      const r = await route(apiRequest("/x", { method: "POST", cookie: env.cookie }), sctx(env.id, sid));
      expect([r.status, (await r.json()).codigo]).toEqual([409, "prazo_encerrado"]);
    }
  });

  it("último dia: o lembrete diz até quando, não 'Vence em 1 dia'", async () => {
    const env = await sentEnvelope(accounts, [{ nome: "Ana", email: "ana@lem4.dev" }]);
    await db().from("as_envelopes").update({ prazo_em: new Date(Date.now() + 5 * 3600_000).toISOString() }).eq("id", env.id);
    expect((await lembrar(apiRequest("/x", { method: "POST", cookie: env.cookie }), sctx(env.id, env.byEmail["ana@lem4.dev"]))).status).toBe(200);
    expect(outbox.findLast((m) => m.to === "ana@lem4.dev")!.text).toMatch(/Assine até \d+ de \w+ de \d{4}\./);
  });
});

describe("copiar link (critério 8.7)", () => {
  it("gera link novo, o anterior deixa de valer, evento convite_enviado {canal: link_copiado}", async () => {
    const env = await sentEnvelope(accounts, [{ nome: "Ana", email: "ana@link.dev" }]);
    const sid = env.byEmail["ana@link.dev"];
    const old = linkFor(outbox, "ana@link.dev");
    const res = await copiarLink(apiRequest("/x", { method: "POST", cookie: env.cookie }), sctx(env.id, sid));
    expect(res.headers.get("cache-control")).toBe("no-store");
    const { link } = await res.json();
    const token = link.match(/\/assinar\/([A-Za-z0-9_-]{43})$/)[1];
    expect((await events(env.id)).at(-1)).toMatchObject({ tipo: "convite_enviado", ator: "remetente", dados: { canal: "link_copiado" }, signatario_id: sid });
    expect(await linkWorks(old, "ana@link.dev")).toBe(false);
    expect(await linkWorks(token, "ana@link.dev")).toBe(true);
  });

  it("de outra conta: 404; de quem já assinou: 409", async () => {
    const env = await sentEnvelope(accounts, [{ nome: "Ana", email: "ana@link2.dev" }, { nome: "Bia", email: "bia@link2.dev" }]);
    const other = await createTestAccount({ accepted: true });
    accounts.push(other.id);
    const sid = env.byEmail["ana@link2.dev"];
    expect((await copiarLink(apiRequest("/x", { method: "POST", cookie: other.cookie }), sctx(env.id, sid))).status).toBe(404);
    expect((await lembrar(apiRequest("/x", { method: "POST", cookie: other.cookie }), sctx(env.id, sid))).status).toBe(404);
    await signAs(outbox, "ana@link2.dev", { metodo: "digitada", assinatura_texto: "Ana" });
    expect((await copiarLink(apiRequest("/x", { method: "POST", cookie: env.cookie }), sctx(env.id, sid))).status).toBe(409);
  });
});

describe("cancelar (critério 8.7)", () => {
  it("enviado → cancelado com motivo; evento; aviso a quem já foi convidado; webhook na fila; de novo → 409", async () => {
    const env = await sentEnvelope(accounts, [{ nome: "Ana", email: "ana@can.dev" }, { nome: "Bia", email: "bia@can.dev" }, { nome: "Caio", email: "caio@can.dev", papel: "copia" }], { emOrdem: true });
    await db().from("as_contas").update({ webhook_url: "https://hook.example/x", webhook_segredo_cifrado: "x" }).eq("id", env.contaId);
    const other = await createTestAccount({ accepted: true });
    accounts.push(other.id);
    expect((await cancelar(apiRequest("/x", { method: "POST", cookie: other.cookie, body: {} }), pctx(env.id))).status).toBe(404);

    const res = await cancelar(apiRequest("/x", { method: "POST", cookie: env.cookie, body: { motivo: "Valor mudou" } }), pctx(env.id));
    expect(res.status).toBe(200);
    const { data: e } = await db().from("as_envelopes").select("status, motivo_cancelamento, encerrado_em").eq("id", env.id).single();
    expect(e).toMatchObject({ status: "cancelado", motivo_cancelamento: "Valor mudou" });
    expect(e!.encerrado_em).not.toBeNull();
    expect((await events(env.id)).at(-1)).toMatchObject({ tipo: "cancelado", ator: "remetente" });
    // Em ordem: só Ana tinha sido convidada.
    const avisos = outbox.filter((m) => m.subject === "Contrato foi cancelado");
    expect(avisos.map((m) => m.to)).toEqual(["ana@can.dev"]);
    expect(avisos[0].text).toContain("Motivo: Valor mudou");
    const { data: hooks } = await db().from("as_entregas_webhook").select("evento").eq("envelope_id", env.id);
    expect(hooks).toEqual([{ evento: "envelope.cancelado" }]);

    const again = await cancelar(apiRequest("/x", { method: "POST", cookie: env.cookie, body: {} }), pctx(env.id));
    expect([again.status, (await again.json()).codigo]).toEqual([409, "status_mudou"]);
  });
});

describe("excluir (seção 7.4)", () => {
  it("enviado → 409; título errado → 400; depois de cancelar, apaga envelope, trilha e arquivos", async () => {
    const env = await sentEnvelope(accounts, [{ nome: "Ana", email: "ana@exc.dev" }]);
    const del = (titulo: string, cookie = env.cookie) => DELETE(apiRequest("/x", { method: "DELETE", cookie, body: { titulo } }), pctx(env.id));
    expect([(await del("Contrato")).status]).toEqual([409]);
    await cancelar(apiRequest("/x", { method: "POST", cookie: env.cookie, body: {} }), pctx(env.id));
    const bad = await del("contrato");
    expect([bad.status, (await bad.json()).codigo]).toEqual([400, "titulo_nao_confere"]);
    const other = await createTestAccount({ accepted: true });
    accounts.push(other.id);
    expect((await del("Contrato", other.cookie)).status).toBe(404);

    const { data: before } = await db().from("as_envelopes").select("arquivo_original_path").eq("id", env.id).single();
    expect(await storage().read(before!.arquivo_original_path!, 20 * 1024 * 1024)).not.toBeNull();
    expect((await del("Contrato")).status).toBe(200);
    expect((await db().from("as_envelopes").select("id").eq("id", env.id)).data).toEqual([]);
    expect(await events(env.id)).toEqual([]);
    expect(await storage().read(before!.arquivo_original_path!, 20 * 1024 * 1024)).toBeNull();
  });
});

describe("downloads e trilha em CSV", () => {
  it("original e final com evento; final antes de concluir → 404; CSV com BOM, ';', colunas da seção 14 e sem fórmula", async () => {
    const env = await sentEnvelope(accounts, [{ nome: "=HYPERLINK(1)", email: "ana@csv.dev" }]);
    const orig = await arquivo(get(`/api/painel/envelopes/${env.id}/arquivo?versao=original`, env.cookie), pctx(env.id));
    expect(orig.status).toBe(302);
    expect((await events(env.id)).at(-1)).toMatchObject({ tipo: "baixou_original", ator: "remetente" });
    expect((await arquivo(get(`/api/painel/envelopes/${env.id}/arquivo?versao=final`, env.cookie), pctx(env.id))).status).toBe(404);

    await signAs(outbox, "ana@csv.dev", { metodo: "digitada", assinatura_texto: "Ana" });
    const fin = await arquivo(get(`/api/painel/envelopes/${env.id}/arquivo?versao=final`, env.cookie), pctx(env.id));
    expect(fin.status).toBe(302);
    expect((await events(env.id)).at(-1)).toMatchObject({ tipo: "baixou_final", ator: "remetente" });

    const res = await trilhaCsv(get(`/api/painel/envelopes/${env.id}/trilha.csv`, env.cookie), pctx(env.id));
    const { data: e } = await db().from("as_envelopes").select("codigo_verificacao").eq("id", env.id).single();
    expect(res.headers.get("content-disposition")).toBe(`attachment; filename="trilha-${e!.codigo_verificacao}.csv"`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const lines = new TextDecoder().decode(bytes.slice(3)).trimEnd().split("\r\n");
    expect(lines[0]).toBe("seq;data_hora_brasilia;data_hora_utc;evento;ator;pessoa;email;ip;navegador;detalhes;hash");
    expect(lines).toHaveLength((await events(env.id)).length + 1);
    const assinou = lines.find((l) => l.includes(";Assinou;"))!.split(";");
    expect(assinou[4]).toBe("Signatário");
    expect(assinou[5]).toBe("'=HYPERLINK(1)");
    expect(assinou[6]).toBe("ana@csv.dev");
    expect(assinou[1]).toMatch(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}$/);
    expect(assinou[10]).toMatch(/^[0-9a-f]{64}$/);

    const other = await createTestAccount({ accepted: true });
    accounts.push(other.id);
    expect((await trilhaCsv(get(`/api/painel/envelopes/${env.id}/trilha.csv`, other.cookie), pctx(env.id))).status).toBe(404);
  });
});
