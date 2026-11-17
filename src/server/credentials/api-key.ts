// Chave de API da conta — seção 6.3 e regra 11.8.
// Formato "assina_" + 32 bytes aleatórios em base64url (43 caracteres). O banco guarda o SHA-256
// (para achar a credencial pelo Bearer), os 12 primeiros caracteres (para exibir) e o valor
// cifrado (para a tela Integrações mostrar de novo, assunção 24.6).
import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { encryptSecret } from "@/server/crypto/aes";

export const API_KEY_PREFIX = "assina_";

export type NewApiKey = { value: string; hash: string; prefix: string; sealed: string };

// SHA-256 hex de uma credencial. Recebe: valor em claro. Devolve: hash para busca.
export function hashCredential(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

// Gera uma chave nova. Devolve: o valor em claro (nunca gravado), hash, prefixo e valor cifrado.
export function generateApiKey(): NewApiKey {
  const value = API_KEY_PREFIX + randomBytes(32).toString("base64url");
  return { value, hash: hashCredential(value), prefix: value.slice(0, 12), sealed: encryptSecret(value) };
}
