// Critérios do épico 8.6 de ponta a ponta: assinaturas pelas rotas, finalização disparada pela
// última, PDF final com campos, manifesto e selo, e-mails de conclusão, falhas e retentativas.
import { createHash } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FINALIZACAO_TENTATIVAS } from "@/lib/limits";
import { db } from "@/server/db/client";
import { setMailerForTests, type EmailMessage } from "@/server/email/mailer";
import { storage } from "@/server/files/storage";
import { verifySeal } from "@/server/pdf/seal";
import { formatVerificationCode } from "./verification-code";
import { deleteTestAccounts } from "../../../tests/helpers";
import { makePdf } from "../../../tests/fixtures/pdfs";
import { pdfPagesText } from "../../../tests/pdf-text";
import { fakeOutbox, PNG_1PX, sentEnvelope, signAs } from "../../../tests/signing";
import { NextRequest } from "next/server";
import { GET as baixarFinal } from "@/app/api/final/[chave]/route";
import { finalizeEnvelope, retryFinalizations } from "./finalize";

const accounts: string[] = [];
let outbox: EmailMessage[] = [];
beforeEach(() => {
  outbox = fakeOutbox();
});
afterEach(() => setMailerForTests(null));
afterAll(() => deleteTestAccounts(accounts));

const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const envelope = async (id: string) =>
  (await db().from("as_envelopes").select("status, hash_original, hash_final, selo, arquivo_final_path, concluido_em, tentativas_finalizacao, erro_finalizacao, codigo_verificacao, conta_id").eq("id", id).single()).data!;

// Envelope de um assinante só, pronto para finalizar à mão: assina com a finalização fora do ar
// (sem certificado) e devolve o id com o envelope em 'finalizando' e tentativas zeradas.
async function stuckInFinalizando() {
  const p12 = process.env.SELO_P12_BASE64;
  delete process.env.SELO_P12_BASE64;
  const env = await sentEnvelope(accounts, [{ nome: "Ana", email: "ana@f.dev" }]);
  expect(await signAs(outbox, "ana@f.dev", { metodo: "digitada", assinatura_texto: "Ana" })).toBe("finalizando");
  process.env.SELO_P12_BASE64 = p12;
  const e = await envelope(env.id);
  expect(e).toMatchObject({ status: "finalizando", tentativas_finalizacao: 1, erro_finalizacao: "selo_sem_certificado" });
  return env;
}

