// POST /api/painel/integracoes/conexoes/{id}/revogar — "Revogar" uma conexão MCP (critério 8.10):
// o token recebe 401 na próxima chamada. Resposta: { revogada: true }; 404 se não é da conta.
import type { NextRequest } from "next/server";
import { requireConta } from "@/server/auth/require-conta";
import { errorResponse } from "@/server/http";
import { revokeMcpConnection } from "@/server/integrations/settings";

export async function POST(req: NextRequest, ctx: RouteContext<"/api/painel/integracoes/conexoes/[id]/revogar">) {
  const account = await requireConta(req);
  if (account instanceof Response) return account;
  try {
    const { id } = await ctx.params;
    if (!(await revokeMcpConnection(account.id, id))) return Response.json({ codigo: "nao_encontrado" }, { status: 404 });
    return Response.json({ revogada: true });
  } catch (e) {
    return errorResponse(e);
  }
}
