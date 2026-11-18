// Critério 8.12: "/" sem sessão mostra a página inicial e com sessão vai para /painel; só /,
// /verificar, /docs/api, /privacidade e /termos são indexáveis; robots.txt e sitemap reais; o
// rodapé e os textos legais em nome da DabLab, com as negativas só em LEGAL_NEGATIVAS.
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { copy, LEGAL_NEGATIVAS } from "@/lib/copy";
import { signSession } from "@/server/auth/session";
import { proxy } from "@/proxy";
import { metadata as rootMeta } from "./layout";
import { metadata as homeMeta } from "./(publico)/page";
import { metadata as termsMeta } from "./(publico)/termos/page";
import { metadata as privacyMeta } from "./(publico)/privacidade/page";
import { metadata as verifyMeta } from "./(publico)/verificar/page";
import { metadata as docsMeta } from "./(publico)/docs/api/page";
import robots from "./robots";
import sitemap from "./sitemap";

const SITE = "http://localhost:3030";

describe("página inicial e proxy", () => {
  it("/ sem sessão segue para a página inicial; com sessão vai para /painel", async () => {
    const anon = await proxy(new NextRequest(`${SITE}/`));
    expect(anon.headers.get("location")).toBeNull();
    expect(anon.headers.get("x-middleware-next")).toBe("1");

    const cookie = `as_sessao=${await signSession("00000000-0000-4000-8000-000000000001")}`;
    const logged = await proxy(new NextRequest(`${SITE}/`, { headers: { cookie } }));
    expect(logged.headers.get("location")).toBe(`${SITE}/painel`);
  });
});

describe("indexação (seção 17)", () => {
  it("só as cinco páginas públicas sobrepõem o noindex do layout raiz", () => {
    expect(rootMeta.robots).toEqual({ index: false, follow: false });
    for (const m of [homeMeta, termsMeta, privacyMeta, verifyMeta, docsMeta]) expect(m.robots).toEqual({ index: true, follow: true });
  });

  it("robots.txt bloqueia painel, assinatura, APIs, OAuth e MCP; sitemap com as cinco páginas", () => {
    const r = robots();
    expect(r.rules).toEqual({ userAgent: "*", allow: "/", disallow: ["/painel", "/assinar/", "/api/", "/oauth/", "/mcp", "/entrar", "/sair"] });
    expect(r.sitemap).toBe(`${SITE}/sitemap.xml`);
    expect(sitemap().map((s) => s.url)).toEqual([SITE, `${SITE}/verificar`, `${SITE}/docs/api`, `${SITE}/privacidade`, `${SITE}/termos`]);
  });
});

describe("textos legais e rodapé (seção 20)", () => {
  it("em nome da DabLab, com contato, base legal, operador e subprocessadores", () => {
    const terms = copy.legal.termsSections.flatMap((s) => s.paragraphs).join("\n");
    const privacy = copy.legal.privacySections.flatMap((s) => s.paragraphs).join("\n");
    for (const text of [terms, privacy]) {
      expect(text).toContain("CNPJ 61.033.268/0001-14");
      expect(text).toContain("alexandre@dablab.com.br");
    }
    expect(terms).toContain("art. 10, § 2º, da Medida Provisória 2.200-2/2001");
    expect(terms).toContain(LEGAL_NEGATIVAS.termsIsNot);
    expect(terms).toContain("operadora");
    for (const sub of ["Supabase", "Cloudflare", "Vercel", "Resend"]) expect(privacy).toContain(sub);
    expect(privacy).toContain("peça a ele");
    expect(privacy).toContain("ANPD");
    // O que o código faz de verdade (achados do verifier no 8.12): o PDF vai anexo no e-mail de
    // conclusão, e os eventos de uso com o e-mail ficam no Visão do Produto depois da exclusão.
    expect(privacy).toContain("PDF assinado em anexo");
    expect(privacy).toMatch(/Ficam só os eventos de uso no Visão do Produto/);
    expect(privacy).toContain("De cada ação sua num envelope");
  });

  it("nenhum texto fora de LEGAL_NEGATIVAS usa as palavras proibidas (princípio 4)", () => {
    const negatives = new Set<string>(Object.values(LEGAL_NEGATIVAS));
    const all: string[] = [
      ...Object.values(copy.home),
      ...Object.values(copy.footer),
      ...[...copy.legal.termsSections, ...copy.legal.privacySections].flatMap((s) => [s.title, ...s.paragraphs]),
    ].filter((t) => !negatives.has(t));
    expect(all.length).toBeGreaterThan(40);
    for (const t of all) expect(t).not.toMatch(/certificado digital|icp-brasil|assinatura qualificada|assinatura digital|firma reconhecida|100% v(a|á)lid|validade garantida/i);
  });

  it("rodapé da seção 15.1", () => {
    expect([copy.footer.privacy, copy.footer.terms, copy.footer.source, copy.footer.madeBy].join(" · ")).toBe("Privacidade · Termos · Código aberto no GitHub · Um produto DabLab");
    expect(copy.footer.sourceUrl).toBe("https://github.com/asiqueira1973/assina");
  });
});
