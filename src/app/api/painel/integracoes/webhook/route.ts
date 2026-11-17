// POST /api/painel/integracoes/webhook — salva a URL do webhook (regra 11.17) ou a remove com
// { url: null }. Só https público (conferido de novo na entrega). Resposta: { ok: true };
// 400 url_invalida.
import type { NextRequest } from "next/server";
import { z } from "zod";
import { WEBHOOK_URL_MAX } from "@/lib/limits";
import { requireConta } from "@/server/auth/require-conta";
import { errorResponse, invalidData, readJson } from "@/server/http";
import { saveWebhookUrl } from "@/server/integrations/settings";

const Body = z.object({ url: z.string().trim().min(1).max(WEBHOOK_URL_MAX).nullable() });

export async function POST(req: NextRequest) {
  const account = await requireConta(req);
  if (account instanceof Response) return account;
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) return invalidData();
  try {
    const r = await saveWebhookUrl(account.id, parsed.data.url);
    if (r === "url_invalida") return Response.json({ codigo: "url_invalida" }, { status: 400 });
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
