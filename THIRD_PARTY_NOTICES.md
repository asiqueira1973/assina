# Avisos de terceiros

O Assina é distribuído sob a licença MIT (arquivo `LICENSE`). Este arquivo registra a referência funcional usada no projeto e os componentes de terceiros que vão junto com o que o Assina entrega: o site, os PDFs gerados e o worker do pdf.js servido em `public/`.

## Referência funcional

**SignuDoc**: <https://github.com/NYLLON-SOFTWARE/signudoc>, licença MIT.
- Serviu de referência funcional (`spec.md`, Anexo A).
- Nenhum trecho de código do SignuDoc foi copiado até o épico 8.13. Se algum trecho for adaptado no futuro, ele leva a atribuição no próprio arquivo, com o aviso de copyright e a licença MIT do SignuDoc, e entra nesta lista.

## Componentes incluídos no que o Assina entrega

| Componente | Versão | Licença | Onde aparece |
|---|---|---|---|
| Dancing Script (`@fontsource/dancing-script`), de Impallari Type | 5.3.0 | SIL Open Font License 1.1 | Assinatura digitada: na tela e embutida, em subconjunto, no PDF final |
| pdf.js (`pdfjs-dist`), da Mozilla | 6.5.438 | Apache-2.0 | Leitura do PDF no navegador; o worker é copiado para `public/pdf.worker.min.mjs` |
| pdf-lib e `@pdf-lib/fontkit` | 1.17.1 / 1.1.1 | MIT | Campos, manifesto e fonte no PDF final |
| `@signpdf/*` | 4.0.0 | MIT | Espaço do selo PAdES no PDF final |
| node-forge | 1.4.3 | BSD-3-Clause (escolhida entre BSD-3-Clause e GPL-2.0) | Assinatura CMS do selo |
| uqr | 0.1.3 | MIT | QR code do manifesto |
| Next.js, React e React DOM | 16.4.6 / 19.3.0 | MIT | O site |
| `@modelcontextprotocol/sdk` | 1.32.2 | MIT | Servidor MCP |
| `@supabase/supabase-js`, jose, zod, lucide-react, server-only | — | MIT / ISC | Servidor e interface |
| AWS SDK for JavaScript v3 (`@aws-sdk/client-s3`, `s3-request-presigner`) | 3.1170.0 | Apache-2.0 | Acesso ao Cloudflare R2 |

Os textos completos das licenças estão em cada pacote, em `node_modules/<pacote>/LICENSE`. A versão exata de cada um está em `package-lock.json`.

**Dancing Script (OFL 1.1):** a fonte pode ser usada e embutida em documentos, inclusive em subconjunto, como o Assina faz no PDF final. Ela não pode ser vendida sozinha, e uma versão modificada não pode usar o nome reservado da fonte.
