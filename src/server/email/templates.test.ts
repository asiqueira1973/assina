// E-mail de conclusão (seção 15.2): o código de verificação aparece como XXXX-XXXX-XXXX, igual ao
// painel e ao manifesto (regra 11.11). Achado no primeiro envelope em produção (20/11/2026).
import { describe, expect, it } from "vitest";
import { completedEmail } from "./templates";

describe("e-mail de conclusão", () => {
  it("código de verificação com hífens, no texto e no HTML", () => {
    const m = completedEmail({ titulo: "Contrato", codigo: "7K2M9QXH4T1B", hashFinal: "a".repeat(64), site: "https://assina.app.br", anexo: true, link: null, detail: false });
    expect(m.text).toContain("Código de verificação: 7K2M-9QXH-4T1B");
    expect(m.html).toContain("7K2M-9QXH-4T1B");
  });
});
