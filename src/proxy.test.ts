// Seção 6.1 / critério 8.1: /painel sem sessão vai para /entrar com a rota de volta; com sessão passa.
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { signSession } from "@/server/auth/session";
import { proxy } from "./proxy";

describe("proxy", () => {
  it("/painel/conta sem cookie → /entrar?volta=/painel/conta", async () => {
    const res = await proxy(new NextRequest("http://localhost:3030/painel/conta"));
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/entrar");
    expect(location.searchParams.get("volta")).toBe("/painel/conta");
  });

  it("cookie inválido também volta para /entrar", async () => {
    const res = await proxy(new NextRequest("http://localhost:3030/painel", { headers: { cookie: "as_sessao=forjado" } }));
    expect(new URL(res.headers.get("location")!).pathname).toBe("/entrar");
  });

  it("/painel com sessão válida passa", async () => {
    const token = await signSession("conta-1");
    const res = await proxy(new NextRequest("http://localhost:3030/painel", { headers: { cookie: `as_sessao=${token}` } }));
    expect(res.headers.get("location")).toBeNull();
  });

  it("sessão com mais de 7 dias é renovada", async () => {
    const old = await signSession("conta-1", new Date(Date.now() - 8 * 86400_000));
    const res = await proxy(new NextRequest("http://localhost:3030/painel", { headers: { cookie: `as_sessao=${old}` } }));
    expect(res.cookies.get("as_sessao")?.value).toBeTruthy();
    expect(res.cookies.get("as_sessao")?.value).not.toBe(old);
  });

  it("/ vai para /entrar sem sessão e para /painel com", async () => {
    const without = await proxy(new NextRequest("http://localhost:3030/"));
    expect(new URL(without.headers.get("location")!).pathname).toBe("/entrar");
    const token = await signSession("conta-1");
    const withSession = await proxy(new NextRequest("http://localhost:3030/", { headers: { cookie: `as_sessao=${token}` } }));
    expect(new URL(withSession.headers.get("location")!).pathname).toBe("/painel");
  });
});
