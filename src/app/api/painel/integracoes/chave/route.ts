// POST /api/painel/integracoes/chave — "Gerar nova chave" (regra 11.8): a anterior para na hora.
// Resposta: { chave } (só nesta resposta, sem cache).
import type { NextRequest } from "next/server";
import { requireConta } from "@/server/auth/require-conta";
import { errorResponse } from "@/server/http";
import { rotateApiKey } from "@/server/integrations/settings";

export async function POST(req: NextRequest) {
  const account = await requireConta(req);
  if (account instanceof Response) return account;
  try {
    return Response.json({ chave: await rotateApiKey(account.id) }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
