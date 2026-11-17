// Regra 11.9 e seção 22: o manifesto com dados fixos — texto (pdf.js) e snapshot visual da 1ª
// página (pdf.js + canvas) comparado com tolerância contra tests/fixtures/snapshots/.
// Para regravar o snapshot depois de uma mudança de layout aprovada: ATUALIZAR_SNAPSHOT=1.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { pdfPagesText } from "../../../tests/pdf-text";
import { embedFonts } from "./fonts";
import { appendManifest, type ManifestData } from "./manifest";

const PNG_1PX = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
const SNAPSHOT = join(process.cwd(), "tests/fixtures/snapshots/manifesto-p1.png");

const data: ManifestData = {
  titulo: "Contrato de prestação de serviços",
  remetente: { nome: "Clínica Exemplo", email: "contato.com.um.endereco.bem.comprido.que.nao.cabe.na.linha@exemplo-muito-longo.com.br" },
  codigo: "7K2M9QXH4T1B",
  hash_original: "a".repeat(64),
  enviado_em: "2026-11-10T13:00:00Z",
  concluido_em: "2026-11-12T18:30:05Z",
  assinantes: [
    { nome: "Ana Souza", email: "ana.souza@exemplo.com", cpf: "52998224725", ip: "203.0.113.9", assinado_em: "2026-11-11T12:01:02Z", assinatura: { texto: "Ana Souza" } },
    { nome: "Łukasz Kowalski", email: "lukasz@exemplo.pl", cpf: null, ip: "2001:db8::1", assinado_em: "2026-11-12T18:30:00Z", assinatura: { png: PNG_1PX } },
  ],
  copias: [{ nome: "Carla Dias", email: "carla@exemplo.com" }],
  eventos: Array.from({ length: 60 }, (_, i) => ({ ocorrido_em: new Date(Date.UTC(2026, 10, 10, 13, i)).toISOString(), tipo: i % 2 ? "visualizou" : "assinou", quem: "Ana Souza", ip: "203.0.113.9" })),
  site: "https://assina.app.br",
};

async function manifestPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setCreationDate(new Date("2026-11-12T00:00:00Z"));
  await appendManifest(doc, data, await embedFonts(doc));
  return doc.save();
}

// Primeira página em PNG pelo pdf.js, escala 1.
async function renderFirstPage(bytes: Uint8Array) {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({ data: bytes, standardFontDataUrl: join(process.cwd(), "node_modules/pdfjs-dist/standard_fonts/") + "/" });
  const page = await (await task.promise).getPage(1);
  const viewport = page.getViewport({ scale: 1 });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  await page.render({ canvas: canvas as unknown as HTMLCanvasElement, viewport }).promise;
  await task.destroy();
  return canvas;
}

describe("manifesto (regra 11.9)", () => {
  it("texto: dados mascarados, quebra de página com cabeçalho e rodapé em todas", async () => {
    const pages = await pdfPagesText(await manifestPdf());
    expect(pages.length).toBeGreaterThan(1); // 60 eventos não cabem numa página
    const all = pages.join(" ");
    for (const t of ["Manifesto de assinaturas", "Contrato de prestação de serviços", "Clínica Exemplo", "7K2M9QXH4T1B", "a".repeat(64), "a***@exemplo.com", "***.982.247-**", "Lukasz Kowalski", "2001:db8::1", "c***@exemplo.com", "10/11/2026 10:00:00 UTC-3"]) {
      expect(all).toContain(t);
    }
    // E-mail maior que a linha: quebra em pedaços, sem perder nada.
    expect(all.replace(/\s/g, "")).toContain(data.remetente.email);
    expect(all).not.toContain("ana.souza@exemplo.com");
    expect(all).not.toContain("52998224725");
    pages.forEach((p, i) => {
      expect(p).toContain(`Página ${i + 1} de ${pages.length} do manifesto`);
      expect(p).toContain("Medida Provisória 2.200-2/2001");
    });
    expect(pages[pages.length - 1]).toContain("Data e hora"); // cabeçalho da tabela repetido
  });

  it("snapshot visual da 1ª página, com tolerância", async () => {
    const canvas = await renderFirstPage(await manifestPdf());
    if (process.env.ATUALIZAR_SNAPSHOT) {
      writeFileSync(SNAPSHOT, await canvas.encode("png"));
      return;
    }
    // Sem o snapshot versionado o teste falha (nunca se regrava sozinho).
    expect(existsSync(SNAPSHOT), "snapshot ausente: rode com ATUALIZAR_SNAPSHOT=1 e confira a imagem").toBe(true);
    const ref = await loadImage(readFileSync(SNAPSHOT));
    expect([ref.width, ref.height]).toEqual([canvas.width, canvas.height]);
    const refCanvas = createCanvas(ref.width, ref.height);
    refCanvas.getContext("2d").drawImage(ref, 0, 0);
    const a = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
    const b = refCanvas.getContext("2d").getImageData(0, 0, ref.width, ref.height).data;
    let differing = 0;
    for (let i = 0; i < a.length; i += 4) {
      if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 96) differing++;
    }
    // Tolerância de 0,5% dos pixels (antisserrilhado entre versões do renderizador).
    expect(differing / (canvas.width * canvas.height)).toBeLessThan(0.005);
  });
});
