// Critérios do épico 8.9 pelas rotas da API v1: autenticação pela chave, criar (upload_url e
// arquivo_url com campos), idempotência, SSRF, enviar, consultar, lista com cursor, eventos,
// arquivo, cancelar, lembrar, excluir rascunho, 429 com limite e usados, OpenAPI válido.
import { NextRequest } from "next/server";
import { Validator } from "@seriousme/openapi-schema-validator";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { generateApiKey } from "@/server/credentials/api-key";
import { db } from "@/server/db/client";
import { setMailerForTests, type EmailMessage } from "@/server/email/mailer";
import { setRemoteFetchTestMode } from "@/server/files/fetch-remote";
import { createTestAccount, deleteTestAccounts, SITE } from "../../../../tests/helpers";
import { uploadTo } from "../../../../tests/envelopes";
import { makePdf } from "../../../../tests/fixtures/pdfs";
import { startHttps } from "../../../../tests/https-server";
import { fakeOutbox } from "../../../../tests/signing";
import { GET as list, POST as create } from "./envelopes/route";
import { DELETE as del, GET as show } from "./envelopes/[id]/route";
import { GET as getFile, POST as attach } from "./envelopes/[id]/arquivo/route";
import { POST as send } from "./envelopes/[id]/enviar/route";
import { GET as events } from "./envelopes/[id]/eventos/route";
import { POST as cancel } from "./envelopes/[id]/cancelar/route";
import { POST as remind } from "./envelopes/[id]/lembrar/route";
import { GET as openapi } from "./openapi.json/route";

const accounts: string[] = [];
let outbox: EmailMessage[] = [];
let pdfServer: Awaited<ReturnType<typeof startHttps>>;
let pdfBytes: Uint8Array;

beforeAll(async () => {
  setRemoteFetchTestMode(true);
  pdfBytes = await makePdf(2);
  pdfServer = await startHttps((req, res) => {
    if (req.url === "/contrato.pdf") res.end(Buffer.from(pdfBytes));
    else if (req.url === "/nao-pdf") res.end("<html>oi</html>");
    else res.writeHead(404).end();
  });
});
afterAll(async () => {
  await pdfServer.close();
  setRemoteFetchTestMode(false);
  await deleteTestAccounts(accounts);
});
beforeEach(() => {
  outbox = fakeOutbox();
});
afterEach(() => setMailerForTests(null));

// Conta com chave de API. Devolve: id e o cabeçalho Authorization.
async function apiAccount() {
  const a = await createTestAccount({ accepted: true });
  accounts.push(a.id);
  const key = generateApiKey();
  const { error } = await db().from("as_credenciais").insert({ conta_id: a.id, tipo: "api", nome: "Chave de API", prefixo: key.prefix, valor_hash: key.hash, valor_cifrado: key.sealed });
  if (error) throw error;
  return { id: a.id, auth: `Bearer ${key.value}`, credentialHash: key.hash };
}

