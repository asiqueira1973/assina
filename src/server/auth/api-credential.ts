// Autenticação por credencial de máquina — seção 6.3. `Authorization: Bearer assina_…` →
// SHA-256 → as_credenciais ativa do tipo aceito → conta não suspensa. Qualquer falha responde
// 401 {"codigo":"credencial_invalida"} (nunca 403 nem 500 por credencial). ultimo_uso_em é
// atualizado no máximo uma vez por minuto. A API REST aceita só a chave de API; o MCP (8.10)
// aceita também o token do OAuth.
import "server-only";
import type { NextRequest } from "next/server";
import { copy } from "@/lib/copy";
import { hashCredential } from "@/server/credentials/api-key";
import { getAccountById, type Account } from "@/server/db/accounts";
import { db } from "@/server/db/client";
import type { Database } from "@/server/db/types";

type Kind = Database["public"]["Enums"]["as_tipo_credencial"];
export type MachineAuth = { account: Account; credentialId: string; kind: Kind };

// Resposta 401 padrão (13.2).
export function invalidCredential(): Response {
  return Response.json({ codigo: "credencial_invalida", mensagem: copy.api.errors.credencial_invalida }, { status: 401 });
}

// Confere o Bearer. Recebe: requisição e tipos aceitos. Devolve: conta e credencial, ou a 401.
export async function requireCredential(req: NextRequest, kinds: Kind[]): Promise<MachineAuth | Response> {
  const header = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(assina_[A-Za-z0-9_-]{20,120})$/.exec(header.trim());
  if (!m) return invalidCredential();
  const { data: cred, error } = await db()
    .from("as_credenciais")
    .select("id, conta_id, tipo, ultimo_uso_em")
    .eq("valor_hash", hashCredential(m[1]))
    .is("revogada_em", null)
    .maybeSingle();
  if (error || !cred || !kinds.includes(cred.tipo)) return invalidCredential();
  const account = await getAccountById(cred.conta_id);
  if (!account) return invalidCredential();
  // Último uso: no máximo uma escrita por minuto por credencial (6.3).
  if (!cred.ultimo_uso_em || Date.now() - new Date(cred.ultimo_uso_em).getTime() > 60_000) {
    await db().from("as_credenciais").update({ ultimo_uso_em: new Date().toISOString() }).eq("id", cred.id);
  }
  return { account, credentialId: cred.id, kind: cred.tipo };
}
