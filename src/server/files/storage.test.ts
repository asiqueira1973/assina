// Seção 18 / épico 8.2: drivers do ArquivoStorage. R2: URL pré-assinada calculada offline.
// Local: assinatura HMAC, validade e confinamento na pasta.
import { describe, expect, it } from "vitest";
import { localFilePath, signLocal, verifyLocal } from "./local";
import { r2StorageDriver } from "./r2";

describe("driver R2 (sem rede)", () => {
  const r2 = r2StorageDriver({ accountId: "conta123", accessKeyId: "AKIATESTE", secretAccessKey: "segredo", bucket: "assina-documentos" });

  it("URL de upload pré-assinada, no bucket e caminho certos, com a validade pedida", async () => {
    const { url, expiresAt } = await r2.createUploadUrl("c1/e1/upload.pdf", "application/pdf", 7200);
    const u = new URL(url);
    expect(u.hostname).toBe("conta123.r2.cloudflarestorage.com");
    expect(u.pathname).toBe("/assina-documentos/c1/e1/upload.pdf");
    expect(u.searchParams.get("X-Amz-Expires")).toBe("7200");
    expect(u.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now() + 7100_000);
  });

  it("URL de download pede o nome do arquivo no Content-Disposition", async () => {
    const { url } = await r2.createDownloadUrl("c1/e1/final.pdf", 300, "Contrato assinado.pdf");
    expect(new URL(url).searchParams.get("response-content-disposition")).toContain("Contrato%20assinado.pdf");
  });
});

describe("driver local (dev e testes)", () => {
  it("assinatura confere e vence", () => {
    const exp = Math.floor(Date.now() / 1000) + 60;
    const sig = signLocal("put", "c/e/upload.pdf", exp);
    expect(verifyLocal("put", "c/e/upload.pdf", exp, sig)).toBe(true);
    expect(verifyLocal("get", "c/e/upload.pdf", exp, sig)).toBe(false);
    expect(verifyLocal("put", "c/e/outro.pdf", exp, sig)).toBe(false);
    expect(verifyLocal("put", "c/e/upload.pdf", exp, sig, (exp + 1) * 1000)).toBe(false);
  });

  it("não sai da pasta", () => {
    expect(() => localFilePath("../../etc/passwd")).toThrow("caminho_invalido");
    expect(localFilePath("c/e/original.pdf")).toContain(".armazenamento-local");
  });
});
