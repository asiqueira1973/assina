// Tradução dos erros do signatário para HTTP (seção 13.1): 400 dados, 401 sem sessão, 404 link,
// 409 situação mudou, 429 limites do código, 502 e-mail. Nunca devolve detalhe interno.
import "server-only";
import { errorCode } from "@/server/error-code";
import { SignerError } from "./actions";

const STATUS: Record<string, number> = {
  aguarde: 429,
  limite_hora: 429,
  indisponivel: 409,
  status_mudou: 409,
  prazo_encerrado: 409,
  link_invalido: 404,
  email_falhou: 502,
};

export function signerErrorResponse(e: unknown): Response {
  if (e instanceof SignerError) return Response.json({ codigo: e.code, ...e.extra }, { status: STATUS[e.code] ?? 400 });
  console.error("erro_interno_signatario", errorCode(e));
  return Response.json({ codigo: "erro_interno" }, { status: 500 });
}

export function noSession(): Response {
  return Response.json({ codigo: "sem_sessao" }, { status: 401 });
}
