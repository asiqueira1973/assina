// Certificado autoassinado para os testes do selo (regra 11.10), gerado uma vez por processo
// com node-forge, no mesmo formato do `npm run selo:gerar`.
import { generateKeyPairSync, randomBytes } from "node:crypto";
import forge from "node-forge";

let cached: { p12Base64: string; password: string } | null = null;

export function testSealCredentials(): { p12Base64: string; password: string } {
  if (cached) return cached;
  // A chave sai do crypto nativo (milissegundos), não do node-forge (segundos em JS puro).
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const keys = {
    privateKey: forge.pki.privateKeyFromPem(privateKey.export({ type: "pkcs1", format: "pem" }) as string) as forge.pki.rsa.PrivateKey,
    publicKey: forge.pki.publicKeyFromPem(publicKey.export({ type: "spki", format: "pem" }) as string) as forge.pki.rsa.PublicKey,
  };
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01" + randomBytes(8).toString("hex");
  cert.validity.notBefore = new Date(Date.now() - 60_000);
  cert.validity.notAfter = new Date(Date.now() + 86400_000);
  const subject = [{ name: "commonName", value: "Assina (teste)" }];
  cert.setSubject(subject);
  cert.setIssuer(subject);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  const password = "teste";
  const p12 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], password, { algorithm: "aes256" });
  cached = { p12Base64: forge.util.encode64(forge.asn1.toDer(p12).getBytes()), password };
  return cached;
}
