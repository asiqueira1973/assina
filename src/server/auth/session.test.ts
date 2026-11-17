// Seção 6.1: sessão assinada, 30 dias, renovada depois de 7.
import { describe, expect, it } from "vitest";
import { SESSION_MAX_AGE_S, shouldRenew, signSession, verifySession } from "./session";

describe("sessão do remetente (seção 6.1)", () => {
  it("assina e lê de volta o conta_id", async () => {
    const token = await signSession("conta-1");
    expect((await verifySession(token))?.contaId).toBe("conta-1");
  });

  it("token adulterado ou com outro segredo é recusado", async () => {
    const token = await signSession("conta-1");
    expect(await verifySession(token.slice(0, -2) + "xx")).toBeNull();
    expect(await verifySession(token, "outro-segredo-com-mais-de-32-caracteres!!")).toBeNull();
  });

  it("expira em 30 dias", async () => {
    const issued = new Date(Date.now() - (SESSION_MAX_AGE_S + 60) * 1000);
    expect(await verifySession(await signSession("conta-1", issued))).toBeNull();
  });

  it("renova só depois de 7 dias", () => {
    const now = new Date();
    const at = (days: number) => Math.floor(now.getTime() / 1000) - days * 86400;
    expect(shouldRenew({ contaId: "c", issuedAt: at(6) }, now)).toBe(false);
    expect(shouldRenew({ contaId: "c", issuedAt: at(8) }, now)).toBe(true);
  });
});
