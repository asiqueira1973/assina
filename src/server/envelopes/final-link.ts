// Link de download do PDF final para o e-mail de conclusão acima de 7 MB (critério 8.6, regra
// 11.14). O banco só guarda o hash do link do signatário, então o e-mail não pode repetir aquele
// link; trocar o token derrubaria a sessão de quem acabou de assinar e, numa retentativa do
// e-mail, deixaria a pessoa sem link nenhum (achado do verifier no 8.6). Este link é próprio,
// estável e só baixa o final: /api/final/{signatario_id}.{hmac}, com HMAC-SHA256 sobre o id
// (chave CHAVES_ENC_KEY, separada por domínio). A validade é a da regra 11.14 (30 dias depois de
// concluido_em), conferida na rota.
import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// Assina o id. Recebe: o signatário. Devolve: HMAC em base64url.
function mac(signatarioId: string): string {
  const key = process.env.CHAVES_ENC_KEY;
  if (!key) throw new Error("CHAVES_ENC_KEY ausente");
  return createHmac("sha256", key).update(`assina-final\n${signatarioId}`).digest("base64url");
}

// Link completo. Recebe: o signatário. Devolve: a URL.
export function finalDownloadLink(signatarioId: string): string {
  return `${process.env.NEXT_PUBLIC_SITE_URL}/api/final/${signatarioId}.${mac(signatarioId)}`;
}

// Confere a chave do link. Recebe: "{id}.{hmac}". Devolve: o id do signatário ou null.
export function readFinalDownloadKey(chave: string): string | null {
  const m = /^([0-9a-f-]{36})\.([A-Za-z0-9_-]{43})$/.exec(chave);
  if (!m) return null;
  const expected = Buffer.from(mac(m[1]));
  const given = Buffer.from(m[2]);
  return expected.length === given.length && timingSafeEqual(expected, given) ? m[1] : null;
}
