// /api/v1/envelopes — seção 13.2.
// POST: cria o rascunho (com arquivo_url, ou devolve upload_url) — 201 {envelope, upload_url?};
//   Idempotency-Key repetida → 200 com o mesmo envelope.
// GET: lista da conta, mais recentes primeiro — ?status=&limite=1..100 (20)&cursor= →
//   {envelopes, proximo_cursor}.
import type { NextRequest } from "next/server";
import { z } from "zod";
import { API_LISTA_MAX, API_LISTA_PADRAO, IDEMPOTENCIA_MAX } from "@/lib/limits";
import { apiError, apiRoute, decodeCursor, encodeCursor, envelopeJson, invalidFields } from "@/server/api/v1";
import { db } from "@/server/db/client";
import { ApiCreateInput, createEnvelopeFromApi } from "@/server/envelopes/api-create";
import type { EnvelopeRow } from "@/server/envelopes/drafts";
import { readJson, requestMeta } from "@/server/http";

// A criação baixa o arquivo_url (até 10 s) e valida o PDF.
export const maxDuration = 60;

const STATUSES = ["rascunho", "enviado", "finalizando", "concluido", "recusado", "cancelado", "expirado"] as const;

export async function POST(req: NextRequest) {
  return apiRoute(req, async ({ account }) => {
    const key = req.headers.get("idempotency-key");
    if (key !== null && (key.length < 1 || key.length > IDEMPOTENCIA_MAX)) {
      return apiError("dados_invalidos", 400, { campos: [{ campo: "Idempotency-Key", motivo: "tamanho" }] });
    }
    const parsed = ApiCreateInput.safeParse(await readJson(req));
    if (!parsed.success) return invalidFields(parsed.error);
    const r = await createEnvelopeFromApi(account.id, parsed.data, key, requestMeta(req));
    return Response.json({ envelope: envelopeJson(r.envelope), ...(r.uploadUrl ? { upload_url: r.uploadUrl } : {}) }, { status: r.existing ? 200 : 201 });
  });
}

const ListQuery = z.object({
  status: z.enum(STATUSES).optional(),
  limite: z.coerce.number().int().min(1).max(API_LISTA_MAX).default(API_LISTA_PADRAO),
  cursor: z.string().max(200).optional(),
});

export async function GET(req: NextRequest) {
  return apiRoute(req, async ({ account }) => {
    const parsed = ListQuery.safeParse(Object.fromEntries(req.nextUrl.searchParams));
    if (!parsed.success) return invalidFields(parsed.error);
    const cursor = parsed.data.cursor ? decodeCursor(parsed.data.cursor) : null;
    if (parsed.data.cursor && !cursor) return apiError("dados_invalidos", 400, { campos: [{ campo: "cursor", motivo: "invalido" }] });
    // Um a mais que o limite: diz se há próxima página.
    const { data, error } = await db().rpc("as_fn_api_lista_envelopes", {
      p_conta_id: account.id,
      p_status: (parsed.data.status ?? null) as unknown as (typeof STATUSES)[number],
      p_limite: parsed.data.limite + 1,
      p_cursor_criado: (cursor?.criadoEm ?? null) as unknown as string,
      p_cursor_id: (cursor?.id ?? null) as unknown as string,
    });
    if (error) throw error;
    const rows = (data ?? []) as EnvelopeRow[];
    const page = rows.slice(0, parsed.data.limite);
    const last = page.at(-1);
    return Response.json({
      envelopes: page.map(envelopeJson),
      proximo_cursor: rows.length > parsed.data.limite && last ? encodeCursor(last.criado_em, last.id) : null,
    });
  });
}
