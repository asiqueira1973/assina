// Documento OpenAPI 3.1 da API REST v1 — seção 13.2 e critério 8.9 (GET /api/v1/openapi.json,
// mostrado legível em /docs/api). Fonte única: as rotas de src/app/api/v1 seguem este contrato,
// e o teste valida o documento contra o esquema oficial do OpenAPI 3.1.
// Os exemplos usam dados fictícios. A URL do servidor vem de NEXT_PUBLIC_SITE_URL.
import "server-only";
import {
  API_LISTA_MAX,
  API_LISTA_PADRAO,
  IDEMPOTENCIA_MAX,
  MAX_ASSINANTES,
  MAX_COPIAS,
  MENSAGEM_MAX,
  MOTIVO_CANCELAMENTO_MAX,
  NOME_ARQUIVO_MAX,
  NOME_MAX,
  PRAZO_DIAS_MAX,
  PRAZO_DIAS_MIN,
  ROTULO_MAX,
  TITULO_MAX,
  WEBHOOK_TENTATIVAS,
  LIMITE_ARQUIVO_BYTES,
  UPLOAD_URL_SEGUNDOS,
  LIMITE_ENVIOS_24H,
  MAX_LEMBRETES,
  LEMBRETE_MANUAL_INTERVALO_H,
  REMOTO_TIMEOUT_MS,
  REMOTO_REDIRECIONAMENTOS,
  WEBHOOK_TIMEOUT_MS,
} from "@/lib/limits";

// Números dos textos, sempre de limits.ts (o contrato acompanha os limites de verdade).
const MB = LIMITE_ARQUIVO_BYTES / 1024 / 1024;
const UPLOAD_H = UPLOAD_URL_SEGUNDOS / 3600;
const REMOTO_S = REMOTO_TIMEOUT_MS / 1000;
const WEBHOOK_S = WEBHOOK_TIMEOUT_MS / 1000;

const errorRef = { $ref: "#/components/schemas/Erro" };
const err = (description: string, example: Record<string, unknown>) => ({
  description,
  content: { "application/json": { schema: errorRef, example } },
});
const E = {
  400: err("Dados inválidos ou arquivo recusado", { codigo: "dados_invalidos", mensagem: "Os dados enviados não passaram na validação. Veja \"campos\".", campos: [{ campo: "signatarios.0.email", motivo: "invalid_format" }] }),
  401: err("Chave ausente, revogada ou de conta suspensa", { codigo: "credencial_invalida", mensagem: "Chave de API ausente, revogada ou de conta suspensa." }),
  404: err("Envelope não encontrado (inclusive de outra conta)", { codigo: "nao_encontrado", mensagem: "Envelope não encontrado." }),
  409: err("O envelope mudou de situação", { codigo: "status_mudou", mensagem: "O envelope mudou de situação e a ação não vale mais." }),
  429: err("Limite atingido", { codigo: "limite_do_nivel", mensagem: "Limite de documentos do nível da conta.", limite: 50, usados: 50 }),
  500: err("Erro interno (sem detalhe)", { codigo: "erro_interno", mensagem: "Algo deu errado. Nada foi alterado. Tente de novo." }),
};
const idParam = { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } };
const json = (schema: unknown, example?: unknown) => ({ "application/json": { schema, ...(example ? { example } : {}) } });

const envelopeExample = {
  id: "5b0c6a8e-2f1d-4c4a-9d7e-1a2b3c4d5e6f",
  titulo: "Contrato de prestação de serviços",
  mensagem: null,
  status: "enviado",
  origem: "api",
  em_ordem: false,
  prazo_dias: 30,
  prazo_em: "2026-12-17T15:00:00.000Z",
  lembrete_cada_dias: 3,
  nome_arquivo: "contrato.pdf",
  paginas: 2,
  codigo_verificacao: "7K2M9QXH4T1B",
  hash_original: "9f2c…",
  hash_final: null,
  selo: null,
  motivo_cancelamento: null,
  criado_em: "2026-11-17T15:00:00.000Z",
  enviado_em: "2026-11-17T15:01:00.000Z",
  concluido_em: null,
  encerrado_em: null,
};

