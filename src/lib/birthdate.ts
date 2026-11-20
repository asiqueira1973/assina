// Data de nascimento do assinante — épico 8.14. Roda no cliente e no servidor; o banco confere a
// mesma regra em as_fn_assina: data real, não futura e de no máximo NASCIMENTO_IDADE_MAX anos.
import { NASCIMENTO_IDADE_MAX } from "./limits";

// Hoje em Brasília, como "AAAA-MM-DD" (o mesmo dia que o banco usa para comparar).
export function todayInBrasilia(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(now);
}

// Data mais antiga aceita: hoje menos NASCIMENTO_IDADE_MAX anos. Devolve "AAAA-MM-DD".
// Em 29/02, se o ano de 120 anos atrás não for bissexto, vale o 28/02, como no Postgres
// (date - interval '120 years').
export function oldestBirthdate(now: Date = new Date()): string {
  const [y, m, d] = todayInBrasilia(now).split("-").map(Number);
  let date = new Date(Date.UTC(y - NASCIMENTO_IDADE_MAX, m - 1, d));
  if (date.getUTCMonth() !== m - 1) date = new Date(Date.UTC(y - NASCIMENTO_IDADE_MAX, m, 0));
  return date.toISOString().slice(0, 10);
}

// Diz se a data é válida para assinar. Recebe "AAAA-MM-DD" (o valor do <input type="date">).
// Recusa formato errado, dia que não existe (31/02), data futura e mais de 120 anos atrás.
export function isValidBirthdate(value: string, now: Date = new Date()): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [y, m, d] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return false;
  return value <= todayInBrasilia(now) && value >= oldestBirthdate(now);
}

// Formata para exibição: "1985-03-15" → "15/03/1985".
export function formatBirthdate(value: string): string {
  const [y, m, d] = value.split("-");
  return `${d}/${m}/${y}`;
}
