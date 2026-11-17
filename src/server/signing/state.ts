// Estado da página do signatário — épico 8.5 (seção 15, "Estados"). Decidido no servidor a
// partir do link, com a hora atual (prazo e os 30 dias do download, regras 11.7 e 11.14).
import "server-only";
import { DOWNLOAD_FINAL_DIAS } from "@/lib/limits";
import { db } from "@/server/db/client";
import type { SignerContext } from "./context";

export type SignerPageState =
  | { kind: "invalido" }
  | { kind: "indisponivel" }
  | { kind: "concluido"; download: boolean }
  | { kind: "cancelado" }
  | { kind: "recusado_por_mim" }
  | { kind: "recusado"; nome: string }
  | { kind: "expirado" }
  | { kind: "ja_assinou"; others: { id: string; nome: string; status: string; assinado_em: string | null }[] }
  | { kind: "pendente" }
  | { kind: "ativo" };

// Recebe: o contexto do link (ou null). Devolve: o estado da página.
export async function signerPageState(ctx: SignerContext | null): Promise<SignerPageState> {
  if (!ctx) return { kind: "invalido" };
  if (ctx.sender.suspensa) return { kind: "indisponivel" };
  const { signer, envelope } = ctx;
  const now = Date.now();
  if (envelope.status === "concluido") {
    const fresh = !!envelope.concluido_em && now - new Date(envelope.concluido_em).getTime() < DOWNLOAD_FINAL_DIAS * 86400_000;
    return { kind: "concluido", download: fresh && !!envelope.arquivo_final_path };
  }
  if (envelope.status === "cancelado") return { kind: "cancelado" };
  if (envelope.status === "recusado") {
    if (signer.status === "recusou") return { kind: "recusado_por_mim" };
    const { data } = await db().from("as_signatarios").select("nome").eq("envelope_id", envelope.id).eq("status", "recusou").maybeSingle();
    return { kind: "recusado", nome: data?.nome ?? "" };
  }
  if (signer.status === "assinou" || envelope.status === "finalizando") {
    const { data } = await db().from("as_signatarios").select("id, nome, status, assinado_em").eq("envelope_id", envelope.id).eq("papel", "assinar").order("ordem");
    return { kind: "ja_assinou", others: data ?? [] };
  }
  // Regra 11.7: vale o prazo_em, mesmo antes de a faxina marcar "expirado".
  if (envelope.status === "expirado" || (envelope.prazo_em && new Date(envelope.prazo_em).getTime() <= now)) return { kind: "expirado" };
  if (signer.status === "pendente") return { kind: "pendente" };
  return { kind: "ativo" };
}