function req(path: string, auth: string | null, opts: { method?: string; body?: unknown; headers?: Record<string, string> } = {}) {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (auth) headers.authorization = auth;
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  return new NextRequest(`${SITE}/api/v1${path}`, { method: opts.method ?? "GET", headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const signers = [
  { nome: "Ana Souza", email: "ana@api.dev" },
  { nome: "Caio", email: "caio@api.dev", papel: "copia" },
];

describe("autenticação (seção 6.3)", () => {
  it("sem chave, chave errada, revogada, conta suspensa e token de outro tipo → 401 credencial_invalida", async () => {
    const a = await apiAccount();
    for (const auth of [null, "Bearer assina_naoexiste000000000000000000000000000", "Basic xyz"]) {
      const r = await list(req("/envelopes", auth));
      expect(r.status).toBe(401);
      expect(await r.json()).toEqual({ codigo: "credencial_invalida", mensagem: expect.any(String) });
    }
    expect((await list(req("/envelopes", a.auth))).status).toBe(200);
    await db().from("as_contas").update({ suspensa_em: new Date().toISOString() }).eq("id", a.id);
    expect((await list(req("/envelopes", a.auth))).status).toBe(401);
    await db().from("as_contas").update({ suspensa_em: null }).eq("id", a.id);
    await db().from("as_credenciais").update({ revogada_em: new Date().toISOString() }).eq("valor_hash", a.credentialHash);
    expect((await list(req("/envelopes", a.auth))).status).toBe(401);
  });
});

describe("fluxo pela API (critério 8.9)", () => {
  it("upload_url: criar → PUT do PDF → arquivo → enviar → consultar → eventos com ator api", async () => {
    const a = await apiAccount();
    const r = await create(req("/envelopes", a.auth, { method: "POST", body: { titulo: "Contrato", signatarios: signers, prazo_dias: 10 } }));
    expect(r.status).toBe(201);
    const { envelope, upload_url } = await r.json();
    expect(envelope).toMatchObject({ status: "rascunho", origem: "api", prazo_dias: 10 });
    expect((await getFile(req(`/envelopes/${envelope.id}/arquivo?versao=xyz`, a.auth), ctx(envelope.id))).status).toBe(400);
    expect(envelope).not.toHaveProperty("arquivo_original_path");
    expect(await uploadTo(upload_url, pdfBytes)).toBe(200);
    const att = await attach(req(`/envelopes/${envelope.id}/arquivo`, a.auth, { method: "POST" }), ctx(envelope.id));
    expect((await att.json()).envelope.paginas).toBe(2);
    const s = await send(req(`/envelopes/${envelope.id}/enviar`, a.auth, { method: "POST" }), ctx(envelope.id));
    expect((await s.json()).envelope.status).toBe("enviado");
    expect(outbox.some((m) => m.to === "ana@api.dev")).toBe(true);

    const detail = await (await show(req(`/envelopes/${envelope.id}`, a.auth), ctx(envelope.id))).json();
    expect(detail.signatarios.map((x: { email: string; status: string }) => [x.email, x.status])).toEqual([
      ["ana@api.dev", "aguardando"],
      ["caio@api.dev", "pendente"],
    ]);
    expect(detail.signatarios[0]).not.toHaveProperty("token_hash");
    const ev = await (await events(req(`/envelopes/${envelope.id}/eventos`, a.auth), ctx(envelope.id))).json();
    expect(ev.divergencia).toBeNull();
    expect(ev.eventos.find((e: { tipo: string }) => e.tipo === "enviado")).toMatchObject({ ator: "api" });

    const file = await (await getFile(req(`/envelopes/${envelope.id}/arquivo?versao=original`, a.auth), ctx(envelope.id))).json();
    expect(file.url).toMatch(/^http/);
    expect(Date.parse(file.expira_em)).toBeGreaterThan(Date.now());
    expect((await getFile(req(`/envelopes/${envelope.id}/arquivo?versao=final`, a.auth), ctx(envelope.id))).status).toBe(404);

    // Lembrar (todos os aguardando) e cancelar.
    expect(await (await remind(req(`/envelopes/${envelope.id}/lembrar`, a.auth, { method: "POST", body: {} }), ctx(envelope.id))).json()).toEqual({ lembrados: 1 });
    expect(await (await remind(req(`/envelopes/${envelope.id}/lembrar`, a.auth, { method: "POST", body: {} }), ctx(envelope.id))).json()).toEqual({ lembrados: 0 });
    const c = await cancel(req(`/envelopes/${envelope.id}/cancelar`, a.auth, { method: "POST", body: { motivo: "Mudou" } }), ctx(envelope.id));
    expect((await c.json()).envelope).toMatchObject({ status: "cancelado", motivo_cancelamento: "Mudou" });
    // Enviado/cancelado não se exclui pela API.
    const d = await del(req(`/envelopes/${envelope.id}`, a.auth, { method: "DELETE" }), ctx(envelope.id));
    expect([d.status, (await d.json()).codigo]).toEqual([409, "envelope_nao_e_rascunho"]);
  });

  it("arquivo_url com campos; Idempotency-Key devolve o mesmo envelope (200)", async () => {
    const a = await apiAccount();
    const body = {
      titulo: "Proposta",
      arquivo_url: `${pdfServer.base}/contrato.pdf`,
      signatarios: [
        { nome: "Bia", email: "bia@api.dev", ordem: 2 },
        { nome: "Ana", email: "ana@api.dev", ordem: 1 },
      ],
      em_ordem: true,
      campos: [
        { signatario_email: "ana@api.dev", tipo: "assinatura", pagina: 2, x: 0.1, y: 0.8 },
        { signatario_email: "bia@api.dev", tipo: "data", pagina: 1, x: 0.5, y: 0.5, largura: 0.2, altura: 0.04 },
      ],
    };
    const first = await create(req("/envelopes", a.auth, { method: "POST", body, headers: { "idempotency-key": "pedido-123" } }));
    expect(first.status).toBe(201);
    const { envelope, upload_url } = await first.json();
    expect(upload_url).toBeUndefined();
    expect(envelope).toMatchObject({ paginas: 2, nome_arquivo: "contrato.pdf", em_ordem: true });
    const { data: fields } = await db().from("as_campos").select("tipo, pagina, largura, altura, as_signatarios(email)").eq("envelope_id", envelope.id).order("pagina");
    expect(fields).toEqual([
      { tipo: "data", pagina: 1, largura: 0.2, altura: 0.04, as_signatarios: { email: "bia@api.dev" } },
      { tipo: "assinatura", pagina: 2, largura: 0.3, altura: 0.06, as_signatarios: { email: "ana@api.dev" } },
    ]);
    const { data: ord } = await db().from("as_signatarios").select("email, ordem").eq("envelope_id", envelope.id).order("ordem");
    expect(ord!.map((s) => s.email)).toEqual(["ana@api.dev", "bia@api.dev"]);

    const again = await create(req("/envelopes", a.auth, { method: "POST", body, headers: { "idempotency-key": "pedido-123" } }));
    expect(again.status).toBe(200);
    expect((await again.json()).envelope.id).toBe(envelope.id);
    const { count } = await db().from("as_envelopes").select("id", { count: "exact", head: true }).eq("conta_id", a.id);
    expect(count).toBe(1);
  });

  it("Idempotency-Key repetida sem arquivo ainda: o mesmo envelope e uma upload_url nova", async () => {
    const a = await apiAccount();
    const body = { titulo: "Sem arquivo", signatarios: signers };
    const first = await (await create(req("/envelopes", a.auth, { method: "POST", body, headers: { "idempotency-key": "k-1" } }))).json();
    const again = await create(req("/envelopes", a.auth, { method: "POST", body, headers: { "idempotency-key": "k-1" } }));
    const aj = await again.json();
    expect([again.status, aj.envelope.id]).toEqual([200, first.envelope.id]);
    expect(aj.upload_url).toMatch(/^http/);
    expect(await uploadTo(aj.upload_url, pdfBytes)).toBe(200);
    expect((await attach(req(`/envelopes/${aj.envelope.id}/arquivo`, a.auth, { method: "POST" }), ctx(aj.envelope.id))).status).toBe(200);
    // Com o arquivo já anexado, a repetição não traz upload_url.
    expect((await (await create(req("/envelopes", a.auth, { method: "POST", body, headers: { "idempotency-key": "k-1" } }))).json()).upload_url).toBeUndefined();
  });

  it("dois pedidos ao mesmo tempo com a mesma Idempotency-Key: um envelope só, completo", async () => {
    const a = await apiAccount();
    const body = { titulo: "Corrida", signatarios: signers };
    const [r1, r2] = await Promise.all([1, 2].map(() => create(req("/envelopes", a.auth, { method: "POST", body, headers: { "idempotency-key": "corrida-1" } }))));
    const [j1, j2] = [await r1.json(), await r2.json()];
    expect([r1.status, r2.status].sort()).toEqual([200, 201]);
    expect(j1.envelope.id).toBe(j2.envelope.id);
    const { count } = await db().from("as_envelopes").select("id", { count: "exact", head: true }).eq("conta_id", a.id);
    expect(count).toBe(1);
    const detail = await (await show(req(`/envelopes/${j1.envelope.id}`, a.auth), ctx(j1.envelope.id))).json();
    expect(detail.signatarios).toHaveLength(2); // nunca um rascunho pela metade
  });

  it("arquivo_url recusada (http, IP privado, não é PDF) e campos sem arquivo: 400, sem rascunho sobrando", async () => {
    const a = await apiAccount();
    const tries: [Record<string, unknown>, string, string][] = [
      [{ arquivo_url: "https://10.0.0.1/x.pdf" }, "arquivo_invalido", "url_recusada"],
      [{ arquivo_url: "https://169.254.169.254/latest/meta-data" }, "arquivo_invalido", "url_recusada"],
      [{ arquivo_url: `${pdfServer.base}/nao-pdf` }, "arquivo_invalido", "nao_e_pdf"],
      [{ arquivo_url: `${pdfServer.base}/sumiu` }, "arquivo_invalido", "download_falhou"],
    ];
    for (const [extra, codigo, motivo] of tries) {
      const r = await create(req("/envelopes", a.auth, { method: "POST", body: { titulo: "X", signatarios: signers, ...extra } }));
      expect([r.status, await r.json()]).toEqual([400, { codigo, mensagem: expect.any(String), motivo }]);
    }
    const noFile = await create(req("/envelopes", a.auth, { method: "POST", body: { titulo: "X", signatarios: signers, campos: [{ signatario_email: "ana@api.dev", tipo: "assinatura", pagina: 1, x: 0, y: 0 }] } }));
    const nb = await noFile.json();
    expect([noFile.status, nb.codigo, nb.campos]).toEqual([400, "dados_invalidos", [{ campo: "campos", motivo: "exige_arquivo_url" }]]);
    const bad = await create(req("/envelopes", a.auth, { method: "POST", body: { titulo: "", signatarios: [] } }));
    expect((await bad.json()).campos.map((c: { campo: string }) => c.campo).sort()).toEqual(["signatarios", "titulo"]);
    const { count } = await db().from("as_envelopes").select("id", { count: "exact", head: true }).eq("conta_id", a.id);
    expect(count).toBe(0);
  });

  it("lista com status e cursor; excluir rascunho (204); outra conta não vê (404)", async () => {
    const a = await apiAccount();
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) ids.push((await (await create(req("/envelopes", a.auth, { method: "POST", body: { titulo: `R${i}`, signatarios: signers } }))).json()).envelope.id);
    const p1 = await (await list(req("/envelopes?limite=2", a.auth))).json();
    expect(p1.envelopes.map((e: { titulo: string }) => e.titulo)).toEqual(["R4", "R3"]);
    const p2 = await (await list(req(`/envelopes?limite=2&cursor=${p1.proximo_cursor}`, a.auth))).json();
    const p3 = await (await list(req(`/envelopes?limite=2&cursor=${p2.proximo_cursor}`, a.auth))).json();
    expect([...p2.envelopes, ...p3.envelopes].map((e: { titulo: string }) => e.titulo)).toEqual(["R2", "R1", "R0"]);
    expect(p3.proximo_cursor).toBeNull();
    expect((await (await list(req("/envelopes?status=enviado", a.auth))).json()).envelopes).toEqual([]);
    expect((await list(req("/envelopes?limite=500", a.auth))).status).toBe(400);
    expect((await list(req("/envelopes?cursor=lixo", a.auth))).status).toBe(400);

    const other = await apiAccount();
    expect((await show(req(`/envelopes/${ids[0]}`, other.auth), ctx(ids[0]))).status).toBe(404);
    expect((await del(req(`/envelopes/${ids[0]}`, other.auth, { method: "DELETE" }), ctx(ids[0]))).status).toBe(404);
    expect((await del(req(`/envelopes/${ids[0]}`, a.auth, { method: "DELETE" }), ctx(ids[0]))).status).toBe(204);
    expect((await show(req(`/envelopes/${ids[0]}`, a.auth), ctx(ids[0]))).status).toBe(404);
  });

  it("limite de 30 envios em 24 h: 429 com limite e usados", async () => {
    const a = await apiAccount();
    await db().from("as_envios").insert(Array.from({ length: 30 }, () => ({ conta_id: a.id })));
    const { envelope } = await (await create(req("/envelopes", a.auth, { method: "POST", body: { titulo: "Z", arquivo_url: `${pdfServer.base}/contrato.pdf`, signatarios: signers } }))).json();
    const r = await send(req(`/envelopes/${envelope.id}/enviar`, a.auth, { method: "POST" }), ctx(envelope.id));
    expect([r.status, await r.json()]).toEqual([429, { codigo: "limite_diario", mensagem: expect.any(String), limite: 30, usados: 30 }]);
  });
});

describe("OpenAPI (critério 8.9)", () => {
  it("é um documento OpenAPI 3.1 válido e cobre as rotas da seção 13.2", async () => {
    const doc = await (await openapi()).json();
    const result = await new Validator().validate(doc);
    expect(result.errors ?? []).toEqual([]);
    expect(result.valid).toBe(true);
    expect(doc.openapi).toBe("3.1.0");
    // Nenhum "${…}" impresso literalmente (texto que devia vir de limits.ts).
    expect(JSON.stringify(doc)).not.toContain("${");
    expect(Object.keys(doc.paths).sort()).toEqual([
      "/envelopes",
      "/envelopes/{id}",
      "/envelopes/{id}/arquivo",
      "/envelopes/{id}/cancelar",
      "/envelopes/{id}/enviar",
      "/envelopes/{id}/eventos",
      "/envelopes/{id}/lembrar",
    ]);
  });
});
