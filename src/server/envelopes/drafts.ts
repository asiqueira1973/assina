// Rascunho de envelope — épico 8.2, regras 11.1 e 11.2 (princípio 5: painel, API e MCP chamam
// estas funções; nenhuma regra mora só na tela).
// Toda função recebe o contaId da credencial ou da sessão e filtra por ele (seção 6.5): envelope
// de outra conta é "não encontrado", nunca "proibido".
import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  LEMBRETES_PERMITIDOS,
  LIMITE_ARQUIVO_BYTES,
  MAX_ASSINANTES,
  MAX_COPIAS,
  MENSAGEM_MAX,
  NOME_ARQUIVO_MAX,
  NOME_MAX,
  PRAZO_DIAS_MAX,
  PRAZO_DIAS_MIN,
  TITULO_MAX,
  UPLOAD_URL_SEGUNDOS,
} from "@/lib/limits";
import { track } from "@/server/analytics/client";
import { db } from "@/server/db/client";
import type { Database } from "@/server/db/types";
import { envelopePaths, storage } from "@/server/files/storage";
import { validatePdf, type PdfErrorCode } from "@/server/pdf/validate";
import { generateVerificationCode } from "./verification-code";

export type EnvelopeRow = Database["public"]["Tables"]["as_envelopes"]["Row"];
export type SignerRow = Database["public"]["Tables"]["as_signatarios"]["Row"];
type Origin = Database["public"]["Enums"]["as_origem"];
type Actor = Database["public"]["Enums"]["as_ator"];

/** Erro de negócio com código estável (vira { codigo } na resposta HTTP). */
export class DraftError extends Error {
  constructor(
    public code:
      | "nao_encontrado"
      | "envelope_congelado"
      | "arquivo_ausente"
      | "email_repetido"
      | "assinantes_demais"
      | "copias_demais"
      | "campos_demais"
      | "campo_invalido"
      | "status_mudou"
      | "envelope_mudou"
      | "sem_assinante"
      | "limite_diario"
      | "limite_do_nivel"
      | "convite_indisponivel"
      | "lembrete_recente"
      | "prazo_encerrado"
      | "limite_lembretes"
      | "titulo_nao_confere"
      | "email_falhou"
      | "arquivo_indisponivel"
      | "url_recusada"
      | "download_falhou"
      | PdfErrorCode,
  ) {
    super(code);
  }
}

export type RequestMeta = { ip: string | null; userAgent: string | null };

// Título a partir do nome do arquivo (8.2, passo 4): sem ".pdf", aparado e no tamanho máximo.
export function titleFromFilename(filename: string): string {
  const base = filename.replace(/\.pdf$/i, "").replace(/[_]+/g, " ").trim();
  return (base || "Documento").slice(0, TITULO_MAX);
}

// Cria o rascunho (com o evento "criado") e a URL de upload (8.2). Tenta de novo se o código de
// verificação sorteado já existir (colisão é raríssima, mas o banco tem unique).
// Recebe: conta, título, origem, ator e quem pediu. Devolve: o envelope e a URL de upload.
// deferAnalytics: a criação pela API e pelo MCP registra o evento só no fim, porque desfaz o
// rascunho se um passo seguinte falha (e esse rascunho não conta como criado).
export async function createDraft(contaId: string, input: { titulo: string; origem: Origin; ator: Actor; meta: RequestMeta; deferAnalytics?: boolean }) {
  let envelope: EnvelopeRow | null = null;
  for (let attempt = 0; attempt < 3 && !envelope; attempt++) {
    const { data, error } = await db().rpc("as_fn_cria_rascunho", {
      p_conta_id: contaId,
      p_titulo: input.titulo.slice(0, TITULO_MAX),
      p_origem: input.origem,
      p_codigo_verificacao: generateVerificationCode(),
      p_ator: input.ator,
      p_ip: input.meta.ip ?? undefined,
      p_user_agent: input.meta.userAgent ?? undefined,
    });
    if (error && error.code === "23505") continue;
    if (error) throw error;
    envelope = data as EnvelopeRow;
  }
  if (!envelope) throw new Error("codigo_verificacao_colidiu");
  if (!input.deferAnalytics) trackEnvelopeCreated(contaId, envelope.id, input.origem);
  const upload = await storage().createUploadUrl(envelopePaths(contaId, envelope.id).upload, "application/pdf", UPLOAD_URL_SEGUNDOS);
  return { envelope, upload };
}

