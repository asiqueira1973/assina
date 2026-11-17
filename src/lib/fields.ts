// Regras dos campos posicionados — regra 11.3 e épico 8.3. Roda no cliente (editor) e no
// servidor (validação), para a mesma regra morar num lugar só (princípio 5).
// Coordenadas sempre em fração da página (0 a 1, origem no canto superior esquerdo).
import { A4_PT, CAMPO_MIN } from "./limits";

export const FIELD_TYPES = ["assinatura", "rubrica", "data", "nome", "texto", "caixa"] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

// Tamanho padrão em fração de uma página A4 (regra 11.3).
const DEFAULT_A4: Record<FieldType, { l: number; a: number }> = {
  assinatura: { l: 0.3, a: 0.06 },
  rubrica: { l: 0.1, a: 0.05 },
  data: { l: 0.16, a: 0.03 },
  nome: { l: 0.3, a: 0.03 },
  texto: { l: 0.3, a: 0.03 },
  caixa: { l: 0.03, a: 0.02 },
};

// Tipos que podem ser opcionais (os demais são sempre obrigatórios, 7.3).
export function canBeOptional(type: FieldType): boolean {
  return type === "texto" || type === "caixa";
}

// Arredonda para as 5 casas do banco (numeric(6,5)), sem deixar passar de 1 por arredondamento.
function round5(v: number): number {
  return Math.floor(v * 100000) / 100000;
}

// Tamanho padrão de um tipo numa página (regra 11.3): o tamanho físico é o de uma A4; a fração
// muda com o tamanho da página. Recebe: tipo e dimensões da página em pontos.
// Devolve: largura e altura em fração da página, no máximo 1.
export function defaultFieldSize(type: FieldType, page: { l: number; a: number }): { largura: number; altura: number } {
  const base = DEFAULT_A4[type];
  return {
    largura: round5(Math.min(1, (base.l * A4_PT.l) / page.l)),
    altura: round5(Math.min(1, (base.a * A4_PT.a) / page.a)),
  };
}

export type Box = { x: number; y: number; largura: number; altura: number };

// Empurra o campo para dentro da página (critério 8.3: nunca grava x + largura > 1).
// Recebe: posição e tamanho quaisquer. Devolve: a caixa ajustada, com tamanho entre o mínimo e 1.
export function clampField(box: Box): Box {
  const largura = round5(Math.min(1, Math.max(CAMPO_MIN, box.largura)));
  const altura = round5(Math.min(1, Math.max(CAMPO_MIN, box.altura)));
  const x = round5(Math.min(1 - largura, Math.max(0, box.x)));
  const y = round5(Math.min(1 - altura, Math.max(0, box.y)));
  return { x, y, largura, altura };
}

// Cores dos assinantes no editor (seção 16), na ordem de assinatura; repete depois da 10ª.
export const SIGNER_COLORS = ["#af52de", "#ff9500", "#30b0c7", "#ff2d55", "#a2845e", "#34c759", "#5856d6", "#ffcc00", "#00c7be", "#8e8e93"];
export function signerColor(index: number): string {
  return SIGNER_COLORS[index % SIGNER_COLORS.length];
}
