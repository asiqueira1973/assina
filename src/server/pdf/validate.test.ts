// Regra 11.1 / critério 8.2: o que entra e o que é recusado, com o código de cada motivo.
import { describe, expect, it } from "vitest";
import { makeDocxBytes, makeEncryptedPdf, makeOversizedPdfBytes, makePdf, makeSignedPdf } from "../../../tests/fixtures/pdfs";
import { validatePdf } from "./validate";

describe("validação do PDF (regra 11.1)", () => {
  it("PDF válido devolve páginas e dimensões em pontos", async () => {
    const check = await validatePdf(await makePdf(3));
    expect(check).toEqual({ ok: true, pages: 3, alreadySigned: false, dimensions: Array(3).fill({ l: 595.28, a: 841.89 }) });
  });

  it("100 páginas passa; 101 é recusado", async () => {
    expect((await validatePdf(await makePdf(100))).ok).toBe(true);
    expect(await validatePdf(await makePdf(101))).toEqual({ ok: false, code: "paginas_demais" });
  });

  it("10,1 MB é recusado", async () => {
    expect(await validatePdf(makeOversizedPdfBytes())).toEqual({ ok: false, code: "grande_demais" });
  });

  it("PDF com senha é recusado", async () => {
    expect(await validatePdf(await makeEncryptedPdf())).toEqual({ ok: false, code: "protegido_por_senha" });
  });

  it(".docx renomeado é recusado como não-PDF", async () => {
    expect(await validatePdf(makeDocxBytes())).toEqual({ ok: false, code: "nao_e_pdf" });
  });

  it("começa com %PDF- mas está corrompido: não-PDF", async () => {
    expect(await validatePdf(new TextEncoder().encode("%PDF-1.7\nlixo"))).toEqual({ ok: false, code: "nao_e_pdf" });
  });

  it("página maior que 1.440 pt é recusada", async () => {
    expect(await validatePdf(await makePdf(1, [1500, 800]))).toEqual({ ok: false, code: "pagina_grande_demais" });
  });

  it("PDF já assinado passa, com o aviso", async () => {
    const check = await validatePdf(await makeSignedPdf());
    expect(check.ok && check.alreadySigned).toBe(true);
  });
});
