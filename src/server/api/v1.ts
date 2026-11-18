// API REST pública v1 — seção 13.2. Respostas e erros no formato {codigo, mensagem} (com
// `campos` em dados_invalidos, `motivo` em arquivo_invalido, `limite`/`usados` nos 429) e as
// representações públicas de envelope, signatário e evento: campos em português, iguais ao
// banco, sem caminho de arquivo, token, código de acesso, reserva nem chave de idempotência.
import "server-only";
import type { NextRequest } from "next/server";
import type { z } from "zod";
import { trackApiCall } from "@/server/analytics/client";
import { requireCredential, type MachineAuth } from "@/server/auth/api-credential";
import { copy } from "@/lib/copy";
import { LIMITE_ENVIOS_24H } from "@/lib/limits";
import type { EnvelopeRow, SignerRow } from "@/server/envelopes/drafts";
import { DraftError } from "@/server/envelopes/drafts";
import { getUsage } from "@/server/envelopes/usage";
import type { Account } from "@/server/db/accounts";
import { db } from "@/server/db/client";
import { errorCode } from "@/server/error-code";

type ApiCode = keyof typeof copy.api.errors;

// Resposta de erro. Recebe: código, status HTTP e campos extras. Devolve: Response.
export function apiError(codigo: ApiCode, status: number, extra: Record<string, unknown> = {}): Response {
  return Response.json({ codigo, mensagem: copy.api.errors[codigo], ...extra }, { status });
}

// Erros de validação do zod viram dados_invalidos com campos [{campo, motivo}].
export function invalidFields(error: z.ZodError): Response {
  const campos = error.issues.map((i) => ({ campo: i.path.join(".") || "corpo", motivo: i.code === "custom" ? i.message : i.code }));
  return apiError("dados_invalidos", 400, { campos });
}

const PDF_MOTIVOS = new Set(["nao_e_pdf", "grande_demais", "paginas_demais", "protegido_por_senha", "pagina_grande_demais", "url_recusada", "download_falhou", "arquivo_ausente"]);
const FIELD_OF: Record<string, string> = {
  email_repetido: "signatarios",
  assinantes_demais: "signatarios",
  copias_demais: "signatarios",
  sem_assinante: "signatarios",
  campos_demais: "campos",
  campo_invalido: "campos",
  titulo_nao_confere: "titulo",
};

// Traduz um erro do domínio para a resposta da API (13.2). Recebe: o erro e a conta (para o 429).
export async function apiErrorResponse(e: unknown, account?: Account): Promise<Response> {
  if (e instanceof DraftError) {
    const c = e.code;
    if (c === "nao_encontrado" || c === "arquivo_indisponivel") return apiError("nao_encontrado", 404);
    if (c === "status_mudou" || c === "envelope_mudou" || c === "convite_indisponivel") return apiError("status_mudou", 409);
    if (c === "envelope_congelado" || c === "limite_lembretes" || c === "prazo_encerrado") return apiError(c, 409);
    if (c === "lembrete_recente") return apiError(c, 429);
    if (c === "limite_diario" || c === "limite_do_nivel") {
      let extra: Record<string, number> = {};
      if (account) {
        if (c === "limite_do_nivel") {
          const u = await getUsage(account.id, account.nivel);
          extra = { limite: u.limit, usados: u.used };
        } else {
          const since = new Date(Date.now() - 86400_000).toISOString();
          const { count } = await db().from("as_envios").select("id", { count: "exact", head: true }).eq("conta_id", account.id).gt("enviado_em", since);
          extra = { limite: LIMITE_ENVIOS_24H, usados: count ?? 0 };
        }
      }
      return apiError(c, 429, extra);
    }
    if (c === "email_falhou") return apiError("email_falhou", 502);
    if (PDF_MOTIVOS.has(c)) return apiError("arquivo_invalido", 400, { motivo: c });
    if (FIELD_OF[c]) return apiError("dados_invalidos", 400, { campos: [{ campo: FIELD_OF[c], motivo: c }] });
    return apiError("dados_invalidos", 400, { campos: [{ campo: "corpo", motivo: c }] });
  }
  console.error("erro_interno_api", errorCode(e));
  return apiError("erro_interno", 500);
}

// Envelope como a API mostra (13.2).
export function envelopeJson(e: EnvelopeRow) {
  return {
    id: e.id,
    titulo: e.titulo,
    mensagem: e.mensagem,
    status: e.status,
    origem: e.origem,
    em_ordem: e.em_ordem,
    prazo_dias: e.prazo_dias,
    prazo_em: e.prazo_em,
    lembrete_cada_dias: e.lembrete_cada_dias,
    nome_arquivo: e.nome_arquivo,
    paginas: e.paginas,
    codigo_verificacao: e.codigo_verificacao,
    hash_original: e.hash_original,
    hash_final: e.hash_final,
    selo: e.selo,
    motivo_cancelamento: e.motivo_cancelamento,
    criado_em: e.criado_em,
    enviado_em: e.enviado_em,
    concluido_em: e.concluido_em,
    encerrado_em: e.encerrado_em,
  };
}

// Signatário como a API mostra (13.2: GET /envelopes/{id}).
export function signerJson(s: SignerRow) {
  return {
    id: s.id,
    nome: s.nome,
    email: s.email,
    papel: s.papel,
    ordem: s.ordem,
    status: s.status,
    assinado_em: s.assinado_em,
    recusado_em: s.recusado_em,
    motivo_recusa: s.motivo_recusa,
  };
}

// Envoltório de toda rota da v1: autentica pela chave de API (6.3) e traduz qualquer erro.
// Recebe: a requisição e o corpo da rota. Devolve: a resposta.
export async function apiRoute(req: NextRequest, handler: (auth: MachineAuth) => Promise<Response>): Promise<Response> {
  const auth = await requireCredential(req, ["api"]);
  if (auth instanceof Response) return auth;
  let res: Response;
  try {
    res = await handler(auth);
  } catch (e) {
    res = await apiErrorResponse(e, auth.account);
  }
  trackApiCall({ credentialId: auth.credentialId, email: auth.account.email }, req.nextUrl.pathname, res.status);
  return res;
}

// Cursor opaco da lista (13.2): a posição (criado_em, id) do último item entregue.
export function encodeCursor(criadoEm: string, id: string): string {
  return Buffer.from(JSON.stringify([criadoEm, id])).toString("base64url");
}
export function decodeCursor(cursor: string): { criadoEm: string; id: string } | null {
  try {
    const [criadoEm, id] = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (typeof criadoEm !== "string" || Number.isNaN(Date.parse(criadoEm)) || !/^[0-9a-f-]{36}$/.test(id)) return null;
    return { criadoEm, id };
  } catch {
    return null;
  }
}
