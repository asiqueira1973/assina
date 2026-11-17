// Código de verificação digitado pela pessoa (regra 11.11): roda no cliente e no servidor.
// Aceita minúsculas, espaços e hífens (o manifesto mostra XXXX-XXXX-XXXX) e as trocas que o base32
// Crockford prevê para quem lê em papel: O → 0, I e L → 1.

const CODE = /^[0-9A-HJKMNP-TV-Z]{12}$/;

// Normaliza. Recebe: o texto digitado. Devolve: os 12 caracteres ou null se não for um código.
export function normalizeVerificationCode(input: string): string | null {
  const code = input
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
  return CODE.test(code) ? code : null;
}
