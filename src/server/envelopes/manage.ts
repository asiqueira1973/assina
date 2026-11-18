// Ações do painel sobre envelopes já enviados — épico 8.7 (seções 7.4, 8.7 e 14, regras 11.5 e
// 11.17). O banco decide e grava a trilha na mesma transação (princípio 1); aqui ficam o token
// novo, os e-mails depois do commit, os arquivos e o CSV. Painel, API REST (8.9) e MCP (8.10)
// chamam estas funções (princípio 5). Nada de e-mail, nome ou token em log.
import "server-only";
import { copy } from "@/lib/copy";
import { formatDateLong } from "@/lib/format";
import { DOWNLOAD_URL_SEGUNDOS, ENVELOPES_POR_PAGINA, LEMBRETE_MANUAL_INTERVALO_H, MAX_LEMBRETES } from "@/lib/limits";
import { track } from "@/server/analytics/client";
import { originFromActor } from "@/server/analytics/events";
import type { Database } from "@/server/db/types";
import { db } from "@/server/db/client";
import { mailer } from "@/server/email/mailer";
import { reminderEmail } from "@/server/email/templates";
import { errorCode } from "@/server/error-code";
import { envelopePaths, storage } from "@/server/files/storage";
import { sendNotice } from "@/server/notifications/notices";
import { runAfterResponse } from "@/server/http";
import { deliverEnvelopeWebhooks } from "@/server/webhooks/deliver";
import { DraftError, getEnvelope, type RequestMeta } from "./drafts";
import { generateSignerToken, signerLink } from "./signer-token";

type Actor = Database["public"]["Enums"]["as_ator"];

export const FILTERS = ["todos", "aguardando", "concluidos", "rascunhos", "encerrados"] as const;
export type Filter = (typeof FILTERS)[number];
export type EnvelopeListRow = Database["public"]["Functions"]["as_fn_lista_envelopes"]["Returns"][number];

// Erros do banco que viram DraftError (o resto sobe como 500).
const KNOWN = new Set(["nao_encontrado", "status_mudou", "prazo_encerrado", "lembrete_recente", "limite_lembretes", "titulo_nao_confere"]);
function rethrow(error: { message: string }): never {
  if (KNOWN.has(error.message)) throw new DraftError(error.message as ConstructorParameters<typeof DraftError>[0]);
  throw error;
}

// Lista do painel (critério 8.7). Recebe: conta, filtro, busca e página (1…). Devolve: as linhas,
// o total do filtro e o número de páginas.
export type EnvelopeList = { rows: EnvelopeListRow[]; total: number; pagina: number; paginas: number };

export async function listEnvelopes(contaId: string, opts: { filtro: Filter; busca: string; pagina: number }): Promise<EnvelopeList> {
  const pagina = Math.max(1, Math.floor(opts.pagina) || 1);
  const { data, error } = await db().rpc("as_fn_lista_envelopes", {
    p_conta_id: contaId,
    p_filtro: opts.filtro,
    p_busca: opts.busca,
    p_limite: ENVELOPES_POR_PAGINA,
    p_deslocamento: (pagina - 1) * ENVELOPES_POR_PAGINA,
  });
  if (error) throw error;
  const rows = data ?? [];
  if (!rows.length && pagina > 1) {
    // Página além do fim (link antigo, último item da página excluído): vai para a última que existe.
    const first = await listEnvelopes(contaId, { ...opts, pagina: 1 });
    return first.paginas > 1 ? listEnvelopes(contaId, { ...opts, pagina: first.paginas }) : first;
  }
  const total = rows.length ? Number(rows[0].total) : 0;
  return { rows, total, pagina, paginas: Math.max(1, Math.ceil(total / ENVELOPES_POR_PAGINA)) };
}

