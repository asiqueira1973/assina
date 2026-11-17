// Critério 8.1: aceite dos Termos nas boas-vindas; guardião requireConta (sessão, Origin, suspensa).
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { apiRequest, createTestAccount, deleteTestAccounts } from "../../../../../../tests/helpers";
import { POST } from "./route";

const ids: string[] = [];
afterAll(() => deleteTestAccounts(ids));

async function account(opts: { suspended?: boolean } = {}) {
  const a = await createTestAccount(opts);
  ids.push(a.id);
  return a;
}

async function acceptedAt(id: string) {
  const { data } = await db().from("as_contas").select("termos_aceitos_em").eq("id", id).single();
  return data!.termos_aceitos_em;
}

describe("POST /api/painel/conta/boas-vindas (critério 8.1)", () => {
  it("sem sessão → 401", async () => {
    const res = await POST(apiRequest("/api/painel/conta/boas-vindas", { method: "POST", body: { aceite: true } }));
    expect(res.status).toBe(401);
  });

  it("Origin de outro site → 403 e nada gravado", async () => {
    const a = await account();
    const res = await POST(apiRequest("/api/painel/conta/boas-vindas", { method: "POST", cookie: a.cookie, body: { aceite: true }, origin: "https://evil.example" }));
    expect(res.status).toBe(403);
    expect(await acceptedAt(a.id)).toBeNull();
  });

  it("sem marcar o aceite → 400 e nada gravado", async () => {
    const a = await account();
    for (const body of [{ aceite: false }, {}, "nao-e-json"]) {
      const res = await POST(apiRequest("/api/painel/conta/boas-vindas", { method: "POST", cookie: a.cookie, body }));
      expect(res.status).toBe(400);
    }
    expect(await acceptedAt(a.id)).toBeNull();
  });

  it("com o aceite grava a data; repetir não reescreve a data", async () => {
    const a = await account();
    const res = await POST(apiRequest("/api/painel/conta/boas-vindas", { method: "POST", cookie: a.cookie, body: { aceite: true } }));
    expect(res.status).toBe(200);
    const first = await acceptedAt(a.id);
    expect(first).not.toBeNull();
    await POST(apiRequest("/api/painel/conta/boas-vindas", { method: "POST", cookie: a.cookie, body: { aceite: true } }));
    expect(await acceptedAt(a.id)).toBe(first);
  });

  it("conta suspensa → 401 (a sessão deixa de valer, regra 11.12)", async () => {
    const a = await account({ suspended: true });
    const res = await POST(apiRequest("/api/painel/conta/boas-vindas", { method: "POST", cookie: a.cookie, body: { aceite: true } }));
    expect(res.status).toBe(401);
  });
});
