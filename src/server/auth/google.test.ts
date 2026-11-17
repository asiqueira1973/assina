// Seção 6.1: escopos básicos, PKCE S256 e validação do id_token (inclusive email_verified).
import { createHash } from "node:crypto";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from "jose";
import { describe, expect, it } from "vitest";
import { buildAuthUrl, createPkce, verifyIdToken } from "./google";

const { publicKey, privateKey } = await generateKeyPair("RS256");
const jwk = { ...(await exportJWK(publicKey)), kid: "k1", alg: "RS256" };
const jwks = createLocalJWKSet({ keys: [jwk] });

// Monta um id_token como o do Google. Recebe: campos a sobrescrever.
async function idToken(claims: Record<string, unknown> = {}) {
  return new SignJWT({ email: "Ana@Teste.dev", email_verified: true, name: "Ana", ...claims })
    .setProtectedHeader({ alg: "RS256", kid: "k1" })
    .setSubject("sub-ana")
    .setIssuer("https://accounts.google.com")
    .setAudience(process.env.GOOGLE_CLIENT_ID!)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);
}

describe("login com Google (seção 6.1)", () => {
  it("URL pede só openid email profile, sem offline, com PKCE S256 e state", () => {
    const url = new URL(buildAuthUrl("estado", "desafio"));
    expect(url.searchParams.get("scope")).toBe("openid email profile");
    expect(url.searchParams.get("access_type")).toBeNull();
    expect(url.searchParams.get("code_challenge")).toBe("desafio");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("state")).toBe("estado");
    expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:3030/api/auth/google/callback");
  });

  it("challenge é o SHA-256 do verifier em base64url", () => {
    const { verifier, challenge } = createPkce();
    expect(challenge).toBe(createHash("sha256").update(verifier).digest("base64url"));
  });

  it("id_token válido devolve sub, e-mail em minúsculas e nome", async () => {
    expect(await verifyIdToken(await idToken(), jwks)).toEqual({ sub: "sub-ana", email: "ana@teste.dev", name: "Ana" });
  });

  it("e-mail não verificado pelo Google é recusado", async () => {
    await expect(verifyIdToken(await idToken({ email_verified: false }), jwks)).rejects.toThrow("email_nao_verificado");
  });

  it("id_token de outro cliente (aud) é recusado", async () => {
    const token = await new SignJWT({ email: "a@b.dev", email_verified: true })
      .setProtectedHeader({ alg: "RS256", kid: "k1" })
      .setSubject("s")
      .setIssuer("https://accounts.google.com")
      .setAudience("outro-cliente")
      .setExpirationTime("5m")
      .sign(privateKey);
    await expect(verifyIdToken(token, jwks)).rejects.toThrow();
  });
});