// Lembrete manual (regra 11.5, critério 8.7): reserva no banco (24 h, até 10), manda o e-mail com
// um link novo e confirma (as_fn_confirma_lembrete troca o link se a pessoa ainda aguarda e
// registra o envio). Se o e-mail falha, desfaz a reserva e o link antigo continua valendo.
// Lança DraftError: nao_encontrado, status_mudou, prazo_encerrado, lembrete_recente,
// limite_lembretes, email_falhou.
export async function remindSigner(contaId: string, envelopeId: string, signatarioId: string, meta: RequestMeta, ator: Actor = "remetente") {
  const { data: claim, error } = await db()
    .rpc("as_fn_reserva_lembrete", {
      p_conta_id: contaId,
      p_envelope_id: envelopeId,
      p_signatario_id: signatarioId,
      p_intervalo_h: LEMBRETE_MANUAL_INTERVALO_H,
      p_max: MAX_LEMBRETES,
    })
    .single();
  if (error) rethrow(error);
  const { numero, chave, anterior } = claim as { numero: number; chave: string; anterior: string | null };
  const undo = (code: string) =>
    db().rpc("as_fn_desfaz_lembrete", { p_conta_id: contaId, p_signatario_id: signatarioId, p_numero: numero, p_chave: chave, p_anterior: anterior as string, p_erro: code });

  const { data: s } = await db()
    .from("as_signatarios")
    .select("email, as_envelopes!inner(titulo, prazo_em), as_contas!inner(nome, email)")
    .eq("id", signatarioId)
    .eq("conta_id", contaId)
    .maybeSingle();
  if (!s?.as_envelopes.prazo_em) {
    await undo("nao_encontrado");
    throw new DraftError("nao_encontrado");
  }
  const token = generateSignerToken();
  const prazo = s.as_envelopes.prazo_em;
  // Menos de 24 h: "Assine até {data}."; senão, os dias inteiros que faltam.
  const remaining = new Date(prazo).getTime() - Date.now();
  const days = remaining < 86400_000 ? 0 : Math.floor(remaining / 86400_000);

  let sentId: string;
  try {
    sentId = (
      await mailer().send({
        to: s.email,
        fromName: s.as_contas.nome,
        replyTo: s.as_contas.email,
        ...reminderEmail({ titulo: s.as_envelopes.titulo, dias: days, prazo: formatDateLong(prazo), link: signerLink(token.value) }),
      })
    ).id;
  } catch (e) {
    await undo(errorCode(e));
    throw new DraftError("email_falhou");
  }
  // O e-mail saiu: daqui em diante não se desfaz. Um erro aqui é 500 (com o log), não "e-mail falhou".
  const { error: cErr } = await db().rpc("as_fn_confirma_lembrete", {
    p_conta_id: contaId,
    p_envelope_id: envelopeId,
    p_signatario_id: signatarioId,
    p_chave: chave,
    p_token_hash: token.hash,
    p_resend_id: sentId,
    p_ator: ator,
    p_ip: meta.ip ?? undefined,
    p_user_agent: meta.userAgent ?? undefined,
  });
  if (cErr) throw cErr;
  track("assina_lembrete_enviado", { quem: { conta: contaId }, chave, propriedades: { automatico: false } });
}

// "Copiar link de assinatura" (critério 8.7): token novo, o anterior deixa de valer, evento
// convite_enviado {canal: link_copiado}. Devolve: o link (só para quem pediu, nunca em log).
export async function copySignerLink(contaId: string, envelopeId: string, signatarioId: string, meta: RequestMeta, ator: Actor = "remetente"): Promise<string> {
  const token = generateSignerToken();
  const { error } = await db().rpc("as_fn_copia_link", {
    p_conta_id: contaId,
    p_envelope_id: envelopeId,
    p_signatario_id: signatarioId,
    p_token_hash: token.hash,
    p_ator: ator,
    p_ip: meta.ip ?? undefined,
    p_user_agent: meta.userAgent ?? undefined,
  });
  if (error) rethrow(error);
  return signerLink(token.value);
}

// Cancela (critério 8.7): transação no banco; depois do commit, avisa quem já foi convidado.
// Lança DraftError: nao_encontrado, status_mudou.
export async function cancelEnvelope(contaId: string, envelopeId: string, motivo: string | null, meta: RequestMeta, ator: Actor = "remetente") {
  const { error } = await db().rpc("as_fn_cancela_envelope", {
    p_conta_id: contaId,
    p_envelope_id: envelopeId,
    p_motivo: (motivo ?? null) as unknown as string,
    p_ator: ator,
    p_ip: meta.ip ?? undefined,
    p_user_agent: meta.userAgent ?? undefined,
  });
  if (error) rethrow(error);
  track("assina_envelope_cancelado", { quem: { conta: contaId }, chave: envelopeId, propriedades: { origem: originFromActor(ator) } });
  const { data: notes } = await db().from("as_notificacoes").select("chave").eq("envelope_id", envelopeId).eq("conta_id", contaId).eq("tipo", "cancelado_destinatario");
  for (const n of notes ?? []) {
    try {
      await sendNotice(n.chave);
    } catch (e) {
      console.error("aviso_pos_commit_falhou", errorCode(e));
    }
  }
  // Webhook envelope.cancelado depois da resposta (um endpoint lento não segura a tela).
  await runAfterResponse(() => deliverEnvelopeWebhooks(envelopeId));
}

