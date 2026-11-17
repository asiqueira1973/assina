// Critérios do épico 8.2 pelas rotas do painel, com o Supabase local e o driver local de arquivos.
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { storage, envelopePaths } from "@/server/files/storage";
import { apiRequest, createTestAccount, deleteTestAccounts } from "../../../../../tests/helpers";
import { uploadTo } from "../../../../../tests/envelopes";
import { makeDocxBytes, makeEncryptedPdf, makeOversizedPdfBytes, makePdf } from "../../../../../tests/fixtures/pdfs";
import { POST as createEnvelope } from "./route";
import { PATCH } from "./[id]/route";
import { POST as attachFile } from "./[id]/arquivo/route";
import { POST as newUpload } from "./[id]/upload/route";
import { PUT as putSigners } from "./[id]/signatarios/route";

const ids: string[] = [];
afterAll(() => deleteTestAccounts(ids));

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

async function account() {
  const a = await createTestAccount({ accepted: true });
  ids.push(a.id);
  return a;
}

// Cria um rascunho pela rota e sobe o PDF pela URL. Devolve: id, conta e a resposta do anexo.
async function draftWithFile(cookie: string, bytes: Uint8Array, nome = "Contrato_de_servico.pdf") {
  const res = await createEnvelope(apiRequest("/api/painel/envelopes", { method: "POST", cookie, body: { nome_arquivo: nome } }));
  expect(res.status).toBe(201);
  const body = await res.json();
  expect(await uploadTo(body.upload_url, bytes)).toBe(200);
  const attached = await attachFile(apiRequest(`/api/painel/envelopes/${body.envelope.id}/arquivo`, { method: "POST", cookie, body: { nome_arquivo: nome } }), ctx(body.envelope.id));
  return { id: body.envelope.id as string, created: body, attached };
}

