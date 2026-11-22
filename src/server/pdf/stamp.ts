// Gravação dos campos no PDF — regra 11.3 (passo 2 do critério 8.6).
// Os campos guardam a posição em fração da página como o pdf.js a mostra (origem no canto
// superior esquerdo da área visível, já girada). Aqui a fração vira espaço do PDF considerando o
// CropBox e o /Rotate da página, para o campo cair onde o signatário o viu.
// - assinatura e rubrica digitadas: fonte cursiva embutida, centralizada, reduzida até caber;
// - desenhadas: a imagem PNG, preservando a proporção, centralizada;
// - data, nome e texto: Helvetica 10 pt (menor se o campo for baixo), cortados em uma linha;
// - caixa: ✓ desenhado em traços quando marcada, vazia quando não.
// Selo de rodapé (emenda de 22/11/2026): quando alguém assinou sem campo de assinatura
// posicionado, cada página do original ganha a linha "Assinado eletronicamente por … · Código …".
import "server-only";
import { degrees, rgb, type PDFDocument, type PDFImage, type PDFPage } from "pdf-lib";
import { copy } from "@/lib/copy";
import { CAMPO_TEXTO_PT } from "@/lib/limits";
import { embedPngOnce, fitLine, safeText, type PdfFonts } from "./fonts";

export type StampField = {
  tipo: "assinatura" | "rubrica" | "data" | "nome" | "texto" | "caixa";
  pagina: number;
  x: number;
  y: number;
  largura: number;
  altura: number;
  valor: string | null;
  signatario_id: string;
};

// O que cada assinante deixou para assinatura e rubrica: texto (cursiva) ou imagem (PNG).
export type SignerMarks = Map<string, { assinatura: { texto?: string; png?: Uint8Array }; rubrica: { texto?: string; png?: Uint8Array } }>;

const INK = rgb(0.07, 0.07, 0.1);

// Caixa de um campo no espaço do PDF: origem no canto inferior esquerdo do campo como visto, os
// vetores "direita" e "acima" do leitor e o giro do texto. Devolve: função de ponto local → PDF.
export function fieldFrame(page: PDFPage, f: Pick<StampField, "x" | "y" | "largura" | "altura">) {
  const crop = page.getCropBox();
  const rot = ((page.getRotation().angle % 360) + 360) % 360;
  const turned = rot === 90 || rot === 270;
  const viewW = turned ? crop.height : crop.width;
  const viewH = turned ? crop.width : crop.height;
  const w = f.largura * viewW;
  const h = f.altura * viewH;
  // (u, v) no papel como visto (u da esquerda, v do topo) → (X, Y) do PDF.
  const toPdf = (u: number, v: number): [number, number] => {
    const { x: x0, y: y0, width: W, height: H } = crop;
    if (rot === 90) return [x0 + v, y0 + u];
    if (rot === 180) return [x0 + W - u, y0 + v];
    if (rot === 270) return [x0 + W - v, y0 + H - u];
    return [x0 + u, y0 + H - v];
  };
  const u0 = f.x * viewW;
  const vBottom = (f.y + f.altura) * viewH;
  // Ponto local (lx para a direita, ly para cima, a partir do canto inferior esquerdo do campo).
  const at = (lx: number, ly: number) => {
    const [X, Y] = toPdf(u0 + lx, vBottom - ly);
    return { x: X, y: Y };
  };
  return { w, h, at, rotate: degrees(rot) };
}

// Desenha um texto centralizado na vertical, alinhado à esquerda (texto, data, nome) ou ao centro.
function drawLine(page: PDFPage, frame: ReturnType<typeof fieldFrame>, text: string, font: PdfFonts["regular"], size: number, center: boolean) {
  const width = font.widthOfTextAtSize(text, size);
  const lx = center ? Math.max(0, (frame.w - width) / 2) : Math.min(2, frame.w / 10);
  // Linha de base: centro do campo menos metade da altura das maiúsculas.
  const ly = frame.h / 2 - font.heightAtSize(size, { descender: false }) / 2;
  page.drawText(text, { ...frame.at(lx, ly), size, font, color: INK, rotate: frame.rotate });
}

// Escreve a assinatura (ou rubrica) digitada em cursiva: o maior tamanho que cabe em 95% da
// largura e 80% da altura do campo.
function drawCursive(page: PDFPage, frame: ReturnType<typeof fieldFrame>, text: string, fonts: PdfFonts) {
  const safe = safeText(text, fonts.cursive).trim() || "?";
  const byHeight = (frame.h * 0.8) / (fonts.cursive.heightAtSize(1));
  const byWidth = (frame.w * 0.95) / Math.max(fonts.cursive.widthOfTextAtSize(safe, 1), 0.001);
  drawLine(page, frame, safe, fonts.cursive, Math.max(1, Math.min(byHeight, byWidth)), true);
}

// Põe a imagem desenhada no campo, com a proporção preservada e centralizada.
function drawImage(page: PDFPage, frame: ReturnType<typeof fieldFrame>, image: PDFImage) {
  const scale = Math.min(frame.w / image.width, frame.h / image.height);
  const w = image.width * scale;
  const h = image.height * scale;
  page.drawImage(image, { ...frame.at((frame.w - w) / 2, (frame.h - h) / 2), width: w, height: h, rotate: frame.rotate });
}

