// Seção 6.3 e regra 11.8: formato da chave de API e o que é guardado.
import { describe, expect, it } from "vitest";
import { decryptSecret } from "@/server/crypto/aes";
import { generateApiKey, hashCredential } from "./api-key";

describe("chave de API (regra 11.8)", () => {
  it("formato assina_ + 32 bytes em base64url", () => {
    const key = generateApiKey();
    expect(key.value).toMatch(/^assina_[A-Za-z0-9_-]{43}$/);
  });

  it("guarda hash SHA-256, prefixo de 12 e valor cifrado que volta igual", () => {
    const key = generateApiKey();
    expect(key.hash).toBe(hashCredential(key.value));
    expect(key.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(key.prefix).toBe(key.value.slice(0, 12));
    expect(key.sealed).not.toContain(key.value);
    expect(decryptSecret(key.sealed)).toBe(key.value);
  });

  it("duas chaves nunca se repetem", () => {
    expect(generateApiKey().value).not.toBe(generateApiKey().value);
  });
});
