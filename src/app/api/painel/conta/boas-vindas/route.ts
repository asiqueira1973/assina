// POST /api/painel/conta/boas-vindas — aceite dos Termos e da Privacidade (seção 6.1, critério 8.1).
// Corpo: {"aceite": true}. Sem o aceite, 400 e nada gravado.
import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireConta } from "@/server/auth/require-conta";
import { acceptTerms } from "@/server/db/accounts";

const Body = z.object({ aceite: z.literal(true) });

export async function POST(req: NextRequest) {
  const account = await requireConta(req);
  if (account instanceof Response) return account;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ codigo: "dados_invalidos" }, { status: 400 });
  await acceptTerms(account.id);
  return Response.json({ ok: true });
}
