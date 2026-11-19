// GET /api/cron/diario — faxina diária (critério 8.13), chamada 1×/dia pelo cron da Vercel
// (vercel.json). Exige `Authorization: Bearer CRON_SECRET` (a Vercel manda sozinha quando a
// variável existe), comparado em tempo constante; sem o segredo configurado, ninguém passa.
// Devolve 200 com as contagens de cada tarefa · 401 {"codigo":"nao_autorizado"}.
import { createHash, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { runDailyCleanup } from "@/server/cron";

// Expiração, lembretes, retentativas (finalização com selo, e-mails, webhooks) e expurgo.
export const maxDuration = 300;

// Compara pelo SHA-256 dos dois lados (mesmo tamanho), em tempo constante.
function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false;
  const given = createHash("sha256").update(req.headers.get("authorization") ?? "").digest();
  const expected = createHash("sha256").update(`Bearer ${secret}`).digest();
  return timingSafeEqual(given, expected);
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return Response.json({ codigo: "nao_autorizado" }, { status: 401 });
  return Response.json(await runDailyCleanup(), { headers: { "cache-control": "no-store" } });
}
