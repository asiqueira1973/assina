// Seção 20.2: o que vai para log e para as colunas de erro é só código, nunca a mensagem livre.
import { describe, expect, it } from "vitest";
import { errorCode } from "./error-code";

describe("errorCode", () => {
  it("raise exception do banco (P0001) com código nosso devolve o código", () => {
    expect(errorCode({ code: "P0001", message: "sem_reserva" })).toBe("sem_reserva");
  });
  it("P0001 com mensagem livre devolve só P0001", () => {
    expect(errorCode({ code: "P0001", message: "valor inválido para ana@x.com" })).toBe("P0001");
  });
  it("outros códigos do Postgres/PostgREST ficam como estão", () => {
    expect(errorCode({ code: "PGRST202", message: "Could not find the function" })).toBe("PGRST202");
  });
  it("Error com código nosso, com mensagem livre e sem nada", () => {
    expect(errorCode(new Error("integridade_violada"))).toBe("integridade_violada");
    expect(errorCode(new Error("resend_422"))).toBe("resend_422");
    expect(errorCode(new TypeError("Cannot read ana@x.com"))).toBe("TypeError");
    expect(errorCode("x")).toBe("erro");
  });
});
