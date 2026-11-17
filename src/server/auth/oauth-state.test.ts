// Seção 6.1: cookie do login e rota de volta saneada (sem redirecionamento aberto).
import { describe, expect, it } from "vitest";
import { decodeOAuthCookie, encodeOAuthCookie, safeReturnPath } from "./oauth-state";

describe("rota de volta do login (seção 6.1)", () => {
  it.each([
    ["/painel", "/painel"],
    ["/painel/conta", "/painel/conta"],
    ["/painel/envelopes/123?aba=trilha", "/painel/envelopes/123?aba=trilha"],
    ["/oauth/autorizar?client_id=abc&state=x", "/oauth/autorizar?client_id=abc&state=x"],
  ])("aceita %s", (input, expected) => {
    expect(safeReturnPath(input)).toBe(expected);
  });

  it.each([
    null,
    "",
    "https://evil.example/painel",
    "//evil.example/painel",
    "/painel//evil.example",
    "/\\evil.example",
    "/api/v1/envelopes",
    "/painelfalso",
    "javascript:alert(1)",
  ])("recusa %s e volta para /painel", (input) => {
    expect(safeReturnPath(input)).toBe("/painel");
  });

  it("cookie vai e volta, e a volta é saneada de novo na leitura", () => {
    const raw = encodeOAuthCookie({ state: "s", verifier: "v", volta: "https://evil.example" });
    expect(decodeOAuthCookie(raw)).toEqual({ state: "s", verifier: "v", volta: "/painel" });
  });

  it("cookie malformado vira null", () => {
    expect(decodeOAuthCookie("nao-e-base64-json")).toBeNull();
    expect(decodeOAuthCookie(undefined)).toBeNull();
  });
});
