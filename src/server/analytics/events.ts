// Catálogo dos eventos de produto — seção 21 e critério 8.11. Cada evento tem a sua tela e o seu
// esquema de propriedades, fechado (`.strict()`): o que não está aqui não sai. Nenhuma
// propriedade carrega título, nome, e-mail, CPF, mensagem, motivo, IP, valor de campo ou nome
// de arquivo — só contagens, enums e booleanos (a exceção é `cliente` do MCP, que é o nome do
// cliente OAuth, ex. "Claude", e não de uma pessoa).
// Os nomes são série histórica no Visão do Produto: não renomeie.
import "server-only";
import { z } from "zod";
import { ANALYTICS_CLIENTE_MAX, ANALYTICS_NUMERO_MAX, ANALYTICS_ROTA_MAX } from "@/lib/limits";

const count = z.number().int().min(0).max(ANALYTICS_NUMERO_MAX);
const origem = z.enum(["painel", "api", "mcp"]);
const none = z.object({}).strict();

// Esquema de propriedades de cada evento (seção 21, coluna "Propriedades").
export const EVENT_SCHEMAS = {
  assina_conta_criada: none,
  assina_envelope_criado: z.object({ origem }).strict(),
  assina_envelope_enviado: z
    .object({
      origem,
      nivel: z.union([z.literal(1), z.literal(2), z.literal(3)]),
      assinantes: count,
      copias: count,
      em_ordem: z.boolean(),
      com_campos: z.boolean(),
      paginas: count,
      prazo_dias: count,
    })
    .strict(),
  assina_documento_aberto: z.object({ ordem: count }).strict(),
  assina_codigo_validado: z.object({ tentativas: count }).strict(),
  assina_documento_assinado: z
    .object({ metodo: z.enum(["digitada", "desenhada"]), campos: count, cpf_exigido: z.boolean(), nascimento_exigido: z.boolean(), minutos_desde_convite: count.nullable() })
    .strict(),
  assina_documento_recusado: none,
  assina_envelope_concluido: z.object({ origem, horas_ate_concluir: z.number().min(0).max(ANALYTICS_NUMERO_MAX), selo: z.enum(["B-B", "B-T"]) }).strict(),
  assina_envelope_cancelado: z.object({ origem }).strict(),
  assina_envelope_expirado: z.object({ assinaram: count, faltaram: count }).strict(),
  assina_lembrete_enviado: z.object({ automatico: z.boolean() }).strict(),
  assina_documento_verificado: z.object({ por: z.enum(["arquivo", "codigo"]), resultado: z.enum(["final", "original", "nao_encontrado"]) }).strict(),
  assina_chave_api_gerada: none,
  assina_webhook_configurado: none,
  assina_mcp_conectado: z.object({ cliente: z.string().trim().min(1).max(ANALYTICS_CLIENTE_MAX) }).strict(),
  // rota: o padrão, com {id} no lugar de qualquer identificador (nunca o id em si).
  assina_api_chamada: z
    .object({ rota: z.string().max(ANALYTICS_ROTA_MAX).regex(/^\/[a-z0-9/{}_.-]+$/), status: z.number().int().min(100).max(599) })
    .strict(),
} as const;

export type EventName = keyof typeof EVENT_SCHEMAS;

/** União fechada por evento (seção 21): as propriedades que cada evento aceita, e só elas. */
export type PropriedadesDeEvento = { [N in EventName]: z.infer<(typeof EVENT_SCHEMAS)[N]> };

// Tela de cada evento (seção 21, coluna "Tela").
export const EVENT_SCREENS: Record<EventName, string> = {
  assina_conta_criada: "entrar",
  assina_envelope_criado: "novo envelope",
  assina_envelope_enviado: "revisar",
  assina_documento_aberto: "assinar",
  assina_codigo_validado: "assinar",
  assina_documento_assinado: "assinar",
  assina_documento_recusado: "assinar",
  assina_envelope_concluido: "sistema",
  assina_envelope_cancelado: "detalhe",
  assina_envelope_expirado: "sistema",
  assina_lembrete_enviado: "detalhe",
  assina_documento_verificado: "verificar",
  assina_chave_api_gerada: "integracoes",
  assina_webhook_configurado: "integracoes",
  assina_mcp_conectado: "autorizar",
  assina_api_chamada: "api",
};

// Origem de uma ação a partir do ator da trilha: o painel age como "remetente".
export function originFromActor(ator: string): "painel" | "api" | "mcp" {
  return ator === "api" || ator === "mcp" ? ator : "painel";
}
