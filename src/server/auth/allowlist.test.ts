// Regra 11.12: lista de permitidos opcional, bloqueados e freio de cadastro.
import { describe, expect, it } from "vitest";
import { dailySignupLimit, isEmailAllowed, isEmailBlocked } from "./allowlist";

describe("proteções de cadastro (regra 11.12)", () => {
  it("lista de permitidos vazia = cadastro aberto", () => {
    expect(isEmailAllowed("qualquer@teste.dev", "")).toBe(true);
  });

  it("com lista, só quem está nela, sem diferença de maiúsculas e espaços", () => {
    expect(isEmailAllowed("Ana@Teste.dev", " ana@teste.dev , bia@teste.dev")).toBe(true);
    expect(isEmailAllowed("caio@teste.dev", "ana@teste.dev")).toBe(false);
  });

  it("bloqueados", () => {
    expect(isEmailBlocked("Spam@Teste.dev", "spam@teste.dev")).toBe(true);
    expect(isEmailBlocked("ana@teste.dev", "spam@teste.dev")).toBe(false);
  });

  it("limite diário: padrão 50, aceita 0 e ignora valor inválido", () => {
    // Variável ausente: passar undefined usaria o valor padrão do parâmetro (o env dos testes).
    const saved = process.env.CONTAS_NOVAS_POR_DIA;
    delete process.env.CONTAS_NOVAS_POR_DIA;
    expect(dailySignupLimit()).toBe(50);
    process.env.CONTAS_NOVAS_POR_DIA = saved;
    expect(dailySignupLimit("")).toBe(50);
    expect(dailySignupLimit("0")).toBe(0);
    expect(dailySignupLimit("abc")).toBe(50);
    expect(dailySignupLimit("7")).toBe(7);
  });
});
