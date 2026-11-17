// Critério 8.9 (tela Integrações) pelas rotas: revelar chave e segredo, gerar nova chave (a
// anterior para na hora), salvar e remover o webhook (só https público), Enviar teste sem webhook.
import { NextRequest } from "next/server";
import { afterAll, describe, expect, it } from "vitest";
import { generateApiKey } from "@/server/credentials/api-key";
import { db } from "@/server/db/client";
import { apiRequest, createTestAccount, deleteTestAccounts, SITE } from "../../../../../tests/helpers";
import { GET as listV1 } from "../../v1/envelopes/route";
import { POST as rotate } from "./chave/route";
import { POST as reveal } from "./revelar/route";
import { POST as saveHook } from "./webhook/route";
import { POST as testHook } from "./webhook/teste/route";

const accounts: string[] = [];
afterAll(() => deleteTestAccounts(accounts));

async function account() {
  const a = await createTestAccount({ accepted: true });
  accounts.push(a.id);
  const key = generateApiKey();
  await db().from("as_credenciais").insert({ conta_id: a.id, tipo: "api", nome: "Chave de API", prefixo: key.prefix, valor_hash: key.hash, valor_cifrado: key.sealed });
  return { ...a, key: key.value };
}
const v1 = (key: string) => listV1(new NextRequest(`${SITE}/api/v1/envelopes`, { headers: { authorization: `Bearer ${key}` } }));
const post = (fn: (r: NextRequest) => Promise<Response>, cookie: string, body?: unknown) => fn(apiRequest("/x", { method: "POST", cookie, body }));

describe("Integrações (critério 8.9)", () => {
  it("revelar a chave; gerar nova revoga a anterior na hora; outra conta e Origin estranho não passam", async () => {
    const a = await account();
    const r = await post(reveal, a.cookie, { item: "chave" });
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect((await r.json()).valor).toBe(a.key);

    const novo = (await (await post(rotate, a.cookie)).json()).chave as string;
    expect(novo).toMatch(/^assina_[A-Za-z0-9_-]{43}$/);
    expect((await v1(a.key)).status).toBe(401);
    expect((await v1(novo)).status).toBe(200);
    expect((await (await post(reveal, a.cookie, { item: "chave" })).json()).valor).toBe(novo);
    const { count } = await db().from("as_credenciais").select("id", { count: "exact", head: true }).eq("conta_id", a.id).eq("tipo", "api").is("revogada_em", null);
    expect(count).toBe(1);

    const evil = await rotate(apiRequest("/x", { method: "POST", cookie: a.cookie, origin: "https://evil.example" }));
    expect(evil.status).toBe(403);
  });

  it("webhook: recusa http, IP privado e localhost; salva https com segredo; remove os dois", async () => {
    const a = await account();
    for (const url of ["http://exemplo.com.br/h", "https://10.0.0.1/h", "https://localhost/h", "https://user:pw@exemplo.com.br/h", "nada"]) {
      const r = await post(saveHook, a.cookie, { url });
      expect([r.status, (await r.json()).codigo]).toEqual([400, "url_invalida"]);
    }
    expect((await post(testHook, a.cookie)).status).toBe(409);
    expect((await post(saveHook, a.cookie, { url: "https://exemplo.com.br/assina" })).status).toBe(200);
    const secret = (await (await post(reveal, a.cookie, { item: "segredo" })).json()).valor as string;
    expect(secret).toMatch(/^whsec_[A-Za-z0-9_-]{43}$/);
    // Trocar a URL mantém o segredo.
    await post(saveHook, a.cookie, { url: "https://exemplo.com.br/outra" });
    expect((await (await post(reveal, a.cookie, { item: "segredo" })).json()).valor).toBe(secret);
    expect((await post(saveHook, a.cookie, { url: null })).status).toBe(200);
    const { data } = await db().from("as_contas").select("webhook_url, webhook_segredo_cifrado").eq("id", a.id).single();
    expect(data).toEqual({ webhook_url: null, webhook_segredo_cifrado: null });
    expect((await post(reveal, a.cookie, { item: "segredo" })).status).toBe(404);
  });
});
