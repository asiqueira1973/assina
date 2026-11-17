// Mascaramento de dados pessoais para trilha e manifesto (regras 11.4 e 11.9): a***@dominio.com.
// Roda no cliente e no servidor.

// Mascara um e-mail: primeira letra do usuário + *** + @domínio. Devolve "***" se não parecer e-mail.
export function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!user || !domain) return "***";
  return `${user[0]}***@${domain}`;
}

// Mascara um CPF (regra 11.9): "52998224725" → "***.982.247-**". Devolve "***" se não tiver 11 dígitos.
export function maskCpf(cpf: string): string {
  const d = cpf.replace(/\D/g, "");
  if (d.length !== 11) return "***";
  return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;
}
