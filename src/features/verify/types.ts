// Tipos do resultado da verificação pública (regra 11.11). Ficam fora de src/server/ para os
// componentes de cliente poderem usá-los (seção 20.3: cliente não importa src/server/).
export type PublicSummary = {
  status: "enviado" | "finalizando" | "concluido" | "recusado" | "cancelado" | "expirado";
  titulo: string;
  enviado_em: string | null;
  concluido_em: string | null;
  selo: "B-B" | "B-T" | null;
  assinantes: { nome: string; assinado_em: string | null }[];
};
export type VerificationResult =
  | { resultado: "final"; envelopes: PublicSummary[] }
  | { resultado: "original"; envelopes: PublicSummary[] }
  | { resultado: "codigo"; envelopes: PublicSummary[] }
  | { resultado: "original_multiplo"; envelopes: PublicSummary[] }
  | { resultado: "nao_encontrado"; envelopes: PublicSummary[] };
