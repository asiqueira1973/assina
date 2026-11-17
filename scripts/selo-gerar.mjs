// npm run selo:gerar — gera um certificado autoassinado .p12 para o selo em dev (regra 11.10,
// pendência 25.2) e imprime as linhas de SELO_P12_BASE64 e SELO_P12_SENHA para o .env.local.
// Nunca grava arquivo: o certificado só existe na saída deste comando.
import { randomBytes } from "node:crypto";
import forge from "node-forge";

const keys = forge.pki.rsa.generateKeyPair(2048);
const cert = forge.pki.createCertificate();
cert.publicKey = keys.publicKey;
cert.serialNumber = "01" + randomBytes(8).toString("hex");
cert.validity.notBefore = new Date();
cert.validity.notAfter = new Date(Date.now() + 5 * 365 * 86400_000);
const subject = [
  { name: "commonName", value: "Assina (dev)" },
  { name: "organizationName", value: "DabLab" },
  { name: "countryName", value: "BR" },
];
cert.setSubject(subject);
cert.setIssuer(subject);
cert.setExtensions([
  { name: "basicConstraints", cA: false },
  { name: "keyUsage", digitalSignature: true, nonRepudiation: true },
  { name: "extKeyUsage", emailProtection: true },
]);
cert.sign(keys.privateKey, forge.md.sha256.create());

const senha = randomBytes(12).toString("base64url");
const p12 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], senha, { algorithm: "aes256", friendlyName: "Assina" });
const b64 = forge.util.encode64(forge.asn1.toDer(p12).getBytes());
console.log(`SELO_P12_BASE64=${b64}`);
console.log(`SELO_P12_SENHA=${senha}`);
