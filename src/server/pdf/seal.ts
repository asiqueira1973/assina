// Selo de integridade da plataforma — regra 11.10 (PAdES, SubFilter ETSI.CAdES.detached).
// - O placeholder de 24 KB entra pelo @signpdf/placeholder-pdf-lib; o @signpdf/signpdf calcula o
//   ByteRange e chama o nosso CadesSigner, que monta o CMS SignedData com node-forge.
// - CMS de PAdES B-B: atributos assinados contentType, messageDigest e signingCertificateV2
//   (ESS, RFC 5035), sem signingTime (a hora vai no /M do dicionário da assinatura).
// - B-T: se SELO_TSA_URL existe, pede o carimbo do tempo RFC 3161 sobre o valor da assinatura com
//   timeout de 5 s e o guarda como atributo não assinado (id-aa-timeStampToken). Se a TSA não
//   responder, o selo sai B-B e o envelope conclui mesmo assim.
// O certificado vem de SELO_P12_BASE64 / SELO_P12_SENHA (25.2: autoassinado no MVP).
import "server-only";
import { createHash, randomBytes } from "node:crypto";
import forge from "node-forge";
import type { PDFDocument } from "pdf-lib";
import { pdflibAddPlaceholder } from "@signpdf/placeholder-pdf-lib";
import { SignPdf } from "@signpdf/signpdf";
import { Signer, SUBFILTER_ETSI_CADES_DETACHED } from "@signpdf/utils";
import { SELO_PLACEHOLDER_BYTES, TSA_TIMEOUT_MS } from "@/lib/limits";
import { copy } from "@/lib/copy";

const { asn1, pki } = forge;
const OID = {
  data: "1.2.840.113549.1.7.1",
  signedData: "1.2.840.113549.1.7.2",
  contentType: "1.2.840.113549.1.9.3",
  messageDigest: "1.2.840.113549.1.9.4",
  signingCertificateV2: "1.2.840.113549.1.9.16.2.47",
  timeStampToken: "1.2.840.113549.1.9.16.2.14",
  sha256: "2.16.840.1.101.3.4.2.1",
  rsaEncryption: "1.2.840.113549.1.1.1",
};

export type SealCredentials = { p12Base64: string; password: string };
export type SealLevel = "B-B" | "B-T";

// Lê o certificado e a chave do P12. Recebe: base64 e senha. Devolve: certificado e chave RSA.
// Lança "selo_sem_certificado" se o P12 não tiver os dois.
function loadP12({ p12Base64, password }: SealCredentials): { cert: forge.pki.Certificate; key: forge.pki.rsa.PrivateKey } {
  const p12 = forge.pkcs12.pkcs12FromAsn1(asn1.fromDer(forge.util.decode64(p12Base64)), password);
  const cert = p12.getBags({ bagType: pki.oids.certBag })[pki.oids.certBag]?.[0]?.cert;
  const key = p12.getBags({ bagType: pki.oids.pkcs8ShroudedKeyBag })[pki.oids.pkcs8ShroudedKeyBag]?.[0]?.key;
  if (!cert || !key) throw new Error("selo_sem_certificado");
  return { cert, key: key as forge.pki.rsa.PrivateKey };
}

// Credenciais do ambiente. Devolve: as credenciais; lança "selo_sem_certificado" se faltarem.
export function sealCredentialsFromEnv(): SealCredentials {
  const p12Base64 = process.env.SELO_P12_BASE64;
  if (!p12Base64) throw new Error("selo_sem_certificado");
  return { p12Base64, password: process.env.SELO_P12_SENHA ?? "" };
}

const seq = (v: forge.asn1.Asn1[]) => asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, v);
// SET OF em DER: elementos em ordem crescente da codificação (X.690, 11.6). Os atributos
// assinados entram no hash nessa ordem; fora dela, um verificador estrito recusa o selo.
const set = (v: forge.asn1.Asn1[]) => {
  const sorted = v.map((x) => ({ x, der: asn1.toDer(x).getBytes() })).sort((a, b) => (a.der < b.der ? -1 : a.der > b.der ? 1 : 0));
  return asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SET, true, sorted.map((s) => s.x));
};
const oid = (o: string) => asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OID, false, asn1.oidToDer(o).getBytes());
const octets = (bytes: string) => asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OCTETSTRING, false, bytes);
const int = (bytes: string) => asn1.create(asn1.Class.UNIVERSAL, asn1.Type.INTEGER, false, bytes);
const nul = () => asn1.create(asn1.Class.UNIVERSAL, asn1.Type.NULL, false, "");
const attr = (type: string, value: forge.asn1.Asn1) => seq([oid(type), set([value])]);
const sha256Alg = () => seq([oid(OID.sha256), nul()]);
const binary = (b: Buffer | Uint8Array) => Buffer.from(b).toString("binary");

