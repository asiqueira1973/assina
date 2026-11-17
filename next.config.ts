import type { NextConfig } from "next";

// Configuração do Next 16 (seção 4): Cache Components ligado, como no Reunião.
// Cabeçalhos de segurança da seção 17. A CSP completa ficou para o épico 8.13 (entrega),
// com nonce para os scripts do Next e o worker do pdf.js; até lá, só os que não dependem dela.
const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
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
