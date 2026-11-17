// Seção 15.2: o remetente "{nome} via Assina" vai entre aspas e sem caracteres que quebram o
// cabeçalho From (achado do verifier no 8.4).
import { describe, expect, it } from "vitest";
import { fromHeader } from "./mailer";

describe("cabeçalho From", () => {
  it("nome comum entre aspas", () => {
    expect(fromHeader("Ana Souza")).toBe('"Ana Souza via Assina" <naoresponda@assina.app.br>');
  });

  it("e-mail da própria plataforma (sem nome): só Assina, sem \"via\"", () => {
    expect(fromHeader()).toBe('"Assina" <naoresponda@assina.app.br>');
  });

  it.each([
    ["Silva, Ana", '"Silva, Ana via Assina"'],
    ['Ana "Aninha" <x@y>', '"Ana Aninha x@y via Assina"'],
    ["Ana\r\nBcc: alguem@x.com", '"Ana Bcc: alguem@x.com via Assina"'],
    ["   ", '"Assina via Assina"'],
  ])("%j fica seguro", (nome, esperado) => {
    expect(fromHeader(nome).startsWith(esperado)).toBe(true);
    expect(fromHeader(nome)).not.toMatch(/[\r\n]/);
  });
});
