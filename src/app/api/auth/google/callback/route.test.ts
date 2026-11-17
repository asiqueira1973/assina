// Testes do callback do login (critérios do épico 8.1) com o Google simulado e o Supabase local.
// Cada teste usa um google_sub único e apaga as próprias contas no fim (o banco local é compartilhado).
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db/client";
import { decryptSecret } from "@/server/crypto/aes";
import { verifySession } from "@/server/auth/session";
import { encodeOAuthCookie } from "@/server/auth/oauth-state";

vi.mock("@/server/auth/google", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/server/auth/google")>();
  return { ...original, exchangeCode: vi.fn(), verifyIdToken: vi.fn() };
});

const google = await import("@/server/auth/google");
const { GET } = await import("./route");

const createdSubs: string[] = [];

// Simula o Google devolvendo a identidade.
function mockGoogle(opts: { sub: string; email?: string }) {
  createdSubs.push(opts.sub);
  vi.mocked(google.exchangeCode).mockResolvedValue("id-token-simulado");
  vi.mocked(google.verifyIdToken).mockResolvedValue({ sub: opts.sub, email: opts.email ?? `${opts.sub}@teste.dev`, name: "Ana Teste" });
}

// Monta a requisição de retorno do Google com o cookie do OAuth.
function callback(opts: { state?: string; cookieState?: string; volta?: string; verifier?: string } = {}) {
  const cookie = encodeOAuthCookie({ state: opts.cookieState ?? "estado-ok", verifier: opts.verifier ?? "verificador", volta: opts.volta ?? "/painel" });
  return new NextRequest(`http://localhost:3030/api/auth/google/callback?code=codigo&state=${opts.state ?? "estado-ok"}`, {
    headers: { cookie: `as_oauth_google=${cookie}` },
  });
}

async function accountBySub(sub: string) {
  const { data } = await db().from("as_contas").select("*").eq("google_sub", sub);
  return data ?? [];
}

async function apiKeysOf(contaId: string) {
  const { data } = await db().from("as_credenciais").select("*").eq("conta_id", contaId);
  return data ?? [];
}

const env = { ...process.env };
beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  process.env.EMAILS_PERMITIDOS = env.EMAILS_PERMITIDOS;
  process.env.CONTAS_NOVAS_POR_DIA = env.CONTAS_NOVAS_POR_DIA;
});
afterAll(async () => {
  if (createdSubs.length) await db().from("as_contas").delete().in("google_sub", createdSubs);
});

