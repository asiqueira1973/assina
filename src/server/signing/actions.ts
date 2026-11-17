// Ações do signatário — épico 8.5 (regras 11.4, 11.7 e seção 12). O banco decide (contadores do
// código, status e prazo, numa transação); aqui fica o que não cabe nele: gerar e mandar o código,
// conferir CPF e PNG, gravar a imagem da assinatura e mandar os e-mails depois do commit.
import "server-only";
import { randomInt, randomUUID } from "node:crypto";
import { z } from "zod";
import { isValidCpf, onlyDigits } from "@/lib/cpf";
import {
  ASSINATURA_DATAURL_MAX,
  ASSINATURA_PNG_MAX_BYTES,
  CODIGO_INTERVALO_S,
  CODIGO_TENTATIVAS,
  CODIGO_VALIDADE_S,
  CODIGOS_POR_HORA,
  CONSENTIMENTO_VERSAO,
  CPF_ENTRADA_MAX,
  MAX_CAMPOS_POR_ASSINANTE,
  MOTIVO_MAX,
  NOME_MAX,
  TEXTO_CAMPO_MAX,
} from "@/lib/limits";
import { maskEmail } from "@/lib/mask";
import { hashCredential } from "@/server/credentials/api-key";
import { db } from "@/server/db/client";
import { mailer } from "@/server/email/mailer";
import { errorCode } from "@/server/error-code";
import { codeEmail } from "@/server/email/templates";
import type { RequestMeta } from "@/server/envelopes/drafts";
import { storage } from "@/server/files/storage";
import { finalizeEnvelope } from "@/server/envelopes/finalize";
import { runAfterResponse } from "@/server/http";
import { sendInvite } from "@/server/notifications/invites";
import { sendNotice } from "@/server/notifications/notices";
import { deliverEnvelopeWebhooks } from "@/server/webhooks/deliver";
import type { SignerContext } from "./context";

/** Erro de negócio do signatário, com código estável para a resposta HTTP. */
export class SignerError extends Error {
  constructor(public code: string, public extra: Record<string, unknown> = {}) {
    super(code);
  }
}

// Os tipos gerados do Supabase dão string obrigatória a parâmetro sem default, mas a função SQL
// aceita nulo (assinatura digitada não tem imagem, rubrica é opcional, CPF só quando exigido).
function nullable(value: string | null | undefined): string {
  return (value ?? null) as unknown as string;
}

// Hash do código (regra 11.4): sha256(signatario_id + código).
function codeHash(signatarioId: string, code: string): string {
  return hashCredential(signatarioId + code);
}

// Pede um código novo e manda por e-mail (regra 11.4). Lança SignerError: aguarde, limite_hora,
// indisponivel ou email_falhou. O evento codigo_enviado só é gravado se o e-mail saiu.
export async function requestCode(ctx: SignerContext, meta: RequestMeta): Promise<void> {
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const { data, error } = await db().rpc("as_fn_novo_codigo", {
    p_signatario_id: ctx.signer.id,
    p_codigo_hash: codeHash(ctx.signer.id, code),
    p_validade_s: CODIGO_VALIDADE_S,
    p_intervalo_s: CODIGO_INTERVALO_S,
    p_max_hora: CODIGOS_POR_HORA,
  });
  if (error) throw error;
  if (data !== "ok") throw new SignerError(data as string);
  try {
    await mailer().send({ to: ctx.signer.email, fromName: ctx.sender.nome, replyTo: ctx.sender.email, ...codeEmail({ codigo: code, remetente: ctx.sender.nome }) });
  } catch {
    throw new SignerError("email_falhou");
  }
  const { error: evError } = await db().rpc("as_fn_registra_evento", {
    p_envelope_id: ctx.envelope.id,
    p_tipo: "codigo_enviado",
    p_ator: "signatario",
    p_signatario_id: ctx.signer.id,
    p_ip: meta.ip ?? undefined,
    p_user_agent: meta.userAgent ?? undefined,
    p_dados: { para: maskEmail(ctx.signer.email) },
  });
  if (evError) throw evError;
}

