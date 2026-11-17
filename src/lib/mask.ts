// Mascaramento de dados pessoais para trilha e manifesto (regras 11.4 e 11.9): a***@dominio.com.
// Roda no cliente e no servidor.

// Mascara um e-mail: primeira letra do usuário + *** + @domínio. Devolve "***" se não parecer e-mail.
export function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!user || !domain) return "***";
  return `${user[0]}***@${domain}`;
}
