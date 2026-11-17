// GET /api/verificar?hash={sha256} · /api/verificar?codigo={codigo} — verificação pública
// (critério 8.8, regra 11.11). Sem conta e sem arquivo: o navegador calcula o SHA-256 e manda só
// o hash. Resposta: { resultado: "final" | "original" | "codigo" | "nao_encontrado", envelopes }
// com o resumo da regra 11.11. 400 sem hash nem código válidos. O limite de 30 consultas por
// minuto por IP é regra do Vercel Firewall (README). Sem cache: o status muda.
import type { NextRequest } from "next/server";
import { normalizeVerificationCode } from "@/lib/verification-code";
import { errorCode } from "@/server/error-code";
import { verifyDocument } from "@/server/verification/lookup";

const NO_STORE = { "cache-control": "no-store" };

export async function GET(req: NextRequest) {
  const hash = req.nextUrl.searchParams.get("hash")?.trim().toLowerCase();
  const rawCode = req.nextUrl.searchParams.get("codigo");
  const codigo = rawCode ? normalizeVerificationCode(rawCode) : null;
  if (hash ? !/^[0-9a-f]{64}$/.test(hash) : !codigo) {
    return Response.json({ codigo: "dados_invalidos" }, { status: 400, headers: NO_STORE });
  }
  try {
    return Response.json(await verifyDocument(hash ? { hash } : { codigo: codigo! }), { headers: NO_STORE });
  } catch (e) {
    console.error("erro_interno_verificacao", errorCode(e));
    return Response.json({ codigo: "erro_interno" }, { status: 500, headers: NO_STORE });
  }
}
