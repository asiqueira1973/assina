// Regra 11.3: a fração do campo (como o pdf.js mostra a página) vira a posição certa no PDF,
// inclusive com CropBox deslocado e /Rotate 90, 180 e 270.
import { degrees, PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { fieldFrame } from "./stamp";

async function page(rotate: number, crop?: [number, number, number, number]) {
  const doc = await PDFDocument.create();
  const p = doc.addPage([600, 800]);
  if (crop) p.setCropBox(...crop);
  p.setRotation(degrees(rotate));
  return p;
}
// Campo no canto superior esquerdo como visto: 10% da largura e 5% da altura vistas.
const f = { x: 0, y: 0, largura: 0.1, altura: 0.05 };
const round = (p: { x: number; y: number }) => ({ x: Math.round(p.x), y: Math.round(p.y) });

describe("posição dos campos (regra 11.3)", () => {
  it("sem giro: topo esquerdo do papel; origem no canto inferior esquerdo do campo", async () => {
    const fr = fieldFrame(await page(0), f);
    expect([fr.w, fr.h]).toEqual([60, 40]);
    expect(round(fr.at(0, 0))).toEqual({ x: 0, y: 760 });
    expect(round(fr.at(fr.w, fr.h))).toEqual({ x: 60, y: 800 });
  });

  it("CropBox deslocado: conta a partir da área visível", async () => {
    const fr = fieldFrame(await page(0, [50, 100, 500, 600]), f);
    expect([fr.w, fr.h]).toEqual([50, 30]);
    expect(round(fr.at(0, fr.h))).toEqual({ x: 50, y: 700 });
  });

  it("90°: a página vista tem 800 de largura; o topo esquerdo visto é a origem do PDF", async () => {
    const fr = fieldFrame(await page(90), f);
    expect([fr.w, fr.h]).toEqual([80, 30]);
    expect(round(fr.at(0, fr.h))).toEqual({ x: 0, y: 0 }); // topo esquerdo visto
    expect(round(fr.at(fr.w, fr.h))).toEqual({ x: 0, y: 80 }); // "direita" do leitor = +Y
    expect(fr.rotate.angle).toBe(90);
  });

  it("180°: o topo esquerdo visto é o canto inferior direito do PDF", async () => {
    const fr = fieldFrame(await page(180), f);
    expect(round(fr.at(0, fr.h))).toEqual({ x: 600, y: 0 });
    expect(round(fr.at(fr.w, fr.h))).toEqual({ x: 540, y: 0 });
  });

  it("270°: o topo esquerdo visto é o canto superior direito do PDF", async () => {
    const fr = fieldFrame(await page(270), f);
    expect(round(fr.at(0, fr.h))).toEqual({ x: 600, y: 800 });
    expect(round(fr.at(fr.w, fr.h))).toEqual({ x: 600, y: 720 });
  });
});

describe("a mesma conta que o pdf.js faz na tela", () => {
  it.each([0, 90, 180, 270])("giro %i°, com CropBox deslocado", async (rot) => {
    const doc = await PDFDocument.create();
    const p = doc.addPage([600, 800]);
    p.setCropBox(30, 40, 520, 700);
    p.setRotation(degrees(rot));
    const bytes = await doc.save();
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const task = getDocument({ data: bytes });
    const viewport = (await (await task.promise).getPage(1)).getViewport({ scale: 1 });
    const field = { x: 0.2, y: 0.3, largura: 0.25, altura: 0.1 };
    const fr = fieldFrame(p, field);
    // Canto inferior esquerdo e superior direito do campo, em pixels da tela do pdf.js.
    const corners: [number, number, number, number][] = [
      [field.x * viewport.width, (field.y + field.altura) * viewport.height, 0, 0],
      [(field.x + field.largura) * viewport.width, field.y * viewport.height, fr.w, fr.h],
    ];
    for (const [u, v, lx, ly] of corners) {
      const [X, Y] = viewport.convertToPdfPoint(u, v);
      const ours = fr.at(lx, ly);
      expect(ours.x).toBeCloseTo(X, 3);
      expect(ours.y).toBeCloseTo(Y, 3);
    }
    await task.destroy();
  });
});
