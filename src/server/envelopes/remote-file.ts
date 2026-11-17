// Arquivo do rascunho a partir de uma URL — regra 11.18 (API e MCP). Baixa pelo fetch protegido
// contra SSRF (só https, IP público conferido na conexão e em cada redirecionamento, no máximo 3,
// 10 s, corta em 10 MB; o Content-Type não importa, vale o %PDF-), grava como upload.pdf e segue
// o mesmo caminho do upload do navegador (attachUploadedFile: regra 11.1).
import "server-only";
import { LIMITE_ARQUIVO_BYTES, REMOTO_REDIRECIONAMENTOS, REMOTO_TIMEOUT_MS } from "@/lib/limits";
import { envelopePaths, storage } from "@/server/files/storage";
import { fetchRemote, RemoteFetchError } from "@/server/files/fetch-remote";
import { attachUploadedFile, DraftError } from "./drafts";

// Baixa e anexa. Recebe: conta, envelope, URL e nome do arquivo. Devolve: o resultado do anexo.
// Lança DraftError: url_recusada, download_falhou, grande_demais ou os da regra 11.1.
export async function attachFromUrl(contaId: string, envelopeId: string, url: string, filename: string) {
  let body: Uint8Array;
  try {
    const res = await fetchRemote(url, { maxBytes: LIMITE_ARQUIVO_BYTES, timeoutMs: REMOTO_TIMEOUT_MS, maxRedirects: REMOTO_REDIRECIONAMENTOS });
    if (res.status < 200 || res.status >= 300) throw new DraftError("download_falhou");
    body = res.body;
  } catch (e) {
    if (e instanceof RemoteFetchError) throw new DraftError(e.code);
    throw e;
  }
  await storage().write(envelopePaths(contaId, envelopeId).upload, body, "application/pdf");
  return attachUploadedFile(contaId, envelopeId, filename);
}

// Nome do arquivo a partir da URL (último trecho do caminho), se não veio no pedido.
export function filenameFromUrl(url: string): string {
  try {
    const last = decodeURIComponent(new URL(url).pathname.split("/").pop() ?? "");
    return last && /\.pdf$/i.test(last) ? last : "documento.pdf";
  } catch {
    return "documento.pdf";
  }
}
