// Uso do nível da conta — regra 11.20: documentos guardados (envelopes que não são rascunho)
// contra o limite do nível. Mostrado no topo da lista de envelopes e na tela Conta.
import "server-only";
import { LIMITE_POR_NIVEL, type Nivel } from "@/lib/limits";
import { db } from "@/server/db/client";

export type Usage = { used: number; limit: number; nivel: Nivel };

// Recebe: conta e nível. Devolve: quantos documentos estão guardados e o limite.
export async function getUsage(contaId: string, nivel: Nivel): Promise<Usage> {
  const { count, error } = await db()
    .from("as_envelopes")
    .select("id", { count: "exact", head: true })
    .eq("conta_id", contaId)
    .neq("status", "rascunho");
  if (error) throw error;
  return { used: count ?? 0, limit: LIMITE_POR_NIVEL[nivel], nivel };
}
