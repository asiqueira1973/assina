// Critérios do épico 8.3 pela rota PUT /api/painel/envelopes/{id}/campos (regra 11.3).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { apiRequest, createTestAccount, deleteTestAccounts } from "../../../../../../../tests/helpers";
import { PUT } from "./route";

const ids: string[] = [];
afterAll(() => deleteTestAccounts(ids));
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

let cookie: string;
let envelopeId: string;
let ana: string;
let carla: string;

// Rascunho de 2 páginas com uma assinante e uma cópia, montado direto no banco.
beforeAll(async () => {
  const a = await createTestAccount({ accepted: true });
  ids.push(a.id);
  cookie = a.cookie;
  const { data: env } = await db()
    .rpc("as_fn_cria_rascunho", { p_conta_id: a.id, p_titulo: "Campos", p_origem: "painel", p_codigo_verificacao: "CMPS1234CMPS", p_ator: "remetente" })
    .single();
  envelopeId = (env as unknown as { id: string }).id;
  await db().from("as_envelopes").update({ paginas: 2, dimensoes_paginas: [{ l: 595.28, a: 841.89 }, { l: 595.28, a: 841.89 }] }).eq("id", envelopeId);
  const { data: signers } = await db().rpc("as_fn_substitui_signatarios", {
    p_envelope_id: envelopeId,
    p_conta_id: a.id,
    p_lista: [{ nome: "Ana", email: "ana@campos.dev" }, { nome: "Carla", email: "carla@campos.dev", papel: "copia" }],
  });
  ana = (signers as { id: string; nome: string }[]).find((s) => s.nome === "Ana")!.id;
  carla = (signers as { id: string; nome: string }[]).find((s) => s.nome === "Carla")!.id;
});

const field = (over: Record<string, unknown> = {}) => ({ signatario_id: ana, tipo: "assinatura", pagina: 1, x: 0.1, y: 0.8, largura: 0.3, altura: 0.06, ...over });
const put = (campos: unknown, c = cookie, id = envelopeId) => PUT(apiRequest(`/api/painel/envelopes/${id}/campos`, { method: "PUT", cookie: c, body: { campos } }), ctx(id));

describe("PUT /api/painel/envelopes/{id}/campos (épico 8.3)", () => {
  it("substitui todos os campos e devolve como ficaram", async () => {
    let res = await put([field(), field({ tipo: "texto", pagina: 2, x: 0.5, y: 0.1, altura: 0.03, obrigatorio: false, rotulo: "Cargo" })]);
    expect(res.status).toBe(200);
    expect((await res.json()).campos).toHaveLength(2);

    res = await put([field({ tipo: "data", x: 0.6, largura: 0.16, altura: 0.03 })]);
    const { campos } = await res.json();
    expect(campos).toHaveLength(1);
    expect(campos[0]).toMatchObject({ tipo: "data", pagina: 1, obrigatorio: true });
    expect(Number(campos[0].x)).toBeCloseTo(0.6, 5);
  });

  it("campo fora da página → 400 e nada muda", async () => {
    await put([field()]);
    const res = await put([field({ x: 0.8, largura: 0.3 })]);
    expect(res.status).toBe(400);
    const { data } = await db().from("as_campos").select("tipo").eq("envelope_id", envelopeId);
    expect(data).toEqual([{ tipo: "assinatura" }]);
  });

  it("página inexistente, campo de quem só recebe cópia e 51 campos → 400", async () => {
    expect(await (await put([field({ pagina: 3 })])).json()).toEqual({ codigo: "campo_invalido" });
    expect(await (await put([field({ signatario_id: carla })])).json()).toEqual({ codigo: "campo_invalido" });
    const many = Array.from({ length: 51 }, () => field({ tipo: "caixa", largura: 0.03, altura: 0.02 }));
    expect(await (await put(many)).json()).toEqual({ codigo: "campos_demais" });
  });

  it("assinante de outro envelope (mesmo da mesma conta) → 400 campo_invalido", async () => {
    const owner = (await db().from("as_envelopes").select("conta_id").eq("id", envelopeId).single()).data!.conta_id;
    const { data: other } = await db()
      .rpc("as_fn_cria_rascunho", { p_conta_id: owner, p_titulo: "Outro", p_origem: "painel", p_codigo_verificacao: "XYZW5678XYZW", p_ator: "remetente" })
      .single();
    const otherId = (other as unknown as { id: string }).id;
    const { data: signers } = await db().rpc("as_fn_substitui_signatarios", { p_envelope_id: otherId, p_conta_id: owner, p_lista: [{ nome: "Zé", email: "ze@campos.dev" }] });
    const ze = (signers as { id: string }[])[0].id;
    expect(await (await put([field({ signatario_id: ze })])).json()).toEqual({ codigo: "campo_invalido" });
  });

  it("assinatura enviada como opcional é gravada obrigatória", async () => {
    const { campos } = await (await put([field({ obrigatorio: false, rotulo: "não vale" })])).json();
    expect(campos[0].obrigatorio).toBe(true);
    expect(campos[0].rotulo).toBeNull();
  });

  it("outra conta → 404; id inválido → 404; fora de rascunho → 409", async () => {
    const outra = await createTestAccount({ accepted: true });
    ids.push(outra.id);
    expect((await put([], outra.cookie)).status).toBe(404);
    expect((await put([], cookie, "nao-e-uuid")).status).toBe(404);

    await db().from("as_envelopes").update({ status: "enviado", hash_original: "c".repeat(64) }).eq("id", envelopeId);
    const res = await put([field()]);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ codigo: "envelope_congelado" });
  });
});
