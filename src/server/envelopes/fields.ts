// Campos posicionados do rascunho — épico 8.3 e regra 11.3 (princípio 5: painel, API e MCP
// chamam estas funções). Toda função recebe o contaId e filtra por ele (seção 6.5).
import "server-only";
import { z } from "zod";
import { FIELD_TYPES } from "@/lib/fields";
import { MAX_ASSINANTES, MAX_CAMPOS_POR_ASSINANTE } from "@/lib/limits";
import { db } from "@/server/db/client";
import type { Database } from "@/server/db/types";
import { DraftError, getEnvelope } from "./drafts";

export type FieldRow = Database["public"]["Tables"]["as_campos"]["Row"];

const fraction = z.number().min(0).max(1);
export const FieldInput = z
  .object({
    signatario_id: z.uuid(),
    tipo: z.enum(FIELD_TYPES),
    pagina: z.number().int().min(1),
    x: fraction,
    y: fraction,
    largura: z.number().gt(0).max(1),
    altura: z.number().gt(0).max(1),
    obrigatorio: z.boolean().default(true),
    rotulo: z.string().trim().max(60).nullable().optional(),
  })
  // Critério 8.3: nunca grava campo que passa da borda (o editor já empurra para dentro).
  .refine((f) => f.x + f.largura <= 1 && f.y + f.altura <= 1, { message: "fora_da_pagina" });
export const FieldList = z.array(FieldInput).max(MAX_CAMPOS_POR_ASSINANTE * MAX_ASSINANTES);

// Lê os campos do envelope da conta, na ordem de leitura (página, de cima para baixo).
// Envelope de outra conta (ou inexistente) devolve lista vazia.
export async function getFields(contaId: string, envelopeId: string): Promise<FieldRow[]> {
  if (!(await getEnvelope(contaId, envelopeId))) return [];
  const { data, error } = await db().from("as_campos").select("*").eq("envelope_id", envelopeId).order("pagina").order("y").order("x");
  if (error) throw error;
  return data ?? [];
}

// Substitui todos os campos do rascunho numa transação (as_fn_substitui_campos).
// Recebe: conta, envelope e a lista validada. Devolve: os campos gravados.
// Lança DraftError: nao_encontrado, envelope_congelado, campos_demais ou campo_invalido.
export async function replaceFields(contaId: string, envelopeId: string, list: z.infer<typeof FieldList>): Promise<FieldRow[]> {
  if (!z.uuid().safeParse(envelopeId).success) throw new DraftError("nao_encontrado");
  const perSigner = new Map<string, number>();
  for (const f of list) perSigner.set(f.signatario_id, (perSigner.get(f.signatario_id) ?? 0) + 1);
  if ([...perSigner.values()].some((n) => n > MAX_CAMPOS_POR_ASSINANTE)) throw new DraftError("campos_demais");

  const { data, error } = await db().rpc("as_fn_substitui_campos", { p_envelope_id: envelopeId, p_conta_id: contaId, p_lista: list });
  if (error) {
    const known = ["nao_encontrado", "envelope_congelado", "campos_demais", "campo_invalido"] as const;
    const code = known.find((k) => error.message === k);
    if (code) throw new DraftError(code);
    // Check de posição do banco (23514): o mesmo caso que o zod já recusa.
    if (error.code === "23514") throw new DraftError("campo_invalido");
    throw error;
  }
  return (data ?? []) as FieldRow[];
}