describe("rascunho de envelope (épico 8.2)", () => {
  it("cria o rascunho com origem painel, código e evento criado; título vem do arquivo", async () => {
    const a = await account();
    const { id, created, attached } = await draftWithFile(a.cookie, await makePdf(2));
    expect(created.envelope).toMatchObject({ status: "rascunho", origem: "painel", titulo: "Contrato de servico" });
    expect(created.envelope.codigo_verificacao).toMatch(/^[0-9A-HJKMNP-TV-Z]{12}$/);
    expect(new Date(created.upload_expira_em).getTime() - Date.now()).toBeGreaterThan(7100_000);

    expect(attached.status).toBe(200);
    const body = await attached.json();
    expect(body.envelope).toMatchObject({ paginas: 2, nome_arquivo: "Contrato_de_servico.pdf" });
    expect(body.envelope.arquivo_original_path).toMatch(new RegExp(`^${a.id}/${id}/original-[0-9a-f-]{36}\\.pdf$`));
    expect(body.envelope.dimensoes_paginas).toEqual([{ l: 595.28, a: 841.89 }, { l: 595.28, a: 841.89 }]);
    expect(body.campos_removidos).toBe(false);

    const { data: eventos } = await db().from("as_eventos").select("seq, tipo, ator").eq("envelope_id", id);
    expect(eventos).toEqual([{ seq: 1, tipo: "criado", ator: "remetente" }]);
    expect(await storage().read(envelopePaths(a.id, id).upload, 1e8)).toBeNull();
    expect(await storage().read(body.envelope.arquivo_original_path, 1e8)).not.toBeNull();
  });

  it("o original é o arquivo validado: sobrescrever o upload depois não muda nada", async () => {
    const a = await account();
    const valid = await makePdf(2);
    const res = await createEnvelope(apiRequest("/api/painel/envelopes", { method: "POST", cookie: a.cookie, body: { nome_arquivo: "a.pdf" } }));
    const { envelope, upload_url } = await res.json();
    await uploadTo(upload_url, valid);
    const attached = await (await attachFile(apiRequest(`/api/painel/envelopes/${envelope.id}/arquivo`, { method: "POST", cookie: a.cookie, body: { nome_arquivo: "a.pdf" } }), ctx(envelope.id))).json();
    // A mesma URL ainda vale (2 h): um PUT depois da validação não pode alcançar o original.
    expect(await uploadTo(upload_url, makeDocxBytes())).toBe(200);
    const stored = await storage().read(attached.envelope.arquivo_original_path, 1e8);
    expect(Buffer.from(stored!).equals(Buffer.from(valid))).toBe(true);
  });

  it.each([
    ["10,1 MB", makeOversizedPdfBytes, "grande_demais"],
    ["com senha", makeEncryptedPdf, "protegido_por_senha"],
    ["101 páginas", () => makePdf(101), "paginas_demais"],
    [".docx renomeado", makeDocxBytes, "nao_e_pdf"],
  ])("arquivo %s é recusado e o upload apagado", async (_nome, make, motivo) => {
    const a = await account();
    const { id, attached } = await draftWithFile(a.cookie, await make());
    expect(attached.status).toBe(400);
    expect(await attached.json()).toEqual({ codigo: "arquivo_invalido", motivo });
    expect(await storage().read(envelopePaths(a.id, id).upload, 1e8)).toBeNull();
    const { data } = await db().from("as_envelopes").select("paginas, arquivo_original_path").eq("id", id).single();
    expect(data).toEqual({ paginas: null, arquivo_original_path: null });
  });

  it("troca inválida não destrói o original; troca válida com campos apaga os campos", async () => {
    const a = await account();
    const { id } = await draftWithFile(a.cookie, await makePdf(1));
    await putSigners(apiRequest(`/api/painel/envelopes/${id}/signatarios`, { method: "PUT", cookie: a.cookie, body: { signatarios: [{ nome: "Ana", email: "ana@teste.dev" }] } }), ctx(id));
    const { data: ana } = await db().from("as_signatarios").select("id").eq("envelope_id", id).single();
    await db().from("as_campos").insert({ envelope_id: id, signatario_id: ana!.id, tipo: "assinatura", pagina: 1, x: 0.1, y: 0.8, largura: 0.3, altura: 0.06 });

    // Troca inválida: o original e os campos continuam.
    let up = await (await newUpload(apiRequest(`/api/painel/envelopes/${id}/upload`, { method: "POST", cookie: a.cookie }), ctx(id))).json();
    await uploadTo(up.upload_url, makeDocxBytes());
    let res = await attachFile(apiRequest(`/api/painel/envelopes/${id}/arquivo`, { method: "POST", cookie: a.cookie, body: { nome_arquivo: "x.pdf" } }), ctx(id));
    expect(res.status).toBe(400);
    const { data: antes } = await db().from("as_envelopes").select("arquivo_original_path").eq("id", id).single();
    expect(await storage().read(antes!.arquivo_original_path!, 1e8)).not.toBeNull();
    expect((await db().from("as_campos").select("id").eq("envelope_id", id)).data).toHaveLength(1);

    // Troca válida: os campos saem e a resposta avisa.
    up = await (await newUpload(apiRequest(`/api/painel/envelopes/${id}/upload`, { method: "POST", cookie: a.cookie }), ctx(id))).json();
    await uploadTo(up.upload_url, await makePdf(3));
    res = await attachFile(apiRequest(`/api/painel/envelopes/${id}/arquivo`, { method: "POST", cookie: a.cookie, body: { nome_arquivo: "novo.pdf" } }), ctx(id));
    const body = await res.json();
    expect(body.campos_removidos).toBe(true);
    expect(body.envelope.paginas).toBe(3);
    expect((await db().from("as_campos").select("id").eq("envelope_id", id)).data).toHaveLength(0);
    // O arquivo anterior foi apagado; o novo é outro caminho.
    expect(body.envelope.arquivo_original_path).not.toBe(antes!.arquivo_original_path);
    expect(await storage().read(antes!.arquivo_original_path!, 1e8)).toBeNull();
  });

  it("configurações: salva título, mensagem vazia vira nula, recusa prazo e lembrete fora da regra", async () => {
    const a = await account();
    const { id } = await draftWithFile(a.cookie, await makePdf(1));
    const ok = await PATCH(apiRequest(`/api/painel/envelopes/${id}`, { method: "PATCH", cookie: a.cookie, body: { titulo: "Novo título", mensagem: "  ", em_ordem: true, prazo_dias: 15, lembrete_cada_dias: null } }), ctx(id));
    expect(ok.status).toBe(200);
    expect((await ok.json()).envelope).toMatchObject({ titulo: "Novo título", mensagem: null, em_ordem: true, prazo_dias: 15, lembrete_cada_dias: null });
    for (const body of [{ prazo_dias: 91 }, { lembrete_cada_dias: 5 }, { titulo: "" }, { status: "enviado" }]) {
      const res = await PATCH(apiRequest(`/api/painel/envelopes/${id}`, { method: "PATCH", cookie: a.cookie, body }), ctx(id));
      expect(res.status).toBe(400);
    }
  });

  it("destinatários: repetido, 11 assinantes e 6 cópias são recusados; a lista volta na ordem", async () => {
    const a = await account();
    const { id } = await draftWithFile(a.cookie, await makePdf(1));
    const put = (signatarios: unknown) => putSigners(apiRequest(`/api/painel/envelopes/${id}/signatarios`, { method: "PUT", cookie: a.cookie, body: { signatarios } }), ctx(id));

    let res = await put([{ nome: "Ana", email: "ana@teste.dev" }, { nome: "Ana 2", email: "ANA@teste.dev" }]);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ codigo: "email_repetido" });

    res = await put(Array.from({ length: 11 }, (_, i) => ({ nome: `P${i}`, email: `p${i}@teste.dev` })));
    expect(await res.json()).toEqual({ codigo: "assinantes_demais" });

    res = await put([{ nome: "Ana", email: "ana@teste.dev" }, ...Array.from({ length: 6 }, (_, i) => ({ nome: `C${i}`, email: `c${i}@teste.dev`, papel: "copia" }))]);
    expect(await res.json()).toEqual({ codigo: "copias_demais" });

    res = await put([{ nome: "Bruno", email: "bruno@teste.dev" }, { nome: "Carla", email: "carla@teste.dev", papel: "copia" }, { nome: "Ana", email: "ana@teste.dev", exigir_cpf: true }]);
    expect(res.status).toBe(200);
    const { signatarios } = await res.json();
    expect(signatarios.map((s: { nome: string; ordem: number; papel: string }) => [s.nome, s.ordem, s.papel])).toEqual([["Bruno", 1, "assinar"], ["Carla", 1, "copia"], ["Ana", 2, "assinar"]]);

    res = await put([{ nome: "X", email: "nao-e-email" }]);
    expect(res.status).toBe(400);
  });

  it("envelope de outra conta → 404 em todas as gravações; fora de rascunho → 409", async () => {
    const dona = await account();
    const outra = await account();
    const { id } = await draftWithFile(dona.cookie, await makePdf(1));

    const tries = [
      PATCH(apiRequest(`/api/painel/envelopes/${id}`, { method: "PATCH", cookie: outra.cookie, body: { titulo: "x" } }), ctx(id)),
      attachFile(apiRequest(`/api/painel/envelopes/${id}/arquivo`, { method: "POST", cookie: outra.cookie, body: { nome_arquivo: "x.pdf" } }), ctx(id)),
      newUpload(apiRequest(`/api/painel/envelopes/${id}/upload`, { method: "POST", cookie: outra.cookie }), ctx(id)),
      putSigners(apiRequest(`/api/painel/envelopes/${id}/signatarios`, { method: "PUT", cookie: outra.cookie, body: { signatarios: [] } }), ctx(id)),
      putSigners(apiRequest(`/api/painel/envelopes/nao-e-uuid/signatarios`, { method: "PUT", cookie: dona.cookie, body: { signatarios: [] } }), ctx("nao-e-uuid")),
      PATCH(apiRequest(`/api/painel/envelopes/nao-e-uuid`, { method: "PATCH", cookie: dona.cookie, body: { titulo: "x" } }), ctx("nao-e-uuid")),
    ];
    for (const res of await Promise.all(tries)) expect(res.status).toBe(404);

    await db().from("as_envelopes").update({ status: "enviado", hash_original: "f".repeat(64) }).eq("id", id);
    const frozen = await PATCH(apiRequest(`/api/painel/envelopes/${id}`, { method: "PATCH", cookie: dona.cookie, body: { titulo: "x" } }), ctx(id));
    expect(frozen.status).toBe(409);
    expect(await frozen.json()).toEqual({ codigo: "envelope_congelado" });
    const frozenSigners = await putSigners(apiRequest(`/api/painel/envelopes/${id}/signatarios`, { method: "PUT", cookie: dona.cookie, body: { signatarios: [] } }), ctx(id));
    expect(frozenSigners.status).toBe(409);
    const frozenUpload = await newUpload(apiRequest(`/api/painel/envelopes/${id}/upload`, { method: "POST", cookie: dona.cookie }), ctx(id));
    expect(frozenUpload.status).toBe(409);
  });

  it("sem sessão → 401; Origin de outro site → 403", async () => {
    expect((await createEnvelope(apiRequest("/api/painel/envelopes", { method: "POST", body: { nome_arquivo: "a.pdf" } }))).status).toBe(401);
    const a = await account();
    expect((await createEnvelope(apiRequest("/api/painel/envelopes", { method: "POST", cookie: a.cookie, body: { nome_arquivo: "a.pdf" }, origin: "https://evil.example" }))).status).toBe(403);
  });
});
