// POST /api/assinar/{token}/assinar — assina (critério 8.5). Exige sessão do signatário.
// Corpo: SignInput (consentimento, método, assinatura digitada ou PNG, rubrica, CPF, campos).
// Resposta: { envelope_status }. Erros: 400 dados/CPF/campos/imagem; 409 status_mudou |
// prazo_encerrado; 404 link_invalido.
import type { NextRequest } from "next/server";
import { readJson, requestMeta } from "@/server/http";
import { SignInput, sign } from "@/server/signing/actions";
import { requireSignatarioPorToken } from "@/server/signing/context";
import { noSession, signerErrorResponse } from "@/server/signing/http";

export async function POST(req: NextRequest, ctx: RouteContext<"/api/assinar/[token]/assinar">) {
  const signer = await requireSignatarioPorToken(req, (await ctx.params).token);
  if (signer instanceof Response) return signer;
  if (!signer.sessionJti) return noSession();
  const parsed = SignInput.safeParse(await readJson(req));
  if (!parsed.success) return Response.json({ codigo: "dados_invalidos" }, { status: 400 });
  try {
    return Response.json({ envelope_status: await sign(signer, parsed.data, requestMeta(req)) });
  } catch (e) {
    return signerErrorResponse(e);
  }
}
