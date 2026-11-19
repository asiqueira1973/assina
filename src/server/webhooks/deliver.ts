// Webhooks — regra 11.17 (épico 8.9). As entregas nascem na fila do banco, na mesma transação
// do fato (assinou, concluído, recusado, cancelado; expirado no 8.13). Aqui:
// - deliverWebhook: reserva (as_fn_reserva_entrega: um envio por vez, conta a tentativa, até 6),
//   POST JSON com timeout de 10 s pelo fetch protegido contra SSRF (sem seguir redirecionamento),
//   cabeçalhos Assina-Assinatura (t={epoch},v1={hmac_sha256(segredo, t + "." + corpo)}),
//   Assina-Entrega e Assina-Evento. 2xx é sucesso; o resto fica "falhou" com o status HTTP.
// - deliverEnvelopeWebhooks: o que estiver pendente de um envelope (logo depois do fato);
// - retryWebhooks: a parte da faxina (rota no 8.13);
// - sendTestWebhook: "Enviar teste" da tela Integrações (não grava entrega).
// O segredo fica cifrado em as_contas (AES-256-GCM); nada de URL, segredo ou corpo em log.
import "server-only";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { FAXINA_LOTE, WEBHOOK_RESPOSTA_MAX, WEBHOOK_TENTATIVAS, WEBHOOK_TIMEOUT_MS } from "@/lib/limits";
import { decryptSecret } from "@/server/crypto/aes";
import { db } from "@/server/db/client";
import { errorCode } from "@/server/error-code";
import { fetchRemote } from "@/server/files/fetch-remote";

export const WEBHOOK_SECRET_PREFIX = "whsec_";

// Segredo novo do webhook. Devolve: o valor em claro (vai cifrado para o banco).
export function generateWebhookSecret(): string {
  return WEBHOOK_SECRET_PREFIX + randomBytes(32).toString("base64url");
}

// Assinatura da regra 11.17. Recebe: segredo, epoch em segundos e o corpo exato enviado.
// Devolve: o valor do cabeçalho Assina-Assinatura.
export function signatureHeader(secret: string, epoch: number, body: string): string {
  return `t=${epoch},v1=${createHmac("sha256", secret).update(`${epoch}.${body}`).digest("hex")}`;
}

// Faz o POST. Devolve: o status HTTP (0 quando não houve resposta).
async function post(url: string, secret: string, entregaId: string, evento: string, body: string): Promise<number> {
  const epoch = Math.floor(Date.now() / 1000);
  try {
    const res = await fetchRemote(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "assina-assinatura": signatureHeader(secret, epoch, body),
        "assina-entrega": entregaId,
        "assina-evento": evento,
      },
      body,
      maxBytes: WEBHOOK_RESPOSTA_MAX,
      excess: "cortar", // regra 11.17: sucesso é 2xx, qualquer que seja o tamanho da resposta
      timeoutMs: WEBHOOK_TIMEOUT_MS,
      maxRedirects: 0,
    });
    return res.status;
  } catch (e) {
    console.error("webhook_falhou", errorCode(e));
    return 0;
  }
}

// URL e segredo do webhook da conta (ou null).
async function webhookOf(contaId: string): Promise<{ url: string; secret: string } | null> {
  const { data } = await db().from("as_contas").select("webhook_url, webhook_segredo_cifrado, suspensa_em").eq("id", contaId).maybeSingle();
  if (!data?.webhook_url || !data.webhook_segredo_cifrado || data.suspensa_em) return null;
  return { url: data.webhook_url, secret: decryptSecret(data.webhook_segredo_cifrado) };
}

// Entrega uma da fila. Devolve: "entregue", "falhou" ou "pulada" (reservada por outro,
// tentativas esgotadas, já entregue, conta sem webhook).
export async function deliverWebhook(entregaId: string): Promise<"entregue" | "falhou" | "pulada"> {
  const { data: d } = await db().from("as_entregas_webhook").select("id, conta_id, evento, corpo").eq("id", entregaId).maybeSingle();
  if (!d) return "pulada";
  const hook = await webhookOf(d.conta_id);
  if (!hook) return "pulada";
  const { data: claimed, error } = await db().rpc("as_fn_reserva_entrega", { p_id: entregaId, p_max: WEBHOOK_TENTATIVAS });
  if (error) throw error;
  if (!claimed) return "pulada";

  const status = await post(hook.url, hook.secret, d.id, d.evento, JSON.stringify(d.corpo));
  const ok = status >= 200 && status < 300;
  await db()
    .from("as_entregas_webhook")
    .update({ status: ok ? "entregue" : "falhou", ultimo_status_http: status || null, entregue_em: ok ? new Date().toISOString() : null, reservada_em: null })
    .eq("id", entregaId);
  return ok ? "entregue" : "falhou";
}

// Entrega o que está pendente de um envelope (depois do fato). Nunca lança.
export async function deliverEnvelopeWebhooks(envelopeId: string): Promise<void> {
  try {
    const { data } = await db().from("as_entregas_webhook").select("id").eq("envelope_id", envelopeId).eq("status", "pendente").order("criado_em");
    for (const d of data ?? []) await deliverWebhook(d.id);
  } catch (e) {
    console.error("webhook_falhou", errorCode(e));
  }
}

// Reentrega as pendentes e as que falharam com tentativa sobrando (faxina, regra 11.17).
// Recebe: contas a limitar (testes) e, da faxina, o início da execução (a entrega criada nela já
// teve a tentativa imediata: uma por execução, regra 11.17). Devolve: quantas foram entregues.
export async function retryWebhooks(opts: { contaIds?: string[]; criadasAntesDe?: string } = {}): Promise<number> {
  // Só de contas ativas que ainda têm webhook: sem URL (ou suspensa), a entrega não tem para onde ir (e "pulada" não
  // conta tentativa, então a faxina a pegaria para sempre).
  let q = db()
    .from("as_entregas_webhook")
    .select("id, as_contas!inner(webhook_url, suspensa_em)")
    .neq("status", "entregue")
    .lt("tentativas", WEBHOOK_TENTATIVAS)
    .not("as_contas.webhook_url", "is", null)
    .is("as_contas.suspensa_em", null)
    .order("criado_em")
    .limit(FAXINA_LOTE);
  if (opts.contaIds) q = q.in("conta_id", opts.contaIds);
  if (opts.criadasAntesDe) q = q.lt("criado_em", opts.criadasAntesDe);
  const { data, error } = await q;
  if (error) throw error;
  let done = 0;
  for (const d of data ?? []) if ((await deliverWebhook(d.id)) === "entregue") done++;
  return done;
}

// "Enviar teste" (tela Integrações): um POST assinado com o evento "teste", sem gravar entrega.
// Recebe: a conta. Devolve: o status HTTP (0 sem resposta) ou null se não há webhook.
export async function sendTestWebhook(contaId: string): Promise<number | null> {
  const hook = await webhookOf(contaId);
  if (!hook) return null;
  const body = JSON.stringify({ evento: "teste", ocorrido_em: new Date().toISOString() });
  return post(hook.url, hook.secret, randomUUID(), "teste", body);
}
