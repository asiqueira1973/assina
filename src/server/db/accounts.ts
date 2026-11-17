// Acesso às contas — seções 6.1, 7.3 e regra 11.20. Todo helper recebe o id da conta da sessão
// (ou o sub do Google no login): a service role ignora RLS (seção 6.5).
import "server-only";
import type { Nivel } from "@/lib/limits";
import { db } from "./client";

export type Account = {
  id: string;
  email: string;
  nome: string;
  nivel: Nivel;
  termsAcceptedAt: string | null;
};

// Lê uma conta ativa. Recebe: id da sessão. Devolve: a conta, ou null se não existe ou está
// suspensa (conta suspensa = como inexistente, regra 11.12).
export async function getAccountById(contaId: string): Promise<Account | null> {
  const { data, error } = await db()
    .from("as_contas")
    .select("id, email, nome, nivel, termos_aceitos_em, suspensa_em")
    .eq("id", contaId)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.suspensa_em) return null;
  return { id: data.id, email: data.email, nome: data.nome, nivel: data.nivel as Nivel, termsAcceptedAt: data.termos_aceitos_em };
}

// Situação de um login antes de gravar (seção 6.1, passo 3). Recebe: sub do Google.
// Devolve: "nova" (não existe), "ativa" ou "suspensa".
export async function accountStatusForGoogle(sub: string): Promise<"nova" | "ativa" | "suspensa"> {
  const { data, error } = await db().from("as_contas").select("suspensa_em").eq("google_sub", sub).maybeSingle();
  if (error) throw error;
  if (!data) return "nova";
  return data.suspensa_em ? "suspensa" : "ativa";
}

// Quantas contas nasceram desde um instante (freio de cadastro, regra 11.12).
export async function countAccountsCreatedSince(since: Date): Promise<number> {
  const { count, error } = await db()
    .from("as_contas")
    .select("id", { count: "exact", head: true })
    .gte("criado_em", since.toISOString());
  if (error) throw error;
  return count ?? 0;
}

// Cria ou atualiza a conta no login, com a chave de API nascendo junto (as_fn_entra_conta,
// regra 11.8). Recebe: identidade do Google e a chave já gerada. Devolve: id, se é nova e se
// está suspensa.
export async function enterAccount(input: {
  sub: string;
  email: string;
  name: string;
  apiKey: { hash: string; prefix: string; sealed: string };
}): Promise<{ contaId: string; nova: boolean; suspensa: boolean }> {
  const { data, error } = await db().rpc("as_fn_entra_conta", {
    p_google_sub: input.sub,
    p_email: input.email,
    p_nome: input.name,
    p_chave_hash: input.apiKey.hash,
    p_chave_prefixo: input.apiKey.prefix,
    p_chave_cifrada: input.apiKey.sealed,
  });
  if (error) throw error;
  const row = data?.[0];
  if (!row) throw new Error("entra_conta_sem_resultado");
  return { contaId: row.conta_id, nova: row.nova, suspensa: row.suspensa };
}

// Registra o aceite dos Termos e da Privacidade (boas-vindas, critério 8.1). Só grava se ainda
// não havia aceite, para não reescrever a data de um aceite anterior. Recebe: id da sessão.
export async function acceptTerms(contaId: string): Promise<void> {
  const { error } = await db()
    .from("as_contas")
    .update({ termos_aceitos_em: new Date().toISOString() })
    .eq("id", contaId)
    .is("termos_aceitos_em", null);
  if (error) throw error;
}
