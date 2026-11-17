// Seção 14: células do CSV da trilha (separador, aspas, quebra de linha e injeção de fórmula).
import { describe, expect, it } from "vitest";
import { csvCell } from "./trail-csv";

describe("csvCell", () => {
  it.each([
    [null, ""],
    [7, "7"],
    ["Ana", "Ana"],
    ["a;b", '"a;b"'],
    ['diz "oi"', '"diz ""oi"""'],
    ["linha\nnova", '"linha\nnova"'],
    ["=1+1", "'=1+1"],
    ["+55", "'+55"],
    ["-x", "'-x"],
    ["@SUM(A1)", "'@SUM(A1)"],
    ["=a;b", `"'=a;b"`],
  ])("%j → %j", (input, out) => {
    expect(csvCell(input as string | number | null)).toBe(out);
  });
});
