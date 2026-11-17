// POST /api/painel/integracoes/webhook/teste — "Enviar teste" (regra 11.17): um POST assinado
// com o evento "teste". Resposta: { status_http } (0 sem resposta); 409 sem_webhook.
import type { NextRequest } from "next/server";
import { requireConta } from "@/server/auth/require-conta";
import { errorResponse } from "@/server/http";
import { sendTestWebhook } from "@/server/webhooks/deliver";

export async function POST(req: NextRequest) {
  const account = await requireConta(req);
  if (account instanceof Response) return account;
  try {
    const status = await sendTestWebhook(account.id);
    if (status === null) return Response.json({ codigo: "sem_webhook" }, { status: 409 });
    return Response.json({ status_http: status });
  } catch (e) {
    return errorResponse(e);
  }
}
