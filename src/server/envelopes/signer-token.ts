// Token do link do signatário — seção 6.2. 32 bytes aleatórios em base64url no link; o banco
// guarda só o SHA-256 (o mesmo hash das credenciais).
import "server-only";
import { randomBytes } from "node:crypto";
import { TOKEN_SIGNATARIO_BYTES } from "@/lib/limits";
import { hashCredential } from "@/server/credentials/api-key";

export type SignerToken = { value: string; hash: string };

// Gera um token novo. Devolve: o valor (vai só no e-mail) e o hash (vai para o banco).
export function generateSignerToken(): SignerToken {
  const value = randomBytes(TOKEN_SIGNATARIO_BYTES).toString("base64url");
  return { value, hash: hashCredential(value) };
}

// Link público de assinatura. Recebe: o token em claro.
export function signerLink(token: string): string {
  return `${process.env.NEXT_PUBLIC_SITE_URL}/assinar/${token}`;
}
