import type { NextConfig } from "next";

// Configuração do Next 16 (seção 4): Cache Components ligado, como no Reunião.
// Cabeçalhos de segurança da seção 17, com a CSP do épico 8.13 no modelo "sem nonce" do guia do
// Next (node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md): com nonce, toda
// página precisaria de renderização dinâmica, inclusive as públicas estáticas. Por isso os scripts
// têm 'unsafe-inline' (os scripts embutidos do Next), mas nunca 'unsafe-eval' em produção
// (divergência 59).
// - connect-src e img-src: o próprio site e o R2 (upload pela URL assinada, PDF lido pelo pdf.js).
// - worker-src e font-src: o worker do pdf.js (/pdf.worker.min.mjs) e as fontes que ele monta.
// - form-action: o consentimento do OAuth volta para o redirect_uri do cliente (https, ou
//   localhost para clientes locais, 6.4), e o navegador aplica form-action também ao redirecionamento.
const isDev = process.env.NODE_ENV === "development";
const R2 = "https://*.r2.cloudflarestorage.com";
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${R2}`,
  "font-src 'self' data: blob:",
  `connect-src 'self' ${R2}${isDev ? " ws:" : ""}`,
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https: http://localhost:* http://127.0.0.1:*",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");
const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // A fonte cursiva é lida do node_modules na finalização (src/server/pdf/fonts.ts, épico 8.6):
  // sem isto, o arquivo não iria para a função da Vercel.
  outputFileTracingIncludes: {
    "/api/**": ["./node_modules/@fontsource/dancing-script/files/dancing-script-latin-400-normal.woff"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      // Seção 6.2: o link do signatário carrega o token na URL; não indexar nem vazar no Referer.
      {
        source: "/assinar/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
    ];
  },
};

export default nextConfig;
