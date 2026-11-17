// Envio do envelope — épico 8.4 (princípio 5: painel, API e MCP chamam esta função).
// 1) Lê o original e revalida a regra 11.1; calcula o SHA-256 (hash_original).
// 2) Gera um token para cada assinante (seção 6.2).
// 3) as_fn_envia_envelope congela o rascunho, aplica os limites 11.12 e 11.20, registra a trilha
//    e enfileira os convites — tudo numa transação.
// 4) Depois do commit, manda os convites dos destinatários da vez; falha de e-mail não desfaz
//    o envio (a notificação fica "falhou" e a faxina retenta, regra 11.16).
import "server-only";
import { createHash } from "node:crypto";
import { LIMITE_ARQUIVO_BYTES, LIMITE_ENVIOS_24H, LIMITE_POR_NIVEL } from "@/lib/limits";
import { db } from "@/server/db/client";
import type { Database } from "@/server/db/types";
import { storage } from "@/server/files/storage";
import { sendInvite } from "@/server/notifications/invites";
import { validatePdf } from "@/server/pdf/validate";
import { DraftError, getEnvelope, getSigners, type RequestMeta } from "./drafts";
import { generateSignerToken } from "./signer-token";

type Actor = Database["public"]["Enums"]["as_ator"];

const DB_CODES = ["nao_encontrado", "status_mudou", "envelope_mudou", "sem_assinante", "limite_diario", "limite_do_nivel"] as const;

// Envia o envelope. Recebe: conta, envelope, ator e quem pediu.
// Devolve: o envelope enviado e quantos convites saíram e falharam. Lança DraftError.
export async function sendEnvelope(contaId: string, envelopeId: string, input: { ator: Actor; meta: RequestMeta }) {
  const envelope = await getEnvelope(contaId, envelopeId);
  if (!envelope) throw new DraftError("nao_encontrado");
  if (envelope.status !== "rascunho") throw new DraftError("status_mudou");
  if (!envelope.arquivo_original_path) throw new DraftError("arquivo_ausente");

  const bytes = await storage().read(envelope.arquivo_original_path, LIMITE_ARQUIVO_BYTES);
  if (!bytes) throw new DraftError("arquivo_ausente");
  const check = await validatePdf(bytes);
  if (!check.ok) throw new DraftError(check.code);
  const hash = createHash("sha256").update(bytes).digest("hex");

  const signers = (await getSigners(contaId, envelopeId)).filter((s) => s.papel === "assinar");
  if (signers.length === 0) throw new DraftError("sem_assinante");
  const tokens = new Map(signers.map((s) => [s.id, generateSignerToken()]));

  const { data, error } = await db().rpc("as_fn_envia_envelope", {
    p_envelope_id: envelopeId,
    p_conta_id: contaId,
    p_caminho: envelope.arquivo_original_path,
    p_hash: hash,
    p_tokens: [...tokens].map(([signatario_id, t]) => ({ signatario_id, token_hash: t.hash })),
    p_limite_diario: LIMITE_ENVIOS_24H,
    p_limites_nivel: [LIMITE_POR_NIVEL[1], LIMITE_POR_NIVEL[2], LIMITE_POR_NIVEL[3]],
    p_ator: input.ator,
    p_ip: input.meta.ip ?? undefined,
    p_user_agent: input.meta.userAgent ?? undefined,
  });
  if (error) {
    const code = DB_CODES.find((c) => error.message === c);
    if (code) throw new DraftError(code);
    throw error;
  }

  // Depois do commit: os convites dos destinatários da vez, com o token que a transação gravou.
  let sent = 0;
  let failed = 0;
  for (const s of (data ?? []) as { id: string }[]) {
    if ((await sendInvite(s.id, tokens.get(s.id))) === "sent") sent++;
    else failed++;
  }
  const after = await getEnvelope(contaId, envelopeId);
  return { envelope: after!, invites: { sent, failed } };
}