describe("finalização (épico 8.6)", () => {
  it("última assinatura conclui: campos, manifesto, selo, hash final, eventos, e-mails com o PDF anexo", async () => {
    const env = await sentEnvelope(
      accounts,
      [
        { nome: "Ana Souza", email: "ana@f.dev", exigir_cpf: true },
        { nome: "Bruno Lima", email: "bruno@f.dev" },
        { nome: "Carla Dias", email: "carla@f.dev", papel: "copia" },
      ],
      {
        campos: (ids) => [
          { signatario_id: ids["ana@f.dev"], tipo: "assinatura", pagina: 1, x: 0.1, y: 0.7, largura: 0.3, altura: 0.06 },
          { signatario_id: ids["ana@f.dev"], tipo: "texto", pagina: 1, x: 0.1, y: 0.1, largura: 0.3, altura: 0.03, obrigatorio: true, rotulo: "Cargo" },
          { signatario_id: ids["ana@f.dev"], tipo: "nome", pagina: 1, x: 0.1, y: 0.2, largura: 0.3, altura: 0.03 },
          { signatario_id: ids["ana@f.dev"], tipo: "data", pagina: 1, x: 0.5, y: 0.2, largura: 0.16, altura: 0.03 },
          { signatario_id: ids["ana@f.dev"], tipo: "caixa", pagina: 1, x: 0.1, y: 0.3, largura: 0.03, altura: 0.02, obrigatorio: false },
          { signatario_id: ids["bruno@f.dev"], tipo: "assinatura", pagina: 1, x: 0.5, y: 0.7, largura: 0.3, altura: 0.06 },
          { signatario_id: ids["bruno@f.dev"], tipo: "rubrica", pagina: 1, x: 0.85, y: 0.9, largura: 0.1, altura: 0.05 },
        ],
      },
    );
    const ids = env.byEmail;
    const { data: campos } = await db().from("as_campos").select("id, tipo").eq("envelope_id", env.id);
    const id = (tipo: string) => campos!.find((c) => c.tipo === tipo)!.id;

    expect(
      await signAs(outbox, "ana@f.dev", {
        metodo: "digitada",
        assinatura_texto: "Ana Souza",
        cpf: "529.982.247-25",
        campos: [
          { id: id("texto"), valor: "Diretora" },
          { id: id("caixa"), valor: "sim" },
        ],
      }),
    ).toBe("enviado");
    expect(await signAs(outbox, "bruno@f.dev", { metodo: "desenhada", assinatura_png: PNG_1PX, rubrica_png: PNG_1PX })).toBe("finalizando");

    // A finalização rodou junto (fora de uma requisição o after roda na hora).
    const e = await envelope(env.id);
    expect(e).toMatchObject({ status: "concluido", selo: "B-B", tentativas_finalizacao: 1 });
    expect(e.arquivo_final_path).toMatch(new RegExp(`^${e.conta_id}/${env.id}/final-[0-9a-f-]{36}\\.pdf$`));
    const final = (await storage().read(e.arquivo_final_path!, 40 * 1024 * 1024))!;
    expect(sha256(final)).toBe(e.hash_final);
    expect(verifySeal(final)).toBe(true);

    // Página do documento + manifesto (texto pelo pdf.js).
    const pages = await pdfPagesText(final);
    expect((await PDFDocument.load(final)).getPageCount()).toBe(pages.length);
    expect(pages.length).toBeGreaterThanOrEqual(2);
    expect(pages[0]).toContain("Diretora");
    expect(pages[0]).toContain("Ana Souza");
    expect(pages[0]).toMatch(/\d{2}\/\d{2}\/\d{4}/); // campo data, em Brasília
    const manifest = pages.slice(1).join(" ");
    if (process.env.MOSTRAR_MANIFESTO) console.log(pages.join("\n---\n"));
    for (const t of ["Manifesto de assinaturas", "Contrato", formatVerificationCode(e.codigo_verificacao), e.hash_original!, "Ana Souza", "Bruno Lima", "Carla Dias", "a***@f.dev", "***.982.247-**", "Autenticado por código enviado ao e-mail", "UTC-3", "Assinou", "Concordou em assinar eletronicamente", "Página 1 de"]) {
      expect(manifest).toContain(t);
    }
    expect(manifest).not.toContain("ana@f.dev");
    expect(manifest).not.toContain("52998224725");
    expect(manifest).not.toContain(e.hash_final!); // o hash final não cabe no próprio arquivo

    // Trilha: finalizado com hash e selo, depois concluído; continua íntegra.
    const { data: eventos } = await db().from("as_eventos").select("tipo, dados").eq("envelope_id", env.id).order("seq");
    expect(eventos!.slice(-2)).toEqual([
      { tipo: "finalizado", dados: { hash_final: e.hash_final, selo: "B-B" } },
      { tipo: "concluido", dados: {} },
    ]);
    expect((await db().rpc("as_fn_verifica_trilha", { p_envelope_id: env.id })).data).toBeNull();

    // E-mails: assinantes e cópia com o PDF anexo; remetente com o link do detalhe.
    const done = outbox.filter((m) => m.subject === "Concluído: Contrato");
    const { data: conta } = await db().from("as_contas").select("email").eq("id", e.conta_id).single();
    expect(done.map((m) => m.to).sort()).toEqual(["ana@f.dev", "bruno@f.dev", "carla@f.dev", conta!.email].sort());
    for (const m of done) {
      expect(m.attachments?.[0]?.filename).toBe("Contrato.pdf");
      expect(sha256(m.attachments![0].content)).toBe(e.hash_final);
      expect(m.text).toContain(e.hash_final!);
      expect(m.text).toContain(formatVerificationCode(e.codigo_verificacao));
    }
    expect(done.find((m) => m.to === conta!.email)!.text).toContain(`/painel/envelopes/${env.id}`);
    void ids;
  });

  it("original alterado no armazenamento: integridade_violada, não conclui, alerta ao admin na hora", async () => {
    const env = await stuckInFinalizando();
    const e = await envelope(env.id);
    const { data: row } = await db().from("as_envelopes").select("arquivo_original_path").eq("id", env.id).single();
    await storage().write(row!.arquivo_original_path!, await makePdf(2), "application/pdf");

    expect(await finalizeEnvelope(env.id)).toBe("falhou");
    expect(await envelope(env.id)).toMatchObject({ status: "finalizando", hash_final: null, tentativas_finalizacao: FINALIZACAO_TENTATIVAS, erro_finalizacao: "integridade_violada" });
    const alert = outbox.find((m) => m.to === "admin@assina.test");
    expect(alert?.subject).toBe("[Assina] Finalização falhou 3 vezes");
    expect(alert?.text).toContain(env.id);
    expect(alert?.text).toContain("integridade_violada");
    expect(alert?.text).not.toContain("ana@f.dev");
    // Sem tentativa sobrando, a faxina não pega mais.
    expect(await retryFinalizations({ contaIds: [env.contaId] })).toBe(0);
    void e;
  });

  it("falha conta tentativa; a faxina retenta; na 3ª falha sai o alerta e para", async () => {
    const env = await stuckInFinalizando(); // 1ª falha (sem certificado)
    const p12 = process.env.SELO_P12_BASE64;
    delete process.env.SELO_P12_BASE64;
    try {
      expect(await retryFinalizations({ contaIds: [env.contaId] })).toBe(0); // 2ª
      expect(outbox.some((m) => m.to === "admin@assina.test")).toBe(false);
      expect(await retryFinalizations({ contaIds: [env.contaId] })).toBe(0); // 3ª
      expect(await envelope(env.id)).toMatchObject({ status: "finalizando", tentativas_finalizacao: 3 });
      expect(outbox.filter((m) => m.to === "admin@assina.test")).toHaveLength(1);
    } finally {
      process.env.SELO_P12_BASE64 = p12;
    }
    // Mesmo com o certificado de volta, a faxina não insiste (intervenção manual, regra 11.10).
    expect(await retryFinalizations({ contaIds: [env.contaId] })).toBe(0);
    expect((await envelope(env.id)).status).toBe("finalizando");
  });

  // O relógio do servidor (Vercel) e o do banco (Supabase) não são o mesmo. A finalização não
  // pode depender de os dois baterem ao milissegundo: com o servidor atrasado ou adiantado
  // alguns segundos, ela conclui, e a data de conclusão nunca fica antes da última assinatura.
  for (const skewMs of [-5_000, 5_000]) {
    it(`relógio do servidor ${skewMs < 0 ? "atrasado" : "adiantado"} 5 s em relação ao banco: conclui mesmo assim`, async () => {
      const env = await stuckInFinalizando();
      vi.useFakeTimers({ toFake: ["Date"], now: Date.now() + skewMs });
      try {
        expect(await finalizeEnvelope(env.id)).toBe("concluido");
      } finally {
        vi.useRealTimers();
      }
      const e = await envelope(env.id);
      const { data: last } = await db().from("as_eventos").select("ocorrido_em").eq("envelope_id", env.id).eq("tipo", "assinou").single();
      expect(e.status).toBe("concluido");
      expect(new Date(e.concluido_em!).getTime()).toBeGreaterThanOrEqual(new Date(last!.ocorrido_em).getTime());
    });
  }

  it("a faxina conclui um envelope que falhou uma vez", async () => {
    const env = await stuckInFinalizando();
    expect(await retryFinalizations({ contaIds: [env.contaId] })).toBe(1);
    expect(await envelope(env.id)).toMatchObject({ status: "concluido", tentativas_finalizacao: 2, erro_finalizacao: null });
  });

  it("finalizador atrasado (reserva vencida e tomada) não conclui nem mexe na reserva do outro", async () => {
    const env = await stuckInFinalizando();
    const claim = async () => (await db().rpc("as_fn_reserva_finalizacao", { p_envelope_id: env.id, p_max_tentativas: FINALIZACAO_TENTATIVAS }).single()).data as { resultado: string; reserva: string };
    const a = await claim();
    expect(a.resultado).toBe("ok");
    // A reserva de A vence (5 min) e a faxina a toma e conclui.
    await db().from("as_envelopes").update({ finalizacao_reservada_em: new Date(Date.now() - 6 * 60_000).toISOString() }).eq("id", env.id);
    expect(await finalizeEnvelope(env.id)).toBe("concluido");
    const done = await envelope(env.id);
    // A chega atrasado: não conclui (o envelope já mudou) e a falha dele não conta.
    const late = await db().rpc("as_fn_conclui_envelope", { p_envelope_id: env.id, p_reserva: a.reserva, p_caminho: `${done.conta_id}/${env.id}/final-${a.reserva}.pdf`, p_hash_final: "f".repeat(64), p_selo: "B-B", p_concluido_em: new Date().toISOString() });
    expect(late.error?.message).toBe("status_mudou");
    expect(await envelope(env.id)).toEqual(done);
    // O final concluído continua sendo o do hash registrado.
    expect(sha256((await storage().read(done.arquivo_final_path!, 40 * 1024 * 1024))!)).toBe(done.hash_final);
  });

  it("tentativas que caem sem registrar falha (timeout) também contam; depois da última, a faxina alerta uma vez", async () => {
    const env = await stuckInFinalizando(); // 1ª, com falha registrada
    // 2ª e 3ª: reservam e "caem" (a reserva vence sem conclusão nem falha).
    for (let i = 0; i < 2; i++) {
      const r = (await db().rpc("as_fn_reserva_finalizacao", { p_envelope_id: env.id, p_max_tentativas: FINALIZACAO_TENTATIVAS }).single()).data as { resultado: string };
      expect(r.resultado).toBe("ok");
      await db().from("as_envelopes").update({ finalizacao_reservada_em: new Date(Date.now() - 6 * 60_000).toISOString() }).eq("id", env.id);
    }
    expect(outbox.some((m) => m.to === "admin@assina.test")).toBe(false);
    expect(await retryFinalizations({ contaIds: [env.contaId] })).toBe(0);
    expect(outbox.filter((m) => m.to === "admin@assina.test")).toHaveLength(1);
    expect(await retryFinalizations({ contaIds: [env.contaId] })).toBe(0);
    expect(outbox.filter((m) => m.to === "admin@assina.test")).toHaveLength(1);
    expect(await envelope(env.id)).toMatchObject({ status: "finalizando", tentativas_finalizacao: 3 });
  });

  it("dois finalizadores ao mesmo tempo: um conclui, o outro encontra a reserva", async () => {
    const env = await stuckInFinalizando();
    const results = await Promise.all([finalizeEnvelope(env.id), finalizeEnvelope(env.id)]);
    expect(results.sort()).toEqual(["concluido", "ocupado"]);
    expect(outbox.filter((m) => m.subject === "Concluído: Contrato" && m.to === "ana@f.dev")).toHaveLength(1);
  });

  it("PDF final acima de 7 MB: sem anexo, com o botão para a página do signatário (link novo)", async () => {
    // Original de ~8 MB (dentro dos 10 MB da regra 11.1): um anexo embutido de bytes aleatórios.
    const doc = await PDFDocument.load(await makePdf(1));
    await doc.attach(new Uint8Array(Array.from({ length: 8 * 1024 * 1024 }, () => (Math.random() * 256) | 0)), "dados.bin", { mimeType: "application/octet-stream" });
    const env = await sentEnvelope(accounts, [{ nome: "Ana", email: "ana@f.dev" }], { pdf: await doc.save() });
    const before = (await db().from("as_signatarios").select("token_hash").eq("id", env.byEmail["ana@f.dev"]).single()).data!.token_hash;
    expect(await signAs(outbox, "ana@f.dev", { metodo: "digitada", assinatura_texto: "Ana" })).toBe("finalizando");
    expect((await envelope(env.id)).status).toBe("concluido");

    const mail = outbox.find((m) => m.to === "ana@f.dev" && m.subject === "Concluído: Contrato")!;
    expect(mail.attachments).toBeUndefined();
    // Link próprio de download; o link de assinatura não muda (a sessão de quem assinou continua).
    const link = mail.text.match(/Baixar documento assinado: (http:\/\/localhost:3030\/api\/final\/[0-9a-f-]{36}\.[A-Za-z0-9_-]{43})/)![1];
    const after = (await db().from("as_signatarios").select("token_hash").eq("id", env.byEmail["ana@f.dev"]).single()).data!.token_hash;
    expect(after).toBe(before);
    const chave = link.split("/").pop()!;
    const res = await baixarFinal(new NextRequest(link), { params: Promise.resolve({ chave }) });
    expect(res.status).toBe(302);
    const { data: ev } = await db().from("as_eventos").select("tipo, signatario_id").eq("envelope_id", env.id).order("seq", { ascending: false }).limit(1).single();
    expect(ev).toEqual({ tipo: "baixou_final", signatario_id: env.byEmail["ana@f.dev"] });
    // Chave adulterada: 404.
    const bad = chave.slice(0, -1) + (chave.endsWith("A") ? "B" : "A");
    expect((await baixarFinal(new NextRequest(link), { params: Promise.resolve({ chave: bad }) })).status).toBe(404);
  }, 60000);
});
