// Seção 6.1 e 20.3: POST /sair apaga o cookie e volta para /entrar; só aceita o próprio site.
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { POST } from "./route";

function sair(origin: string | null) {
  const headers: Record<string, string> = { cookie: "as_sessao=x" };
  if (origin) headers.origin = origin;
  return new NextRequest("http://localhost:3030/sair", { method: "POST", headers });
}

describe("POST /sair", () => {
  it("com Origin do site: apaga as_sessao e redireciona com 303 para /entrar", async () => {
    const res = await POST(sair("http://localhost:3030"));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("http://localhost:3030/entrar");
    expect(res.cookies.get("as_sessao")?.value).toBe("");
  });

  it.each([["https://evil.example"], [null]])("Origin %s → 403 e o cookie fica", async (origin) => {
    const res = await POST(sair(origin));
    expect(res.status).toBe(403);
    expect(res.cookies.get("as_sessao")).toBeUndefined();
  });
});
