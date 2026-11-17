# Pendências — Assina

Itens que dependem do Alexandre (conta, console, decisão) ou de um passo que não pôde ser feito na hora. Cada épico acrescenta aqui o que deixou para depois e risca o que foi resolvido. Detalhes nos `plans/` citados.

## Precisam do Alexandre

| # | O quê | Por que está parado | Como resolver | Bloqueia |
|---|---|---|---|---|
| P1 | **Aplicar as migrations no Supabase remoto** (`as_schema`, `as_logica` e as dos épicos seguintes) e rodar os advisors filtrados a `as_*` | No 8.1, o `apply_migration` foi barrado pelo hook `guard-production.sh` do agenda-psi (a sessão tinha nascido naquela pasta). Mudar de pasta no meio da sessão não troca os hooks (P4), então precisa de uma sessão **nova, aberta já em `~/assina`** | Abrir o Claude Code em `~/assina` e pedir: "aplica as migrations pendentes no remoto e roda os advisors". Conferir antes com `list_migrations` quais já estão lá | Deploy e qualquer teste com dados reais (`plans/8.1-fundacao.md`) |
| P2 | **Criar o bucket R2** `assina-documentos` (privado, CORS, token restrito ao bucket) e preencher `R2_*` no `.env.local` e na Vercel | Precisa da conta Cloudflare da DabLab | README, seção "Cloudflare R2". Depois: teste manual de 403 sem assinatura e com URL vencida, e um upload real pelo painel | Upload real; em dev e nos testes o app usa o armazenamento local em disco (`plans/8.2-novo-envelope.md`) |
| P3 | **Criar o cliente OAuth do Google** no projeto próprio "Assina" e preencher `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` | Precisa do console do Google Cloud | README, seção "Google Cloud". Depois: login real e conferir que o consentimento pede só nome, e-mail e foto | Login real (hoje só com Google simulado e sessão de dev) |
| P4 | **Testar os hooks dentro de uma sessão em `~/assina`** (pedir uma edição proibida e ver o bloqueio) | Os hooks foram testados chamando os scripts diretamente. E a sessão que fez os épicos 8.1 e 8.2 nasceu no agenda-psi: mesmo depois de mudar de pasta, os hooks que disparavam eram os de lá (`$CLAUDE_PROJECT_DIR` herdado). Os arquivos foram conferidos rodando os guardas do Assina à mão | Pedir, por exemplo, "escreve SUPABASE_SERVICE_ROLE_KEY em src/app/x.tsx" e conferir que é barrado | Nada; é prova de integração |
| P5 | **Conta e domínio no Resend:** verificar `assina.app.br` (SPF, DKIM, DMARC), criar a chave e preencher `RESEND_API_KEY` e `EMAIL_REMETENTE=naoresponda@assina.app.br` no `.env.local` e na Vercel | Precisa da conta Resend e do DNS do domínio | Painel do Resend → Domains → Add domain, e os registros no DNS do `assina.app.br`. Depois: mandar um envelope de teste para um e-mail real | E-mail real; em dev os e-mails vão para `.caixa-de-saida-local/` (`plans/8.4-revisar-e-enviar.md`) |
| P6 | **Abrir um `final.pdf` no Adobe Reader e no Preview** e conferir a assinatura de integridade ("documento não foi modificado"; com o autoassinado, identidade desconhecida) | Esta máquina não tem o Adobe Reader. O selo foi conferido pelo `openssl cms -verify` e pelos testes | Assinar um envelope de teste em dev (`npm run dev`), pegar o anexo em `.caixa-de-saida-local/` e abrir. Para conferir o "alterado": mudar 1 byte e abrir de novo | Critério 8.6 (`plans/8.6-finalizacao.md`) |
| P7 | **Selo em produção:** decidir o 25.2, gerar o certificado (`npm run selo:gerar` para o autoassinado) e pôr `SELO_P12_BASE64`, `SELO_P12_SENHA`, `SELO_TSA_URL` e `ADMIN_EMAIL` na Vercel | Variáveis da Vercel e a decisão 25.2 são do Alexandre | README, seção "Selo". Sem o certificado, a finalização falha, retenta e alerta o admin | Envelope concluído em produção |

## Decisões abertas do spec (seção 25)
- 25.2 Certificado do selo (autoassinado ou e-CNPJ A1), antes do lançamento público.
- 25.4 Custos de lançamento (Resend pago, Vercel Pro), antes do 8.12.
- 25.5 Como uma conta chega aos níveis 2 e 3.

## Resolvidas
_(nada ainda)_