export function openApiDocument() {
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://assina.app.br";
  return {
    openapi: "3.1.0",
    info: {
      title: "Assina — API REST",
      version: "1.0.0",
      description:
        "Crie, envie e acompanhe envelopes de assinatura. Autenticação por `Authorization: Bearer assina_…` (a chave fica em Integrações, no painel). JSON UTF-8, campos em português. Erros no formato `{codigo, mensagem}`.",
      license: { name: "MIT", identifier: "MIT" },
    },
    servers: [{ url: `${site}/api/v1` }],
    security: [{ chave: [] }],
    tags: [{ name: "Envelopes" }, { name: "Documento" }],
    paths: {
      "/envelopes": {
        post: {
          tags: ["Envelopes"],
          operationId: "criarEnvelope",
          summary: "Cria um rascunho",
          description:
            "Sempre cria um rascunho (nunca envia). Com `arquivo_url` (só https, até " + MB + " MB), o PDF é baixado e validado na hora, e os `campos` podem vir junto. Sem ele, a resposta traz `upload_url` (PUT do PDF, válida por " + UPLOAD_H + " h); depois chame `POST /envelopes/{id}/arquivo`. Repetir a mesma `Idempotency-Key` devolve o mesmo envelope com 200.",
          parameters: [{ name: "Idempotency-Key", in: "header", required: false, schema: { type: "string", minLength: 1, maxLength: IDEMPOTENCIA_MAX } }],
          requestBody: {
            required: true,
            content: json(
              { $ref: "#/components/schemas/NovoEnvelope" },
              {
                titulo: "Contrato de prestação de serviços",
                arquivo_url: "https://exemplo.com.br/contrato.pdf",
                signatarios: [
                  { nome: "Ana Souza", email: "ana@exemplo.com.br", exigir_cpf: true, exigir_nascimento: true },
                  { nome: "Bruno Lima", email: "bruno@exemplo.com.br" },
                ],
                campos: [{ signatario_email: "ana@exemplo.com.br", tipo: "assinatura", pagina: 2, x: 0.1, y: 0.8 }],
              },
            ),
          },
          responses: {
            201: { description: "Criado", content: json({ type: "object", required: ["envelope"], properties: { envelope: { $ref: "#/components/schemas/Envelope" }, upload_url: { type: "string", format: "uri" } } }, { envelope: { ...envelopeExample, status: "rascunho", enviado_em: null, prazo_em: null, hash_original: null } }) },
            200: { description: "Mesma Idempotency-Key: o envelope que já existia", content: json({ type: "object", properties: { envelope: { $ref: "#/components/schemas/Envelope" } } }) },
            400: E[400],
            401: E[401],
            500: E[500],
          },
        },
        get: {
          tags: ["Envelopes"],
          operationId: "listarEnvelopes",
          summary: "Lista os envelopes da conta",
          parameters: [
            { name: "status", in: "query", schema: { $ref: "#/components/schemas/StatusEnvelope" } },
            { name: "limite", in: "query", schema: { type: "integer", minimum: 1, maximum: API_LISTA_MAX, default: API_LISTA_PADRAO } },
            { name: "cursor", in: "query", description: "O `proximo_cursor` da página anterior.", schema: { type: "string" } },
          ],
          responses: {
            200: { description: "Página da lista", content: json({ type: "object", required: ["envelopes", "proximo_cursor"], properties: { envelopes: { type: "array", items: { $ref: "#/components/schemas/Envelope" } }, proximo_cursor: { type: ["string", "null"] } } }, { envelopes: [envelopeExample], proximo_cursor: null }) },
            400: E[400],
            401: E[401],
          },
        },
      },
      "/envelopes/{id}": {
        parameters: [idParam],
        get: {
          tags: ["Envelopes"],
          operationId: "verEnvelope",
          summary: "Envelope e destinatários",
          responses: {
            200: { description: "Envelope", content: json({ type: "object", properties: { envelope: { $ref: "#/components/schemas/Envelope" }, signatarios: { type: "array", items: { $ref: "#/components/schemas/Signatario" } } } }) },
            401: E[401],
            404: E[404],
          },
        },
        delete: {
          tags: ["Envelopes"],
          operationId: "excluirRascunho",
          summary: "Exclui um rascunho",
          description: "Só rascunhos. Fora disso, `409 envelope_nao_e_rascunho` (cancele pelo painel ou por `/cancelar`).",
          responses: { 204: { description: "Excluído" }, 401: E[401], 404: E[404], 409: err("Não é rascunho", { codigo: "envelope_nao_e_rascunho", mensagem: "Só rascunhos podem ser excluídos pela API." }) },
        },
      },
      "/envelopes/{id}/arquivo": {
        parameters: [idParam],
        post: {
          tags: ["Documento"],
          operationId: "anexarArquivo",
          summary: "Valida o PDF enviado pela upload_url",
          responses: { 200: { description: "Anexado", content: json({ type: "object", properties: { envelope: { $ref: "#/components/schemas/Envelope" } } }) }, 400: E[400], 401: E[401], 404: E[404], 409: E[409] },
        },
        get: {
          tags: ["Documento"],
          operationId: "baixarArquivo",
          summary: "URL temporária do original ou do assinado",
          parameters: [{ name: "versao", in: "query", schema: { type: "string", enum: ["original", "final"], default: "original" } }],
          responses: {
            200: { description: "URL de 5 minutos", content: json({ type: "object", properties: { url: { type: "string", format: "uri" }, expira_em: { type: "string", format: "date-time" } } }) },
            401: E[401],
            404: E[404],
          },
        },
      },
      "/envelopes/{id}/enviar": {
        parameters: [idParam],
        post: {
          tags: ["Envelopes"],
          operationId: "enviarEnvelope",
          summary: "Envia para assinatura",
          description: "Congela o rascunho e manda os convites. Limites: " + LIMITE_ENVIOS_24H + " envios em 24 h e o limite de documentos do nível da conta (`429` com `limite` e `usados`).",
          responses: { 200: { description: "Enviado", content: json({ type: "object", properties: { envelope: { $ref: "#/components/schemas/Envelope" } } }) }, 400: E[400], 401: E[401], 404: E[404], 409: E[409], 429: E[429] },
        },
      },
      "/envelopes/{id}/eventos": {
        parameters: [idParam],
        get: {
          tags: ["Envelopes"],
          operationId: "trilha",
          summary: "Trilha de auditoria",
          responses: {
            200: {
              description: "Eventos em ordem, encadeados por hash; `divergencia` é null quando a trilha está íntegra",
              content: json({ type: "object", properties: { eventos: { type: "array", items: { $ref: "#/components/schemas/Evento" } }, divergencia: { type: ["integer", "null"] } } }),
            },
            401: E[401],
            404: E[404],
          },
        },
      },
      "/envelopes/{id}/cancelar": {
        parameters: [idParam],
        post: {
          tags: ["Envelopes"],
          operationId: "cancelarEnvelope",
          summary: "Cancela um envelope enviado",
          requestBody: { content: json({ type: "object", additionalProperties: false, properties: { motivo: { type: ["string", "null"], maxLength: MOTIVO_CANCELAMENTO_MAX } } }, { motivo: "Valor mudou" }) },
          responses: { 200: { description: "Cancelado", content: json({ type: "object", properties: { envelope: { $ref: "#/components/schemas/Envelope" } } }) }, 401: E[401], 404: E[404], 409: E[409] },
        },
      },
      "/envelopes/{id}/lembrar": {
        parameters: [idParam],
        post: {
          tags: ["Envelopes"],
          operationId: "lembrar",
          summary: "Manda lembrete",
          description: "Com `signatario_id`, só para ele; sem, para todos os que estão aguardando. No máximo um lembrete a cada " + LEMBRETE_MANUAL_INTERVALO_H + " h por pessoa, até " + MAX_LEMBRETES + ". Cada lembrete leva um link novo.",
          requestBody: { content: json({ type: "object", additionalProperties: false, properties: { signatario_id: { type: "string", format: "uuid" } } }) },
          responses: { 200: { description: "Quantos receberam", content: json({ type: "object", properties: { lembrados: { type: "integer" } } }, { lembrados: 1 }) }, 401: E[401], 404: E[404], 409: E[409], 429: E[429] },
        },
      },
    },
    webhooks: {
      envelope: {
        post: {
          summary: "Evento de envelope",
          description:
            "Enviado para a URL configurada em Integrações, com timeout de " + WEBHOOK_S + " s; 2xx é sucesso. Até " + WEBHOOK_TENTATIVAS + " tentativas. Cabeçalhos: `Assina-Assinatura: t={epoch},v1={hex(hmac_sha256(segredo, t + \".\" + corpo))}`, `Assina-Entrega` e `Assina-Evento`. Confira a assinatura sobre o corpo cru, antes de interpretar o JSON.",
          requestBody: { content: json({ $ref: "#/components/schemas/Webhook" }) },
          responses: { 200: { description: "Recebido" } },
        },
      },
    },
    components: {
      securitySchemes: { chave: { type: "http", scheme: "bearer", description: "`assina_` + 43 caracteres. Uma por conta; gerar outra revoga a anterior." } },
      schemas: {
        Erro: {
          type: "object",
          required: ["codigo", "mensagem"],
          properties: {
            codigo: { type: "string" },
            mensagem: { type: "string" },
            campos: { type: "array", items: { type: "object", properties: { campo: { type: "string" }, motivo: { type: "string" } } } },
            motivo: { type: "string", enum: ["nao_e_pdf", "grande_demais", "paginas_demais", "protegido_por_senha", "pagina_grande_demais", "url_recusada", "download_falhou", "arquivo_ausente"] },
            limite: { type: "integer" },
            usados: { type: "integer" },
          },
        },
        StatusEnvelope: { type: "string", enum: ["rascunho", "enviado", "finalizando", "concluido", "recusado", "cancelado", "expirado"] },
        NovoEnvelope: {
          type: "object",
          additionalProperties: false,
          required: ["titulo", "signatarios"],
          properties: {
            titulo: { type: "string", minLength: 1, maxLength: TITULO_MAX },
            mensagem: { type: ["string", "null"], maxLength: MENSAGEM_MAX },
            em_ordem: { type: "boolean" },
            prazo_dias: { type: "integer", minimum: PRAZO_DIAS_MIN, maximum: PRAZO_DIAS_MAX },
            lembrete_cada_dias: { type: ["integer", "null"], enum: [2, 3, 7, null] },
            arquivo_url: { type: "string", format: "uri", description: "Só https; IP público; até " + REMOTO_REDIRECIONAMENTOS + " redirecionamentos; " + REMOTO_S + " s; até " + MB + " MB." },
            nome_arquivo: { type: "string", maxLength: NOME_ARQUIVO_MAX },
            signatarios: {
              type: "array",
              minItems: 1,
              maxItems: MAX_ASSINANTES + MAX_COPIAS,
              items: {
                type: "object",
                additionalProperties: false,
                required: ["nome", "email"],
                properties: {
                  nome: { type: "string", maxLength: NOME_MAX },
                  email: { type: "string", format: "email" },
                  papel: { type: "string", enum: ["assinar", "copia"], default: "assinar" },
                  ordem: { type: "integer", minimum: 1, maximum: MAX_ASSINANTES },
                  exigir_cpf: { type: "boolean", default: false },
                  exigir_nascimento: { type: "boolean", default: false, description: "Pede a data de nascimento ao assinar (só para assinar)." },
                },
              },
            },
            campos: {
              type: "array",
              description: "Só com `arquivo_url`. Coordenadas em fração da página (0 a 1, origem no canto superior esquerdo). Sem largura e altura, vale o tamanho padrão do tipo.",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["signatario_email", "tipo", "pagina", "x", "y"],
                properties: {
                  signatario_email: { type: "string", format: "email" },
                  tipo: { type: "string", enum: ["assinatura", "rubrica", "data", "nome", "texto", "caixa"] },
                  pagina: { type: "integer", minimum: 1 },
                  x: { type: "number", minimum: 0, maximum: 1 },
                  y: { type: "number", minimum: 0, maximum: 1 },
                  largura: { type: "number", exclusiveMinimum: 0, maximum: 1 },
                  altura: { type: "number", exclusiveMinimum: 0, maximum: 1 },
                  obrigatorio: { type: "boolean" },
                  rotulo: { type: ["string", "null"], maxLength: ROTULO_MAX },
                },
              },
            },
          },
        },
        Envelope: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            titulo: { type: "string" },
            mensagem: { type: ["string", "null"] },
            status: { $ref: "#/components/schemas/StatusEnvelope" },
            origem: { type: "string", enum: ["painel", "api", "mcp"] },
            em_ordem: { type: "boolean" },
            prazo_dias: { type: "integer" },
            prazo_em: { type: ["string", "null"], format: "date-time" },
            lembrete_cada_dias: { type: ["integer", "null"] },
            nome_arquivo: { type: ["string", "null"] },
            paginas: { type: ["integer", "null"] },
            codigo_verificacao: { type: "string" },
            hash_original: { type: ["string", "null"] },
            hash_final: { type: ["string", "null"] },
            selo: { type: ["string", "null"], enum: ["B-B", "B-T", null] },
            motivo_cancelamento: { type: ["string", "null"] },
            criado_em: { type: "string", format: "date-time" },
            enviado_em: { type: ["string", "null"], format: "date-time" },
            concluido_em: { type: ["string", "null"], format: "date-time" },
            encerrado_em: { type: ["string", "null"], format: "date-time" },
          },
          example: envelopeExample,
        },
        Signatario: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            nome: { type: "string" },
            email: { type: "string" },
            papel: { type: "string", enum: ["assinar", "copia"] },
            ordem: { type: "integer" },
            status: { type: "string", enum: ["pendente", "aguardando", "assinou", "recusou"] },
            assinado_em: { type: ["string", "null"], format: "date-time" },
            recusado_em: { type: ["string", "null"], format: "date-time" },
            motivo_recusa: { type: ["string", "null"] },
          },
        },
        Evento: {
          type: "object",
          properties: {
            seq: { type: "integer" },
            tipo: { type: "string" },
            ator: { type: "string", enum: ["remetente", "signatario", "sistema", "api", "mcp"] },
            signatario_id: { type: ["string", "null"], format: "uuid" },
            ip: { type: ["string", "null"] },
            ocorrido_em: { type: "string", format: "date-time" },
            hash: { type: "string" },
          },
        },
        Webhook: {
          type: "object",
          required: ["evento", "envelope", "ocorrido_em"],
          properties: {
            evento: { type: "string", enum: ["signatario.assinou", "envelope.concluido", "envelope.recusado", "envelope.cancelado", "envelope.expirado"] },
            envelope: {
              type: "object",
              properties: {
                id: { type: "string", format: "uuid" },
                status: { $ref: "#/components/schemas/StatusEnvelope" },
                titulo: { type: "string" },
                codigo_verificacao: { type: "string" },
                concluido_em: { type: ["string", "null"], format: "date-time" },
                hash_final: { type: ["string", "null"] },
              },
            },
            signatario: { type: "object", properties: { id: { type: "string", format: "uuid" }, email: { type: "string" }, assinado_em: { type: "string", format: "date-time" } } },
            ocorrido_em: { type: "string", format: "date-time" },
          },
        },
      },
    },
  };
}