// assina_envelope_criado (seção 21). Recebe: conta, envelope e origem.
export function trackEnvelopeCreated(contaId: string, envelopeId: string, origem: Origin): void {
  track("assina_envelope_criado", { quem: { conta: contaId }, chave: envelopeId, propriedades: { origem } });
}

// Lê um envelope da conta. Devolve: o envelope ou null (inclusive se for de outra conta).
export async function getEnvelope(contaId: string, envelopeId: string): Promise<EnvelopeRow | null> {
  if (!z.uuid().safeParse(envelopeId).success) return null;
  const { data, error } = await db().from("as_envelopes").select("*").eq("id", envelopeId).eq("conta_id", contaId).maybeSingle();
  if (error) throw error;
  return data;
}

// Lê os destinatários do envelope da conta, assinantes na ordem e cópias no fim.
export async function getSigners(contaId: string, envelopeId: string): Promise<SignerRow[]> {
  const { data, error } = await db()
    .from("as_signatarios")
    .select("*")
    .eq("envelope_id", envelopeId)
    .eq("conta_id", contaId)
    .order("papel", { ascending: true })
    .order("ordem", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// Lê o rascunho da conta ou lança: não existe/é de outra conta → nao_encontrado; já saiu de
// rascunho → envelope_congelado (princípio 2).
async function requireDraft(contaId: string, envelopeId: string): Promise<EnvelopeRow> {
  const envelope = await getEnvelope(contaId, envelopeId);
  if (!envelope) throw new DraftError("nao_encontrado");
  if (envelope.status !== "rascunho") throw new DraftError("envelope_congelado");
  return envelope;
}

export const DraftSettings = z
  .object({
    titulo: z.string().trim().min(1).max(TITULO_MAX),
    mensagem: z.string().trim().max(MENSAGEM_MAX).nullable(),
    em_ordem: z.boolean(),
    prazo_dias: z.number().int().min(PRAZO_DIAS_MIN).max(PRAZO_DIAS_MAX),
    lembrete_cada_dias: z.union([z.literal(LEMBRETES_PERMITIDOS[0]), z.literal(LEMBRETES_PERMITIDOS[1]), z.literal(LEMBRETES_PERMITIDOS[2]), z.null()]),
  })
  .partial();

// Atualiza as configurações do rascunho (PATCH 13.1). Mensagem vazia vira nula.
// Recebe: conta, envelope e os campos a mudar (já validados por DraftSettings). Devolve: o envelope.
export async function updateDraftSettings(contaId: string, envelopeId: string, input: z.infer<typeof DraftSettings>): Promise<EnvelopeRow> {
  await requireDraft(contaId, envelopeId);
  const patch = { ...input, ...(input.mensagem !== undefined ? { mensagem: input.mensagem || null } : {}) };
  const { data, error } = await db().from("as_envelopes").update(patch).eq("id", envelopeId).eq("conta_id", contaId).eq("status", "rascunho").select("*").maybeSingle();
  if (error) throw error;
  if (!data) throw new DraftError("envelope_congelado");
  return data;
}

// Gera uma URL nova de upload para trocar o arquivo do rascunho.
export async function newUploadUrl(contaId: string, envelopeId: string) {
  await requireDraft(contaId, envelopeId);
  return storage().createUploadUrl(envelopePaths(contaId, envelopeId).upload, "application/pdf", UPLOAD_URL_SEGUNDOS);
}

// Valida o arquivo recém-enviado e o torna o original do rascunho (8.2, regra 11.1).
// 1) Lê upload.pdf numa leitura só, limitada a 10 MB + 1 byte.
// 2) Valida esses bytes.
// 3) Grava **esses mesmos bytes** num caminho novo, por versão. Não move o objeto: a URL de
//    upload vale 2 h e o objeto poderia ser trocado entre a validação e o move (achado do
//    verifier no 8.2).
// 4) as_fn_anexa_arquivo aponta o envelope para o arquivo novo numa transação, com o envelope
//    travado e ainda em rascunho, apagando os campos se havia arquivo antes.
// 5) Apaga o original anterior.
// Arquivo inválido: apaga o upload; o original anterior continua.
// Recebe: conta, envelope e o nome do arquivo escolhido. Devolve: o envelope, se os campos foram
// removidos e se o PDF já tinha assinatura digital (aviso 11.1). retitle: o título passa a vir do
// nome deste arquivo (8.2, passo 4), para a nova tentativa depois de um arquivo recusado.
export async function attachUploadedFile(contaId: string, envelopeId: string, filename: string, opts: { retitle?: boolean } = {}) {
  await requireDraft(contaId, envelopeId);
  const paths = envelopePaths(contaId, envelopeId);

  let bytes: Uint8Array | null;
  try {
    bytes = await storage().read(paths.upload, LIMITE_ARQUIVO_BYTES);
  } catch (e) {
    if (e instanceof Error && e.message === "arquivo_grande") {
      await storage().delete(paths.upload);
      throw new DraftError("grande_demais");
    }
    throw e;
  }
  if (!bytes) throw new DraftError("arquivo_ausente");
  await storage().delete(paths.upload);

  const check = await validatePdf(bytes);
  if (!check.ok) throw new DraftError(check.code);

  const newPath = paths.original(randomUUID());
  await storage().write(newPath, bytes, "application/pdf");

  const { data, error } = await db().rpc("as_fn_anexa_arquivo", {
    p_envelope_id: envelopeId,
    p_conta_id: contaId,
    p_caminho: newPath,
    p_nome: filename.slice(0, NOME_ARQUIVO_MAX),
    p_tamanho: bytes.length,
    p_paginas: check.pages,
    p_dimensoes: check.dimensions,
  });
  if (error) {
    // O envelope saiu de rascunho (ou de alcance) no meio do caminho: o arquivo novo não vale.
    await storage().delete(newPath);
    if (error.message === "nao_encontrado" || error.message === "envelope_congelado") throw new DraftError(error.message);
    throw error;
  }
  const row = data?.[0];
  if (row?.caminho_anterior && row.caminho_anterior !== newPath) await storage().delete(row.caminho_anterior);

  const envelope = opts.retitle ? await updateDraftSettings(contaId, envelopeId, { titulo: titleFromFilename(filename) }) : await getEnvelope(contaId, envelopeId);
  if (!envelope) throw new DraftError("nao_encontrado");
  return { envelope, fieldsRemoved: !!row?.campos_removidos, alreadySigned: check.alreadySigned };
}

export const SignerInput = z.object({
  nome: z.string().trim().min(1).max(NOME_MAX),
  email: z.string().trim().toLowerCase().pipe(z.email()),
  papel: z.enum(["assinar", "copia"]).default("assinar"),
  exigir_cpf: z.boolean().default(false),
});
export const SignerList = z.array(SignerInput).max(MAX_ASSINANTES + MAX_COPIAS);

// Troca a lista de destinatários do rascunho (regra 11.2), pela função do banco que preserva
// quem continua e renumera a ordem. Recebe: conta, envelope e a lista validada.
// Devolve: os destinatários como ficaram. Lança DraftError com o código do banco.
export async function replaceSigners(contaId: string, envelopeId: string, list: z.infer<typeof SignerList>): Promise<SignerRow[]> {
  if (!z.uuid().safeParse(envelopeId).success) throw new DraftError("nao_encontrado");
  const emails = list.map((s) => s.email);
  if (new Set(emails).size !== emails.length) throw new DraftError("email_repetido");
  if (list.filter((s) => s.papel === "assinar").length > MAX_ASSINANTES) throw new DraftError("assinantes_demais");
  if (list.filter((s) => s.papel === "copia").length > MAX_COPIAS) throw new DraftError("copias_demais");

  const { data, error } = await db().rpc("as_fn_substitui_signatarios", { p_envelope_id: envelopeId, p_conta_id: contaId, p_lista: list });
  if (error) {
    const known = ["nao_encontrado", "envelope_congelado", "email_repetido", "assinantes_demais", "copias_demais"] as const;
    const code = known.find((k) => error.message === k);
    if (code) throw new DraftError(code);
    throw error;
  }
  return (data ?? []) as SignerRow[];
}
