// Critérios do épico 8.8 pela rota pública: hash final, hash original, código (com as trocas do
// Crockford), não encontrado, rascunho e conta suspensa invisíveis, e nada além da regra 11.11.
import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { setMailerForTests, type EmailMessage } from "@/server/email/mailer";
import { generateVerificationCode } from "@/server/envelopes/verification-code";
import { storage } from "@/server/files/storage";
import { normalizeVerificationCode } from "@/lib/verification-code";
import { deleteTestAccounts, SITE } from "../../../../tests/helpers";
import { makePdf } from "../../../../tests/fixtures/pdfs";
import { fakeOutbox, sentEnvelope, signAs } from "../../../../tests/signing";
import { GET } from "./route";

const accounts: string[] = [];
let outbox: EmailMessage[] = [];
beforeEach(() => {
  outbox = fakeOutbox();
});
afterEach(() => setMailerForTests(null));
afterAll(() => deleteTestAccounts(accounts));

const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
// PDF só deste teste (tamanho de página sorteado): o hash do original não é de outro envelope.
const uniquePdf = () => makePdf(1, [600 + Math.floor(Math.random() * 600), 600 + Math.floor(Math.random() * 600)]);
const ask = async (q: string) => {
  const res = await GET(new NextRequest(`${SITE}/api/verificar?${q}`));
  return { status: res.status, cache: res.headers.get("cache-control"), body: await res.json() };
};

