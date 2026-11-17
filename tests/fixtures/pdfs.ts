// PDFs de teste gerados em memória (regra 11.1): nada binário no repositório.
import { PDFDocument, PDFName } from "pdf-lib";

// PDF válido. Recebe: número de páginas e tamanho da página em pontos (padrão A4).
export async function makePdf(pages = 1, size: [number, number] = [595.28, 841.89]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage(size).drawText(`Página ${i + 1}`.replace("á", "a"), { x: 50, y: 50, size: 12 });
  return doc.save();
}

// PDF "com senha": um dicionário /Encrypt no trailer basta para o pdf-lib recusar abrir.
export async function makeEncryptedPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage();
  doc.context.trailerInfo.Encrypt = doc.context.register(doc.context.obj({ Filter: PDFName.of("Standard"), V: 2, R: 3 }));
  return doc.save({ useObjectStreams: false });
}

// PDF que já traz uma assinatura digital (um dicionário /Sig com /ByteRange).
export async function makeSignedPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage();
  doc.context.register(doc.context.obj({ Type: PDFName.of("Sig"), ByteRange: [0, 10, 20, 30] }));
  return doc.save({ useObjectStreams: false });
}

// Um .docx renomeado para .pdf: começa com a assinatura do ZIP.
export function makeDocxBytes(): Uint8Array {
  return new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00, ...new Array(200).fill(0)]);
}

// Arquivo de 10,1 MB que começa como PDF (o tamanho é recusado antes de abrir).
export function makeOversizedPdfBytes(): Uint8Array {
  const bytes = new Uint8Array(Math.round(10.1 * 1024 * 1024));
  bytes.set([0x25, 0x50, 0x44, 0x46, 0x2d]);
  return bytes;
}
