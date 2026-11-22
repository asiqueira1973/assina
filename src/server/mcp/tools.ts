// Servidor MCP do Assina — seção 13.3 e regra 11.15 (épico 8.10). As 7 ferramentas, montadas por
// requisição e presas à conta da credencial (a conta vem do Bearer, nunca de parâmetro: não há
// como o assistente pedir dado de outra conta). Chamam as mesmas funções do painel e da API
// (princípio 5), com origem e ator "mcp". Respostas em texto em português, com os dados também em
// structuredContent. Leitura com readOnlyHint; cancelar com destructiveHint. O MCP não exclui
// envelope, não posiciona campos e não mexe na chave nem no webhook (11.15).
import "server-only";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { copy } from "@/lib/copy";
import { formatDateShort, formatDateTime } from "@/lib/format";
import { MCP_EVENTOS_DETALHE, MCP_LISTA_MAX, MCP_LISTA_PADRAO, PRAZO_DIAS_MAX, PRAZO_DIAS_MIN } from "@/lib/limits";
import type { Account } from "@/server/db/accounts";
import { db } from "@/server/db/client";
import { ApiCreateInput, createEnvelopeFromApi } from "@/server/envelopes/api-create";
import { DraftError, getEnvelope, getSigners, type RequestMeta } from "@/server/envelopes/drafts";
import { cancelEnvelope, downloadUrl, getTrail, remindSigner } from "@/server/envelopes/manage";
import { sendEnvelope } from "@/server/envelopes/send";
import { errorCode } from "@/server/error-code";
import { siteOrigin } from "@/server/oauth/server";

const T = copy.mcpTools;
const STATUSES = ["rascunho", "enviado", "finalizando", "concluido", "recusado", "cancelado", "expirado"] as const;
type Status = (typeof STATUSES)[number];
// Grupo da lista do painel que contém cada status (a busca e o "n de m" vêm de as_fn_lista_envelopes).
const GROUP: Record<Status, string> = { rascunho: "rascunhos", enviado: "aguardando", finalizando: "aguardando", concluido: "concluidos", recusado: "encerrados", cancelado: "encerrados", expirado: "encerrados" };

type Result = { content: { type: "text"; text: string }[]; structuredContent?: Record<string, unknown>; isError?: boolean };
const ok = (text: string, data?: Record<string, unknown>): Result => ({ content: [{ type: "text", text }], ...(data ? { structuredContent: data } : {}) });

// Erro de negócio vira resposta de ferramenta com isError (o assistente lê e explica). Outros erros
// viram a mensagem genérica, com só o código no log.
async function guarded(fn: () => Promise<Result>): Promise<Result> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof DraftError) {
      const msg = (copy.api.errors as Record<string, string>)[e.code] ?? `${copy.api.errors.dados_invalidos} (${e.code})`;
      return { content: [{ type: "text", text: msg }], structuredContent: { codigo: e.code }, isError: true };
    }
    console.error("erro_interno_mcp", errorCode(e));
    return { content: [{ type: "text", text: copy.api.errors.erro_interno }], isError: true };
  }
}

const panelLink = (id: string) => `${siteOrigin()}/painel/envelopes/${id}`;
const editorLink = (id: string) => `${siteOrigin()}/painel/envelopes/${id}/editar`;

// Emenda de 22/11/2026: algum assinante do envelope está sem campo de assinatura posicionado?
// (aí a assinatura dele aparece só no manifesto e no selo de rodapé). Recebe: o id. Devolve: sim/não.
async function missingSignatureField(envelopeId: string): Promise<boolean> {
  const [{ data: signers, error: sErr }, { data: fields, error: fErr }] = await Promise.all([
    db().from("as_signatarios").select("id").eq("envelope_id", envelopeId).eq("papel", "assinar"),
    db().from("as_campos").select("signatario_id").eq("envelope_id", envelopeId).eq("tipo", "assinatura"),
  ]);
  if (sErr || fErr) throw sErr ?? fErr;
  const withField = new Set(fields!.map((f) => f.signatario_id));
  return signers!.some((s) => !withField.has(s.id));
}

