// /robots.txt — critério 8.12 e seção 17: libera o site público e bloqueia o que não é para buscador
// (painel, links de assinatura, APIs, OAuth, MCP, entrar e sair). As páginas fora do índice também
// levam `noindex` (layout raiz); só /, /verificar, /docs/api, /privacidade e /termos são indexáveis.
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/painel", "/assinar/", "/api/", "/oauth/", "/mcp", "/entrar", "/sair"] },
    ...(site ? { sitemap: `${site}/sitemap.xml` } : {}),
  };
}
