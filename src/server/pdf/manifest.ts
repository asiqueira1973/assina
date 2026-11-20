// Manifesto de assinaturas — regra 11.9 e seção 16 (passo 3 do critério 8.6).
// Páginas A4 anexadas ao fim do PDF: cabeçalho com "Assina" em azul e o QR de
// {SITE}/verificar/{codigo} à direita; título do envelope, remetente, código, SHA-256 do original,
// enviado e concluído em (Brasília, "UTC−3"); um bloco por assinante (nome, e-mail e CPF
// mascarados, a assinatura como foi feita, autenticação, IP e hora); as cópias; a trilha completa
// em tabela; rodapé com o texto legal e "Página X de Y do manifesto".
// O hash final não aparece aqui (é calculado depois do selo).
import "server-only";
import { rgb, type PDFDocument, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { encode } from "uqr";
import { copy } from "@/lib/copy";
import { formatDateTimeSeconds } from "@/lib/format";
import { maskCpf, maskEmail } from "@/lib/mask";
import { formatVerificationCode } from "@/server/envelopes/verification-code";
import { embedPngOnce, fitLine, safeText, wrapLines, type PdfFonts } from "./fonts";

export type ManifestSigner = {
  nome: string;
  email: string;
  cpf: string | null;
  ip: string | null;
  assinado_em: string;
  assinatura: { texto?: string; png?: Uint8Array };
};
export type ManifestEvent = { ocorrido_em: string; tipo: keyof typeof copy.events; quem: string; ip: string | null };
export type ManifestData = {
  titulo: string;
  remetente: { nome: string; email: string };
  codigo: string;
  hash_original: string;
  enviado_em: string;
  concluido_em: string;
  assinantes: ManifestSigner[];
  copias: { nome: string; email: string }[];
  eventos: ManifestEvent[];
  site: string;
};

const A4: [number, number] = [595.28, 841.89];
const M = 48; // margem
const INK = rgb(0.11, 0.11, 0.12);
const MUTED = rgb(0.43, 0.43, 0.45); // #6e6e73
const HAIRLINE = rgb(0.86, 0.86, 0.88);
const BLUE = rgb(0, 113 / 255, 227 / 255); // #0071e3
const FOOTER_H = 64;

const when = (iso: string) => `${formatDateTimeSeconds(iso)} ${copy.manifest.timezone}`;

// Desenha o QR (uqr) como quadrados. Recebe: página, texto, canto superior esquerdo e lado.
function drawQr(page: PDFPage, text: string, x: number, top: number, side: number) {
  const { data, size } = encode(text, { ecc: "M", border: 1 });
  const cell = side / size;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (data[r][c]) page.drawRectangle({ x: x + c * cell, y: top - (r + 1) * cell, width: cell + 0.05, height: cell + 0.05, color: INK });
    }
  }
}

// Escritor com cursor vertical que abre página nova quando falta espaço.
class Writer {
  page!: PDFPage;
  y = 0;
  pages: PDFPage[] = [];
  readonly width = A4[0] - 2 * M;
  constructor(private doc: PDFDocument, private fonts: PdfFonts, private data: ManifestData) {
    this.newPage();
  }

  newPage() {
    this.page = this.doc.addPage(A4);
    this.pages.push(this.page);
    this.y = A4[1] - M;
    // Cabeçalho: "Assina" em azul (a marca é só o texto, seção 16) e o QR à direita.
    this.page.drawText(copy.manifest.brand, { x: M, y: this.y - 14, size: 14, font: this.fonts.bold, color: BLUE });
    drawQr(this.page, `${this.data.site}/verificar/${this.data.codigo}`, A4[0] - M - 64, this.y + 4, 64);
    this.y -= 28;
  }

  ensure(height: number) {
    if (this.y - height < M + FOOTER_H) this.newPage();
  }

  text(t: string, opts: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; x?: number; maxWidth?: number } = {}) {
    const size = opts.size ?? 10;
    const font = opts.font ?? this.fonts.regular;
    const maxWidth = opts.maxWidth ?? this.width - (opts.x ?? 0);
    const lines = wrapLines(safeText(t, font), font, size, maxWidth);
    for (const line of lines) {
      this.ensure(size * 1.4);
      this.page.drawText(line, { x: M + (opts.x ?? 0), y: this.y - size, size, font, color: opts.color ?? INK });
      this.y -= size * 1.4;
    }
  }

  // Par rótulo: valor numa linha (o valor quebra se for longo).
  field(label: string, value: string, x = 0) {
    const size = 9;
    const labelW = 150;
    this.ensure(size * 1.5);
    this.page.drawText(safeText(label, this.fonts.regular), { x: M + x, y: this.y - size, size, font: this.fonts.regular, color: MUTED });
    const lines = wrapLines(safeText(value, this.fonts.regular), this.fonts.regular, size, this.width - x - labelW);
    lines.forEach((line, i) => {
      if (i > 0) this.ensure(size * 1.4);
      this.page.drawText(line, { x: M + x + labelW, y: this.y - size, size, font: this.fonts.regular, color: INK });
      this.y -= size * 1.4;
    });
    if (!lines.length) this.y -= size * 1.4;
  }

  rule(gap = 10) {
    this.ensure(gap * 2);
    this.y -= gap;
    this.page.drawLine({ start: { x: M, y: this.y }, end: { x: A4[0] - M, y: this.y }, thickness: 0.5, color: HAIRLINE });
    this.y -= gap;
  }

  heading(t: string) {
    this.ensure(40);
    this.y -= 6;
    this.text(t, { size: 12, font: this.fonts.bold });
    this.y -= 2;
  }
}

