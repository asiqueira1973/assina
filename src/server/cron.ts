// Faxina diária — critério 8.13, regras 11.5, 11.7, 11.10, 11.14, 11.16 e 11.17. Chamada 1×/dia
// pelo cron da Vercel (GET /api/cron/diario). Oito tarefas, nesta ordem e todas idempotentes
// (rodar duas vezes seguidas não reenvia nada):
// 1. expira os envelopes vencidos (as_fn_expira_envelope), avisa o remetente, entrega o webhook;
// 2. manda os lembretes automáticos devidos (as_fn_lembretes_devidos → remindSigner, ator sistema);
// 3. retenta as finalizações paradas;
// 4. retenta convites e avisos que falharam (e fecha lembrete preso no meio do envio);
// 5. retenta os webhooks;
// 6. expurga os arquivos de recusados, cancelados e expirados encerrados há 90 dias;
// 7. apaga rascunhos sem mudança há 30 dias (com os arquivos);
// 8. apaga códigos OAuth vencidos (e clientes OAuth órfãos, só na execução sem filtro de contas).
// A falha de uma tarefa não impede as outras; o log leva só o nome da tarefa e o código do erro.
// Devolve as contagens de cada tarefa.
import "server-only";
import {
  EXPURGO_ARQUIVOS_DIAS,
  FAXINA_LEMBRETE_FOLGA_MIN,
  FAXINA_LOTE,
  LEMBRETE_PRESO_MIN,
  MAX_LEMBRETES,
  OAUTH_CLIENTE_ORFAO_DIAS,
  RASCUNHO_ABANDONADO_DIAS,
} from "@/lib/limits";
import { track } from "@/server/analytics/client";
import { db } from "@/server/db/client";
import { DraftError } from "@/server/envelopes/drafts";
import { retryFinalizations } from "@/server/envelopes/finalize";
import { remindSigner } from "@/server/envelopes/manage";
import { errorCode } from "@/server/error-code";
import { envelopePaths, storage } from "@/server/files/storage";
import { retryFailedInvites } from "@/server/notifications/invites";
import { retryFailedNotices, sendNotice } from "@/server/notifications/notices";
import { deliverEnvelopeWebhooks, retryWebhooks } from "@/server/webhooks/deliver";

export type CleanupResult = {
  expirados: number;
  lembretes: number;
  finalizados: number;
  convites: number;
  avisos: number;
  webhooks: number;
  expurgados: number;
  rascunhos: number;
  codigos_oauth: number;
};

/** `contaIds`: só nos testes, limita a faxina às contas da fixture (o banco local tem outros dados). */
export type CleanupOptions = { contaIds?: string[] };

const DAY_MS = 86_400_000;
const SYSTEM_META = { ip: null, userAgent: null };

// Tarefa 1 (regra 11.7). Cada envelope numa transação própria; depois do commit, o aviso ao
// remetente, o webhook e o evento de analytics.
async function expireEnvelopes(contaIds?: string[]): Promise<number> {
  let q = db().from("as_envelopes").select("id, conta_id").eq("status", "enviado").lte("prazo_em", new Date().toISOString()).order("prazo_em").limit(FAXINA_LOTE);
  if (contaIds) q = q.in("conta_id", contaIds);
  const { data, error } = await q;
  if (error) throw error;
  let expired = 0;
  for (const e of data ?? []) {
    const { data: done, error: rpcError } = await db().rpc("as_fn_expira_envelope", { p_envelope_id: e.id });
    if (rpcError) throw rpcError;
    if (!done) continue;
    expired++;
    await sendNotice(`expirado_remetente:${e.id}`).catch((err) => console.error("aviso_pos_commit_falhou", errorCode(err)));
    await deliverEnvelopeWebhooks(e.id);
    track("assina_envelope_expirado", {
      quem: { conta: e.conta_id },
      chave: e.id,
      propriedades: async () => {
        const { data: sigs } = await db().from("as_signatarios").select("status").eq("envelope_id", e.id).eq("papel", "assinar");
        const assinaram = (sigs ?? []).filter((s) => s.status === "assinou").length;
        return { assinaram, faltaram: (sigs ?? []).length - assinaram };
      },
    });
  }
  return expired;
}

