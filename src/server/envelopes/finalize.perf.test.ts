// Critério 8.6 (desempenho, seção 23.8): PDF de 100 páginas com 10 assinantes finaliza em menos
// de 20 s. Pior caso dentro dos limites: 50 campos por assinante (regra 11.3), metade das
// assinaturas desenhadas. Mede só a finalização (da reserva ao concluido, com os e-mails).
import { afterAll, afterEach, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { setMailerForTests } from "@/server/email/mailer";
import { deleteTestAccounts } from "../../../tests/helpers";
import { makePdf } from "../../../tests/fixtures/pdfs";
import { fakeOutbox, PNG_1PX, sentEnvelope, signAs } from "../../../tests/signing";
import { finalizeEnvelope } from "./finalize";

const accounts: string[] = [];
afterEach(() => setMailerForTests(null));
afterAll(() => deleteTestAccounts(accounts));

it("100 páginas, 10 assinantes, 500 campos: finaliza em menos de 20 s", async () => {
  const outbox = fakeOutbox();
  const signers = Array.from({ length: 10 }, (_, i) => ({ nome: `Pessoa ${i + 1}`, email: `p${i + 1}@perf.dev` }));
  const env = await sentEnvelope(accounts, signers, {
    pdf: await makePdf(100),
    campos: (ids) =>
      signers.flatMap((s, i) => [
        { signatario_id: ids[s.email], tipo: "assinatura", pagina: 100, x: 0.05 + (i % 3) * 0.32, y: 0.05 + Math.floor(i / 3) * 0.1, largura: 0.3, altura: 0.06 },
        { signatario_id: ids[s.email], tipo: "data", pagina: 100, x: 0.05 + (i % 3) * 0.32, y: 0.12 + Math.floor(i / 3) * 0.1, largura: 0.16, altura: 0.03 },
        ...Array.from({ length: 48 }, (_, p) => ({ signatario_id: ids[s.email], tipo: "rubrica", pagina: p + 1 + (i % 2) * 50, x: 0.05 + i * 0.09, y: 0.92, largura: 0.08, altura: 0.05 })),
      ]),
  });

  // Todos assinam com a finalização desligada; ela é medida sozinha depois.
  const p12 = process.env.SELO_P12_BASE64;
  delete process.env.SELO_P12_BASE64;
  try {
    for (const [i, s] of signers.entries()) {
      const drawn = i % 2 === 0;
      await signAs(outbox, s.email, drawn ? { metodo: "desenhada", assinatura_png: PNG_1PX, rubrica_png: PNG_1PX } : { metodo: "digitada", assinatura_texto: s.nome, rubrica_texto: `P${i + 1}` });
    }
  } finally {
    process.env.SELO_P12_BASE64 = p12;
  }
  await db().from("as_envelopes").update({ tentativas_finalizacao: 0 }).eq("id", env.id);
  const { count } = await db().from("as_campos").select("id", { count: "exact", head: true }).eq("envelope_id", env.id).not("valor", "is", null);
  const { count: total } = await db().from("as_campos").select("id", { count: "exact", head: true }).eq("envelope_id", env.id);
  expect(total).toBe(500);
  expect(count).toBe(10); // só as datas têm valor; assinatura e rubrica vêm das colunas do signatário

  const t0 = performance.now();
  expect(await finalizeEnvelope(env.id)).toBe("concluido");
  const ms = Math.round(performance.now() - t0);
  console.log(`finalização: ${ms} ms (100 páginas, 10 assinantes, 500 campos)`);
  expect(ms).toBeLessThan(20_000);
  const { data: e } = await db().from("as_envelopes").select("arquivo_final_path").eq("id", env.id).single();
  const { storage } = await import("@/server/files/storage");
  const { PDFDocument } = await import("pdf-lib");
  const final = await storage().read(e!.arquivo_final_path!, 40 * 1024 * 1024);
  expect((await PDFDocument.load(final!)).getPageCount()).toBeGreaterThan(100);
}, 180_000);
