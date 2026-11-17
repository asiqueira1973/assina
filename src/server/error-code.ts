// Código de um erro para log e para a coluna "erro" das notificações (seção 17: nada de dado
// pessoal em log). Recebe: qualquer erro. Devolve: o código do Postgres/PostgREST, a mensagem
// quando ela é um código nosso conhecido (ex.: "resend_422"), ou só o nome da classe — nunca a
// mensagem livre, que pode trazer e-mail, IP ou valor digitado.
import "server-only";

const OUR_CODES = /^(resend_\d{3}|RESEND_API_KEY ausente)$/;

export function errorCode(e: unknown): string {
  if (e && typeof e === "object" && "code" in e && typeof (e as { code: unknown }).code === "string") return (e as { code: string }).code;
  if (e instanceof Error) return OUR_CODES.test(e.message) ? e.message : e.name;
  return "erro";
}