describe("GET /api/auth/google/callback (épico 8.1)", () => {
  it("state diferente do cookie → erro=falha sem chamar o Google", async () => {
    const res = await GET(callback({ state: "estado-ok", cookieState: "outro" }));
    expect(res.headers.get("location")).toBe("http://localhost:3030/entrar?erro=falha");
    expect(google.exchangeCode).not.toHaveBeenCalled();
  });

  it("sem cookie do OAuth → erro=falha", async () => {
    const res = await GET(new NextRequest("http://localhost:3030/api/auth/google/callback?code=c&state=s"));
    expect(res.headers.get("location")).toBe("http://localhost:3030/entrar?erro=falha");
  });

  it("manda o verifier do PKCE na troca do código", async () => {
    const sub = `sub-${randomUUID()}`;
    mockGoogle({ sub });
    await GET(callback({ verifier: "meu-verificador" }));
    expect(google.exchangeCode).toHaveBeenCalledWith("codigo", "meu-verificador");
  });

  it("Google recusa (e-mail não verificado, token inválido) → erro=falha e nada gravado", async () => {
    const sub = `sub-${randomUUID()}`;
    createdSubs.push(sub);
    vi.mocked(google.exchangeCode).mockResolvedValue("id-token");
    vi.mocked(google.verifyIdToken).mockRejectedValue(new Error("email_nao_verificado"));
    const res = await GET(callback());
    expect(res.headers.get("location")).toBe("http://localhost:3030/entrar?erro=falha");
    expect(await accountBySub(sub)).toHaveLength(0);
  });

  it("e-mail bloqueado → erro=sem_acesso e nada gravado", async () => {
    const sub = `sub-${randomUUID()}`;
    mockGoogle({ sub, email: "bloqueado@teste.dev" });
    const res = await GET(callback());
    expect(res.headers.get("location")).toBe("http://localhost:3030/entrar?erro=sem_acesso");
    expect(await accountBySub(sub)).toHaveLength(0);
  });

  it("com EMAILS_PERMITIDOS, quem está fora → erro=sem_acesso e nada gravado", async () => {
    process.env.EMAILS_PERMITIDOS = "so-este@teste.dev";
    const sub = `sub-${randomUUID()}`;
    mockGoogle({ sub });
    const res = await GET(callback());
    expect(res.headers.get("location")).toBe("http://localhost:3030/entrar?erro=sem_acesso");
    expect(await accountBySub(sub)).toHaveLength(0);
  });

  it("limite diário de contas novas: no limite recusa, um abaixo aceita (fronteira da regra 11.12)", async () => {
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { count } = await db().from("as_contas").select("id", { count: "exact", head: true }).gte("criado_em", since);

    process.env.CONTAS_NOVAS_POR_DIA = String(count);
    const barrada = `sub-${randomUUID()}`;
    mockGoogle({ sub: barrada });
    const res = await GET(callback());
    expect(res.headers.get("location")).toBe("http://localhost:3030/entrar?erro=cadastros_pausados");
    expect(await accountBySub(barrada)).toHaveLength(0);

    process.env.CONTAS_NOVAS_POR_DIA = String((count ?? 0) + 1);
    const aceita = `sub-${randomUUID()}`;
    mockGoogle({ sub: aceita });
    const ok = await GET(callback());
    expect(ok.headers.get("location")).toBe("http://localhost:3030/painel");
    expect(await accountBySub(aceita)).toHaveLength(1);
  });

  it("primeiro login cria a conta com a chave de API cifrada e abre a sessão", async () => {
    const sub = `sub-${randomUUID()}`;
    mockGoogle({ sub });
    const res = await GET(callback());
    expect(res.headers.get("location")).toBe("http://localhost:3030/painel");

    const [conta] = await accountBySub(sub);
    expect(conta).toBeDefined();
    expect(conta.email).toBe(`${sub}@teste.dev`);
    expect(conta.nivel).toBe(1);
    expect(conta.termos_aceitos_em).toBeNull();

    const keys = await apiKeysOf(conta.id);
    expect(keys).toHaveLength(1);
    expect(keys[0].tipo).toBe("api");
    expect(keys[0].valor_cifrado).not.toContain("assina_");
    expect(decryptSecret(keys[0].valor_cifrado!)).toMatch(/^assina_/);
    expect(keys[0].prefixo).toBe(decryptSecret(keys[0].valor_cifrado!).slice(0, 12));

    const cookie = res.cookies.get("as_sessao");
    expect(cookie?.httpOnly).toBe(true);
    expect((await verifySession(cookie!.value))?.contaId).toBe(conta.id);
    // O cookie do OAuth é apagado depois do uso.
    expect(res.cookies.get("as_oauth_google")?.value).toBe("");
  });

  it("segundo login com o mesmo Google não duplica conta nem chave", async () => {
    const sub = `sub-${randomUUID()}`;
    mockGoogle({ sub });
    await GET(callback());
    const [primeira] = await accountBySub(sub);
    const chaveAntes = (await apiKeysOf(primeira.id))[0].valor_hash;

    const res = await GET(callback());
    expect(res.headers.get("location")).toBe("http://localhost:3030/painel");
    expect(await accountBySub(sub)).toHaveLength(1);
    const keys = await apiKeysOf(primeira.id);
    expect(keys).toHaveLength(1);
    expect(keys[0].valor_hash).toBe(chaveAntes);
  });

  it("quem já tem conta entra mesmo com o limite diário atingido", async () => {
    const sub = `sub-${randomUUID()}`;
    mockGoogle({ sub });
    await GET(callback());
    process.env.CONTAS_NOVAS_POR_DIA = "0";
    const res = await GET(callback());
    expect(res.headers.get("location")).toBe("http://localhost:3030/painel");
  });

  it("conta suspensa → erro=suspensa e sem sessão", async () => {
    const sub = `sub-${randomUUID()}`;
    mockGoogle({ sub });
    await GET(callback());
    await db().from("as_contas").update({ suspensa_em: new Date().toISOString() }).eq("google_sub", sub);
    const res = await GET(callback());
    expect(res.headers.get("location")).toBe("http://localhost:3030/entrar?erro=suspensa");
    expect(res.cookies.get("as_sessao")).toBeUndefined();
  });

  it("volta para a rota pedida (?volta= saneado)", async () => {
    const sub = `sub-${randomUUID()}`;
    mockGoogle({ sub });
    const res = await GET(callback({ volta: "/painel/conta" }));
    expect(res.headers.get("location")).toBe("http://localhost:3030/painel/conta");
  });
});
