// Data de nascimento (épico 8.14): a mesma regra do banco (as_fn_assina), no fuso de Brasília.
import { describe, expect, it } from "vitest";
import { formatBirthdate, isValidBirthdate, oldestBirthdate, todayInBrasilia } from "./birthdate";

// 20/11/2026 às 01:00 em UTC ainda é 19/11 em Brasília (UTC−3).
const now = new Date("2026-11-20T01:00:00Z");

describe("data de nascimento", () => {
  it("o dia de hoje é o de Brasília", () => {
    expect(todayInBrasilia(now)).toBe("2026-11-19");
  });

  it.each([
    ["1985-03-15", true],
    ["2026-11-19", true], // hoje vale
    ["2026-11-20", false], // amanhã em Brasília
    ["1906-11-19", true], // exatamente 120 anos
    ["1906-11-18", false],
    ["1985-02-31", false], // dia que não existe
    ["15/03/1985", false], // formato da tela, não o do campo
    ["", false],
  ])("%s → %s", (value, ok) => {
    expect(isValidBirthdate(value, now)).toBe(ok);
  });

  it("29/02 de 120 anos atrás num ano não bissexto vira 28/02, como no Postgres", () => {
    expect(oldestBirthdate(new Date("2020-02-29T15:00:00Z"))).toBe("1900-02-28"); // 1900 não é bissexto
    expect(oldestBirthdate(new Date("2024-02-29T15:00:00Z"))).toBe("1904-02-29");
    expect(oldestBirthdate(new Date("2025-03-01T15:00:00Z"))).toBe("1905-03-01");
  });

  it("formata para exibição", () => {
    expect(formatBirthdate("1985-03-15")).toBe("15/03/1985");
  });
});