// Pede o carimbo do tempo RFC 3161 (TimeStampReq com SHA-256 e certReq). Recebe: URL e os bytes
// carimbados (o valor da assinatura). Devolve: o TimeStampToken (ContentInfo) ou null se a TSA
// falhar, demorar mais de 5 s ou não conceder (status diferente de 0 e 1).
export async function requestTimestamp(url: string, signature: string): Promise<forge.asn1.Asn1 | null> {
  const digest = createHash("sha256").update(Buffer.from(signature, "binary")).digest("binary");
  const nonce = randomBytes(8);
  nonce[0] &= 0x7f; // INTEGER positivo
  const req = seq([
    int(String.fromCharCode(1)),
    seq([sha256Alg(), octets(digest)]),
    int(binary(nonce)),
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.BOOLEAN, false, String.fromCharCode(0xff)),
  ]);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/timestamp-query" },
      body: Buffer.from(asn1.toDer(req).getBytes(), "binary"),
      signal: AbortSignal.timeout(TSA_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const resp = asn1.fromDer(Buffer.from(await res.arrayBuffer()).toString("binary"));
    const [statusInfo, token] = resp.value as forge.asn1.Asn1[];
    const status = (statusInfo.value as forge.asn1.Asn1[])[0].value as string;
    const code = status.length ? status.charCodeAt(status.length - 1) : -1;
    if ((code !== 0 && code !== 1) || !token) return null;
    return token;
  } catch {
    return null;
  }
}

// Signer do @signpdf que monta o CMS (CAdES detached) e anota o nível alcançado.
class CadesSigner extends Signer {
  level: SealLevel = "B-B";
  constructor(
    private cert: forge.pki.Certificate,
    private key: forge.pki.rsa.PrivateKey,
    private tsaUrl: string | undefined,
  ) {
    super();
  }

  // Recebe: os bytes cobertos pelo ByteRange. Devolve: o CMS em DER.
  async sign(content: Buffer): Promise<Buffer> {
    const certDer = asn1.toDer(pki.certificateToAsn1(this.cert)).getBytes();
    const certHash = createHash("sha256").update(Buffer.from(certDer, "binary")).digest("binary");
    const contentHash = createHash("sha256").update(content).digest("binary");

    const signedAttrs = [
      attr(OID.contentType, oid(OID.data)),
      attr(OID.messageDigest, octets(contentHash)),
      // SigningCertificateV2 { certs SEQUENCE OF ESSCertIDv2 { certHash } } (SHA-256 é o padrão e fica implícito)
      attr(OID.signingCertificateV2, seq([seq([seq([octets(certHash)])])])),
    ];
    // A assinatura cobre o SET dos atributos (tag SET), não o [0] IMPLICIT; o [0] gravado leva os
    // mesmos atributos na mesma ordem DER, senão o verificador recalcula outro hash.
    const attrsSet = set(signedAttrs);
    const md = forge.md.sha256.create();
    md.update(asn1.toDer(attrsSet).getBytes());
    const signature = this.key.sign(md);

    const signerInfo: forge.asn1.Asn1[] = [
      int(String.fromCharCode(1)),
      seq([
        pki.distinguishedNameToAsn1(this.cert.issuer),
        int(forge.util.hexToBytes(this.cert.serialNumber)),
      ]),
      sha256Alg(),
      asn1.create(asn1.Class.CONTEXT_SPECIFIC, 0, true, attrsSet.value as forge.asn1.Asn1[]),
      seq([oid(OID.rsaEncryption), nul()]),
      octets(signature),
    ];
    this.level = "B-B";
    if (this.tsaUrl) {
      const token = await requestTimestamp(this.tsaUrl, signature);
      if (token) {
        signerInfo.push(asn1.create(asn1.Class.CONTEXT_SPECIFIC, 1, true, [attr(OID.timeStampToken, token)]));
        this.level = "B-T";
      }
    }

    const signedData = seq([
      int(String.fromCharCode(1)),
      set([sha256Alg()]),
      seq([oid(OID.data)]),
      asn1.create(asn1.Class.CONTEXT_SPECIFIC, 0, true, [pki.certificateToAsn1(this.cert)]),
      set([seq(signerInfo)]),
    ]);
    const contentInfo = seq([oid(OID.signedData), asn1.create(asn1.Class.CONTEXT_SPECIFIC, 0, true, [signedData])]);
    return Buffer.from(asn1.toDer(contentInfo).getBytes(), "binary");
  }
}