// Confere o código digitado. Devolve se valeu; lança SignerError (errado com "restantes",
// bloqueado, expirado, sem_codigo, indisponivel).
export async function validateCode(ctx: SignerContext, code: string, meta: RequestMeta): Promise<void> {
  if (!/^\d{6}$/.test(code)) throw new SignerError("errado", { restantes: null });
  const { data, error } = await db()
    .rpc("as_fn_valida_codigo", {
      p_signatario_id: ctx.signer.id,
      p_codigo_hash: codeHash(ctx.signer.id, code),
      p_max_tentativas: CODIGO_TENTATIVAS,
      p_ip: meta.ip ?? undefined,
      p_user_agent: meta.userAgent ?? undefined,
    })
    .single();
  if (error) throw error;
  const r = data as { resultado: string; restantes: number };
  if (r.resultado !== "ok") throw new SignerError(r.resultado, r.resultado === "errado" ? { restantes: r.restantes } : {});
}

// Registra "visualizou" uma vez por sessão (critério 8.5): procura um evento com o jti da sessão.
export async function recordView(ctx: SignerContext, jti: string, meta: RequestMeta): Promise<boolean> {
  const { data } = await db()
    .from("as_eventos")
    .select("id")
    .eq("envelope_id", ctx.envelope.id)
    .eq("signatario_id", ctx.signer.id)
    .eq("tipo", "visualizou")
    .contains("dados", { sessao: jti })
    .limit(1);
  if (data?.length) return false;
  const { error } = await db().rpc("as_fn_registra_evento", {
    p_envelope_id: ctx.envelope.id,
    p_tipo: "visualizou",
    p_ator: "signatario",
    p_signatario_id: ctx.signer.id,
    p_ip: meta.ip ?? undefined,
    p_user_agent: meta.userAgent ?? undefined,
    p_dados: { sessao: jti },
  });
  if (error) throw error;
  return true;
}

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

// Lê uma imagem desenhada enviada como data URL. Só PNG e até 200 KB (critério 8.5).
// Devolve: os bytes; lança SignerError imagem_invalida.
function decodePng(dataUrl: string): Uint8Array {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) throw new SignerError("imagem_invalida");
  const bytes = new Uint8Array(Buffer.from(m[1], "base64"));
  if (bytes.length > ASSINATURA_PNG_MAX_BYTES || bytes.length < PNG_MAGIC.length || PNG_MAGIC.some((b, i) => bytes[i] !== b)) {
    throw new SignerError("imagem_invalida");
  }
  return bytes;
}

// Corpo de "Assinar" (validado antes de tudo).
export const SignInput = z.object({
  consentimento: z.literal(CONSENTIMENTO_VERSAO),
  metodo: z.enum(["digitada", "desenhada"]),
  assinatura_texto: z.string().trim().max(NOME_MAX).optional(),
  assinatura_png: z.string().max(ASSINATURA_DATAURL_MAX).optional(),
  rubrica_texto: z.string().trim().max(NOME_MAX).optional(),
  rubrica_png: z.string().max(ASSINATURA_DATAURL_MAX).optional(),
  cpf: z.string().max(CPF_ENTRADA_MAX).optional(),
  campos: z.array(z.object({ id: z.uuid(), valor: z.string().max(TEXTO_CAMPO_MAX) })).max(MAX_CAMPOS_POR_ASSINANTE),
});

