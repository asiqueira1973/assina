# Avisos de terceiros — Assina

O código do Assina é MIT (`LICENSE`). Este arquivo lista o que vem de terceiros com licença própria ou que pede atribuição.

| Item | Onde | Licença | Origem |
|---|---|---|---|
| Fonte "Dancing Script" (assinatura e rubrica digitadas) | pacote `@fontsource/dancing-script`; embutida (subconjunto) no PDF final desde o épico 8.6 | SIL Open Font License 1.1 | Impallari Type, via Fontsource |
| pdf.js (`pdfjs-dist`) | renderização do PDF no navegador; worker copiado para `public/` | Apache-2.0 | Mozilla |
| `@signpdf/signpdf`, `@signpdf/placeholder-pdf-lib`, `@signpdf/utils` | placeholder e ByteRange do selo PAdES | MIT | vbuch/node-signpdf |
| node-forge | CMS do selo, carimbo do tempo e P12 | BSD-3-Clause (licença dupla com GPL-2.0; o Assina usa a BSD) | digitalbazaar/forge |
| pdf-lib e `@pdf-lib/fontkit` | gravação dos campos e do manifesto; fonte embutida | MIT | Hopding/pdf-lib |
| uqr | QR do manifesto | MIT | unjs/uqr |
| SignuDoc | referência funcional (spec, Anexo A); nenhum trecho de código copiado até o épico 8.6 | MIT | NYLLON-SOFTWARE/signudoc |

As demais dependências estão em `package.json`, com as licenças nos próprios pacotes (`node_modules/*/LICENSE`).
