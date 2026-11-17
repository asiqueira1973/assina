// PUT /api/painel/envelopes/{id}/campos — substitui todos os campos do rascunho numa transação
// (seção 13.1, critério 8.3, regra 11.3). Corpo: { campos: [{ signatario_id, tipo, pagina, x, y,
// largura, altura, obrigatorio, rotulo }] }. Resposta: { campos } como ficaram.
// Fora de rascunho → 409 envelope_congelado; campo fora da página → 400 dados_invalidos.
import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireConta } from "@/server/auth/require-conta";
import { FieldList, replaceFields } from "@/server/envelopes/fields";
import { errorResponse, invalidData, readJson } from "@/server/http";

const Body = z.object({ campos: FieldList });

export async function PUT(req: NextRequest, ctx: RouteContext<"/api/painel/envelopes/[id]/campos">) {
  const account = await requireConta(req);
  if (account instanceof Response) return account;
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) return invalidData();
  try {
    const { id } = await ctx.params;
    return Response.json({ campos: await replaceFields(account.id, id, parsed.data.campos) });
  } catch (e) {
    return errorResponse(e);
  }
}
