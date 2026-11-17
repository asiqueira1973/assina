// Armazenamento de arquivos — seções 4 e 18 ("arquivo só por src/server/files/storage.ts").
// Interface única (ArquivoStorage) com dois drivers:
// - r2: Cloudflare R2 pela API do S3, quando as quatro variáveis R2_* existem (produção);
// - local: disco em .armazenamento-local/, só fora de produção (dev e testes, pendência P2).
// Em produção sem R2 o app falha alto, em vez de gravar documento em disco efêmero.
// Caminhos são relativos ao bucket: {conta_id}/{envelope_id}/original.pdf, etc.
import "server-only";
import { localStorageDriver } from "./local";
import { r2StorageDriver } from "./r2";

export type SignedUrl = { url: string; expiresAt: Date };

export interface ArquivoStorage {
  /** URL para o navegador fazer PUT direto do arquivo (validade em segundos). */
  createUploadUrl(path: string, contentType: string, expiresInS: number): Promise<SignedUrl>;
  /** URL de leitura temporária; com filename, o navegador baixa com esse nome. */
  createDownloadUrl(path: string, expiresInS: number, filename?: string): Promise<SignedUrl>;
  /** Lê o arquivo, no máximo maxBytes, numa leitura só; null se não existe. Lança "arquivo_grande" acima. */
  read(path: string, maxBytes: number): Promise<Uint8Array | null>;
  write(path: string, bytes: Uint8Array, contentType: string): Promise<void>;
  /** Move (copia e apaga a origem). Usado para promover upload.pdf a original.pdf. */
  move(from: string, to: string): Promise<void>;
  delete(path: string): Promise<void>;
}

let cached: ArquivoStorage | null = null;

// Diz se as quatro variáveis do R2 existem (a rota de dev usa a mesma regra para se desligar).
export function isR2Configured(): boolean {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env;
  return !!(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET);
}

// Escolhe o driver pelas variáveis de ambiente. Devolve: o driver do processo.
export function storage(): ArquivoStorage {
  if (cached) return cached;
  if (isR2Configured()) {
    const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env as Record<string, string>;
    cached = r2StorageDriver({ accountId: R2_ACCOUNT_ID, accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY, bucket: R2_BUCKET });
  } else if (process.env.NODE_ENV !== "production") {
    cached = localStorageDriver();
  } else {
    throw new Error("R2 não configurado (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET)");
  }
  return cached;
}

// Caminhos padronizados de um envelope (7.3). O original tem um caminho por versão: cada troca
// grava um arquivo novo e o banco aponta para ele numa transação (as_fn_anexa_arquivo), então um
// envio concorrente nunca vê o arquivo pela metade (princípio 2). Recebe: conta e envelope.
export function envelopePaths(contaId: string, envelopeId: string) {
  const base = `${contaId}/${envelopeId}`;
  return {
    upload: `${base}/upload.pdf`,
    original: (version: string) => `${base}/original-${version}.pdf`,
    final: `${base}/final.pdf`,
  };
}