describe("verificação pública (critério 8.8, regra 11.11)", () => {
  it("hash final → íntegro; hash original → original; código → o envelope; só o resumo permitido", async () => {
    const env = await sentEnvelope(accounts, [{ nome: "Ana Souza", email: "ana@ver.dev", exigir_cpf: true }, { nome: "Caio", email: "caio@ver.dev", papel: "copia" }], { pdf: await uniquePdf() });
    await signAs(outbox, "ana@ver.dev", { metodo: "digitada", assinatura_texto: "Ana", cpf: "529.982.247-25" });
    const { data: e } = await db().from("as_envelopes").select("hash_original, hash_final, arquivo_final_path, arquivo_original_path, codigo_verificacao").eq("id", env.id).single();
    // O hash que o navegador calcula é o do arquivo: confere com os bytes guardados.
    expect(sha256((await storage().read(e!.arquivo_final_path!, 40 * 1024 * 1024))!)).toBe(e!.hash_final);
    expect(sha256((await storage().read(e!.arquivo_original_path!, 20 * 1024 * 1024))!)).toBe(e!.hash_original);

    const final = await ask(`hash=${e!.hash_final!.toUpperCase()}`);
    expect(final.status).toBe(200);
    expect(final.cache).toBe("no-store");
    expect(final.body.resultado).toBe("final");
    expect(final.body.envelopes).toHaveLength(1);
    const summary = final.body.envelopes[0];
    expect(Object.keys(summary).sort()).toEqual(["assinantes", "concluido_em", "enviado_em", "selo", "status", "titulo"]);
    expect(summary).toMatchObject({ status: "concluido", titulo: "Contrato", selo: "B-B" });
    expect(summary.assinantes).toEqual([{ nome: "Ana Souza", assinado_em: expect.any(String) }]); // cópia não é assinante
    // Nada de e-mail, CPF, IP, código, hash ou link (regra 11.11).
    const text = JSON.stringify(final.body);
    for (const forbidden of ["ana@ver.dev", "caio@ver.dev", "52998224725", e!.codigo_verificacao, e!.hash_final!, "http"]) expect(text).not.toContain(forbidden);

    expect((await ask(`hash=${e!.hash_original}`)).body).toMatchObject({ resultado: "original", envelopes: [{ titulo: "Contrato", status: "concluido" }] });

    const dashed = e!.codigo_verificacao.toLowerCase().replace(/(.{4})(?=.)/g, "$1-");
    const byCode = await ask(`codigo=${encodeURIComponent(dashed)}`);
    expect(byCode.body).toMatchObject({ resultado: "codigo", envelopes: [{ titulo: "Contrato", status: "concluido" }] });
  });

  it("desconhecido, rascunho e conta suspensa: não encontrado; entrada inválida: 400", async () => {
    expect((await ask(`hash=${"0".repeat(64)}`)).body).toEqual({ resultado: "nao_encontrado", envelopes: [] });
    expect((await ask("hash=xyz")).status).toBe(400);
    expect((await ask("codigo=123")).status).toBe(400);
    expect((await ask("")).status).toBe(400);

    // PDF só deste envelope (tamanho de página diferente): o hash original não é de outro teste.
    const env = await sentEnvelope(accounts, [{ nome: "Ana", email: "ana@ver2.dev" }], { pdf: await uniquePdf() });
    const { data: e } = await db().from("as_envelopes").select("codigo_verificacao, hash_original").eq("id", env.id).single();
    // Enviado (não concluído): aparece, com o status (a tela diz "ainda não foi concluído").
    expect((await ask(`codigo=${e!.codigo_verificacao}`)).body.envelopes[0].status).toBe("enviado");
    await db().from("as_contas").update({ suspensa_em: new Date().toISOString() }).eq("id", env.contaId);
    expect((await ask(`codigo=${e!.codigo_verificacao}`)).body.resultado).toBe("nao_encontrado");
    expect((await ask(`hash=${e!.hash_original}`)).body.resultado).toBe("nao_encontrado");

    const code = generateVerificationCode();
    await db().from("as_envelopes").insert({ conta_id: accounts[0], titulo: "Rascunho", origem: "painel", codigo_verificacao: code });
    expect((await ask(`codigo=${code}`)).body.resultado).toBe("nao_encontrado");
  });

  it("o mesmo PDF original em mais de um envelope (modelo público): nenhum resumo de terceiros", async () => {
    const pdf = await uniquePdf();
    const env1 = await sentEnvelope(accounts, [{ nome: "Ana", email: "ana@ver3.dev" }], { pdf });
    const env2 = await sentEnvelope(accounts, [{ nome: "Bia", email: "bia@ver3.dev" }], { pdf });
    await signAs(outbox, "bia@ver3.dev", { metodo: "digitada", assinatura_texto: "Bia" });
    const { data: e1 } = await db().from("as_envelopes").select("hash_original").eq("id", env1.id).single();
    expect((await ask(`hash=${e1!.hash_original}`)).body).toEqual({ resultado: "original_multiplo", envelopes: [] });
    // O final de cada um continua único.
    const { data: e2 } = await db().from("as_envelopes").select("hash_final").eq("id", env2.id).single();
    expect((await ask(`hash=${e2!.hash_final}`)).body.envelopes).toHaveLength(1);
  });

  it("recusado e cancelado aparecem com o status (sem dizer que ainda vão concluir)", async () => {
    const env = await sentEnvelope(accounts, [{ nome: "Ana", email: "ana@ver4.dev" }], { pdf: await uniquePdf() });
    await db().rpc("as_fn_cancela_envelope", { p_conta_id: env.contaId, p_envelope_id: env.id, p_motivo: null as unknown as string, p_ator: "remetente" });
    const { data: e } = await db().from("as_envelopes").select("codigo_verificacao").eq("id", env.id).single();
    expect((await ask(`codigo=${e!.codigo_verificacao}`)).body.envelopes[0]).toMatchObject({ status: "cancelado", concluido_em: null });
  });
});
describe("normalização do código (Crockford)", () => {
  it.each([
    ["abcd-1234-efgh", "ABCD1234EFGH"],
    [" 9Y3K KCB4 C1HV ", "9Y3KKCB4C1HV"],
    ["9Y3K-KCB4-CIHV", "9Y3KKCB4C1HV"],
    ["0OOO-LLLL-IIII", "000011111111"],
    ["UUUU1234UUUU", null],
    ["ABCD1234EFG", null],
  ])("%j → %j", (input, out) => {
    expect(normalizeVerificationCode(input)).toBe(out);
  });
});