// Exclui (seção 7.4): o banco confere status e título e apaga em cascata; depois, a pasta do
// envelope no armazenamento. Se apagar os arquivos falhar, o envelope já não existe (a
// verificação não o acha) e o erro fica no log para limpeza manual.
// Lança DraftError: nao_encontrado, status_mudou, titulo_nao_confere.
export async function deleteEnvelope(contaId: string, envelopeId: string, titulo: string) {
  const { error } = await db().rpc("as_fn_exclui_envelope", { p_conta_id: contaId, p_envelope_id: envelopeId, p_titulo: titulo });
  if (error) rethrow(error);
  try {
    await storage().deletePrefix(envelopePaths(contaId, envelopeId).folder);
  } catch (e) {
    console.error("arquivos_nao_apagados", errorCode(e));
  }
}

// Download do original ou do final pelo remetente (13.1): registra baixou_* e devolve a URL
// assinada de 5 min. Lança DraftError: nao_encontrado, arquivo_indisponivel (sem arquivo,
// expurgado, ou final antes de concluir).
export async function downloadUrl(contaId: string, envelopeId: string, versao: "original" | "final", meta: RequestMeta, ator: Actor = "remetente"): Promise<string> {
  const e = await getEnvelope(contaId, envelopeId);
  if (!e) throw new DraftError("nao_encontrado");
  const path = versao === "final" ? (e.status === "concluido" ? e.arquivo_final_path : null) : e.arquivo_original_path;
  if (!path) throw new DraftError("arquivo_indisponivel");
  // Rascunho não tem trilha de envio; baixar o próprio arquivo não vira evento.
  if (e.status !== "rascunho") {
    const { error } = await db().rpc("as_fn_registra_evento", {
      p_envelope_id: e.id,
      p_tipo: versao === "final" ? "baixou_final" : "baixou_original",
      p_ator: ator,
      p_ip: meta.ip ?? undefined,
      p_user_agent: meta.userAgent ?? undefined,
    });
    if (error) throw error;
  }
  const name = versao === "final" ? `${e.titulo} (assinado).pdf` : `${e.titulo}.pdf`;
  return (await storage().createDownloadUrl(path, DOWNLOAD_URL_SEGUNDOS, name)).url;
}

export type TrailEvent = {
  seq: number;
  tipo: keyof typeof copy.events;
  signatario_id: string | null;
  ator: Actor;
  pessoa: string | null;
  email: string | null;
  ip: string | null;
  user_agent: string | null;
  dados: unknown;
  ocorrido_em: string;
  hash: string;
};

// Trilha do envelope da conta, com nome e e-mail de quem agiu (linha do tempo e CSV, seção 14),
// e o resultado de as_fn_verifica_trilha (null = íntegra; n = divergência no evento n).
export async function getTrail(contaId: string, envelopeId: string): Promise<{ events: TrailEvent[]; divergence: number | null }> {
  const e = await getEnvelope(contaId, envelopeId);
  if (!e) throw new DraftError("nao_encontrado");
  const [{ data: rows, error }, { data: check, error: cErr }] = await Promise.all([
    db()
      .from("as_eventos")
      .select("seq, tipo, ator, signatario_id, ip, user_agent, dados, ocorrido_em, hash, as_signatarios(nome, email)")
      .eq("envelope_id", envelopeId)
      .order("seq"),
    db().rpc("as_fn_verifica_trilha", { p_envelope_id: envelopeId }),
  ]);
  if (error || cErr) throw error ?? cErr;
  const events = (rows ?? []).map((r) => ({
    seq: r.seq,
    tipo: r.tipo as keyof typeof copy.events,
    signatario_id: r.signatario_id,
    ator: r.ator,
    pessoa: r.as_signatarios?.nome ?? null,
    email: r.as_signatarios?.email ?? null,
    ip: (r.ip as string | null) ?? null,
    user_agent: r.user_agent,
    dados: r.dados,
    ocorrido_em: r.ocorrido_em,
    hash: r.hash,
  }));
  return { events, divergence: (check as number | null) ?? null };
}
