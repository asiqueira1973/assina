// Criação de envelope pela API (POST /api/v1/envelopes, seção 13.2; o MCP do 8.10 reaproveita).
// Sempre nasce rascunho (regra 11.15: criar nunca envia). Passos, com o rascunho desfeito se
// qualquer um falhar (a API não deixa rascunho pela metade):
//  1) Idempotency-Key repetida devolve o mesmo envelope (200), sem criar outro; se ele ainda é
//     rascunho sem arquivo, com uma upload_url nova (a resposta do 1º pedido pode ter se perdido);
//  2) cria o rascunho (origem e ator "api"); configurações, destinatários (na ordem de `ordem`,
//     quando vier) e, com `arquivo_url`, o arquivo (regra 11.18) e os campos (posicionados pelo
//     e-mail do destinatário; tamanho padrão da regra 11.3 quando largura e altura não vêm);
//  3) por último, grava a chave (índice único por conta). Assim uma repetição nunca recebe um
//     rascunho pela metade; numa corrida, o segundo apaga o seu e devolve o do primeiro.
// Sem `arquivo_url`, devolve a `upload_url` (PUT do PDF, 2 h) e o cliente chama /arquivo depois.
import "server-only";
import { z } from "zod";
import { FIELD_TYPES, defaultFieldSize } from "@/lib/fields";
import {
  ARQUIVO_URL_MAX,
  LEMBRETES_PERMITIDOS,
  MAX_ASSINANTES,
  MAX_COPIAS,
  MENSAGEM_MAX,
  NOME_ARQUIVO_MAX,
  NOME_MAX,
  PRAZO_DIAS_MAX,
  PRAZO_DIAS_MIN,
  ROTULO_MAX,
  TITULO_MAX,
} from "@/lib/limits";
import { db } from "@/server/db/client";
import type { Database } from "@/server/db/types";
import { createDraft, DraftError, getEnvelope, getSigners, newUploadUrl, replaceSigners, trackEnvelopeCreated, updateDraftSettings, type EnvelopeRow, type RequestMeta } from "./drafts";
import { replaceFields } from "./fields";
import { deleteEnvelope } from "./manage";
import { attachFromUrl, filenameFromUrl } from "./remote-file";

type Actor = Database["public"]["Enums"]["as_ator"];
type Origin = Database["public"]["Enums"]["as_origem"];

export const ApiCreateInput = z
  .object({
    titulo: z.string().trim().min(1).max(TITULO_MAX),
    mensagem: z.string().trim().max(MENSAGEM_MAX).nullish(),
    em_ordem: z.boolean().optional(),
    prazo_dias: z.number().int().min(PRAZO_DIAS_MIN).max(PRAZO_DIAS_MAX).optional(),
    lembrete_cada_dias: z.union([z.literal(LEMBRETES_PERMITIDOS[0]), z.literal(LEMBRETES_PERMITIDOS[1]), z.literal(LEMBRETES_PERMITIDOS[2]), z.null()]).optional(),
    arquivo_url: z.string().trim().max(ARQUIVO_URL_MAX).url().optional(),
    nome_arquivo: z.string().trim().min(1).max(NOME_ARQUIVO_MAX).optional(),
    signatarios: z
      .array(
        z.object({
          nome: z.string().trim().min(1).max(NOME_MAX),
          email: z.string().trim().toLowerCase().pipe(z.email()),
          papel: z.enum(["assinar", "copia"]).default("assinar"),
          ordem: z.number().int().min(1).max(MAX_ASSINANTES).optional(),
          exigir_cpf: z.boolean().default(false),
          exigir_nascimento: z.boolean().default(false),
        }),
      )
      .min(1)
      .max(MAX_ASSINANTES + MAX_COPIAS),
    campos: z
      .array(
        z.object({
          signatario_email: z.string().trim().toLowerCase().pipe(z.email()),
          tipo: z.enum(FIELD_TYPES),
          pagina: z.number().int().min(1),
          x: z.number().min(0).max(1),
          y: z.number().min(0).max(1),
          largura: z.number().gt(0).max(1).optional(),
          altura: z.number().gt(0).max(1).optional(),
          obrigatorio: z.boolean().optional(),
          rotulo: z.string().trim().max(ROTULO_MAX).nullish(),
        }),
      )
      .optional(),
  })
  .strict()
  // Campos precisam das páginas do arquivo: só junto com arquivo_url (com upload_url, o cliente
  // posiciona depois no editor; a API v1 não tem rota de campos).
  .refine((v) => !v.campos?.length || !!v.arquivo_url, { path: ["campos"], message: "exige_arquivo_url" });

export type ApiCreate = z.infer<typeof ApiCreateInput>;