// Anexa o manifesto ao fim do documento. Recebe: documento, dados e fontes. Devolve: nada.
export async function appendManifest(doc: PDFDocument, data: ManifestData, fonts: PdfFonts): Promise<void> {
  const w = new Writer(doc, fonts, data);
  const m = copy.manifest;

  w.text(m.title, { size: 18, font: fonts.bold });
  w.y -= 4;
  w.text(data.titulo, { size: 12 });
  w.rule();
  w.field(m.sender, `${data.remetente.nome} (${data.remetente.email})`);
  w.field(m.code, formatVerificationCode(data.codigo));
  w.field(m.hashOriginal, data.hash_original);
  w.field(m.sentAt, when(data.enviado_em));
  w.field(m.completedAt, when(data.concluido_em));

  w.heading(m.signers);
  const images = new Map<ManifestSigner, PDFImage>();
  for (const s of data.assinantes) if (s.assinatura.png) images.set(s, await embedPngOnce(doc, s.assinatura.png));
  for (const s of data.assinantes) {
    w.rule(6);
    w.ensure(130);
    w.text(s.nome, { size: 11, font: fonts.bold });
    w.field(m.email, maskEmail(s.email));
    if (s.cpf) w.field(m.cpf, maskCpf(s.cpf));
    // A assinatura como foi feita: a imagem desenhada ou o nome em cursiva.
    const boxH = 36;
    const boxW = 180;
    w.ensure(boxH + 8);
    const img = images.get(s);
    if (img) {
      const scale = Math.min(boxW / img.width, boxH / img.height);
      w.page.drawImage(img, { x: M + 150, y: w.y - boxH, width: img.width * scale, height: img.height * scale });
    } else if (s.assinatura.texto) {
      const t = safeText(s.assinatura.texto, fonts.cursive);
      const size = Math.min(24, (boxW / Math.max(fonts.cursive.widthOfTextAtSize(t, 1), 0.001)) * 0.95);
      w.page.drawText(t, { x: M + 150, y: w.y - boxH + 8, size, font: fonts.cursive, color: INK });
    }
    w.y -= boxH + 6;
    w.field("", m.authenticated);
    w.field(m.ip, s.ip ?? m.none);
    w.field(m.signedAt, when(s.assinado_em));
  }

  if (data.copias.length) {
    w.heading(m.copies);
    for (const c of data.copias) w.field(c.nome, maskEmail(c.email));
  }

  // Trilha completa em tabela (data e hora, evento, quem, IP).
  w.heading(m.trail);
  const cols = [0, 118, 290, 420];
  const size = 8;
  const row = (cells: string[], font: PDFFont, color = INK) => {
    w.ensure(size * 1.6);
    cells.forEach((c, i) => {
      const maxW = (cols[i + 1] ?? w.width) - cols[i] - 6;
      w.page.drawText(fitLine(safeText(c, font), font, size, maxW), { x: M + cols[i], y: w.y - size, size, font, color });
    });
    w.y -= size * 1.6;
  };
  const header = () => row([m.trailHeaders.when, m.trailHeaders.event, m.trailHeaders.who, m.trailHeaders.ip], fonts.bold, MUTED);
  header();
  for (const e of data.eventos) {
    const before = w.page;
    w.ensure(size * 1.6);
    if (w.page !== before) header(); // cabeçalho de novo em cada página da trilha
    row([when(e.ocorrido_em), copy.events[e.tipo], e.quem, e.ip ?? m.none], fonts.regular);
  }

  // Rodapé de todas as páginas do manifesto: texto legal e "Página X de Y do manifesto".
  const legal = wrapLines(safeText(m.legal(data.site), fonts.regular), fonts.regular, 7, w.width);
  w.pages.forEach((page, i) => {
    let y = M + FOOTER_H - 14;
    page.drawLine({ start: { x: M, y: y + 8 }, end: { x: A4[0] - M, y: y + 8 }, thickness: 0.5, color: HAIRLINE });
    for (const line of legal) {
      page.drawText(line, { x: M, y, size: 7, font: fonts.regular, color: MUTED });
      y -= 9;
    }
    const label = m.pageOf(i + 1, w.pages.length);
    page.drawText(label, { x: A4[0] - M - fonts.regular.widthOfTextAtSize(label, 7), y: M - 14, size: 7, font: fonts.regular, color: MUTED });
  });
}
