// Verificação pública — épico 8.8 e regra 11.11. Uma função só para a rota /api/verificar e para a
// página /verificar/{codigo}: o banco (as_fn_verifica_documento) decide o que aparece e devolve
// só o resumo permitido (status, título, datas, selo, nomes e quando assinaram).
import "server-only";
import { db } from "@/server/db/client";

export type { PublicSummary, VerificationResult } from "@/features/verify/types";
import type { PublicSummary, VerificationResult } from "@/features/verify/types";

// Consulta por hash (SHA-256 hex) ou por código já normalizado. Devolve: o resultado.
export async function verifyDocument(q: { hash?: string; codigo?: string }): Promise<VerificationResult> {
  const { data, error } = await db().rpc("as_fn_verifica_documento", {
    p_hash: (q.hash?.toLowerCase() ?? null) as unknown as string,
    p_codigo: (q.codigo ?? null) as unknown as string,
  });
  if (error) throw error;
  const rows = data ?? [];
  if (!rows.length) return { resultado: "nao_encontrado", envelopes: [] };
  return { resultado: rows[0].resultado as VerificationResult["resultado"], envelopes: rows.flatMap((r) => (r.envelope ? [r.envelope as unknown as PublicSummary] : [])) };
}
