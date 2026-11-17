// POST /api/painel/integracoes/revelar — "Mostrar" e "Copiar" da chave de API e do segredo do
// webhook (seção 6.3): o valor em claro só sai por pedido, nunca no HTML. Corpo: { item:
// "chave" | "segredo" }. Resposta: { valor } (sem cache); 404 se não existe.
import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireConta } from "@/server/auth/require-conta";
import { errorResponse, invalidData, readJson } from "@/server/http";
import { revealSecret } from "@/server/integrations/settings";

const Body = z.object({ item: z.enum(["chave", "segredo"]) });

export async function POST(req: NextRequest) {
  const account = await requireConta(req);
  if (account instanceof Response) return account;
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) return invalidData();
  try {
    const valor = await revealSecret(account.id, parsed.data.item);
    if (!valor) return Response.json({ codigo: "nao_encontrado" }, { status: 404 });
    return Response.json({ valor }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
