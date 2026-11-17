// Validação do PDF enviado — regra 11.1.
// Aceita: começa com %PDF-, até 10 MB, abre sem senha no pdf-lib, de 1 a 100 páginas, cada página
// com no máximo 1.440 × 1.440 pt. PDF que já traz assinatura digital passa, com aviso (gravar os
// campos reescreve o arquivo e essa assinatura deixa de valer).
import "server-only";
import { EncryptedPDFError, PDFDocument, type PDFPage } from "pdf-lib";
import { LIMITE_ARQUIVO_BYTES, MAX_LADO_PAGINA_PT, MAX_PAGINAS, MIN_PAGINAS } from "@/lib/limits";

export type PdfErrorCode = "nao_e_pdf" | "grande_demais" | "paginas_demais" | "protegido_por_senha" | "pagina_grande_demais";

export type PdfCheck =
  | { ok: true; pages: number; dimensions: { l: number; a: number }[]; alreadySigned: boolean }
  | { ok: false; code: PdfErrorCode };

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"

// Procura uma sequência de bytes ASCII no arquivo (sem converter tudo para texto).
function containsAscii(bytes: Uint8Array, needle: string): boolean {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).includes(needle, 0, "latin1");
}

// Valida o PDF. Recebe: os bytes. Devolve: páginas, dimensões em pontos e se já tem assinatura
// digital; ou o código do motivo de recusa (frases na seção 15).
export async function validatePdf(bytes: Uint8Array): Promise<PdfCheck> {
  if (bytes.length > LIMITE_ARQUIVO_BYTES) return { ok: false, code: "grande_demais" };
  if (bytes.length < PDF_MAGIC.length || PDF_MAGIC.some((b, i) => bytes[i] !== b)) return { ok: false, code: "nao_e_pdf" };

  let pages: PDFPage[];
  try {
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    // getPages também pode quebrar num PDF corrompido (catálogo sem /Pages): é "não é PDF".
    pages = doc.getPages();
  } catch (e) {
    // O pdf-lib lança Error comum ("…is encrypted…") em vez de EncryptedPDFError; vale a mensagem.
    if (e instanceof EncryptedPDFError || (e instanceof Error && /is encrypted/i.test(e.message))) {
      return { ok: false, code: "protegido_por_senha" };
    }
    return { ok: false, code: "nao_e_pdf" };
  }

  if (pages.length < MIN_PAGINAS) return { ok: false, code: "nao_e_pdf" };
  if (pages.length > MAX_PAGINAS) return { ok: false, code: "paginas_demais" };

  // Tamanho da página como o pdf.js a mostra (CropBox, já girado pelo /Rotate): é nessa caixa que
  // o editor põe os campos em fração (regra 11.3), e a gravação no 8.6 desfaz a mesma conta.
  const dimensions = pages.map((p) => {
    const { width, height } = p.getCropBox();
    const turned = (((p.getRotation().angle % 360) + 360) % 360) % 180 === 90;
    const [l, a] = turned ? [height, width] : [width, height];
    return { l: Math.round(l * 100) / 100, a: Math.round(a * 100) / 100 };
  });
  // O limite vale para a área visível e para o MediaBox (um MediaBox enorme com CropBox pequeno
  // ainda é uma página enorme para gravar e guardar).
  const media = pages.map((p) => p.getSize());
  if (dimensions.some((d) => d.l > MAX_LADO_PAGINA_PT || d.a > MAX_LADO_PAGINA_PT) || media.some((d) => d.width > MAX_LADO_PAGINA_PT || d.height > MAX_LADO_PAGINA_PT)) {
    return { ok: false, code: "pagina_grande_demais" };
  }

  return { ok: true, pages: pages.length, dimensions, alreadySigned: containsAscii(bytes, "/ByteRange") };
}
