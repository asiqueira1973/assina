# Pendências — Assina

Itens que dependem do Alexandre (conta, console, decisão) ou de um passo que não pôde ser feito na hora. Cada épico acrescenta aqui o que deixou para depois e risca o que foi resolvido. Detalhes nos `plans/` citados.

## Precisam do Alexandre

| # | O quê | Por que está parado | Como resolver | Bloqueia |
|---|---|---|---|---|
| P4 | **Testar os hooks dentro de uma sessão em `~/assina`** (pedir uma edição proibida e ver o bloqueio) | Os hooks foram testados chamando os scripts diretamente. E a sessão que fez os épicos 8.1 e 8.2 nasceu no agenda-psi: mesmo depois de mudar de pasta, os hooks que disparavam eram os de lá (`$CLAUDE_PROJECT_DIR` herdado). Os arquivos foram conferidos rodando os guardas do Assina à mão | Pedir, por exemplo, "escreve SUPABASE_SERVICE_ROLE_KEY em src/app/x.tsx" e conferir que é barrado | Nada; é prova de integração |
| P8 | **Regras do Vercel Firewall** (limite por IP de `/api/verificar` e `/verificar/`, `/api/assinar/`, `/api/v1/` e `/mcp`) | Precisa do painel da Vercel (o site já está no ar desde 20/11/2026) | README, seção "Vercel Firewall", com o `curl` para conferir o 429 | Critério 8.8 (30 consultas por minuto) em produção (`plans/8.8-verificacao.md`) |
| P9 | **Conectar de verdade ao ChatGPT** (o Claude já foi: 20/11/2026, conector em claude.ai, OAuth, listar, ver e criar rascunho em produção, prints no README) | O ChatGPT pede o modo desenvolvedor ligado na conta | README, seção "MCP: conectar ao Claude e ao ChatGPT". Conferir que a conexão aparece em Integrações e que "Revogar" corta a próxima chamada | Critério 8.10 em produção (`plans/8.10-mcp-oauth.md`) |
| P11 | **Revisão jurídica dos Termos de uso e da Política de privacidade** (`copy.legal` e `LEGAL_NEGATIVAS` em `src/lib/copy.ts`) | Os textos foram escritos no 8.12 seguindo a seção 20 e o modelo do Reunião, em nome da DabLab, mas sem advogado. Conferir também a assunção 24.12 (redação do CPC, art. 784, § 4º) antes de citá-lo; os textos de hoje não o citam. Incluir na revisão: a seção "A assinatura vale?" da página inicial (25/11/2026) e se vale citar a Lei 14.063/2020 (assinatura simples, avançada e qualificada), deixada de fora de propósito | Mandar `/termos` e `/privacidade` para revisão; as mudanças entram em `copy.ts` (e, se for o caso, a data em `copy.legal.updated`) | Lançamento público (`plans/8.12-inicio-legais-protecoes.md`) |

## Técnicas

| # | O quê | Por que está parado | Como resolver | Bloqueia |
|---|---|---|---|---|
| P13 | **Migrar o `/mcp` para o SDK v2 do MCP** (`@modelcontextprotocol/server`, 2.4.0 em 28/11/2026), que fala a versão 2026-07-28 do protocolo | O `@modelcontextprotocol/sdk` 1.x parou em 2025-11-25 e não vai ganhar a versão nova. Hoje o Claude sonda com `server/discover` (2026-07-28), leva 400 e volta ao `initialize` de 2025, que funciona (decisão 63 da documentação técnica). Se um dia o Claude deixar de falar 2025, o conector para | Plano em `plans/`: trocar o pacote, ajustar `src/app/mcp/route.ts` e `src/server/mcp/tools.ts`, responder `server/discover`, manter os testes de `mcp.route.test.ts` e conferir no log que `mcp_rejeitado` some | Nada hoje; é prevenção |

## Decisões abertas do spec (seção 25)
- 25.4 em parte: o lançamento é aberto (20/11/2026). Falta decidir o plano pago do Resend: o grátis manda 100 e-mails por dia, cerca de 10 envelopes de 3 assinantes (risco 23.2).
- 25.5 Como uma conta chega aos níveis 2 e 3.

## Resolvidas

- **22 a 25/11/2026: MCP com links do Drive e validade na página inicial.**
  - `arquivo_url` (API e MCP): o link de compartilhamento do Google Drive (`/file/d/…/view`, `open?id=`, `uc?id=`) vira o download direto, e o do Dropbox ganha `dl=1` (`src/server/files/share-links.ts`, spec v0.19). Antes, o link do Drive devolvia HTML e o anexo era recusado. A descrição de `criar_envelope` passou a dizer que esses links valem, porque o Grok tinha entendido link do Drive como anexo da conversa. Conferido pelo Alexandre: pelo Grok, o rascunho veio com o PDF do Drive. O arquivo precisa estar aberto para "qualquer pessoa com o link".
  - Página inicial com a seção "A assinatura vale?" (spec v0.20): validade entre as partes (MP 2.200-2/2001, art. 10, § 2º), comprovação pelo código no e-mail, manifesto e trilha, o aviso sobre ICP e o link para os Termos. Sem a Lei 14.063/2020 (fica para a P11).

