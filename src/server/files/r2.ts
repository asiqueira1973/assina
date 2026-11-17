// Driver Cloudflare R2 do ArquivoStorage (seção 4), pela API compatível com S3.
// URLs pré-assinadas (assinatura v4, calculada localmente) para upload e download diretos do
// navegador; o PDF nunca passa pelo corpo de uma função (limite de ~4,5 MB no Vercel).
import "server-only";
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { ArquivoStorage } from "./storage";

export type R2Config = { accountId: string; accessKeyId: string; secretAccessKey: string; bucket: string };

// Cria o driver. Recebe: credenciais do token restrito ao bucket. Devolve: ArquivoStorage.
export function r2StorageDriver(config: R2Config): ArquivoStorage {
  const client = new S3Client({
    region: "auto",
    // Estilo de caminho (conta.r2…/bucket/chave), o formato da documentação do R2.
    forcePathStyle: true,
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });
  const Bucket = config.bucket;

  return {
    async createUploadUrl(path, contentType, expiresInS) {
      const url = await getSignedUrl(client, new PutObjectCommand({ Bucket, Key: path, ContentType: contentType }), { expiresIn: expiresInS });
      return { url, expiresAt: new Date(Date.now() + expiresInS * 1000) };
    },
    async createDownloadUrl(path, expiresInS, filename) {
      const command = new GetObjectCommand({
        Bucket,
        Key: path,
        ResponseContentDisposition: filename ? `attachment; filename*=UTF-8''${encodeURIComponent(filename)}` : undefined,
      });
      const url = await getSignedUrl(client, command, { expiresIn: expiresInS });
      return { url, expiresAt: new Date(Date.now() + expiresInS * 1000) };
    },
    async read(path, maxBytes) {
      try {
        // Uma leitura só, limitada a maxBytes + 1 (Range): nunca carrega na memória um objeto
        // maior que o limite, nem há janela entre conferir o tamanho e ler (achado do verifier).
        const res = await client.send(new GetObjectCommand({ Bucket, Key: path, Range: `bytes=0-${maxBytes}` }));
        if (!res.Body) return null;
        const bytes = await res.Body.transformToByteArray();
        if (bytes.length > maxBytes) throw new Error("arquivo_grande");
        return bytes;
      } catch (e) {
        if (e instanceof Error && (e.name === "NotFound" || e.name === "NoSuchKey" || e.name === "InvalidRange")) return null;
        throw e;
      }
    },
    async write(path, bytes, contentType) {
      await client.send(new PutObjectCommand({ Bucket, Key: path, Body: bytes, ContentType: contentType }));
    },
    async move(from, to) {
      await client.send(new CopyObjectCommand({ Bucket, Key: to, CopySource: `${Bucket}/${encodeURI(from)}` }));
      await client.send(new DeleteObjectCommand({ Bucket, Key: from }));
    },
    async delete(path) {
      await client.send(new DeleteObjectCommand({ Bucket, Key: path }));
    },
    async deletePrefix(prefix) {
      if (!prefix.endsWith("/") || prefix.length < 3) throw new Error("caminho_invalido");
      // Lista e apaga de 1.000 em 1.000 (limite do DeleteObjects).
      for (;;) {
        const list = await client.send(new ListObjectsV2Command({ Bucket, Prefix: prefix, MaxKeys: 1000 }));
        const keys = (list.Contents ?? []).flatMap((o) => (o.Key ? [{ Key: o.Key }] : []));
        if (!keys.length) return;
        const res = await client.send(new DeleteObjectsCommand({ Bucket, Delete: { Objects: keys, Quiet: true } }));
        // Falha parcial: para aqui (senão a próxima listagem traria as mesmas chaves para sempre).
        if (res.Errors?.length) throw new Error("arquivos_nao_apagados");
        if (!list.IsTruncated) return;
      }
    },
  };
}
