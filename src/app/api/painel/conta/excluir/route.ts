// POST /api/painel/conta/excluir — "Excluir minha conta" (seções 7.4, 13.1 e 15.1, épico 8.12).
// Corpo: {"email": "…"}, o e-mail da conta digitado na confirmação. Confere a sessão e o Origin
// (requireConta). E-mail que não confere: 400 {"codigo":"email_nao_confere"} e nada apagado.
// Sucesso: apaga a conta e tudo dela, encerra a sessão (cookie apagado) e responde {ok: true}.
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { EMAIL_CONFIRMACAO_MAX } from "@/lib/limits";
import { deleteAccount } from "@/server/account/delete";
import { requireConta } from "@/server/auth/require-conta";
import { SESSION_COOKIE } from "@/server/auth/session";
import { errorResponse } from "@/server/http";

const Body = z.object({ email: z.string().max(EMAIL_CONFIRMACAO_MAX) });

export async function POST(req: NextRequest) {
  const account = await requireConta(req);
  if (account instanceof Response) return account;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ codigo: "dados_invalidos" }, { status: 400 });
  try {
    if ((await deleteAccount(account.id, parsed.data.email)) === "email_nao_confere") {
      return Response.json({ codigo: "email_nao_confere" }, { status: 400 });
    }
  } catch (e) {
    return errorResponse(e);
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.delete({ name: SESSION_COOKIE, path: "/" });
  return res;
}
