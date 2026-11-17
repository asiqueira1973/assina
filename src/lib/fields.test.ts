// Regra 11.3 / critério 8.3: tamanhos padrão e campo sempre dentro da página.
import { describe, expect, it } from "vitest";
import { clampField, defaultFieldSize } from "./fields";

describe("campos (regra 11.3)", () => {
  it("numa A4, o tamanho padrão é a própria fração da regra", () => {
    expect(defaultFieldSize("assinatura", { l: 595.28, a: 841.89 })).toEqual({ largura: 0.3, altura: 0.06 });
    expect(defaultFieldSize("caixa", { l: 595.28, a: 841.89 })).toEqual({ largura: 0.03, altura: 0.02 });
  });

  it("numa página maior, a fração encolhe para manter o tamanho físico", () => {
    const { largura, altura } = defaultFieldSize("assinatura", { l: 1190.56, a: 841.89 });
    expect(largura).toBeCloseTo(0.15, 5);
    expect(altura).toBeCloseTo(0.06, 5);
  });

  it("numa página minúscula, nunca passa de 1", () => {
    expect(defaultFieldSize("assinatura", { l: 100, a: 20 })).toEqual({ largura: 1, altura: 1 });
  });

  it("campo arrastado para fora é empurrado para dentro", () => {
    expect(clampField({ x: 0.9, y: -0.2, largura: 0.3, altura: 0.06 })).toEqual({ x: 0.7, y: 0, largura: 0.3, altura: 0.06 });
    const c = clampField({ x: 0.95, y: 0.99, largura: 0.3, altura: 0.06 });
    expect(c.x + c.largura).toBeLessThanOrEqual(1);
    expect(c.y + c.altura).toBeLessThanOrEqual(1);
  });

  it("tamanho entre o mínimo e 1", () => {
    expect(clampField({ x: 0, y: 0, largura: 0, altura: 2 })).toEqual({ x: 0, y: 0, largura: 0.01, altura: 1 });
  });

  it("arredonda para 5 casas sem estourar a borda", () => {
    const c = clampField({ x: 0.123456789, y: 0.5, largura: 0.876543211, altura: 0.1 });
    expect(c.x + c.largura).toBeLessThanOrEqual(1);
    expect(String(c.x).split(".")[1]?.length ?? 0).toBeLessThanOrEqual(5);
  });
});
