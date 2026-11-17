// Critério 8.5: CPF validado pelos dígitos verificadores.
import { describe, expect, it } from "vitest";
import { isValidCpf } from "./cpf";

describe("CPF", () => {
  it.each(["529.982.247-25", "52998224725", "111.444.777-35"])("%s é válido", (cpf) => expect(isValidCpf(cpf)).toBe(true));
  it.each(["529.982.247-24", "111.111.111-11", "123", "", "abc.def.ghi-jk"])("%s é inválido", (cpf) => expect(isValidCpf(cpf)).toBe(false));
});