// Tarefa 2 (regra 11.5): o mesmo caminho do lembrete manual, com ator "sistema" e o intervalo do
// envelope (N dias, menos a folga). Recusas de negócio (o signatário assinou no meio, o prazo
// venceu, o limite chegou) são puladas; falha de e-mail fica para o dia seguinte.
async function sendDueReminders(contaIds?: string[]): Promise<number> {
  const { data, error } = await db().rpc("as_fn_lembretes_devidos", {
    p_max: MAX_LEMBRETES,
    p_folga_min: FAXINA_LEMBRETE_FOLGA_MIN,
    // Lista, não texto: o helper nullable() não serve; nulo = todas as contas (default da função).
    p_contas: (contaIds ?? null) as unknown as string[],
  });
  if (error) throw error;
  let sent = 0;
  for (const r of (data ?? []).slice(0, FAXINA_LOTE)) {
    const intervalH = r.cada_dias * 24 - Math.ceil(FAXINA_LEMBRETE_FOLGA_MIN / 60);
    try {
      await remindSigner(r.conta_id, r.envelope_id, r.signatario_id, SYSTEM_META, "sistema", intervalH);
      sent++;
    } catch (e) {
      if (!(e instanceof DraftError)) console.error("lembrete_automatico_falhou", errorCode(e));
    }
  }
  return sent;
}

// Tarefas 4 e 5: cada execução gasta no máximo uma tentativa (regras 11.16 e 11.17); o que esta
// execução criou fica para a próxima. Tarefas 3 a 8 pegam no máximo FAXINA_LOTE linhas.

// Tarefa 4, parte do lembrete: a reserva do lembrete (8.7) cria a notificação "pendente"; se o
// servidor caiu antes de confirmar ou desfazer, ela fica pendente para sempre. Depois de
// LEMBRETE_PRESO_MIN, vira "falhou" (a contagem do lembrete não volta: é o lado seguro do limite).
async function closeStuckReminders(contaIds?: string[]): Promise<void> {
  let q = db()
    .from("as_notificacoes")
    .update({ status: "falhou", erro: "interrompido" })
    .eq("tipo", "lembrete")
    .eq("status", "pendente")
    .lt("criado_em", new Date(Date.now() - LEMBRETE_PRESO_MIN * 60_000).toISOString());
  if (contaIds) q = q.in("conta_id", contaIds);
  const { error } = await q;
  if (error) throw error;
}

// Tarefa 6 (regra 11.14): primeiro apaga a pasta do envelope, depois marca o expurgo. Se a
// marcação falhar, a próxima execução apaga de novo (nada) e marca.
async function purgeClosedFiles(contaIds?: string[]): Promise<number> {
  const cutoff = new Date(Date.now() - EXPURGO_ARQUIVOS_DIAS * DAY_MS).toISOString();
  let q = db()
    .from("as_envelopes")
    .select("id, conta_id")
    .in("status", ["recusado", "cancelado", "expirado"])
    .is("arquivos_expurgados_em", null)
    .lte("encerrado_em", cutoff)
    .order("encerrado_em")
    .limit(FAXINA_LOTE);
  if (contaIds) q = q.in("conta_id", contaIds);
  const { data, error } = await q;
  if (error) throw error;
  let purged = 0;
  for (const e of data ?? []) {
    await storage().deletePrefix(envelopePaths(e.conta_id, e.id).folder);
    const { data: marked, error: rpcError } = await db().rpc("as_fn_expurga_envelope", { p_envelope_id: e.id, p_dias: EXPURGO_ARQUIVOS_DIAS });
    if (rpcError) throw rpcError;
    if (marked) purged++;
  }
  return purged;
}

// Tarefa 7 (regra 11.14): rascunho sem mudança há 30 dias é apagado por inteiro (a cascata leva
// destinatários, campos e trilha), e depois a pasta dele no armazenamento.
async function deleteAbandonedDrafts(contaIds?: string[]): Promise<number> {
  const cutoff = new Date(Date.now() - RASCUNHO_ABANDONADO_DIAS * DAY_MS).toISOString();
  let q = db().from("as_envelopes").select("id, conta_id").eq("status", "rascunho").lte("atualizado_em", cutoff).order("atualizado_em").limit(FAXINA_LOTE);
  if (contaIds) q = q.in("conta_id", contaIds);
  const { data, error } = await q;
  if (error) throw error;
  let deleted = 0;
  for (const e of data ?? []) {
    // Confere de novo status e data no DELETE: a pessoa pode ter mexido no rascunho agora.
    const { data: gone, error: delError } = await db()
      .from("as_envelopes")
      .delete()
      .eq("id", e.id)
      .eq("status", "rascunho")
      .lte("atualizado_em", cutoff)
      .select("id");
    if (delError) throw delError;
    if (!gone?.length) continue;
    deleted++;
    await storage()
      .deletePrefix(envelopePaths(e.conta_id, e.id).folder)
      .catch((err) => console.error("arquivos_nao_apagados", e.id, errorCode(err)));
  }
  return deleted;
}

