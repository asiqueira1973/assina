// PUT /api/painel/envelopes/{id}/signatarios — troca a lista de destinatários do rascunho
// (seção 13.1, critério 8.2, regra 11.2). Corpo: { signatarios: [{ nome, email, papel, exigir_cpf, exigir_nascimento }] },
// na ordem de assinatura. Resposta: { signatarios } como ficaram.
import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireConta } from "@/server/auth/require-conta";
import { SignerList, replaceSigners } from "@/server/envelopes/drafts";
import { errorResponse, invalidData, readJson } from "@/server/http";

const Body = z.object({ signatarios: SignerList });

export async function PUT(req: NextRequest, ctx: RouteContext<"/api/painel/envelopes/[id]/signatarios">) {
  const account = await requireConta(req);
  if (account instanceof Response) return account;
  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) return invalidData();
  try {
    const { id } = await ctx.params;
    return Response.json({ signatarios: await replaceSigners(account.id, id, parsed.data.signatarios) });
  } catch (e) {
    return errorResponse(e);
  }
}
