// Texto de cada página de um PDF, pelo pdf.js (testes do manifesto, seção 22: "extrai o texto do
// manifesto (pdfjs) com nomes, código e hash").
import { join } from "node:path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

// Fontes padrão do PDF (Helvetica) que o pdf.js usa para medir o texto.
const standardFontDataUrl = join(process.cwd(), "node_modules/pdfjs-dist/standard_fonts/") + "/";

export async function pdfPagesText(bytes: Uint8Array): Promise<string[]> {
  const task = getDocument({ data: new Uint8Array(bytes), useSystemFonts: false, standardFontDataUrl });
  const doc = await task.promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    pages.push(content.items.map((it) => ("str" in it ? it.str : "")).join(" ").replace(/\s+/g, " "));
  }
  await task.destroy();
  return pages;
}