// Monta o servidor da requisição. Recebe: a conta e quem pediu. Devolve: o McpServer.
export function buildMcpServer(account: Account, meta: RequestMeta): McpServer {
  const server = new McpServer({ name: "assina", version: "1.0.0" });
  const contaId = account.id;

  server.registerTool(
    "listar_envelopes",
    {
      title: T.listar.title,
      description: T.listar.description,
      inputSchema: {
        status: z.enum([...STATUSES, "pendentes"]).optional().describe(T.args.status),
        busca: z.string().trim().max(100).optional().describe(T.args.busca),
        limite: z.number().int().min(1).max(MCP_LISTA_MAX).optional().describe(T.args.limite),
      },
      annotations: { readOnlyHint: true },
    },
    ({ status, busca, limite }) =>
      guarded(async () => {
        const wanted: Status | undefined = status === "pendentes" ? "enviado" : status;
        const { data, error } = await db().rpc("as_fn_lista_envelopes", {
          p_conta_id: contaId,
          p_filtro: wanted ? GROUP[wanted] : "todos",
          p_busca: busca ?? "",
          p_limite: 500,
          p_deslocamento: 0,
        });
        if (error) throw error;
        const rows = (data ?? []).filter((r) => !wanted || r.status === wanted).slice(0, limite ?? MCP_LISTA_PADRAO);
        const envelopes = rows.map((r) => ({
          id: r.id,
          titulo: r.titulo,
          status: r.status,
          assinaram: r.assinaram,
          assinantes: r.assinantes,
          criado_em: r.criado_em,
          enviado_em: r.enviado_em,
          concluido_em: r.concluido_em,
        }));
        if (!rows.length) return ok(T.none, { envelopes });
        const text = rows
          .map((r) => T.line(r.titulo, copy.status.envelope[r.status], T.progress(r.assinaram, r.assinantes), r.enviado_em ? T.sent(formatDateShort(r.enviado_em)) : T.created(formatDateShort(r.criado_em)), r.id))
          .join("\n");
        return ok(text, { envelopes });
      }),
  );

  server.registerTool(
    "ver_envelope",
    { title: T.ver.title, description: T.ver.description, inputSchema: { id: z.string().describe(T.args.id) }, annotations: { readOnlyHint: true } },
    ({ id }) =>
      guarded(async () => {
        const e = await getEnvelope(contaId, id);
        if (!e) throw new DraftError("nao_encontrado");
        const [signers, trail] = await Promise.all([getSigners(contaId, id), getTrail(contaId, id)]);
        const events = trail.events.slice(-MCP_EVENTOS_DETALHE);
        const lines = [
          `${e.titulo} — ${copy.status.envelope[e.status]}`,
          ...(e.prazo_em ? [T.deadline(formatDateTime(e.prazo_em))] : []),
          T.panel(panelLink(e.id)),
          "",
          T.recipients,
          ...signers.map((s) => `• ${s.nome} <${s.email}> — ${s.papel === "copia" ? copy.status.signerCopy : s.assinado_em ? copy.status.signerSigned(formatDateTime(s.assinado_em)) : s.recusado_em ? copy.status.signerDeclined(formatDateTime(s.recusado_em)) : s.status === "aguardando" ? copy.status.signerWaiting : copy.status.signerWaitingTurn}`),
          "",
          T.trail,
          ...events.map((ev) => `• ${formatDateTime(ev.ocorrido_em)} — ${copy.events[ev.tipo]}${ev.pessoa ? ` — ${ev.pessoa}` : ""}`),
        ];
        return ok(lines.join("\n"), {
          envelope: { id: e.id, titulo: e.titulo, status: e.status, prazo_em: e.prazo_em, codigo_verificacao: e.codigo_verificacao, link: panelLink(e.id) },
          signatarios: signers.map((s) => ({ id: s.id, nome: s.nome, email: s.email, papel: s.papel, status: s.status, assinado_em: s.assinado_em, recusado_em: s.recusado_em })),
          eventos: events.map((ev) => ({ seq: ev.seq, tipo: ev.tipo, ator: ev.ator, pessoa: ev.pessoa, ocorrido_em: ev.ocorrido_em })),
        });
      }),
  );

  server.registerTool(
    "criar_envelope",
    {
      title: T.criar.title,
      description: T.criar.description,
      inputSchema: {
        titulo: z.string().describe(T.args.titulo),
        signatarios: z
          .array(z.object({ nome: z.string(), email: z.string(), papel: z.enum(["assinar", "copia"]).optional(), ordem: z.number().int().optional(), exigir_cpf: z.boolean().optional(), exigir_nascimento: z.boolean().optional() }))
          .describe(T.args.signatarios),
        arquivo_url: z.string().optional().describe(T.args.arquivo_url),
        mensagem: z.string().optional().describe(T.args.mensagem),
        em_ordem: z.boolean().optional().describe(T.args.em_ordem),
        prazo_dias: z.number().int().min(PRAZO_DIAS_MIN).max(PRAZO_DIAS_MAX).optional().describe(T.args.prazo_dias),
      },
    },
    (args) =>
      guarded(async () => {
        // Mesma validação da API (sem campos: o MCP não posiciona campos, regra 11.15).
        const parsed = ApiCreateInput.safeParse(args);
        if (!parsed.success) {
          const campos = parsed.error.issues.map((i) => i.path.join(".") || "corpo").join(", ");
          return { content: [{ type: "text", text: `${copy.api.errors.dados_invalidos} (${campos})` }], isError: true };
        }
        const r = await createEnvelopeFromApi(contaId, parsed.data, null, meta, { origem: "mcp", ator: "mcp" });
        const lines = [T.draftCreated(r.envelope.titulo, r.envelope.id)];
        lines.push(r.envelope.paginas ? T.fileAttached(r.envelope.paginas) : T.attachFile(editorLink(r.envelope.id)));
        // O MCP nunca posiciona campos (regra 11.15): avisa onde a assinatura vai aparecer.
        lines.push(T.noVisibleSignature(editorLink(r.envelope.id)));
        lines.push(T.notSent);
        return ok(lines.join("\n"), { envelope: { id: r.envelope.id, titulo: r.envelope.titulo, status: r.envelope.status, paginas: r.envelope.paginas, enviado: false, assinatura_visivel_no_documento: false } });
      }),
  );

  server.registerTool(
    "enviar_envelope",
    { title: T.enviar.title, description: T.enviar.description, inputSchema: { id: z.string().describe(T.args.id) } },
    ({ id }) =>
      guarded(async () => {
        const r = await sendEnvelope(contaId, id, { ator: "mcp", meta });
        const semCampo = await missingSignatureField(r.envelope.id);
        const text = semCampo ? `${T.sentNow(r.envelope.titulo, r.invites.sent)}\n${T.sentWithoutField}` : T.sentNow(r.envelope.titulo, r.invites.sent);
        return ok(text, { envelope: { id: r.envelope.id, status: r.envelope.status, assinatura_visivel_no_documento: !semCampo }, convites: r.invites });
      }),
  );

  server.registerTool(
    "lembrar_signatarios",
    { title: T.lembrar.title, description: T.lembrar.description, inputSchema: { id: z.string().describe(T.args.id), email: z.string().optional().describe(T.args.email) } },
    ({ id, email }) =>
      guarded(async () => {
        const e = await getEnvelope(contaId, id);
        if (!e) throw new DraftError("nao_encontrado");
        if (e.status !== "enviado") throw new DraftError("status_mudou");
        const waiting = (await getSigners(contaId, id)).filter((s) => s.papel === "assinar" && s.status === "aguardando");
        if (email) {
          const s = waiting.find((x) => x.email === email.trim().toLowerCase());
          if (!s) return { content: [{ type: "text", text: T.notFoundEmail }], isError: true };
          await remindSigner(contaId, id, s.id, meta, "mcp");
          return ok(T.reminded(1), { lembrados: 1 });
        }
        let n = 0;
        for (const s of waiting) {
          try {
            await remindSigner(contaId, id, s.id, meta, "mcp");
            n++;
          } catch (err) {
            if (!(err instanceof DraftError && ["lembrete_recente", "limite_lembretes"].includes(err.code))) throw err;
          }
        }
        return ok(T.reminded(n), { lembrados: n });
      }),
  );

  server.registerTool(
    "cancelar_envelope",
    {
      title: T.cancelar.title,
      description: T.cancelar.description,
      inputSchema: { id: z.string().describe(T.args.id), motivo: z.string().max(500).optional().describe(T.args.motivo) },
      annotations: { destructiveHint: true },
    },
    ({ id, motivo }) =>
      guarded(async () => {
        if (!(await getEnvelope(contaId, id))) throw new DraftError("nao_encontrado");
        await cancelEnvelope(contaId, id, motivo?.trim() || null, meta, "mcp");
        const e = await getEnvelope(contaId, id);
        return ok(T.canceled(e!.titulo), { envelope: { id, status: e!.status } });
      }),
  );

  server.registerTool(
    "link_do_documento",
    {
      title: T.link.title,
      description: T.link.description,
      inputSchema: { id: z.string().describe(T.args.id), versao: z.enum(["original", "final"]).describe(T.args.versao) },
      annotations: { readOnlyHint: true },
    },
    ({ id, versao }) =>
      guarded(async () => {
        const url = await downloadUrl(contaId, id, versao, meta, "mcp");
        return ok(T.linkText(url), { url });
      }),
  );

  return server;
}
