// Verificação pública — épico 8.8 e regra 11.11. Uma função só para a rota /api/verificar e para a
// página /verificar/{codigo}: o banco (as_fn_verifica_documento) decide o que aparece e devolve
// só o resumo permitido (status, título, datas, selo, nomes e quando assinaram).
import "server-only";
import { track } from "@/server/analytics/client";
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
  const result: VerificationResult = rows.length
    ? { resultado: rows[0].resultado as VerificationResult["resultado"], envelopes: rows.flatMap((r) => (r.envelope ? [r.envelope as unknown as PublicSummary] : [])) }
    : { resultado: "nao_encontrado", envelopes: [] };
  track("assina_documento_verificado", { quem: { anonimo: true }, propriedades: { por: q.hash ? "arquivo" : "codigo", resultado: analyticsResult(result) } });
  return result;
}

// Resultado para a seção 21 (final, original ou nao_encontrado): pelo código, vale o status do
// envelope (concluído = final); original_multiplo é um original.
function analyticsResult(r: VerificationResult): "final" | "original" | "nao_encontrado" {
  if (r.resultado === "nao_encontrado") return "nao_encontrado";
  if (r.resultado === "codigo") return r.envelopes[0]?.status === "concluido" ? "final" : "original";
  return r.resultado === "final" ? "final" : "original";
}