// Cria (ou devolve, pela chave de idempotência). Recebe: conta, entrada validada, chave, quem
// pediu, origem e ator. Devolve: o envelope, a URL de upload (sem arquivo_url) e se já existia.
export async function createEnvelopeFromApi(
  contaId: string,
  input: ApiCreate,
  idempotencyKey: string | null,
  meta: RequestMeta,
  who: { origem: Origin; ator: Actor } = { origem: "api", ator: "api" },
): Promise<{ envelope: EnvelopeRow; uploadUrl: string | null; existing: boolean }> {
  if (idempotencyKey) {
    const found = await byKey(contaId, idempotencyKey);
    if (found) return { envelope: found, uploadUrl: await replayUploadUrl(contaId, found), existing: true };
  }

  const { envelope, upload } = await createDraft(contaId, { titulo: input.titulo, origem: who.origem, ator: who.ator, meta, deferAnalytics: true });
  try {
    const settings = {
      ...(input.mensagem !== undefined ? { mensagem: input.mensagem ?? null } : {}),
      ...(input.em_ordem !== undefined ? { em_ordem: input.em_ordem } : {}),
      ...(input.prazo_dias !== undefined ? { prazo_dias: input.prazo_dias } : {}),
      ...(input.lembrete_cada_dias !== undefined ? { lembrete_cada_dias: input.lembrete_cada_dias } : {}),
    };
    // Sem nenhuma configuração, nada a gravar (um update vazio não acha linha).
    if (Object.keys(settings).length) await updateDraftSettings(contaId, envelope.id, settings);
    // Assinantes na ordem de `ordem` (os sem ordem no fim, na ordem em que vieram); cópias depois.
    const ordered = input.signatarios
      .map((s, i) => ({ s, i }))
      .sort((a, b) => (a.s.ordem ?? 99) - (b.s.ordem ?? 99) || a.i - b.i)
      .map(({ s }) => ({ nome: s.nome, email: s.email, papel: s.papel, exigir_cpf: s.exigir_cpf, exigir_nascimento: s.exigir_nascimento }));
    await replaceSigners(contaId, envelope.id, ordered);

    if (input.arquivo_url) {
      const attached = await attachFromUrl(contaId, envelope.id, input.arquivo_url, input.nome_arquivo ?? filenameFromUrl(input.arquivo_url));
      if (input.campos?.length) {
        const signers = await getSigners(contaId, envelope.id);
        const idByEmail = new Map(signers.filter((s) => s.papel === "assinar").map((s) => [s.email, s.id]));
        const pages = (attached.envelope.dimensoes_paginas as { l: number; a: number }[] | null) ?? [];
        const fields = input.campos.map((c) => {
          const id = idByEmail.get(c.signatario_email);
          if (!id) throw new DraftError("campo_invalido");
          const page = pages[c.pagina - 1];
          if (!page) throw new DraftError("campo_invalido");
          const size = defaultFieldSize(c.tipo, page);
          return {
            signatario_id: id,
            tipo: c.tipo,
            pagina: c.pagina,
            x: c.x,
            y: c.y,
            largura: c.largura ?? size.largura,
            altura: c.altura ?? size.altura,
            obrigatorio: c.obrigatorio ?? true,
            rotulo: c.rotulo ?? null,
          };
        });
        if (fields.some((f) => f.x + f.largura > 1 || f.y + f.altura > 1)) throw new DraftError("campo_invalido");
        await replaceFields(contaId, envelope.id, fields);
      }
    }
    if (idempotencyKey) {
      const { error } = await db().from("as_envelopes").update({ chave_idempotencia: idempotencyKey }).eq("id", envelope.id).eq("conta_id", contaId);
      if (error?.code === "23505") {
        // Corrida com outro pedido de mesma chave, que terminou antes: vale o dele.
        await discard(contaId, envelope.id);
        const winner = await byKey(contaId, idempotencyKey);
        if (winner) return { envelope: winner, uploadUrl: await replayUploadUrl(contaId, winner), existing: true };
      }
      if (error) throw error;
    }
  } catch (e) {
    await discard(contaId, envelope.id);
    throw e;
  }
  trackEnvelopeCreated(contaId, envelope.id, who.origem);
  const fresh = await getEnvelope(contaId, envelope.id);
  return { envelope: fresh!, uploadUrl: input.arquivo_url ? null : upload.url, existing: false };
}

// URL de upload nova para a repetição de um rascunho que ainda não tem arquivo (ou null).
async function replayUploadUrl(contaId: string, e: EnvelopeRow): Promise<string | null> {
  if (e.status !== "rascunho" || e.arquivo_original_path) return null;
  return (await newUploadUrl(contaId, e.id)).url;
}

async function byKey(contaId: string, key: string): Promise<EnvelopeRow | null> {
  const { data, error } = await db().from("as_envelopes").select("*").eq("conta_id", contaId).eq("chave_idempotencia", key).maybeSingle();
  if (error) throw error;
  return data;
}

// Desfaz o rascunho que não terminou de nascer (linha, trilha e arquivos).
async function discard(contaId: string, envelopeId: string) {
  const e = await getEnvelope(contaId, envelopeId);
  if (!e || e.status !== "rascunho") return;
  await deleteEnvelope(contaId, envelopeId, e.titulo);
}
