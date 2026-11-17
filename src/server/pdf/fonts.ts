// Fontes do PDF final — regra 11.3 e seção 16. Helvetica (padrão do PDF) para texto, data, nome e
// manifesto; "Dancing Script" (OFL, @fontsource) embutida para assinatura e rubrica digitadas.
// A Helvetica padrão só codifica WinAnsi: um caractere fora dele quebraria o drawText, então todo
// texto passa por safeText antes.
import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { StandardFonts, type PDFDocument, type PDFFont, type PDFImage } from "pdf-lib";

// Caminho da fonte cursiva. O next.config inclui o arquivo no bundle das rotas (outputFileTracingIncludes).
export const CURSIVE_FONT_FILE = "node_modules/@fontsource/dancing-script/files/dancing-script-latin-400-normal.woff";

let cursiveBytes: Promise<Buffer> | null = null;

export type PdfFonts = { regular: PDFFont; bold: PDFFont; cursive: PDFFont };

// Embute as três fontes no documento. A cursiva entra como subconjunto (só os glifos usados).
export async function embedFonts(doc: PDFDocument): Promise<PdfFonts> {
  doc.registerFontkit(fontkit);
  cursiveBytes ??= readFile(join(process.cwd(), CURSIVE_FONT_FILE));
  const [regular, bold, cursive] = await Promise.all([
    doc.embedFont(StandardFonts.Helvetica),
    doc.embedFont(StandardFonts.HelveticaBold),
    doc.embedFont(await cursiveBytes, { subset: true }),
  ]);
  return { regular, bold, cursive };
}

const charsets = new WeakMap<PDFFont, Set<number>>();

// Equivalentes para o que o WinAnsi não tem e o NFKD não resolve: o "UTC−3" do manifesto usa o
// sinal de menos U+2212, que vira hífen no PDF; letras como "Ł" e "đ" não se decompõem.
const FALLBACK: Record<string, string> = {
  "\u2212": "-", "\u2010": "-", "\u2011": "-", "\u2013": "-", "\u00a0": " ",
  "Ł": "L", "ł": "l", "Đ": "D", "đ": "d", "Ħ": "H", "ħ": "h", "ı": "i", "Ŧ": "T", "ŧ": "t",
};

// Deixa o texto desenhável na fonte: troca quebras de linha por espaço, tira acento só do que a
// fonte não tem (ex.: "Ł" → "L") e troca o resto por "?". Recebe: texto e fonte. Devolve: texto.
export function safeText(text: string, font: PDFFont): string {
  let set = charsets.get(font);
  if (!set) {
    set = new Set(font.getCharacterSet());
    charsets.set(font, set);
  }
  const ok = set;
  return Array.from(text.replace(/[\r\n\t]+/g, " "))
    .map((ch) => {
      if (ok.has(ch.codePointAt(0)!)) return ch;
      if (FALLBACK[ch] && ok.has(FALLBACK[ch].codePointAt(0)!)) return FALLBACK[ch];
      const base = ch.normalize("NFKD").replace(/[̀-ͯ]/g, "");
      return base && Array.from(base).every((c) => ok.has(c.codePointAt(0)!)) ? base : "?";
    })
    .join("");
}

// Corta o texto para caber na largura (uma linha, regra 11.3). Recebe: texto já seguro, fonte,
// tamanho e largura máxima. Devolve: o maior prefixo que cabe.
export function fitLine(text: string, font: PDFFont, size: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  const chars = Array.from(text);
  let lo = 0;
  let hi = chars.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (font.widthOfTextAtSize(chars.slice(0, mid).join(""), size) <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return chars.slice(0, lo).join("");
}

// Quebra o texto em linhas que cabem na largura (manifesto). Palavra maior que a linha (um e-mail
// longo, um hash) continua na linha seguinte, em pedaços: nada se perde.
export function wrapLines(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      line = next;
      continue;
    }
    if (line) lines.push(line);
    let rest = word;
    while (font.widthOfTextAtSize(rest, size) > maxWidth) {
      const piece = fitLine(rest, font, size, maxWidth) || Array.from(rest)[0];
      lines.push(piece);
      rest = rest.slice(piece.length);
    }
    line = rest;
  }
  if (line) lines.push(line);
  return lines;
}

const pngs = new WeakMap<PDFDocument, Map<Uint8Array, Promise<PDFImage>>>();

// Embute um PNG uma vez só por documento: a mesma assinatura desenhada aparece no campo e no
// manifesto. Recebe: documento e bytes (o mesmo objeto). Devolve: a imagem.
export function embedPngOnce(doc: PDFDocument, bytes: Uint8Array): Promise<PDFImage> {
  let byDoc = pngs.get(doc);
  if (!byDoc) {
    byDoc = new Map();
    pngs.set(doc, byDoc);
  }
  let img = byDoc.get(bytes);
  if (!img) {
    img = doc.embedPng(bytes);
    byDoc.set(bytes, img);
  }
  return img;
}
