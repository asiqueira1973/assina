// Selo de rodapé (emenda de 22/11/2026, regra 11.9): o texto encolhe para caber, e a linha sai
// no pé da página como ela é vista, inclusive em páginas giradas.
import { degrees, PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { embedFonts } from "./fonts";
import { footerWidth, signedFooterText, stampSignedFooter } from "./stamp";
import { pdfPagesText } from "../../../tests/pdf-text";

async function setup() {
  const doc = await PDFDocument.create();
  return { doc, fonts: await embedFonts(doc) };
}

describe("texto do selo de rodapé", () => {
  it("cabe: todos os nomes", async () => {
    const { fonts } = await setup();
    expect(signedFooterText(["Ana Lima", "Bruno Reis", "Carla Dias"], "22/11/2026", "ZGC7-PZ1R-20YX", "assina.app.br/verificar", fonts.regular, 500)).toBe(
      "Assinado eletronicamente por Ana Lima, Bruno Reis e Carla Dias em 22/11/2026 · Código ZGC7-PZ1R-20YX · assina.app.br/verificar",
    );
  });

  it("não cabe: 'Ana e mais N', depois 'N pessoas'", async () => {
    const { fonts } = await setup();
    const nomes = Array.from({ length: 8 }, (_, i) => `Pessoa Com Nome Comprido ${i + 1}`);
    const a = (w: number) => signedFooterText(nomes, "22/11/2026", "ZGC7-PZ1R-20YX", "assina.app.br/verificar", fonts.regular, w);
    // Larguras exatas de cada variante em 7 pt.
    const w = (quem: string) => fonts.regular.widthOfTextAtSize(`Assinado eletronicamente por ${quem} em 22/11/2026 · Código ZGC7-PZ1R-20YX · assina.app.br/verificar`, 7);
    expect(a(w("Pessoa Com Nome Comprido 1 e mais 7"))).toContain("por Pessoa Com Nome Comprido 1 e mais 7 em");
    expect(a(w("8 pessoas"))).toBe("Assinado eletronicamente por 8 pessoas em 22/11/2026 · Código ZGC7-PZ1R-20YX · assina.app.br/verificar");
    // Nem "8 pessoas" cabe: corta o fim da linha, sem quebrar.
    expect(a(w("8 pessoas") - 30).startsWith("Assinado eletronicamente por 8 pessoas em 22/11/2026")).toBe(true);
  });

  it("caractere fora do WinAnsi não quebra o PDF", async () => {
    const { fonts } = await setup();
    expect(signedFooterText(["Łukasz"], "22/11/2026", "X", "v", fonts.regular, 500)).toContain("por Lukasz em");
  });
});

describe("desenho do selo de rodapé", () => {
  it.each([0, 90, 180, 270])("página girada %i°: o texto sai legível e inteiro", async (rot) => {
    const { doc, fonts } = await setup();
    const page = doc.addPage([595, 842]);
    page.setRotation(degrees(rot));
    const text = signedFooterText(["Ana Lima"], "22/11/2026", "ZGC7-PZ1R-20YX", "assina.app.br/verificar", fonts.regular, footerWidth(page));
    stampSignedFooter([page], text, fonts);
    const [got] = await pdfPagesText(await doc.save());
    expect(got).toContain("Assinado eletronicamente por Ana Lima em 22/11/2026");
  });

  it("fica dentro da página, perto da borda de baixo vista", async () => {
    const { doc, fonts } = await setup();
    const page = doc.addPage([595, 842]);
    const calls: { x: number; y: number }[] = [];
    const draw = page.drawText.bind(page);
    page.drawText = ((t: string, o: { x: number; y: number }) => { calls.push(o); return draw(t, o as never); }) as never;
    stampSignedFooter([page], "Assinado eletronicamente por Ana", fonts);
    expect(calls).toHaveLength(1);
    expect(calls[0].y).toBeGreaterThan(5);
    expect(calls[0].y).toBeLessThan(25);
    expect(calls[0].x).toBeGreaterThan(0);
  });
});