// ✓ em dois traços, proporcional ao menor lado da caixa.
function drawCheck(page: PDFPage, frame: ReturnType<typeof fieldFrame>) {
  const s = Math.min(frame.w, frame.h);
  const ox = (frame.w - s) / 2;
  const oy = (frame.h - s) / 2;
  const p = (a: number, b: number) => frame.at(ox + a * s, oy + b * s);
  const thickness = Math.max(0.8, s * 0.12);
  page.drawLine({ start: p(0.15, 0.5), end: p(0.4, 0.2), thickness, color: INK });
  page.drawLine({ start: p(0.4, 0.2), end: p(0.88, 0.85), thickness, color: INK });
}

// Grava todos os campos no documento (regra 11.3). Recebe: o documento, os campos com o valor já
// gravado pelo banco, as marcas de cada assinante e as fontes. Devolve: nada.
export async function stampFields(doc: PDFDocument, fields: StampField[], marks: SignerMarks, fonts: PdfFonts): Promise<void> {
  const pages = doc.getPages();
  const png = (bytes: Uint8Array) => embedPngOnce(doc, bytes);

  for (const f of fields) {
    const page = pages[f.pagina - 1];
    if (!page) throw new Error("campo_fora_do_documento");
    const frame = fieldFrame(page, f);
    if (f.tipo === "assinatura" || f.tipo === "rubrica") {
      const mark = marks.get(f.signatario_id)?.[f.tipo];
      if (mark?.png) drawImage(page, frame, await png(mark.png));
      else if (mark?.texto) drawCursive(page, frame, mark.texto, fonts);
      else throw new Error("assinatura_sem_marca");
    } else if (f.tipo === "caixa") {
      if (f.valor === "sim") drawCheck(page, frame);
    } else if (f.valor) {
      const size = Math.min(CAMPO_TEXTO_PT, frame.h * 0.8);
      const text = fitLine(safeText(f.valor, fonts.regular), fonts.regular, size, frame.w - Math.min(4, frame.w / 5));
      drawLine(page, frame, text, fonts.regular, size, false);
    }
  }
}

const FOOTER_INK = rgb(0.43, 0.43, 0.45); // #6e6e73, o cinza do manifesto
const FOOTER_PT = 7;
const FOOTER_BOTTOM_PT = 10; // distância da borda de baixo da área visível
const FOOTER_SIDE = 0.04; // margem lateral, em fração da largura vista

// Monta o texto do selo de rodapé (emenda de 22/11/2026, regra 11.9): os nomes de quem assinou,
// trocados por "Ana e mais 2" e depois por "3 pessoas" se a linha não couber na página mais
// estreita. Recebe: nomes, data já formatada, código formatado, "assina.app.br/verificar", a
// fonte e a largura disponível. Devolve: a linha.
export function signedFooterText(nomes: string[], data: string, codigo: string, verificar: string, font: PdfFonts["regular"], maxWidth: number): string {
  const f = copy.manifest;
  const options = [f.footerAnd(nomes), ...(nomes.length > 1 ? [f.footerOthers(nomes[0], nomes.length - 1), f.footerPeople(nomes.length)] : [])];
  const lines = options.map((quem) => safeText(f.footer(quem, data, codigo, verificar), font));
  const fits = lines.find((l) => font.widthOfTextAtSize(l, FOOTER_PT) <= maxWidth);
  return fits ?? fitLine(lines[lines.length - 1], font, FOOTER_PT, maxWidth);
}

// Largura útil do rodapé de uma página como ela é vista (com /Rotate e CropBox).
export function footerWidth(page: PDFPage): number {
  return fieldFrame(page, { x: FOOTER_SIDE, y: 0, largura: 1 - 2 * FOOTER_SIDE, altura: 0.01 }).w;
}

// Desenha o selo de rodapé em todas as páginas do documento original (antes do manifesto),
// centralizado no pé da página como ela é vista, em cinza 7 pt, sem fundo (não cobre o conteúdo).
// Recebe: as páginas do original, a linha pronta (signedFooterText) e as fontes. Devolve: nada.
export function stampSignedFooter(pages: PDFPage[], text: string, fonts: PdfFonts): void {
  for (const page of pages) {
    const probe = fieldFrame(page, { x: 0, y: 0, largura: 1, altura: 1 });
    const viewH = probe.h;
    const h = FOOTER_PT * 1.4;
    const frame = fieldFrame(page, { x: FOOTER_SIDE, y: (viewH - FOOTER_BOTTOM_PT - h) / viewH, largura: 1 - 2 * FOOTER_SIDE, altura: h / viewH });
    const line = fitLine(text, fonts.regular, FOOTER_PT, frame.w);
    const width = fonts.regular.widthOfTextAtSize(line, FOOTER_PT);
    const ly = frame.h / 2 - fonts.regular.heightAtSize(FOOTER_PT, { descender: false }) / 2;
    page.drawText(line, { ...frame.at(Math.max(0, (frame.w - width) / 2), ly), size: FOOTER_PT, font: fonts.regular, color: FOOTER_INK, rotate: frame.rotate });
  }
}
