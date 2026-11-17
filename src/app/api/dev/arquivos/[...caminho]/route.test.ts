// Épico 8.2: a rota do driver local só aceita URL assinada e válida, e some em produção.
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { signLocal } from "@/server/files/local";
import { GET, PUT } from "./route";

const params = (caminho: string) => ({ params: Promise.resolve({ caminho: caminho.split("/") }) });
afterEach(() => vi.unstubAllEnvs());

function url(op: "put" | "get", path: string, exp: number, sig?: string) {
  return `http://localhost:3030/api/dev/arquivos/${path}?op=${op}&exp=${exp}&sig=${sig ?? signLocal(op, path, exp)}`;
}

describe("/api/dev/arquivos (driver local)", () => {
  const path = "teste-dev/arquivo/upload.pdf";
  const exp = Math.floor(Date.now() / 1000) + 60;

  it("PUT e GET com assinatura válida", async () => {
    expect((await PUT(new NextRequest(url("put", path, exp), { method: "PUT", body: "%PDF-1.7" }), params(path))).status).toBe(200);
    const res = await GET(new NextRequest(url("get", path, exp)), params(path));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("%PDF-1.7");
  });

  it("assinatura errada, vencida ou de outra operação → 403", async () => {
    expect((await PUT(new NextRequest(url("put", path, exp, "forjada"), { method: "PUT", body: "x" }), params(path))).status).toBe(403);
    expect((await PUT(new NextRequest(url("put", path, 1), { method: "PUT", body: "x" }), params(path))).status).toBe(403);
    const getSig = signLocal("get", path, exp);
    expect((await PUT(new NextRequest(url("put", path, exp, getSig), { method: "PUT", body: "x" }), params(path))).status).toBe(403);
  });

  it("em produção ou com R2 configurado → 404", async () => {
    vi.stubEnv("NODE_ENV", "production");
    expect((await GET(new NextRequest(url("get", path, exp)), params(path))).status).toBe(404);
    vi.unstubAllEnvs();
    for (const [k, v] of Object.entries({ R2_ACCOUNT_ID: "c", R2_ACCESS_KEY_ID: "k", R2_SECRET_ACCESS_KEY: "s", R2_BUCKET: "assina-documentos" })) vi.stubEnv(k, v);
    expect((await GET(new NextRequest(url("get", path, exp)), params(path))).status).toBe(404);
  });
});
