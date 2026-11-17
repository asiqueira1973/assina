// Driver local do ArquivoStorage, só para dev e testes (pendência P2: sem bucket R2 ainda).
// Grava em .armazenamento-local/ (no .gitignore). As "URLs assinadas" apontam para a rota
// /api/dev/arquivos/{caminho}?op=put|get&exp=…&sig=…, com HMAC-SHA256 sobre op, caminho e
// validade (chave CHAVES_ENC_KEY). A rota responde 404 em produção.
import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, normalize, sep } from "node:path";
import type { ArquivoStorage } from "./storage";

const ROOT = join(process.cwd(), ".armazenamento-local");

// Caminho no disco, sem deixar sair da pasta (nada de "..").
export function localFilePath(path: string): string {
  const full = normalize(join(ROOT, path));
  if (!full.startsWith(ROOT + sep)) throw new Error("caminho_invalido");
  return full;
}

// Assina op + caminho + validade. Recebe: os três. Devolve: HMAC em base64url.
export function signLocal(op: "put" | "get", path: string, exp: number): string {
  const key = process.env.CHAVES_ENC_KEY;
  if (!key) throw new Error("CHAVES_ENC_KEY ausente");
  return createHmac("sha256", key).update(`${op}\n${path}\n${exp}`).digest("base64url");
}

// Confere a assinatura e a validade de uma URL local. Devolve: true se vale.
export function verifyLocal(op: "put" | "get", path: string, exp: number, sig: string, now = Date.now()): boolean {
  if (!Number.isFinite(exp) || exp * 1000 < now) return false;
  const expected = Buffer.from(signLocal(op, path, exp));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

// Monta a URL local assinada. Recebe: operação, caminho, validade em segundos e nome de download.
function localUrl(op: "put" | "get", path: string, expiresInS: number, filename?: string) {
  const exp = Math.floor(Date.now() / 1000) + expiresInS;
  const params = new URLSearchParams({ op, exp: String(exp), sig: signLocal(op, path, exp) });
  if (filename) params.set("nome", filename);
  const url = `${process.env.NEXT_PUBLIC_SITE_URL}/api/dev/arquivos/${path.split("/").map(encodeURIComponent).join("/")}?${params}`;
  return { url, expiresAt: new Date(exp * 1000) };
}

// Cria o driver local. Devolve: ArquivoStorage.
export function localStorageDriver(): ArquivoStorage {
  return {
    async createUploadUrl(path, _contentType, expiresInS) {
      return localUrl("put", path, expiresInS);
    },
    async createDownloadUrl(path, expiresInS, filename) {
      return localUrl("get", path, expiresInS, filename);
    },
    async read(path, maxBytes) {
      try {
        const info = await stat(localFilePath(path));
        if (info.size > maxBytes) throw new Error("arquivo_grande");
        return new Uint8Array(await readFile(localFilePath(path)));
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw e;
      }
    },
    async write(path, bytes) {
      const file = localFilePath(path);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, bytes);
    },
    async move(from, to) {
      const target = localFilePath(to);
      await mkdir(dirname(target), { recursive: true });
      await rename(localFilePath(from), target);
    },
    async delete(path) {
      await rm(localFilePath(path), { force: true });
    },
    async deletePrefix(prefix) {
      if (!prefix.endsWith("/") || prefix.length < 3) throw new Error("caminho_invalido");
      await rm(localFilePath(prefix.slice(0, -1)), { recursive: true, force: true });
    },
  };
}