- **20/11/2026: primeiro uso em produção e correções.**
  - Envelopes reais assinados de ponta a ponta em `https://assina.app.br`: pelo painel (convite no Outlook, código, assinatura, PDF selado `B-T`, e-mails de conclusão, verificação pelo código) e pelo Claude (conector MCP, rascunho criado com "Envelope criado · MCP" na trilha).
  - Corrigidos depois dos testes, com o Petr:
    - botão "Enviar código" desativado até a página carregar;
    - separador do rodapé;
    - texto da última assinatura;
    - código de verificação como `XXXX-XXXX-XXXX` no e-mail e no manifesto;
    - título do novo envelope depois de um PDF recusado;
    - 404 em português (envelope de outra conta mostra com qual e-mail a pessoa entrou);
    - verificação mais clara, com "Verificar documento" dentro do painel.
  - **Épico 8.14 (data de nascimento do assinante):** migration `20261120130000_as_data_nascimento.sql` aplicada no remoto pelo MCP antes do deploy; Termos e Privacidade citam a data (aprovado pelo Alexandre; a revisão jurídica, P11, continua aberta).
- **P5 (20/11/2026): Resend.** Domínio `assina.app.br` verificado (DKIM, `send` e `rsend`). Convite, código e conclusão chegaram no Outlook e no Gmail.
  - O primeiro envio falhou com `resend_403` porque a verificação do domínio nunca tinha sido disparada. Foi disparada pela API, e "Tentar de novo" reenviou o convite.
  - Num teste, o Outlook tirou o e-mail do código da caixa de entrada (entregue, segundo o Resend). Acompanhar; se repetir, endurecer o DMARC e marcar como "Não é lixo eletrônico".

- **P10 (20/11/2026): analytics ligado em produção.** Projeto "Assina" no Visão do Produto, com a ingestão em `https://api.visaodeproduto.com.br/functions/v1/ingest` e a chave de ingestão como variável sensitive na Vercel (também em `.env.producao-vercel.local`). Em dev continua desligado, para os testes não poluírem o painel.
  - A chave foi conferida: uma chave errada leva 401; a certa é aceita (o evento de teste foi recusado de propósito, nada gravado).
  - Depois do redeploy, uma verificação pública real gerou `assina_documento_verificado`, sem nenhum `analytics_falhou` nos logs da Vercel.
  - O evento apareceu no painel Atividade do Visão (confirmado pelo Alexandre em 20/11/2026).
- **P12 e P7 (20/11/2026): deploy na Vercel.**
  - Projeto `assina` (time "asiqueira1973's projects"), ligado ao GitHub: cada push na `main` publica em produção.
  - As 19 variáveis de produção subiram pelo Vercel CLI, direto de `.env.producao-vercel.local`, com os segredos como sensitive. `SESSION_SECRET`, `CHAVES_ENC_KEY` e `CRON_SECRET` são próprios de produção. Inclui o selo autoassinado "Assina". Cadastro aberto (25.4 respondida: aberto para qualquer conta Google).
  - Conferido em `https://assina-mu.vercel.app`:
    - páginas públicas e `robots.txt` respondem 200;
    - a verificação consulta o banco remoto;
    - CSP ativa;
    - `/api/cron/diario` recusa sem segredo e, com ele, rodou a faxina (tudo zero).
  - Domínios `assina.app.br` e `www` (redireciona para o principal) ligados ao projeto. O DNS publicou em 20/11/2026 (servidores `a.sec.dns.br` e `c.sec.dns.br`), com HTTPS da Let's Encrypt, e o login com Google em produção funciona.
- **P6 (20/11/2026):** PDF final gerado pelo fluxo real em dev, com o certificado de produção "Assina" e o carimbo do tempo da DigiCert (`B-T`). O `openssl cms -verify` deu "CMS Verification successful", com o ByteRange cobrindo o arquivo inteiro; no Adobe Reader, "documento não modificado desde que esta assinatura foi aplicada" (o assinante aparece como identidade desconhecida, o esperado com o autoassinado, decisão 25.2).
- **P3 (19/11/2026):** cliente OAuth "Assina web" no projeto Google Cloud próprio "Assina", com escopos só `openid email profile` e app publicado. Login real conferido em dev:
  - a tela do Google mostra "continue to Assina";
  - a conta nasce no banco com a chave de API cifrada, passa pelas boas-vindas com o aceite e abre o painel;
  - o cookie da sessão não é visível ao JavaScript.

  Depois do deploy: `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` na Vercel (P12) e, se o Google pedir, a verificação da marca, que exige as páginas no ar.
- **P2 (19/11/2026):** bucket R2 `assina-documentos` criado (privado), token restrito ao bucket (Object Read & Write) e CORS para `https://assina.app.br` e `http://localhost:3030`. Conferido:
  - upload pela URL assinada, leitura pelo servidor e download assinado funcionam;
  - acesso sem assinatura é recusado;
  - o preflight do CORS aceita as duas origens e recusa as outras;
  - pelo navegador, o upload do painel vai direto ao R2 e o editor lê o PDF de lá pelo pdf.js, sem erro de CSP;
  - a exclusão da conta esvazia a pasta no bucket.

  Falta pôr as quatro variáveis `R2_*` na Vercel (P12).
- **P1 (19/11/2026):** as 15 migrations `as_*` (16 com a do 8.14, em 20/11/2026) aplicadas no Supabase remoto pelo MCP, com o mesmo SQL dos arquivos. A comparação das definições (funções, colunas e triggers) com o local deu hashes idênticos. Advisors filtrados a `as_*`: segurança só com "RLS sem política" (intencional, seção 6.5); performance com uma chave estrangeira sem índice, corrigida em `20261120120000_as_indice_credencial_oauth.sql`, e índices ainda não usados (banco vazio).
