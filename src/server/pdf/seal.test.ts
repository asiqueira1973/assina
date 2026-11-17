// Regra 11.10 e critérios 8.6: selo PAdES com o .p12 de teste; alterar 1 byte quebra a
// verificação; TSA fora do ar → B-B.
import { createServer } from "node:http";
import forge from "node-forge";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { testSealCredentials } from "../../../tests/fixtures/seal";
import { makePdf } from "../../../tests/fixtures/pdfs";
import { sealHasTimestamp, sealPdf, signedAttributeOids, verifySeal } from "./seal";

async function sealed(tsa?: string) {
  const doc = await PDFDocument.load(await makePdf(2));
  return sealPdf(doc, testSealCredentials(), tsa);
}

describe("selo (regra 11.10)", () => {
  it("assina com ETSI.CAdES.detached e a verificação confere", async () => {
    const { bytes, level } = await sealed();
    expect(level).toBe("B-B");
    const text = Buffer.from(bytes).toString("latin1");
    expect(text).toContain("/SubFilter /ETSI.CAdES.detached");
    expect(text).toContain("Selo de integridade Assina");
    expect(verifySeal(bytes)).toBe(true);
    expect(sealHasTimestamp(bytes)).toBe(false);
    // O PDF selado ainda abre e mantém as páginas.
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(2);
  });

  it("atributos assinados em ordem DER (o SET gravado é o mesmo que foi assinado)", async () => {
    const { bytes } = await sealed();
    // contentType (30 18…) < messageDigest (30 2F…) < signingCertificateV2 (30 37…)
    expect(signedAttributeOids(bytes)).toEqual(["1.2.840.113549.1.9.3", "1.2.840.113549.1.9.4", "1.2.840.113549.1.9.16.2.47"]);
  });

  it("alterar 1 byte coberto faz a verificação falhar", async () => {
    const { bytes } = await sealed();
    const tampered = new Uint8Array(bytes);
    tampered[200] ^= 0x01;
    expect(verifySeal(tampered)).toBe(false);
  });

  it("TSA fora do ar → B-B, e o selo continua válido", async () => {
    const { bytes, level } = await sealed("http://127.0.0.1:9/tsa");
    expect(level).toBe("B-B");
    expect(verifySeal(bytes)).toBe(true);
  });

  it("TSA que responde (status 0): B-T, com o carimbo no CMS e o selo íntegro", async () => {
    const { asn1 } = forge;
    const seq = (v: forge.asn1.Asn1[]) => asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, v);
    const int = (n: number) => asn1.create(asn1.Class.UNIVERSAL, asn1.Type.INTEGER, false, String.fromCharCode(n));
    // TimeStampResp mínima: PKIStatusInfo { granted } e um token ContentInfo (signedData vazio).
    const token = seq([asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OID, false, asn1.oidToDer("1.2.840.113549.1.7.2").getBytes()), asn1.create(asn1.Class.CONTEXT_SPECIFIC, 0, true, [seq([])])]);
    const body = (status: number) => Buffer.from(asn1.toDer(seq([seq([int(status)]), ...(status === 0 ? [token] : [])])).getBytes(), "binary");
    let status = 0;
    let contentType = "";
    const server = createServer((req, res) => {
      contentType = req.headers["content-type"] ?? "";
      req.resume();
      req.on("end", () => res.end(body(status)));
    }).listen(0);
    const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/`;
    try {
      const ok = await sealed(url);
      expect(contentType).toBe("application/timestamp-query");
      expect(ok.level).toBe("B-T");
      expect(sealHasTimestamp(ok.bytes)).toBe(true);
      expect(verifySeal(ok.bytes)).toBe(true);
      status = 2; // rejection
      const rejected = await sealed(url);
      expect(rejected.level).toBe("B-B");
      expect(sealHasTimestamp(rejected.bytes)).toBe(false);
    } finally {
      server.close();
    }
  });

  it("assinatura RSA adulterada (hash do conteúdo intacto) falha", async () => {
    const { bytes } = await sealed();
    const latin = Buffer.from(bytes).toString("latin1");
    const start = latin.lastIndexOf("/Contents <") + "/Contents <".length;
    const hex = latin.slice(start, latin.indexOf(">", start)).replace(/0+$/, "");
    // O fim do DER (sem atributos não assinados) é o valor da assinatura RSA.
    const pos = start + hex.length - 6;
    const tampered = Buffer.from(bytes);
    tampered[pos] = tampered[pos] === 0x31 ? 0x32 : 0x31;
    expect(verifySeal(new Uint8Array(tampered))).toBe(false);
  });

  it("TSA que responde com erro → B-B", async () => {
    const server = createServer((_req, res) => {
      res.statusCode = 500;
      res.end();
    }).listen(0);
    const port = (server.address() as { port: number }).port;
    try {
      expect((await sealed(`http://127.0.0.1:${port}/`)).level).toBe("B-B");
    } finally {
      server.close();
    }
  });
});
