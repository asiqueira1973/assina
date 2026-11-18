// Exclusão da conta — seções 3, 7.4 e 15.1 (Conta), épico 8.12. Hard delete: a linha de as_contas
// leva em cascata credenciais, envelopes, signatários, campos, trilha, notificações e entregas
// (os triggers da trilha e do envelope em andamento deixam a cascata passar). Depois do commit,
// apaga a pasta {conta}/ do armazenamento; se isso falhar, os dados já não existem e o erro fica no
// log para limpeza manual (como na exclusão do envelope).
import "server-only";
import { db } from "@/server/db/client";
import { errorCode } from "@/server/error-code";
import { accountFolder, storage } from "@/server/files/storage";

// Recebe: a conta da sessão e o e-mail digitado na confirmação. Devolve: "ok" ou
// "email_nao_confere" (nada apagado).
export async function deleteAccount(contaId: string, typedEmail: string): Promise<"ok" | "email_nao_confere"> {
  const { data: conta, error: readError } = await db().from("as_contas").select("email").eq("id", contaId).maybeSingle();
  if (readError) throw readError;
  if (!conta || typedEmail.trim().toLowerCase() !== conta.email) return "email_nao_confere";
  const { error } = await db().from("as_contas").delete().eq("id", contaId);
  if (error) throw error;
  try {
    await storage().deletePrefix(accountFolder(contaId));
  } catch (e) {
    // O id da conta (UUID, não é dado pessoal) diz qual pasta limpar à mão.
    console.error("arquivos_nao_apagados", contaId, errorCode(e));
  }
  return "ok";
}