// Sela o documento (regra 11.10). Recebe: o PDF já com campos e manifesto (pdf-lib), as
// credenciais e a URL da TSA (opcional). Devolve: os bytes selados e o nível (B-B ou B-T).
export async function sealPdf(
  pdfDoc: PDFDocument,
  creds: SealCredentials,
  tsaUrl: string | undefined,
): Promise<{ bytes: Uint8Array; level: SealLevel }> {
  const { cert, key } = loadP12(creds);
  pdflibAddPlaceholder({
    pdfDoc,
    reason: copy.seal.reason,
    contactInfo: "",
    name: copy.seal.name,
    location: copy.seal.location,
    signatureLength: SELO_PLACEHOLDER_BYTES,
    subFilter: SUBFILTER_ETSI_CADES_DETACHED,
    appName: "Assina",
  });
  // O @signpdf procura o ByteRange no texto do PDF: sem object streams.
  const unsigned = Buffer.from(await pdfDoc.save({ useObjectStreams: false }));
  const signer = new CadesSigner(cert, key, tsaUrl || undefined);
  const signed = await new SignPdf().sign(unsigned, signer);
  return { bytes: new Uint8Array(signed), level: signer.level };
}

// Separa o CMS e os bytes cobertos de um PDF selado. Devolve null se não há selo legível.
function readSeal(pdf: Uint8Array): { covered: Buffer; signedData: forge.asn1.Asn1[] } | null {
  const buf = Buffer.from(pdf);
  const latin = buf.toString("latin1");
  const m = /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/.exec(latin.slice(latin.lastIndexOf("/ByteRange")));
  if (!m) return null;
  const [a, b, c, d] = m.slice(1).map(Number);
  if (a !== 0 || c + d !== buf.length || c <= a + b) return null;
  const covered = Buffer.concat([buf.subarray(a, a + b), buf.subarray(c, c + d)]);
  // /Contents <hex>: o placeholder sobra em zeros depois do DER, então o parser para no fim do CMS.
  const cms = (asn1.fromDer as unknown as (b: string, o: object) => forge.asn1.Asn1)(forge.util.hexToBytes(latin.slice(a + b + 1, c - 1)), { strict: false, parseAllBytes: false });
  const signedData = ((cms.value as forge.asn1.Asn1[])[1].value as forge.asn1.Asn1[])[0].value as forge.asn1.Asn1[];
  return { covered, signedData };
}

const attrOid = (x: forge.asn1.Asn1) => asn1.derToOid((x.value as forge.asn1.Asn1[])[0].value as string);

// Confere o selo de um PDF (testes e diagnóstico): o messageDigest bate com os bytes do
// ByteRange e a assinatura RSA sobre os atributos confere com o certificado embutido.
// Recebe: os bytes. Devolve: true se íntegro.
export function verifySeal(pdf: Uint8Array): boolean {
  try {
    const seal = readSeal(pdf);
    if (!seal) return false;
    const cert = pki.certificateFromAsn1((seal.signedData[3].value as forge.asn1.Asn1[])[0]);
    const signerInfo = (seal.signedData[4].value as forge.asn1.Asn1[])[0].value as forge.asn1.Asn1[];
    const attrs = signerInfo[3].value as forge.asn1.Asn1[];
    const digestAttr = attrs.find((x) => attrOid(x) === OID.messageDigest);
    const digest = ((digestAttr!.value as forge.asn1.Asn1[])[1].value as forge.asn1.Asn1[])[0].value as string;
    if (digest !== createHash("sha256").update(seal.covered).digest("binary")) return false;
    // Hash sobre os atributos exatamente como gravados (o [0] com a tag trocada por SET), sem
    // reordenar: um selo com o SET fora da ordem DER falha aqui, como num verificador estrito.
    const raw = asn1.toDer(signerInfo[3]).getBytes();
    const md = forge.md.sha256.create();
    md.update(String.fromCharCode(0x31) + raw.slice(1));
    return (cert.publicKey as forge.pki.rsa.PublicKey).verify(md.digest().bytes(), signerInfo[5].value as string);
  } catch {
    return false;
  }
}

// O selo tem carimbo do tempo (B-T)? Recebe: os bytes do PDF selado. Devolve: true se tem.
export function sealHasTimestamp(pdf: Uint8Array): boolean {
  const seal = readSeal(pdf);
  if (!seal) return false;
  const signerInfo = (seal.signedData[4].value as forge.asn1.Asn1[])[0].value as forge.asn1.Asn1[];
  const unsigned = signerInfo.find((x) => x.tagClass === asn1.Class.CONTEXT_SPECIFIC && x.type === 1);
  return !!unsigned && (unsigned.value as forge.asn1.Asn1[]).some((x) => attrOid(x) === OID.timeStampToken);
}

// OIDs dos atributos assinados na ordem em que estão no selo (testes da ordem DER).
export function signedAttributeOids(pdf: Uint8Array): string[] {
  const seal = readSeal(pdf);
  if (!seal) return [];
  const signerInfo = (seal.signedData[4].value as forge.asn1.Asn1[])[0].value as forge.asn1.Asn1[];
  return (signerInfo[3].value as forge.asn1.Asn1[]).map(attrOid);
}