// Assina (critério 8.5): confere CPF e imagens, grava as imagens, chama as_fn_assina (transação)
// e, depois do commit, manda o convite do próximo e o aviso ao remetente. Devolve: o status do
// envelope ("enviado" ou "finalizando"). Lança SignerError com o código do banco.
export async function sign(ctx: SignerContext, input: z.infer<typeof SignInput>, meta: RequestMeta) {
  const cpf = input.cpf ? onlyDigits(input.cpf) : null;
  if (ctx.signer.exigir_cpf && (!cpf || !isValidCpf(cpf))) throw new SignerError("cpf_invalido");

  // Caminho único por tentativa: duas abas (ou toque duplo) nunca gravam por cima da imagem que
  // a outra já levou ao banco, e a que perde apaga só o próprio arquivo (achado do verifier no 8.5).
  const base = `${ctx.envelope.conta_id}/${ctx.envelope.id}/assinaturas/${ctx.signer.id}-${randomUUID()}`;
  const written: string[] = [];
  let assinaturaPath: string | null = null;
  let rubricaPath: string | null = null;
  if (input.metodo === "desenhada") {
    if (!input.assinatura_png) throw new SignerError("assinatura_ausente");
    assinaturaPath = `${base}-assinatura.png`;
    await storage().write(assinaturaPath, decodePng(input.assinatura_png), "image/png");
    written.push(assinaturaPath);
  }
  if (input.rubrica_png) {
    rubricaPath = `${base}-rubrica.png`;
    await storage().write(rubricaPath, decodePng(input.rubrica_png), "image/png");
    written.push(rubricaPath);
  }

  const { data, error } = await db()
    .rpc("as_fn_assina", {
      p_signatario_id: ctx.signer.id,
      p_token_hash: ctx.tokenHash,
      p_metodo: input.metodo,
      p_assinatura_texto: nullable(input.metodo === "digitada" ? (input.assinatura_texto ?? "") : null),
      p_assinatura_path: nullable(assinaturaPath),
      p_rubrica_texto: nullable(input.rubrica_png ? null : input.rubrica_texto),
      p_rubrica_path: nullable(rubricaPath),
      p_cpf: nullable(cpf),
      p_campos: input.campos,
      p_consentimento: input.consentimento,
      p_ip: meta.ip ?? undefined,
      p_user_agent: meta.userAgent ?? undefined,
    })
    .single();
  if (error) {
    // A transação não aconteceu: as imagens gravadas não valem.
    await Promise.all(written.map((p) => storage().delete(p)));
    const known = ["link_invalido", "status_mudou", "prazo_encerrado", "sem_consentimento", "assinatura_ausente", "cpf_invalido", "campo_obrigatorio", "campo_invalido"];
    if (known.includes(error.message)) throw new SignerError(error.message);
    throw error;
  }
  const result = data as { envelope_status: string; proximo_id: string | null };

  // Depois do commit: convite do próximo (em ordem) e aviso ao remetente. Falha de e-mail não
  // desfaz a assinatura nem vira erro na tela; a faxina retenta (regra 11.16). A finalização é do 8.6.
  await afterCommit(async () => {
    if (result.proximo_id) await sendInvite(result.proximo_id);
  });
  await afterCommit(() => sendNotice(`assinou_remetente:${ctx.signer.id}`));
  // Webhook signatario.assinou (enfileirado pelo trigger na mesma transação, regra 11.17): sai
  // depois da resposta, para um endpoint lento não segurar quem assinou (seção 17).
  await runAfterResponse(() => deliverEnvelopeWebhooks(ctx.envelope.id));
  // Último assinante: o envelope entrou em finalizando. A finalização roda depois da resposta e
  // nunca lança (a falha fica no banco e a faxina retenta).
  if (result.envelope_status === "finalizando") await runAfterResponse(() => finalizeEnvelope(ctx.envelope.id));
  return result.envelope_status;
}

// Recusa (critério 8.5). Lança SignerError com o código do banco. Depois do commit, avisa o
// remetente e os outros assinantes já convidados.
export async function decline(ctx: SignerContext, motivo: string, meta: RequestMeta): Promise<void> {
  if (!motivo.trim() || motivo.trim().length > MOTIVO_MAX) throw new SignerError("motivo_invalido");
  const { error } = await db().rpc("as_fn_recusa", {
    p_signatario_id: ctx.signer.id,
    p_token_hash: ctx.tokenHash,
    p_motivo: motivo,
    p_ip: meta.ip ?? undefined,
    p_user_agent: meta.userAgent ?? undefined,
  });
  if (error) {
    if (["link_invalido", "status_mudou", "prazo_encerrado", "motivo_invalido"].includes(error.message)) throw new SignerError(error.message);
    throw error;
  }
  await afterCommit(async () => {
    await sendNotice(`recusado_remetente:${ctx.envelope.id}`);
    const { data: others } = await db().from("as_notificacoes").select("chave").eq("envelope_id", ctx.envelope.id).eq("tipo", "recusado_destinatario");
    for (const n of others ?? []) await sendNotice(n.chave);
  });
  await runAfterResponse(() => deliverEnvelopeWebhooks(ctx.envelope.id));
}

// E-mails depois do commit: a ação já valeu, então uma falha aqui só fica no log (sem dado
// pessoal); a notificação continua na fila e a faxina retenta (regra 11.16).
async function afterCommit(fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch (e) {
    console.error("aviso_pos_commit_falhou", errorCode(e));
  }
}