// Tarefa 8: códigos OAuth vencidos (valem 10 min). Sem filtro de contas, também os clientes OAuth
// registrados há mais de OAUTH_CLIENTE_ORFAO_DIAS sem nenhuma conexão nem código (o registro é
// aberto, RFC 7591; achado do verifier no 8.10).
async function deleteExpiredOAuth(contaIds?: string[]): Promise<number> {
  let q = db().from("as_oauth_codigos").delete().lt("expira_em", new Date().toISOString());
  if (contaIds) q = q.in("conta_id", contaIds);
  const { data, error } = await q.select("codigo_hash");
  if (error) throw error;
  if (!contaIds) await deleteOrphanOAuthClients();
  return data?.length ?? 0;
}

// Clientes OAuth registrados há mais de OAUTH_CLIENTE_ORFAO_DIAS sem nenhuma credencial nem
// código (anti-junção no banco, os mais antigos primeiro). Recebe: só nos testes, os clientes a
// considerar. Devolve: quantos apagou.
export async function deleteOrphanOAuthClients(clientIds?: string[]): Promise<number> {
  const cutoff = new Date(Date.now() - OAUTH_CLIENTE_ORFAO_DIAS * DAY_MS).toISOString();
  let q = db()
    .from("as_oauth_clientes")
    .select("id, as_credenciais(id), as_oauth_codigos(codigo_hash)")
    .lt("criado_em", cutoff)
    .is("as_credenciais", null)
    .is("as_oauth_codigos", null)
    .order("criado_em")
    .limit(FAXINA_LOTE);
  if (clientIds) q = q.in("id", clientIds);
  const { data, error } = await q;
  if (error) throw error;
  const orphans = (data ?? []).filter((c) => !c.as_credenciais.length && !c.as_oauth_codigos.length).map((c) => c.id);
  if (!orphans.length) return 0;
  const { error: delError } = await db().from("as_oauth_clientes").delete().in("id", orphans);
  if (delError) throw delError;
  return orphans.length;
}

// Roda as oito tarefas em sequência. Recebe: contas a limitar (testes). Devolve: as contagens.
export async function runDailyCleanup({ contaIds }: CleanupOptions = {}): Promise<CleanupResult> {
  const safe = async (name: string, task: () => Promise<number>): Promise<number> => {
    try {
      return await task();
    } catch (e) {
      console.error("faxina_falhou", name, errorCode(e));
      return 0;
    }
  };
  const scope = contaIds ? { contaIds } : {};
  // O que a própria execução criou (aviso e webhook do expirado) já teve a tentativa imediata.
  // criado_em vem do relógio do banco: 1 min de folga para um servidor adiantado (o que ficar de
  // fora sai no dia seguinte).
  const startedAt = new Date(Date.now() - 60_000).toISOString();
  const expirados = await safe("expirar", () => expireEnvelopes(contaIds));
  const lembretes = await safe("lembretes", () => sendDueReminders(contaIds));
  const finalizados = await safe("finalizacoes", () => retryFinalizations(scope));
  await safe("lembretes_presos", async () => (await closeStuckReminders(contaIds), 0));
  const convites = await safe("convites", () => retryFailedInvites(scope));
  const avisos = await safe("avisos", () => retryFailedNotices({ ...scope, criadasAntesDe: startedAt }));
  const webhooks = await safe("webhooks", () => retryWebhooks({ ...scope, criadasAntesDe: startedAt }));
  const expurgados = await safe("expurgo", () => purgeClosedFiles(contaIds));
  const rascunhos = await safe("rascunhos", () => deleteAbandonedDrafts(contaIds));
  const codigos_oauth = await safe("oauth", () => deleteExpiredOAuth(contaIds));
  return { expirados, lembretes, finalizados, convites, avisos, webhooks, expurgados, rascunhos, codigos_oauth };
}
