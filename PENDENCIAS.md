# Pendências — Assina

Itens que dependem do Alexandre (conta, console, decisão) ou de um passo que não pôde ser feito na hora. Cada épico acrescenta aqui o que deixou para depois e risca o que foi resolvido. Detalhes nos `plans/` citados.

## Precisam do Alexandre

| # | O quê | Por que está parado | Como resolver | Bloqueia |
|---|---|---|---|---|
| P4 | **Testar os hooks dentro de uma sessão em `~/assina`** (pedir uma edição proibida e ver o bloqueio) | Os hooks foram testados chamando os scripts diretamente. E a sessão que fez os épicos 8.1 e 8.2 nasceu no agenda-psi: mesmo depois de mudar de pasta, os hooks que disparavam eram os de lá (`$CLAUDE_PROJECT_DIR` herdado). Os arquivos foram conferidos rodando os guardas do Assina à mão | Pedir, por exemplo, "escreve SUPABASE_SERVICE_ROLE_KEY em src/app/x.tsx" e conferir que é barrado | Nada; é prova de integração |
| P5 | **Conta e domínio no Resend:** verificar `assina.app.br` (SPF, DKIM, DMARC), criar a chave e preencher `RESEND_API_KEY` e `EMAIL_REMETENTE=naoresponda@assina.app.br` no `.env.local` e na Vercel | Precisa da conta Resend e do DNS do domínio | Painel do Resend → Domains → Add domain, e os registros no DNS do `assina.app.br`. Depois: mandar um envelope de teste para um e-mail real | E-mail real; em dev os e-mails vão para `.caixa-de-saida-local/` (`plans/8.4-revisar-e-enviar.md`) |
| P8 | **Regras do Vercel Firewall** (limite por IP de `/api/verificar` e `/verificar/`, `/api/assinar/`, `/api/v1/` e `/mcp`) | Precisa do painel da Vercel, e o projeto ainda não tem deploy | README, seção "Vercel Firewall", com o `curl` para conferir o 429 | Critério 8.8 (30 consultas por minuto) em produção (`plans/8.8-verificacao.md`) |
| P9 | **Conectar de verdade ao Claude e ao ChatGPT** e pôr os prints no README (critério 8.10: "Roteiro manual no README, com prints") | Os aplicativos precisam alcançar o `/mcp` por uma URL pública, e o projeto ainda não tem deploy. Em dev, o fluxo foi feito à mão: consentimento no navegador, troca por `curl` e as ferramentas pelo `/mcp` | README, seção "MCP: conectar ao Claude e ao ChatGPT". Conferir que a conexão aparece em Integrações e que "Revogar" corta a próxima chamada | Critério 8.10 em produção (`plans/8.10-mcp-oauth.md`) |
| P11 | **Revisão jurídica dos Termos de uso e da Política de privacidade** (`copy.legal` e `LEGAL_NEGATIVAS` em `src/lib/copy.ts`) | Os textos foram escritos no 8.12 seguindo a seção 20 e o modelo do Reunião, em nome da DabLab, mas sem advogado. Conferir também a assunção 24.12 (redação do CPC, art. 784, § 4º) antes de citá-lo; os textos de hoje não o citam | Mandar `/termos` e `/privacidade` para revisão; as mudanças entram em `copy.ts` (e, se for o caso, a data em `copy.legal.updated`) | Lançamento público (`plans/8.12-inicio-legais-protecoes.md`) |

## Decisões abertas do spec (seção 25)
- 25.4 em parte: o lançamento é aberto (20/11/2026). Falta decidir o plano pago do Resend: o grátis manda 100 e-mails por dia, cerca de 10 envelopes de 3 assinantes (risco 23.2).
- 25.5 Como uma conta chega aos níveis 2 e 3.

## Resolvidas

- **P10 (20/11/2026): analytics ligado em produção.** Projeto "Assina" no Visão do Produto, com a ingestão em `https://api.visaodeproduto.com.br/functions/v1/ingest` e a chave de ingestão como variável sensitive na Vercel (também em `.env.producao-vercel.local`). Em dev continua desligado, para os testes não poluírem o painel.
  - A chave foi conferida: uma chave errada leva 401; a certa é aceita (o evento de teste foi recusado de propósito, nada gravado).
  - Depois do redeploy, uma verificação pública real gerou `assina_documento_verificado`, sem nenhum `analytics_falhou` nos logs da Vercel.
  - Falta confirmar a chegada no painel Atividade do Visão: o conector MCP do Visão nesta sessão recusa a credencial (401).
- **P12 e P7 (20/11/2026): deploy na Vercel.**
  - Projeto `assina` (time "asiqueira1973's projects"), ligado ao GitHub: cada push na `main` publica em produção.
  - As 19 variáveis de produção subiram pelo Vercel CLI, direto de `.env.producao-vercel.local`, com os segredos como sensitive. `SESSION_SECRET`, `CHAVES_ENC_KEY` e `CRON_SECRET` são próprios de produção. Inclui o selo autoassinado "Assina". Cadastro aberto (25.4 respondida: aberto para qualquer conta Google).
  - Conferido em `https://assina-mu.vercel.app`:
    - páginas públicas e `robots.txt` respondem 200;
    - a verificação consulta o banco remoto;
    - CSP ativa;
    - `/api/cron/diario` recusa sem segredo e, com ele, rodou a faxina (tudo zero).
  - Domínios `assina.app.br` e `www` (redireciona para o principal) ligados ao projeto. Respondem quando o DNS do Registro.br publicar a zona do modo avançado.
  - Enquanto o domínio não responder, o login com Google em produção não fecha, porque o callback é `https://assina.app.br`.
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
- **P1 (19/11/2026):** as 15 migrations `as_*` aplicadas no Supabase remoto pelo MCP, com o mesmo SQL dos arquivos. A comparação das definições (funções, colunas e triggers) com o local deu hashes idênticos. Advisors filtrados a `as_*`: segurança só com "RLS sem política" (intencional, seção 6.5); performance com uma chave estrangeira sem índice, corrigida em `20261120120000_as_indice_credencial_oauth.sql`, e índices ainda não usados (banco vazio).
