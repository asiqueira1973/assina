// Código de verificação do envelope — regra 11.11.
// 12 caracteres em base32 Crockford (0-9 e A-Z sem I, L, O, U), sorteados com crypto.
import "server-only";
import { randomInt } from "node:crypto";

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

// Gera um código novo. Devolve: 12 caracteres (exibido como XXXX-XXXX-XXXX).
export function generateVerificationCode(): string {
  let out = "";
  for (let i = 0; i < 12; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

// Formata para exibição: ABCD1234EFGH → ABCD-1234-EFGH.
export function formatVerificationCode(code: string): string {
  return code.replace(/(.{4})(?=.)/g, "$1-");
}
