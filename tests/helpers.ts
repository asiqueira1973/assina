// Ajudantes dos testes de rota (seção 22): contas de teste no Supabase local e requisições com sessão.
// Cada conta tem google_sub único; apague com deleteTestAccounts() no afterAll (o banco local é
// compartilhado entre arquivos e nunca se apaga "tudo").
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { signSession } from "@/server/auth/session";
import { db } from "@/server/db/client";

export const SITE = "http://localhost:3030";

// Cria uma conta de teste direto no banco. Recebe: aceite já feito ou não, suspensa ou não.
// Devolve: id e o cookie de sessão pronto.
export async function createTestAccount(opts: { accepted?: boolean; suspended?: boolean } = {}) {
  const suffix = randomUUID().slice(0, 8);
  const { data, error } = await db()
    .from("as_contas")
    .insert({
      google_sub: `sub-${randomUUID()}`,
      email: `teste-${suffix}@teste.dev`,
      nome: "Conta Teste",
      termos_aceitos_em: opts.accepted ? new Date().toISOString() : null,
      suspensa_em: opts.suspended ? new Date().toISOString() : null,
    })
    .select("id")
    .single();
  if (error) throw error;
  return { id: data.id, cookie: `as_sessao=${await signSession(data.id)}` };
}

// Apaga as contas de teste (a cascata leva credenciais, envelopes e trilha).
export async function deleteTestAccounts(ids: string[]) {
  if (ids.length) await db().from("as_contas").delete().in("id", ids);
}

// Monta uma requisição de API com cookie de sessão e Origin do site (seção 20.3).
export function apiRequest(path: string, opts: { method?: string; cookie?: string; body?: unknown; origin?: string | null } = {}) {
  const headers: Record<string, string> = {};
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.origin !== null) headers.origin = opts.origin ?? SITE;
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  return new NextRequest(`${SITE}${path}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body === undefined ? undefined : typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body),
  });
}
