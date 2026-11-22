# Assina — Especificação (SDD)

| Campo | Valor |
|---|---|
| Versão | 0.18 (20/11/2026: verificação mais clara, pedido do Petr — "Assina" leva à página inicial, texto que explica o que a verificação prova, frase de abertura também na busca por código ("Este código é de um envelope do Assina."), complemento do resultado íntegro, rodapé público, e "Verificar documento" como item de Documentos, em `/painel/verificar`, com o resultado na própria tela) · 0.17 (20/11/2026: épico 8.14 — data de nascimento do assinante, pedida por pessoa como o CPF ("Pedir data de nascimento"), conferida em `as_fn_assina` (`nascimento_invalido`), completa no manifesto; `exigir_nascimento` na API e no MCP) · 0.16 (18/11/2026: épico 8.13 — funções da faxina (`as_fn_expira_envelope`, `as_fn_lembretes_devidos`, `as_fn_expurga_envelope`), canal `automatico` do lembrete na trilha, e-mail `expirado_remetente` ("Assinaram: …" / "Não assinaram: …" / "Ninguém assinou."), lembrete preso fechado pela faxina, clientes OAuth órfãos apagados, CSP sem nonce, conclusão tolerante à diferença de relógio entre servidor e banco) · 0.15 (17/11/2026: épico 8.12 — "Excluir minha conta" no 8.12, com a confirmação "Excluir minha conta?" / "Excluir conta" / "O e-mail não confere."; `robots.txt` e `sitemap.xml`; `LEGAL_NEGATIVAS` com o aviso da página inicial e os trechos negativos dos Termos; o `guard-copy` só isenta a partir da declaração do bloco) · 0.14 (17/11/2026: épico 8.11 — `id` do evento derivado de nome e registro, `distinct_id` anônimo na verificação, mapeamento do resultado da verificação, `assina_api_chamada` também no `/mcp`, `envelope_expirado` e o lembrete automático com a faxina do 8.13) · 0.13 (17/11/2026: épico 8.10 — `as_fn_cria_codigo_oauth` e `as_fn_troca_codigo_oauth`, rota `/oauth/autorizar/decidir`, metadados do recurso também em `/.well-known/oauth-protected-resource/mcp`, textos da tela de consentimento e da parte MCP de Integrações, respostas das ferramentas) · 0.12 (17/11/2026: épico 8.9 — funções da API e da entrega dos webhooks, coluna `as_entregas_webhook.reservada_em`, rotas `revelar` e `webhook` da tela Integrações, fetch protegido contra SSRF também para o webhook, `campos` da API só com `arquivo_url`, textos da tela Integrações e de `/docs/api`) · 0.11 (17/11/2026: épico 8.8 — `as_fn_verifica_documento` e `as_fn_resumo_publico`, índices dos hashes, textos extras da verificação, código aceito com hífens, minúsculas e O→0, I/L→1) · 0.10 (17/11/2026: épico 8.7 — funções da lista, do lembrete manual, do link copiado, do cancelamento e da exclusão; `deletePrefix` no armazenamento; textos da lista e do detalhe; e-mails `lembrete` e `cancelado_destinatario`) · 0.9 (17/11/2026: épico 8.6 — colunas `finalizacao_reservada_em` e `erro_finalizacao`, funções da finalização e trigger do final imutável; textos do e-mail de conclusão; caracteres fora do WinAnsi no PDF) · 0.8 (17/11/2026: épico 8.5 — funções do código, assinar e recusar; textos extras do signatário; cookie do signatário com Path=/) · 0.7 (17/11/2026: épico 8.4 — `as_fn_envia_envelope`, textos do revisar e do uso do nível) · 0.6 (17/11/2026: épico 8.3 — `as_fn_substitui_campos`, textos do editor) · 0.5 (17/11/2026: épico 8.2 — textos do rascunho na seção 15; `as_fn_cria_rascunho`, `as_fn_substitui_signatarios`, ordem diferida e rota `/upload`) · 0.4 (17/11/2026: épico 8.1 — canônico da trilha em linhas (11.6), `as_fn_entra_conta` e congelamento refinado (7.5)) · 0.3 (17/11/2026: arquivos no Cloudflare R2, fora do Supabase; 25.3 respondida) · 0.2 (17/11/2026: níveis 1, 2 e 3 com limite de documentos, regra 11.20; armazenamento atrás de uma interface única, seção 18) · 0.1 (17/11/2026: nome Assina, domínio assina.app.br; nome de trabalho anterior "Firma" descartado porque firma.app.br já tinha dono) |
| Responsável de produto | Alexandre Siqueira (DabLab) |
| Status | pronto para revisão |
| Data | 17/11/2026 |
| Nome do produto | **Assina**, domínio **`assina.app.br`** (25.1). Repositório `~/assina`, GitHub público `asiqueira1973/assina` |

## Como usar este documento

Este documento é a fonte única de verdade do Assina, a versão própria e simplificada do DocuSign que o Alexandre está fazendo. O Claude Code vai usá-lo para implementar o app do zero.

**Antes de gerar qualquer código, revise a seção 24 (Assunções).** Uma assunção que ninguém revisou vira verdade no minuto em que o agente começa a codar. Diante de qualquer item da seção 25 (Perguntas abertas), o agente **para e pergunta**.

As referências são citadas por número ("regra 11.3", "seção 7.3"), e a numeração é estável.

**Projetos de referência:**

| Projeto | O que se reaproveita |
|---|---|
| `~/minha-agenda` (**Reunião**, `reuniao.app.br`) | Stack, projeto Supabase compartilhado com prefixo, login Google próprio com sessão em cookie JWT, Resend, cron diário, páginas legais da DabLab, guardrails e loop de verificação. **A identidade visual é a mesma** (seção 16) |
| `~/Visao de Produto` | O padrão do servidor MCP remoto **com OAuth próprio**: o site é o servidor de autorização (DCR + PKCE), e o token emitido é uma linha comum da tabela de credenciais (DOCUMENTACAO-TECNICA do Visão, 5.5). Também o contrato de ingestão de analytics |
| [SignuDoc](https://github.com/NYLLON-SOFTWARE/signudoc) (MIT) | Referência funcional: envelope, campos, OTP por e-mail, consentimento versionado, trilha de auditoria encadeada por hash, selo PAdES com `@signpdf` e página de verificação. Todo código adaptado leva a atribuição em `THIRD_PARTY_NOTICES.md` |

---

## 0. Princípios não-negociáveis

1. **Sem prova, não há assinatura.** Toda ação relevante (enviar, ver, validar o código, consentir, assinar, recusar, concluir) grava um evento na trilha encadeada (regra 11.6) **na mesma transação** da mudança de estado. Se o evento não for gravado, a ação não aconteceu, e a tela diz que falhou. Recusar uma assinatura é aceitável. Ter uma assinatura sem evidência não é.
2. **O documento não muda depois de enviado.** O SHA-256 do PDF original é calculado e congelado no envio. Corrigir qualquer coisa exige cancelar e mandar um envelope novo. Nenhuma rota, nem de painel, nem de API, nem de MCP, troca o arquivo ou os campos de um envelope que já saiu de `rascunho`.
3. **Quem assina não precisa de conta.** O signatário abre o link, recebe um código no e-mail, lê, assina e pronto. São três passos, sem cadastro, sem senha e sem app.
4. **Não prometer o que não é.** Toda copy sobre validade jurídica cita a base legal real (seção 20.1). As palavras "certificado digital", "ICP-Brasil", "qualificada" e "equivale a firma reconhecida" nunca aparecem como afirmação sobre o Assina.
5. **Uma regra, três portas.** Tela, API REST e MCP chamam as mesmas funções de domínio de `src/server/envelopes/`. Nenhuma regra mora só na tela, e uma escrita feita pelo MCP é indistinguível de uma feita pelo painel, a não ser pelo campo `origem`.

---

## 1. Visão e problema

O Assina serve para mandar um PDF para uma ou mais pessoas assinarem e receber de volta o documento assinado, selado e com a trilha de auditoria anexada. É grátis, em português, com login pelo Google e com código aberto no GitHub. Segue a mesma linha do Reunião: o básico do DocuSign bem feito, com o visual limpo dos apps do Alexandre.

Além da tela, o Assina tem **API REST** com chave por conta, para que outros sistemas (como os da BBZ e os apps da DabLab) enviem documentos e recebam webhooks, e um **servidor MCP** para enviar e acompanhar documentos de dentro do Claude ou do ChatGPT, com o mesmo login Google da plataforma.

Produto gratuito da **DabLab** (Alexandre da Silva de Siqueira LTDA - ME, CNPJ 61.033.268/0001-14, São Paulo/SP), aberto a qualquer pessoa com conta Google, como o Reunião v0.5.

**Anti-escopo:** o Assina não é certificado digital ICP-Brasil e não faz assinatura qualificada. Também não é gestor de contratos (sem CLM, cláusulas ou versionamento de minuta) nem editor de documentos (só PDF pronto). Não cobra de ninguém. Não tem equipes nem organizações com vários usuários. Não envia por WhatsApp nem SMS, e não faz validação biométrica (selfie ou documento com foto).

---

## 2. Personas e cenários de uso

| Persona | Contexto | Momento mais difícil |
|---|---|---|
| **Remetente** (Alexandre, pequeno empresário, profissional autônomo) | Tem um contrato, termo ou proposta em PDF e quer a assinatura de 1 a 3 pessoas. Prepara pelo computador. | Saber se o documento já foi assinado e por quem, e cobrar quem está atrasado, sem trocar e-mail. |
| **Signatário** (cliente, síndico, fornecedor, candidato) | Recebe um e-mail e abre no celular. Não conhece o Assina e desconfia de link que pede assinatura. | Confiar no link: ver claramente quem mandou e o que está assinando, receber o código e assinar com o dedo numa tela pequena. |
| **Sistema** (um app que integra pela API ou um agente pelo MCP) | Gera o PDF sozinho e precisa mandar para assinatura e saber quando concluiu. | Upload de arquivo maior que o limite de corpo da função e confirmação de entrega do aviso de conclusão (webhook). |

---

## 3. Escopo do MVP

### Dentro
- Login do remetente com Google, com escopos só `openid email profile` (seção 6), boas-vindas com aceite dos Termos e da Privacidade, e exclusão da conta.
- **Envelope:** 1 PDF (regra 11.1), título, mensagem opcional, prazo, lembrete automático e ordem de assinatura (sequencial ou todos ao mesmo tempo).
- **Destinatários:** até 10 assinantes e até 5 pessoas que só recebem cópia. Por assinante, o remetente decide se exige CPF.
- **Campos posicionados** no PDF por arrastar e soltar: assinatura, rubrica, data, nome, texto e caixa de seleção. Também há o modo **sem campos**: a assinatura vai só no manifesto.
- **Fluxo do signatário:** link único, código de 6 dígitos por e-mail, consentimento, leitura, preenchimento, assinatura (digitada ou desenhada), recusa com motivo e download depois da conclusão.
- **Finalização:** campos gravados no PDF, **manifesto de assinaturas** anexado (seção 11.9), **selo PAdES** com o certificado da plataforma e carimbo do tempo RFC 3161 quando houver (regra 11.10), SHA-256 do original e do final, e e-mail com o PDF final para todos.
- **Trilha de auditoria** só de inserção e encadeada por hash, visível ao remetente e exportável em CSV.
- **Página pública de verificação:** por arquivo (o hash é calculado no navegador) ou por código.
- **Painel:** lista de envelopes com filtros, detalhe com status por pessoa, cancelar, lembrar, baixar, excluir e exportar a trilha.
- **API REST v1** com uma chave por conta, criada junto com a conta, mais **webhooks** assinados com HMAC e documentação OpenAPI.
- **Servidor MCP** remoto (Streamable HTTP) com OAuth 2.1 próprio. O login é o mesmo Google do painel, e a mesma chave de API também funciona como Bearer.
- **Analytics** no Visão do Produto, enviado pelo servidor (seção 21).
- **Níveis de conta 1, 2 e 3** com limite de documentos guardados (50, 500 e 5.000; regra 11.20). Toda conta nasce no nível 1. A mudança de nível é manual (SQL pelo admin) no MVP; como se chega aos níveis 2 e 3 fica para depois (25.5).
- Página inicial, Política de privacidade e Termos de uso em nome da DabLab, mais as proteções para uso público (limites, bloqueio e suspensão).
- Faxina diária: lembretes, expiração, retentativas de e-mail, webhook e finalização, e retenção.

### Fora
| Item | Destino | Motivo / dependência |
|---|---|---|
| Modelos de documento (salvar envelope como modelo, com papéis) | v2 (seção 28) | É o primeiro pedido depois do MVP. Precisa do editor de campos estável |
| Vários documentos por envelope | v2 | Complica o manifesto e o hash. Hoje junta-se num PDF só |
| Word, imagem e outros formatos | Descartado no MVP | Converter exige serviço externo. O remetente exporta PDF |
| SMS ou WhatsApp para o código | v2 | Tem custo por mensagem e o produto é grátis |
| Selfie, documento com foto e biometria | Descartado | Envolve dado biométrico sensível (LGPD art. 11) e foge do básico |
| Assinatura ICP-Brasil do signatário (certificado A1/A3 do usuário) | Descartado | Outro produto. A seção 20.1 explica o que o Assina é |
| Equipes, organizações e vários usuários por conta | Descartado | Mesmo anti-escopo do Reunião |
| Envio em massa (um documento para N pessoas separadas) | v2 | Faz-se pela API num laço |
| Carimbo do tempo de ACT ICP-Brasil e selo LTV (B-LT/B-LTA) | v2 | São pagos ou complexos. A regra 11.10 cobre B-B/B-T |
| Interface em inglês | v2 | A copy fica centralizada para permitir depois |
| Lembrete em hora marcada (cron horário) | v2 | O Vercel Hobby só tem cron diário (risco 23.6) |
| CIMD (Client ID Metadata Documents) no OAuth do MCP | v2 | Claude e ChatGPT ainda caem em DCR |

---

## 4. Arquitetura

| Camada | Escolha | Por quê | Alternativa descartada |
|---|---|---|---|
| Framework | **Next.js 16** (App Router, Cache Components, `proxy.ts`), React 19, TypeScript, na mesma linha do Reunião (16.4.x) | Reaproveita os guardrails e o que se aprendeu no Reunião | Outro framework: stack novo sem ganho |
| Banco | **Supabase Postgres, projeto compartilhado "BANCO DE TESTE"** (`jeesdmfcrmhyufwzwzwt`), tabelas com **prefixo `as_`** (livre em 17/11/2026; `btree_gist`, `pgcrypto` e `pg_cron` já instalados) | Decisão do Alexandre (17/11/2026): custo zero e o mesmo arranjo do Reunião | Projeto próprio: isola melhor os PDFs, mas é mais um projeto para manter. Plano de saída no risco 23.1 |
| Arquivos | **Cloudflare R2**, bucket **privado** `assina-documentos` (sem domínio público nem `r2.dev`), pela API compatível com S3 (`@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`). Upload e download só por **URL pré-assinada** de curta duração. CORS do bucket libera `PUT`/`GET` só para `https://assina.app.br` e `http://localhost:3030` | Decisão do Alexandre (17/11/2026): não aumentar o custo do Supabase. O R2 tem camada gratuita de 10 GB por mês e **saída gratuita**, que importa porque todo mundo baixa o PDF final. O PDF nunca passa pelo corpo de uma função (limite de cerca de 4,5 MB no Vercel) | Supabase Storage: 1 GB gratuito dividido com todos os apps do projeto compartilhado. Vercel Blob: cobra a saída |
| Acesso ao banco | **Só pelo servidor**, com service role, em `src/server/db/`. RLS **ligado e sem nenhuma política** em todas as `as_*`, com `REVOKE ALL` de `anon` e `authenticated` | Igual ao Reunião: não há Supabase Auth e o banco nunca é tocado do navegador | Supabase Auth com RLS por `auth.uid()`: mexeria na Auth do projeto compartilhado inteiro |
| Login do remetente | **OAuth do Google próprio**, só com `openid email profile`, e sessão em cookie `HttpOnly` com JWT HS256 (`jose`) | Escopos não sensíveis: não precisa da verificação do Google, só da verificação da marca | Supabase Auth: mesmo motivo da linha acima |
| Identificação do signatário | Link com token de 32 bytes mais **código de 6 dígitos por e-mail** (regra 11.4) | É o que prova o controle do e-mail, a principal evidência de autoria | Só o link: qualquer pessoa com o e-mail encaminhado assinaria |
| PDF | `pdf-lib` + `@pdf-lib/fontkit` (gravar campos e manifesto), `pdfjs-dist` (mostrar no navegador), `qrcode` ou `uqr` (QR do manifesto) | Mesmas bibliotecas do SignuDoc, já provadas no Vercel | Puppeteer: pesado demais para uma função |
| Selo | `@signpdf/signpdf`, `@signpdf/placeholder-pdf-lib`, `@signpdf/signer-p12` e `node-forge`, com `SubFilter ETSI.CAdES.detached` (PAdES). Carimbo do tempo RFC 3161 de TSA gratuita, opcional (regra 11.10) | Integridade verificável em qualquer leitor de PDF | Sem selo: o hash só seria verificável na nossa página |
| E-mail | **Resend**, remetente `naoresponda@assina.app.br`, `reply-to` com o e-mail do remetente do envelope | Mesmo do Reunião | Gmail API: escopo restrito |
| MCP | Rota `/mcp` no próprio Next (Streamable HTTP, `@modelcontextprotocol/sdk`, protocolo `2026-07-28` compatível com clientes de 2025) | Um deploy só, e o MCP chama `src/server/envelopes/` direto (princípio 5) | Edge Function do Supabase, como no Visão: duplicaria a camada de domínio em Deno |
| OAuth do MCP | O **site é o servidor de autorização**: `/.well-known/oauth-authorization-server`, `/.well-known/oauth-protected-resource`, `/oauth/registrar` (RFC 7591), `/oauth/autorizar` (exige sessão Google) e `/oauth/token` (PKCE S256) | É o padrão que já funciona no Visão de Produto, e a janela "Add custom connector" do Claude só fala OAuth | Só chave no MCP: não serve como conector no claude.ai nem no ChatGPT |
| Datas | `date-fns` v4 + `@date-fns/tz`. Exibição em `America/Sao_Paulo` | Mesmo do Reunião | — |
| Validação | `zod` 4, e os mesmos schemas para tela, API e MCP | Princípio 5 | — |
| Analytics | **Visão do Produto**, `POST /functions/v1/ingest` com `x-api-key`, chamado **do servidor** | Os eventos nascem no servidor (as três portas); a chave fica fora do bundle | SDK no navegador: perderia os eventos de API e MCP |
| Hospedagem | **Vercel**, domínio `assina.app.br` (25.1) | Mesmo do Reunião | — |
| Cron | Vercel Cron **1×/dia** → `/api/cron/diario` | O plano Hobby permite uma execução por dia | `pg_cron` chamando HTTP: lógica espalhada |
| Repositório | `~/assina`, GitHub **público** `assina`, licença **MIT** | Mesmo padrão dos outros projetos abertos | — |

**Premissas a validar no épico 8.1:**
- (a) Nenhum objeto `as_*` existe no remoto.
- (b) A camada gratuita do R2 (10 GB-mês de armazenamento, 1 milhão de operações classe A e 10 milhões classe B por mês, saída gratuita) ainda vale nesses números na data da implementação; se mudou, registrar no plano e avisar.
- (c) `@signpdf` + `node-forge` rodam no runtime Node da Vercel sem módulo nativo.
- (d) Uma TSA gratuita responde do Vercel em menos de 5 s (regra 11.10).

Fluxo principal:

```
Remetente → /painel/envelopes/novo ─POST /api/painel/envelopes─▶ servidor: cria rascunho + URL assinada de upload
           navegador ─PUT PDF─▶ R2 (assina-documentos/{conta}/{envelope}/original.pdf)
           posiciona campos ─PUT /api/painel/envelopes/{id}/campos─▶ servidor
           "Enviar" ─POST /api/painel/envelopes/{id}/enviar─▶ servidor: valida PDF (11.1), SHA-256, congela,
                                                            status enviado, evento "enviado", convites (Resend)
Signatário → /assinar/{token} → "Enviar código" → código → consentimento → lê e preenche → "Assinar"
           ─POST /api/assinar/{token}/assinar─▶ servidor: valida, grava valores, evento "assinou",
                                               próximo da fila notificado (se em ordem)
           último assinante ─▶ finalizando → grava campos + manifesto + selo → hash final → concluido
                              → e-mails com PDF final + webhook "envelope.concluido"
```

---

## 5. Perfis de usuário e matriz de permissões

São quatro perfis:

- **remetente:** logado no painel e dono de uma `as_contas`;
- **signatário:** anônimo, com o token de um `as_signatarios`;
- **sistema:** chave de API ou token OAuth do MCP, sempre de uma conta;
- **público:** qualquer pessoa, na página de verificação.

| Ação | Remetente (painel) | Sistema (API / MCP) | Signatário | Público |
|---|---|---|---|---|
| Criar conta | ✅ qualquer conta Google, salvo se estiver em `EMAILS_BLOQUEADOS`, se a conta estiver suspensa ou se o limite diário da regra 11.12 já foi atingido | ❌ | ❌ | ❌ |
| Criar envelope em rascunho | ✅ só na própria conta | ✅ só na conta da credencial | ❌ | ❌ |
| Trocar arquivo, campos e destinatários | ✅ só em `rascunho` da própria conta | ✅ idem, por API. O MCP não posiciona campos (regra 11.15) | ❌ | ❌ |
| Enviar envelope | ✅ próprio, em `rascunho`, válido (11.1–11.3), dentro dos limites 11.12 e 11.20 | ✅ idem. No MCP é uma ferramenta separada de criar (regra 11.15) | ❌ | ❌ |
| Ver envelopes, status e trilha | ✅ **só da própria conta** | ✅ **só da conta da credencial** | ✅ **só o envelope do token**: título, remetente, o documento (depois do código) e o próprio status. Nunca o e-mail nem o CPF dos outros | ❌ |
| Baixar o original | ✅ próprio | ✅ próprio | ✅ do próprio token, depois de validar o código | ❌ |
| Baixar o final | ✅ próprio, em `concluido` | ✅ idem | ✅ do próprio token, em `concluido`, até 30 dias depois (regra 11.14) | ❌ |
| Mandar lembrete manual | ✅ próprio, em `enviado`, com limite (11.5) | ✅ idem | ❌ | ❌ |
| Cancelar envelope | ✅ próprio, em `enviado` | ✅ idem | ❌ (o signatário **recusa**) | ❌ |
| Assinar ou recusar | ❌ pelo painel (o remetente que também assina entra como signatário pelo próprio link) | ❌ | ✅ **só o próprio**, na vez dele, com código validado, envelope em `enviado` e dentro do prazo | ❌ |
| Excluir envelope | ✅ próprio, em qualquer status final ou em `rascunho` (seção 7.4) | ✅ só `rascunho` pela API. ❌ pelo MCP | ❌ | ❌ |
| Ver ou gerar nova chave de API, configurar webhook | ✅ só a própria | ❌ | ❌ | ❌ |
| Ver e revogar conexões MCP | ✅ só as próprias | ❌ | ❌ | ❌ |
| Verificar documento por arquivo ou código | ✅ | ✅ | ✅ | ✅ só o resumo da regra 11.11 |
| Excluir a conta | ✅ só a própria | ❌ | ❌ | ❌ |
| Mudar o nível da conta | ❌ (só o admin, por SQL no MVP, regra 11.20) | ❌ | ❌ | ❌ |

**Primeiro remetente:** não há seed. A conta nasce no primeiro login, com a chave de API criada junto (regra 11.8).

O escopo de dados é sempre `conta_id`. Cada porta tem seu guardião na primeira linha:

| Porta | Guardião |
|---|---|
| Rota do painel | `requireConta()` |
| Rota de API | `requireCredencial('api')` |
| MCP | `requireCredencial('mcp' \| 'api')` |
| Rota do signatário | `requireSignatarioPorToken()` |

Os helpers de `src/server/db/` exigem `contaId` ou `tokenHash` como parâmetro obrigatório.

---

## 6. Autenticação e identidade

### 6.1 Remetente

- **Identificador:** `sub` do Google, guardado em `google_sub`. O e-mail pode mudar.
- **Entrar:** `/entrar` → `GET /api/auth/google` gera o `state` (cookie de 10 min) e o `code_verifier` do PKCE, e redireciona com `scope=openid email profile` e `prompt=select_account`. **Não pede `access_type=offline`**, porque o Assina não chama nenhuma API do Google depois do login.
- **Retorno:** `GET /api/auth/google/callback` faz, nesta ordem:
  1. confere o `state`;
  2. troca o código e valida o `id_token` (assinatura, `aud`, `iss`, `exp` e `email_verified = true`);
  3. aplica as proteções da regra 11.12 (bloqueados, permitidos, suspensa e limite diário), sem gravar nada se recusar;
  4. cria ou atualiza `as_contas`;
  5. se a conta é nova, cria a chave de API (regra 11.8);
  6. abre a sessão.
- **Sessão:** cookie `as_sessao` com JWT HS256 (`SESSION_SECRET`), `HttpOnly`, `Secure`, `SameSite=Lax`, validade de 30 dias e renovação quando tiver mais de 7 dias. Conteúdo: `conta_id` e `iat`. O `proxy.ts` manda `/painel/*` sem sessão para `/entrar?volta=…`.
- **Boas-vindas:** conta com `termos_aceitos_em` nulo vê só as boas-vindas até aceitar.
- **Sair:** `POST /sair` por formulário. Nunca `<Link href="/sair">`.
- **Recuperação de senha:** não existe senha.
- **Várias contas:** cada e-mail Google é uma conta. Para trocar, sai-se e entra-se de novo.

### 6.2 Signatário

- Recebe no convite o link `/assinar/{token}`. O token tem 32 bytes aleatórios em base64url, e o banco guarda **só o SHA-256** (`token_hash`).
- O link sozinho mostra apenas o título, o nome e o e-mail do remetente e o botão "Enviar código". **O conteúdo do documento só aparece depois do código** (regra 11.4), para que um e-mail encaminhado não exponha o documento.
- Código validado abre uma sessão de signatário: cookie `as_sig_{signatario_id}`, JWT de 2 h, `HttpOnly`, `SameSite=Lax`, `Path=/` (v0.8: com `/assinar` o cookie não chegaria às rotas `/api/assinar/...`). O JWT leva o `token_hash` do link: link trocado derruba a sessão. Fechou a aba e voltou dentro de 2 h, não pede código de novo. Depois disso, pede.
- `Referrer-Policy: no-referrer` e `noindex` em `/assinar/*`.

### 6.3 Credenciais de máquina

Vivem em `as_credenciais`, separadas pelo enum `as_tipo_credencial`.

- **Chave de API (`api`):** uma por conta, criada junto com a conta (regra 11.8). Formato `assina_` + 32 bytes em base64url. É guardada como `valor_hash` (SHA-256, para a busca) e como `valor_cifrado` (AES-256-GCM com `CHAVES_ENC_KEY`), para que a tela Integrações possa mostrá-la de novo, que é o pedido do Alexandre ("uma chave predefinida por usuário"). "Gerar nova chave" revoga a anterior na mesma transação. Uso: `Authorization: Bearer assina_…` na API REST e também no MCP, para clientes configurados por arquivo.
- **Token MCP (`mcp`):** criado pelo OAuth (seção 6.4). Formato `assina_mcp_` + 32 bytes. Só o hash é guardado, e ele é mostrado ao cliente OAuth uma única vez. Tem nome (o `client_name` do registro), `ultimo_uso_em` e revogação em um clique na tela Integrações. Não expira, como no Visão de Produto. A revogação é o controle.
- **Validação:** hash do Bearer → `as_credenciais` com `revogada_em is null` → conta não suspensa. Tudo que falhar devolve `401 {"codigo":"credencial_invalida"}`, nunca 403 nem 500.
- `ultimo_uso_em` é atualizado no máximo uma vez por minuto por credencial.

### 6.4 OAuth 2.1 do MCP (mesmo desenho do Visão de Produto)

| Passo | Rota | O que faz |
|---|---|---|
| 0 | `GET /mcp` sem token | `401` com `WWW-Authenticate: Bearer resource_metadata="{SITE}/.well-known/oauth-protected-resource"`. O cabeçalho entra em `Access-Control-Expose-Headers` |
| 1 | `GET /.well-known/oauth-protected-resource` | RFC 9728: `resource = {SITE}/mcp` e `authorization_servers = [{SITE}]` |
| 2 | `GET /.well-known/oauth-authorization-server` | RFC 8414: endpoints, `code_challenge_methods_supported: ["S256"]`, `grant_types_supported: ["authorization_code"]`, `token_endpoint_auth_methods_supported: ["none"]` |
| 3 | `POST /oauth/registrar` | RFC 7591, cliente público e sem segredo. Grava `as_oauth_clientes` (nome, `redirect_uris` só `https` ou `http://localhost`/`127.0.0.1`) |
| 4 | `GET /oauth/autorizar` (+ `POST /oauth/autorizar/decidir`, v0.13) | Exige sessão (sem ela vai para `/entrar?volta=…`) e mostra a tela de consentimento da seção 15 com o nome do cliente e o que ele poderá e não poderá fazer. "Permitir" grava `as_oauth_codigos` (hash, 10 min, `code_challenge`) e redireciona com `code` e `state` |
| 5 | `POST /oauth/token` | Confere o código (existe, não foi usado, não expirou, mesmo cliente e mesmo `redirect_uri`) e o PKCE S256, marca `usado_em` e cria `as_credenciais` do tipo `mcp`. Devolve `{access_token, token_type:"Bearer"}` sem `expires_in` e sem refresh token |

As URLs dos metadados vêm de `NEXT_PUBLIC_SITE_URL`, nunca do `Host` da requisição (essa armadilha custou deploy no Visão).

### 6.5 Autorização no banco

Todas as tabelas `as_*` têm `ENABLE ROW LEVEL SECURITY` e **nenhuma política**, além de `REVOKE ALL` de `anon` e `authenticated`. O bucket `assina-documentos` do R2 é privado: sem domínio público, sem `r2.dev`, e só o servidor tem a credencial (token de API do R2 restrito a esse bucket, com leitura e escrita de objetos). A service role ignora RLS, então **toda consulta do servidor filtra por `conta_id` ou `token_hash`**, e quem garante isso são os helpers de `src/server/db/`.

---

## 7. Modelo de dados

O banco é em português, `snake_case`, com prefixo `as_`. Timestamps em `timestamptz` (UTC). Coordenadas de campo em fração da página (0 a 1, origem no canto superior esquerdo), para não depender de DPI nem de zoom.

### 7.1 Diagrama

```
as_contas 1 ──── N as_credenciais N ──── 0..1 as_oauth_clientes 1 ──── N as_oauth_codigos
    │
    ├── 1 ──── N as_envelopes 1 ──── N as_signatarios 1 ──── N as_campos
    │               │                      │
    │               ├── 1 ──── N as_eventos (signatario_id opcional)
    │               ├── 1 ──── N as_notificacoes (signatario_id opcional)
    │               └── 1 ──── N as_entregas_webhook
    └── 1 ──── N as_notificacoes
```

(`as_campos.envelope_id` também aponta para `as_envelopes`, para consultar por envelope sem passar por signatário.)

### 7.2 Enums

| Enum | Valores | Significado |
|---|---|---|
| `as_status_envelope` | `rascunho`, `enviado`, `finalizando`, `concluido`, `recusado`, `cancelado`, `expirado` | Ver a máquina de estado (seção 12) |
| `as_status_signatario` | `pendente`, `aguardando`, `assinou`, `recusou` | `pendente` = ainda não é a vez (ou envelope em rascunho). `aguardando` = convite enviado, falta assinar |
| `as_papel` | `assinar`, `copia` | Quem assina ou quem só recebe o PDF final |
| `as_tipo_campo` | `assinatura`, `rubrica`, `data`, `nome`, `texto`, `caixa` | Regra 11.3 |
| `as_metodo_assinatura` | `digitada`, `desenhada` | Como o signatário fez a assinatura |
| `as_origem` | `painel`, `api`, `mcp` | Por onde o envelope foi criado (princípio 5) |
| `as_tipo_credencial` | `api`, `mcp` | Seção 6.3 |
| `as_ator` | `remetente`, `signatario`, `sistema`, `api`, `mcp` | Quem causou o evento da trilha |
| `as_tipo_evento` | `criado`, `enviado`, `convite_enviado`, `codigo_enviado`, `codigo_validado`, `codigo_recusado`, `visualizou`, `consentiu`, `assinou`, `recusou`, `lembrete_enviado`, `finalizado`, `concluido`, `cancelado`, `expirado`, `baixou_original`, `baixou_final` | Trilha (regra 11.6) |
| `as_tipo_notificacao` | `convite`, `codigo`, `lembrete`, `concluido_destinatario`, `concluido_remetente`, `assinou_remetente`, `recusado_remetente`, `recusado_destinatario`, `cancelado_destinatario`, `expirado_remetente`, `finalizacao_falhou_admin` | Qual e-mail (seção 15.2) |
| `as_status_notificacao` | `pendente`, `enviada`, `falhou` | Situação do envio pelo Resend |
| `as_status_entrega` | `pendente`, `entregue`, `falhou` | Situação do webhook |

### 7.3 Tabelas

**`as_contas`**: uma por conta Google do remetente.

| Coluna | Tipo | Nulo | Default | Notas |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | PK |
| `google_sub` | text | não | — | unique |
| `email` | text | não | — | e-mail Google, em minúsculas. Recebe os avisos e vira o `reply-to` dos convites |
| `nome` | text | não | — | vem do Google; editável. 1–100 |
| `termos_aceitos_em` | timestamptz | sim | — | nulo = ainda não passou pelas boas-vindas |
| `suspensa_em` | timestamptz | sim | — | nulo = ativa (regra 11.12) |
| `nivel` | smallint | não | `1` | check 1–3 (regra 11.20); toda conta nasce no 1 |
| `webhook_url` | text | sim | — | nulo = sem webhook. Só `https://`, máx. 500 |
| `webhook_segredo_cifrado` | text | sim | — | nulo se e só se `webhook_url` nulo. AES-256-GCM `iv.tag.cifra` |
| `criado_em` | timestamptz | não | `now()` | |
| `atualizado_em` | timestamptz | não | `now()` | trigger `as_tg_atualizado_em` |

**`as_credenciais`**

| Coluna | Tipo | Nulo | Default | Notas |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | PK |
| `conta_id` | uuid | não | — | FK → `as_contas.id` on delete cascade |
| `tipo` | `as_tipo_credencial` | não | — | |
| `nome` | text | não | — | `"Chave de API"` ou o `client_name` do OAuth |
| `prefixo` | text | não | — | os 12 primeiros caracteres, para exibir |
| `valor_hash` | text | não | — | unique; SHA-256 hex |
| `valor_cifrado` | text | sim | — | preenchido só em `tipo = 'api'` (seção 6.3); nulo em `mcp` |
| `oauth_cliente_id` | uuid | sim | — | FK → `as_oauth_clientes.id` on delete set null; nulo em `api` |
| `ultimo_uso_em` | timestamptz | sim | — | nulo = nunca usada |
| `revogada_em` | timestamptz | sim | — | nulo = válida |
| `criado_em` | timestamptz | não | `now()` | |

Índice único parcial `as_credenciais_api_uk` em (`conta_id`) `where tipo = 'api' and revogada_em is null`: no máximo uma chave de API ativa por conta.

**`as_oauth_clientes`**: clientes MCP que se registraram sozinhos (DCR).

| Coluna | Tipo | Nulo | Default | Notas |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | PK; é o `client_id` |
| `nome` | text | não | — | `client_name`, máx. 100. Sem nome = "Cliente MCP" |
| `redirect_uris` | text[] | não | — | 1–5 URIs (seção 6.4) |
| `criado_em` | timestamptz | não | `now()` | |

**`as_oauth_codigos`**

| Coluna | Tipo | Nulo | Default | Notas |
|---|---|---|---|---|
| `codigo_hash` | text | não | — | PK; SHA-256 hex |
| `cliente_id` | uuid | não | — | FK → `as_oauth_clientes.id` on delete cascade |
| `conta_id` | uuid | não | — | FK → `as_contas.id` on delete cascade |
| `redirect_uri` | text | não | — | |
| `code_challenge` | text | não | — | S256 |
| `expira_em` | timestamptz | não | — | criação + 10 min |
| `usado_em` | timestamptz | sim | — | nulo = ainda não trocado |

**`as_envelopes`**

| Coluna | Tipo | Nulo | Default | Notas |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | PK |
| `conta_id` | uuid | não | — | FK → `as_contas.id` on delete cascade |
| `titulo` | text | não | — | 1–120 |
| `mensagem` | text | sim | — | nulo = convite sem mensagem. Máx. 1.000 |
| `status` | `as_status_envelope` | não | `'rascunho'` | |
| `origem` | `as_origem` | não | — | |
| `em_ordem` | boolean | não | `false` | verdadeiro = sequencial pela coluna `ordem` dos assinantes |
| `prazo_dias` | smallint | não | `30` | check 1–90 |
| `prazo_em` | timestamptz | sim | — | preenchido no envio = `enviado_em + prazo_dias`; nulo em rascunho |
| `lembrete_cada_dias` | smallint | sim | `3` | nulo = sem lembrete automático; check em (2, 3, 7) |
| `nome_arquivo` | text | sim | — | nome original do PDF, máx. 200; nulo até o upload |
| `arquivo_original_path` | text | sim | — | `{conta_id}/{id}/original-{versao}.pdf` (um caminho por troca de arquivo, v0.5); nulo até o upload ou depois do expurgo (11.14) |
| `tamanho_bytes` | integer | sim | — | nulo até o upload |
| `paginas` | smallint | sim | — | nulo até validar (11.1) |
| `dimensoes_paginas` | jsonb | sim | — | `[{"l":595.28,"a":841.89}, …]` em pontos; nulo até validar |
| `hash_original` | text | sim | — | SHA-256 hex; preenchido **no envio** e nunca mais alterado (trigger 7.5) |
| `arquivo_final_path` | text | sim | — | `{conta_id}/{id}/final-{reserva}.pdf` (épico 8.6: o caminho é da tentativa, para um finalizador atrasado nunca gravar por cima do final de outro); nulo até `concluido` |
| `hash_final` | text | sim | — | SHA-256 hex do PDF selado; nulo até `concluido` |
| `selo` | text | sim | — | `'B-B'` ou `'B-T'` (11.10); nulo até `concluido` |
| `codigo_verificacao` | text | não | — | unique; 12 caracteres base32 Crockford, exibido `XXXX-XXXX-XXXX` (11.11) |
| `chave_idempotencia` | text | sim | — | nulo fora da API; unique por (`conta_id`, `chave_idempotencia`) |
| `tentativas_finalizacao` | smallint | não | `0` | regra 11.10 |
| `finalizacao_reserva` | uuid | sim | — | id da reserva de quem está finalizando (épico 8.6); só o dono conclui ou registra a falha; nulo quando ninguém está |
| `finalizacao_reservada_em` | timestamptz | sim | — | desde quando vale a reserva; ela vence em 5 min |
| `erro_finalizacao` | text | sim | — | código técnico da última falha da finalização, sem dado pessoal (vai no alerta ao admin); nulo depois de concluir |
| `motivo_cancelamento` | text | sim | — | máx. 500; preenchido só em `cancelado` (opcional mesmo assim) |
| `enviado_em` | timestamptz | sim | — | |
| `concluido_em` | timestamptz | sim | — | |
| `encerrado_em` | timestamptz | sim | — | quando entrou em `recusado`, `cancelado` ou `expirado` |
| `arquivos_expurgados_em` | timestamptz | sim | — | nulo até a faxina da regra 11.14 |
| `criado_em` | timestamptz | não | `now()` | |
| `atualizado_em` | timestamptz | não | `now()` | |

Índices: (`conta_id`, `criado_em desc`), (`status`, `prazo_em`) para a faxina, e unique parcial `as_envelopes_idem_uk` em (`conta_id`, `chave_idempotencia`) `where chave_idempotencia is not null`.

**`as_signatarios`**: destinatários do envelope (assinantes e cópias).

| Coluna | Tipo | Nulo | Default | Notas |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | PK |
| `envelope_id` | uuid | não | — | FK → `as_envelopes.id` on delete cascade |
| `conta_id` | uuid | não | — | desnormalizado para filtrar sem join; FK on delete cascade |
| `papel` | `as_papel` | não | `'assinar'` | |
| `ordem` | smallint | não | `1` | 1–10, único por envelope entre os assinantes; ignorado em `copia` |
| `nome` | text | não | — | 1–100 |
| `email` | text | não | — | minúsculas; único por envelope |
| `exigir_cpf` | boolean | não | `false` | só para `assinar` |
| `cpf` | text | sim | — | 11 dígitos, sem máscara; preenchido pelo próprio signatário ao assinar, se exigido; nulo caso contrário |
| `exigir_nascimento` | boolean | não | `false` | só para `assinar` (épico 8.14) |
| `data_nascimento` | date | sim | — | informada pelo próprio signatário ao assinar, se exigida: data real, não futura e de no máximo 120 anos atrás (`NASCIMENTO_IDADE_MAX`); nula caso contrário |
| `status` | `as_status_signatario` | não | `'pendente'` | |
| `token_hash` | text | não | — | unique; SHA-256 hex do token do link |
| `codigo_hash` | text | sim | — | SHA-256 do código atual (com `id` como sal); nulo quando não há código ativo |
| `codigo_expira_em` | timestamptz | sim | — | |
| `codigo_tentativas` | smallint | não | `0` | tentativas erradas no código atual (11.4) |
| `codigos_enviados_hora` | smallint | não | `0` | contador da janela de 1 h (11.4) |
| `janela_codigos_desde` | timestamptz | sim | — | início da janela de 1 h |
| `consentimento_versao` | text | sim | — | ex. `"2026-11-17"`; nulo até consentir |
| `metodo_assinatura` | `as_metodo_assinatura` | sim | — | nulo até assinar |
| `assinatura_texto` | text | sim | — | nome digitado (`digitada`); máx. 100 |
| `assinatura_imagem_path` | text | sim | — | PNG no R2 (`desenhada`) |
| `rubrica_texto` | text | sim | — | iniciais; nulo se não houver campo rubrica |
| `rubrica_imagem_path` | text | sim | — | |
| `ip_assinatura` | inet | sim | — | IP no momento de assinar ou recusar |
| `user_agent_assinatura` | text | sim | — | máx. 500 |
| `assinado_em` | timestamptz | sim | — | |
| `recusado_em` | timestamptz | sim | — | |
| `motivo_recusa` | text | sim | — | 1–500, obrigatório ao recusar |
| `notificado_em` | timestamptz | sim | — | quando o convite saiu; nulo enquanto `pendente` |
| `ultimo_lembrete_em` | timestamptz | sim | — | |
| `lembretes_enviados` | smallint | não | `0` | máx. 10 (11.5) |
| `criado_em` | timestamptz | não | `now()` | |

Índice único `as_signatarios_email_uk` em (`envelope_id`, `email`). Ordem única entre os assinantes: exclusion constraint `as_signatarios_ordem_ex` (`btree_gist`) em (`envelope_id` =, `ordem` =) `where papel = 'assinar'`, **`DEFERRABLE INITIALLY DEFERRED`**, para reordenar numa transação sem colisão no meio do caminho (v0.5, épico 8.2).

**`as_campos`**

| Coluna | Tipo | Nulo | Default | Notas |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | PK |
| `envelope_id` | uuid | não | — | FK on delete cascade |
| `signatario_id` | uuid | não | — | FK → `as_signatarios.id` on delete cascade; papel precisa ser `assinar` |
| `tipo` | `as_tipo_campo` | não | — | |
| `pagina` | smallint | não | — | 1-based; check ≤ `as_envelopes.paginas` (função 7.5) |
| `x` | numeric(6,5) | não | — | 0–1, borda esquerda |
| `y` | numeric(6,5) | não | — | 0–1, borda superior |
| `largura` | numeric(6,5) | não | — | > 0; `x + largura ≤ 1` |
| `altura` | numeric(6,5) | não | — | > 0; `y + altura ≤ 1` |
| `obrigatorio` | boolean | não | `true` | `assinatura`, `rubrica`, `data` e `nome` são sempre obrigatórios (check) |
| `rotulo` | text | sim | — | dica para `texto`/`caixa` ("CNPJ", "Li e concordo"); máx. 60 |
| `valor` | text | sim | — | preenchido ao assinar: texto (máx. 200), `"sim"`/`"nao"` para `caixa`, data `dd/mm/aaaa` para `data`; nulo para `assinatura` e `rubrica` (usam as colunas do signatário) |

**`as_eventos`**: trilha de auditoria. **Só aceita inserção** (regra 11.6).

| Coluna | Tipo | Nulo | Default | Notas |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | PK |
| `envelope_id` | uuid | não | — | FK on delete cascade |
| `seq` | integer | não | — | 1, 2, 3… por envelope; unique (`envelope_id`, `seq`) |
| `tipo` | `as_tipo_evento` | não | — | |
| `ator` | `as_ator` | não | — | |
| `signatario_id` | uuid | sim | — | FK on delete cascade; nulo em eventos do remetente ou do sistema |
| `ip` | inet | sim | — | nulo em eventos do sistema (cron) |
| `user_agent` | text | sim | — | máx. 500; nulo em eventos do sistema |
| `dados` | jsonb | não | `'{}'` | detalhes sem segredo: `{"motivo":…}`, `{"hash_original":…}`, `{"para":"a***@x.com"}` |
| `ocorrido_em` | timestamptz | não | `now()` | relógio do servidor (banco), nunca do cliente |
| `hash_anterior` | text | não | — | hash do evento `seq-1`; `'0'×64` no primeiro |
| `hash` | text | não | — | SHA-256 hex (regra 11.6) |

**`as_notificacoes`**: cada e-mail, para reenvio e idempotência.

| Coluna | Tipo | Nulo | Default | Notas |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | PK |
| `conta_id` | uuid | não | — | FK on delete cascade |
| `envelope_id` | uuid | sim | — | FK on delete cascade; nulo só em `finalizacao_falhou_admin` |
| `signatario_id` | uuid | sim | — | FK on delete cascade; nulo nos avisos ao remetente |
| `tipo` | `as_tipo_notificacao` | não | — | |
| `chave` | text | não | — | unique; idempotência, ex. `convite:{signatario_id}`, `lembrete:{signatario_id}:{n}`, `codigo:{signatario_id}:{epoch}` |
| `status` | `as_status_notificacao` | não | `'pendente'` | |
| `tentativas` | smallint | não | `0` | máx. 5 |
| `resend_id` | text | sim | — | |
| `erro` | text | sim | — | sem dado pessoal |
| `criado_em` | timestamptz | não | `now()` | |
| `enviada_em` | timestamptz | sim | — | |
| `reservada_em` | timestamptz | sim | — | v0.7: reserva de envio por 2 min (`as_fn_reserva_notificacao`); nulo fora de um envio em andamento |

**`as_envios`** (v0.7): um registro por envio, para o limite de 30 em 24 h (regra 11.12). Fica fora do envelope: excluir o envelope não apaga o registro; só cai com a conta.

| Coluna | Tipo | Nulo | Default | Notas |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | PK |
| `conta_id` | uuid | não | — | FK → `as_contas.id` on delete cascade |
| `enviado_em` | timestamptz | não | `now()` | índice (`conta_id`, `enviado_em desc`) |

**`as_entregas_webhook`**

| Coluna | Tipo | Nulo | Default | Notas |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | PK; vai no cabeçalho `Assina-Entrega` (idempotência do lado de lá) |
| `conta_id` | uuid | não | — | FK on delete cascade |
| `envelope_id` | uuid | não | — | FK on delete cascade |
| `evento` | text | não | — | um dos nomes da regra 11.17 |
| `corpo` | jsonb | não | — | payload exato enviado (sem dado do PDF) |
| `status` | `as_status_entrega` | não | `'pendente'` | |
| `tentativas` | smallint | não | `0` | máx. 6 (11.17) |
| `ultimo_status_http` | smallint | sim | — | nulo se não houve resposta |
| `reservada_em` | timestamptz | sim | — | entrega em andamento (épico 8.9); nulo quando ninguém está entregando |
| `criado_em` | timestamptz | não | `now()` | |
| `entregue_em` | timestamptz | sim | — | |

### 7.4 Exclusão

| Entidade | Estratégia | Motivo |
|---|---|---|
| `as_envelopes` em `rascunho` | hard delete (cascata e arquivos do R2) | nada foi enviado a ninguém |
| `as_envelopes` em status final (`concluido`, `recusado`, `cancelado`, `expirado`) | hard delete pelo remetente, com confirmação digitando o título; cascata na trilha e nos arquivos. A partir daí, a verificação responde "não encontrado" | O remetente é o controlador (seção 20). Os signatários já receberam o PDF final por e-mail |
| `as_envelopes` em `enviado` ou `finalizando` | **não pode excluir**: primeiro cancela | Não some com documento que alguém está assinando |
| Arquivos de envelopes não concluídos | expurgo automático (regra 11.14), linha e trilha mantidas | Economiza armazenamento sem perder a prova do que aconteceu |
| `as_eventos` | nunca alterados nem apagados isoladamente; só caem em cascata com o envelope ou a conta (trigger 7.5) | Princípio 1 |
| `as_contas` | hard delete pelo remetente (cascata em tudo, mais o prefixo `{conta_id}/` do R2) | Direito de exclusão |
| `as_oauth_codigos` | apagados pela faxina 24 h depois de expirar | Sem valor depois de usado |

### 7.5 Lógica no banco

| Nome | Tipo | Onde | O que faz |
|---|---|---|---|
| `as_tg_atualizado_em` | trigger `BEFORE UPDATE` | `as_contas`, `as_envelopes` | grava `now()` |
| `as_fn_registra_evento(envelope_id, tipo, ator, signatario_id, ip, user_agent, dados)` | função (`SECURITY INVOKER`, `search_path=''`) | `as_eventos` | pega `pg_advisory_xact_lock` pelo envelope, lê o último `seq` e `hash`, calcula o próximo hash (regra 11.6) e insere. É a **única** forma de inserir na trilha |
| `as_tg_eventos_imutaveis` | trigger `BEFORE UPDATE OR DELETE` | `as_eventos` | `UPDATE` sempre recusado (`'trilha_imutavel'`). `DELETE` só é aceito quando vem de cascata (`pg_trigger_depth() > 1`) |
| `as_tg_envelope_congelado` | trigger `BEFORE UPDATE` | `as_envelopes` | (1) só aceita as transições da seção 12, venham de onde vierem (`'status_mudou'`); (2) fora de `rascunho`, recusa mudança em título, mensagem, ordem, prazo, nome, tamanho, páginas e dimensões do arquivo, conta e código de verificação (`'envelope_congelado'`). `hash_original` só passa de nulo para preenchido uma vez. `arquivo_original_path` só pode virar nulo junto com `arquivos_expurgados_em`, em envelope `recusado`, `cancelado` ou `expirado` (expurgo da regra 11.14) |
| `as_tg_envelope_nasce_rascunho` | trigger `BEFORE INSERT` | `as_envelopes` | todo envelope nasce em `rascunho`, sem hash, sem arquivo final e sem datas de envio ou conclusão (`'status_mudou'`): ninguém pula a máquina de estado nem a trilha |
| `as_tg_envelope_exclusao` | trigger `BEFORE DELETE` | `as_envelopes` | envelope em `enviado` ou `finalizando` não se exclui (`'envelope_em_andamento'`, seção 7.4: primeiro cancela); a cascata da exclusão da conta passa |
| `as_tg_filhos_congelados` | trigger `BEFORE INSERT/UPDATE/DELETE` | `as_campos`, `as_signatarios` | com o envelope fora de `rascunho`, recusa insert/delete e update de `nome`, `email`, `papel`, `ordem`, `exigir_cpf`, `exigir_nascimento` e das coordenadas (`'envelope_congelado'`). Continua aceitando os campos de andamento (status, código, assinatura, valor) |
| `as_tg_valida_campo` | trigger `BEFORE INSERT/UPDATE` | `as_campos` | `pagina ≤ paginas` do envelope e signatário do mesmo envelope com papel `assinar` (`'campo_invalido'`) |
| `as_fn_transicao_envelope(envelope_id, de, para)` | função | `as_envelopes` | `UPDATE … SET status = para WHERE id = … AND status = de`; devolve se mudou. É a trava contra duas transições simultâneas (seção 12) |
| `as_fn_verifica_trilha(envelope_id)` | função (só leitura) | `as_eventos` | recalcula a cadeia e devolve o primeiro `seq` quebrado ou nulo. Usada no teste e na página de detalhe |
| `as_fn_evento_canonico(...)` | função (só leitura) | `as_eventos` | monta o texto canônico de um evento (regra 11.6); usada pelo registro e pela verificação |
| `as_fn_entra_conta(google_sub, email, nome, chave_hash, chave_prefixo, chave_cifrada)` | função | `as_contas`, `as_credenciais` | login do remetente (seção 6.1): conta nova nasce **na mesma transação** que a chave de API (regra 11.8); conta existente atualiza só o e-mail; suspensa não é tocada. Devolve `conta_id`, `nova` e `suspensa` |
| `as_fn_cria_rascunho(conta_id, titulo, origem, codigo_verificacao, ator, ip, user_agent)` | função | `as_envelopes`, `as_eventos` | cria o envelope em rascunho e registra o evento `criado` na mesma transação (princípio 1, épico 8.2) |
| `as_fn_substitui_signatarios(envelope_id, conta_id, lista)` | função | `as_signatarios`, `as_campos` | troca a lista de destinatários de um rascunho (regra 11.2): só da conta (`nao_encontrado`) e só em rascunho (`envelope_congelado`); recusa e-mail repetido (`email_repetido`), mais de 10 assinantes (`assinantes_demais`) ou 5 cópias (`copias_demais`); mantém o id (e os campos) de quem continua pelo e-mail, apaga quem saiu, renumera a ordem pela posição e tira os campos de quem virou cópia |
| `as_fn_anexa_arquivo(envelope_id, conta_id, caminho, nome, tamanho, paginas, dimensoes)` | função | `as_envelopes`, `as_campos` | troca atômica do arquivo do rascunho (épico 8.2, princípio 2): com o envelope travado, confere conta e rascunho, apaga os campos e aponta para o arquivo novo, que o servidor já validou e gravou num caminho por versão; devolve o caminho anterior (que o servidor apaga) e se havia campos |
| `as_fn_substitui_campos(envelope_id, conta_id, lista)` | função | `as_campos` | troca todos os campos do rascunho numa transação (épico 8.3): envelope travado, da conta (`nao_encontrado`) e em rascunho (`envelope_congelado`); até 50 por assinante (`campos_demais`); assinatura, rubrica, data e nome sempre obrigatórios; página e assinante conferidos pelo trigger (`campo_invalido`) |
| `as_fn_envia_envelope(envelope_id, conta_id, caminho, hash, tokens, limite_diario, limites_nivel, ator, ip, user_agent)` | função | `as_envelopes`, `as_signatarios`, `as_eventos`, `as_notificacoes` | envio numa transação (épico 8.4): trava a conta (advisory lock) e o envelope; confere rascunho (`status_mudou`), arquivo igual ao lido pelo servidor e assinantes iguais aos tokens (`envelope_mudou`), assinante (`sem_assinante`), limites 11.12 (`limite_diario`, contado em `as_envios`) e 11.20 (`limite_do_nivel`, números vindos do servidor); aplica `rascunho → enviado` por `as_fn_transicao_envelope` com hash e prazo, grava os `token_hash`, põe os da vez em `aguardando`, registra `criado` (se faltar) e `enviado`, enfileira os convites; devolve os destinatários da vez |
| `as_fn_reserva_notificacao(id, max_tentativas)` | função | `as_notificacoes` | reserva um e-mail para envio por 2 minutos, se não foi enviado, há tentativa sobrando e ninguém o reservou; conta a tentativa (regra 11.16). Impede dois envios do mesmo convite ao mesmo tempo; reserva vencida libera sozinha |
| `as_fn_novo_codigo(signatario_id, codigo_hash, validade_s, intervalo_s, max_hora)` | função | `as_signatarios` | código de acesso novo (regra 11.4, épico 8.5): só para quem está aguardando num envelope enviado (`indisponivel`); recusa antes do intervalo (`aguarde`) e acima do máximo da hora (`limite_hora`); invalida o anterior e zera as tentativas |
| `as_fn_valida_codigo(signatario_id, codigo_hash, max_tentativas, ip, user_agent)` | função | `as_signatarios`, `as_eventos` | confere o código (uso único); conta os erros e bloqueia no último; registra `codigo_validado` / `codigo_recusado`; devolve `ok`, `errado` (com restantes), `bloqueado`, `expirado`, `sem_codigo` |
| `as_fn_assina(signatario_id, token_hash, metodo, …, campos, consentimento, ip, user_agent)` | função | `as_envelopes`, `as_signatarios`, `as_campos`, `as_eventos`, `as_notificacoes` | assinatura numa transação (épico 8.5): confere link atual, status, prazo (`prazo_em`), assinatura, rubrica, CPF, data de nascimento (`nascimento_invalido`, 8.14) e campos; grava valores (data de Brasília e nome feitos no banco), colunas e IP; registra `consentiu` e `assinou`; enfileira `assinou_remetente`; leva o envelope a `finalizando` (último) ou passa o próximo da ordem a `aguardando` com o convite |
| `as_fn_reserva_finalizacao(envelope_id, max_tentativas)` | função | `as_envelopes`, `as_notificacoes` | reserva o envelope em `finalizando` para um finalizador só (épico 8.6) e **conta a tentativa ali** (uma tentativa que cai ou estoura o tempo também conta); devolve `ok` com o id da reserva, `ocupado`, `esgotado`, ou `esgotado_alerta` quando a última tentativa caiu sem registrar falha e o alerta ao admin acabou de entrar na fila |
| `as_fn_alerta_finalizacao(conta_id, envelope_id)` | função | `as_notificacoes` | enfileira `finalizacao_falhou_admin` uma vez só; devolve se é novo |
| `as_fn_conclui_envelope(envelope_id, reserva, caminho, hash_final, selo, concluido_em)` | função | `as_envelopes`, `as_eventos`, `as_notificacoes`, `as_entregas_webhook` | conclusão numa transação (critério 8.6, passos 6 a 9): confere que a reserva é de quem chama e o caminho `{conta}/{id}/final-{reserva}.pdf`; `finalizando → concluido`; eventos `finalizado` e `concluido`; e-mails `concluido_destinatario` (assinantes e cópias) e `concluido_remetente`; webhook `envelope.concluido`. `concluido_em` não pode ser anterior ao envio nem mais de 1 minuto à frente do relógio do banco (v0.16): o servidor usa a maior data entre o próprio relógio e o último fato da trilha |
| `as_fn_expira_envelope(envelope_id)` | função | `as_envelopes`, `as_eventos`, `as_notificacoes`, `as_entregas_webhook` | faxina, regra 11.7 (v0.16): `enviado` com o prazo vencido → `expirado`, `encerrado_em`, evento `expirado` (ator sistema), aviso `expirado_remetente` e webhook `envelope.expirado`. Devolve se expirou agora (idempotente) |
| `as_fn_lembretes_devidos(max, folga_min, contas)` | função | `as_envelopes`, `as_signatarios`, `as_contas` | faxina, regra 11.5 (v0.16): assinantes aguardando, no prazo, de conta ativa, com o último contato (convite ou lembrete) há `lembrete_cada_dias` dias ou mais (com folga de minutos) e abaixo do limite |
| `as_tg_rascunho_tocado` | trigger | `as_signatarios`, `as_campos` → `as_envelopes` | v0.16: mudar destinatários ou campos de um rascunho renova o `atualizado_em` do envelope (regra 11.14: "sem atualização há 30 dias") |
| `as_fn_expurga_envelope(envelope_id, dias)` | função | `as_envelopes`, `as_signatarios` | faxina, regra 11.14 (v0.16), depois de o servidor apagar os arquivos: marca `arquivos_expurgados_em` e esquece o caminho do original e das imagens de assinatura e rubrica. Só recusado, cancelado ou expirado, encerrado há `dias` |
| `as_fn_falha_finalizacao(envelope_id, reserva, erro, max_tentativas, definitiva)` | função | `as_envelopes`, `as_notificacoes` | registra a falha da própria reserva (regra 11.10; a de um finalizador atrasado é ignorada), solta a reserva e guarda o código; se era a última tentativa (ou numa falha definitiva, como `integridade_violada`), enfileira `finalizacao_falhou_admin` |
| `as_tg_final_imutavel` | trigger | `as_envelopes` | depois de preenchidos, `hash_final`, `arquivo_final_path`, `selo` e `concluido_em` não mudam (`envelope_congelado`) |
| `as_fn_lista_envelopes(conta, filtro, busca, limite, deslocamento)` | função | `as_envelopes`, `as_signatarios` | lista do painel (critério 8.7): filtros da seção 15, busca por título ou e-mail (com `%` e `_` como texto), "n de m assinaram" e o total para paginar; mais recentes primeiro |
| `as_fn_signatario_ativo(conta, envelope, signatario)` | função | `as_envelopes`, `as_signatarios` | trava e confere o signatário aguardando num envelope enviado da conta e dentro do `prazo_em` (`nao_encontrado` / `status_mudou` / `prazo_encerrado`); usada pelo lembrete e pelo link copiado |
| `as_fn_reserva_lembrete` · `as_fn_confirma_lembrete` · `as_fn_desfaz_lembrete` | funções | `as_signatarios`, `as_notificacoes`, `as_eventos` | lembrete manual (regra 11.5) em três passos: reserva (1 a cada 24 h, até 10; `lembrete_recente` / `limite_lembretes`; notificação `lembrete:{sid}:{uuid}`, uma por tentativa), e-mail com link novo, confirmação (registra o envio e `lembrete_enviado` com `{"canal":"manual"}` sempre; troca o `token_hash` só se a pessoa ainda aguarda) ou desfazer (e-mail falhou: a contagem volta e o link antigo continua valendo) |
| `as_fn_copia_link(conta, envelope, signatario, token_hash, ator, ip, user_agent)` | função | `as_signatarios`, `as_eventos` | "Copiar link de assinatura": link novo e `convite_enviado` com `{"canal":"link_copiado"}` |
| `as_fn_cancela_envelope(conta, envelope, motivo, ator, ip, user_agent)` | função | `as_envelopes`, `as_eventos`, `as_notificacoes`, `as_entregas_webhook` | `enviado → cancelado` (seção 12), motivo e `encerrado_em`, evento `cancelado`, `cancelado_destinatario` para quem já foi convidado (aguardando ou assinou), webhook `envelope.cancelado` |
| `as_fn_exclui_envelope(conta, envelope, titulo)` | função | `as_envelopes` (cascata) | seção 7.4: só rascunho ou status final; o título digitado tem de ser exato (`titulo_nao_confere`); o servidor apaga a pasta `{conta}/{envelope}/` do armazenamento depois |
| `as_fn_verifica_documento(hash, codigo)` | função | `as_envelopes`, `as_signatarios`, `as_contas` | verificação pública (critério 8.8, regra 11.11): por hash, primeiro o final de um concluído (`final`), senão o original (`original` com o resumo se for de um envelope só; `original_multiplo`, sem resumo, se o mesmo PDF está em mais de um, para não mostrar envelopes de terceiros a quem tem um modelo público); por código (`codigo`). Rascunho e conta suspensa não aparecem |
| `as_fn_api_lista_envelopes(conta, status, limite, cursor_criado, cursor_id)` | função | `as_envelopes` | `GET /api/v1/envelopes` (13.2): mais recentes primeiro, cursor pela posição (criado_em, id) do último item entregue |
| `as_fn_troca_chave_api(conta, hash, prefixo, cifrado)` | função | `as_credenciais` | "Gerar nova chave" (regra 11.8): revoga a ativa e grava a nova na mesma transação |
| `as_tg_webhook_assinou` | trigger AFTER UPDATE | `as_signatarios` | enfileira `signatario.assinou` (regra 11.17) na transação da assinatura, se a conta tem webhook |
| `as_fn_reserva_entrega(id, max)` | função | `as_entregas_webhook` | reserva de 2 min para entregar um webhook (um envio por vez) e conta a tentativa; até 6 |
| `as_fn_cria_codigo_oauth(codigo_hash, cliente, conta, redirect_uri, code_challenge, validade_s)` | função | `as_oauth_codigos` | "Permitir" (6.4, passo 4): `redirect_uri` exatamente igual a um dos registrados e `code_challenge` S256 bem formado; grava o código (hash) por 10 min |
| `as_fn_troca_codigo_oauth(codigo_hash, cliente, redirect_uri, challenge_do_verifier, token_hash, token_prefixo)` | função | `as_oauth_codigos`, `as_credenciais` | POST /oauth/token (6.4, passo 5), com o código travado: confere existência, uso, validade, cliente, `redirect_uri` e PKCE; queima o código e cria a credencial `mcp` com o nome do cliente; conta suspensa não recebe token; código reutilizado revoga o token que ele gerou (RFC 9700). Devolve nulo em vez de lançar (`invalid_grant`), para a revogação não ser desfeita |
| `as_fn_resumo_publico(envelope)` | função | `as_envelopes`, `as_signatarios` | o resumo da regra 11.11: status, título, enviado e concluído em, selo e os assinantes (nome e quando assinaram); nada mais |
| `as_envelopes_hash_final_idx` · `as_envelopes_hash_original_idx` | índices | `as_envelopes` | consulta por hash da verificação |
| `as_fn_recusa(signatario_id, token_hash, motivo, ip, user_agent)` | função | `as_envelopes`, `as_signatarios`, `as_eventos`, `as_notificacoes`, `as_entregas_webhook` | recusa (épico 8.5): `enviado → recusado`, encerrado, signatário em `recusou` com o motivo, evento `recusou`, avisos ao remetente e a quem já foi convidado, webhook `envelope.recusado` na fila |

Os erros de negócio sobem com `MESSAGE` igual ao código, e o servidor traduz para a copy da seção 15.

### 7.6 Seed e migrations

- Migrations ficam em `supabase/migrations/` e são aplicadas no remoto pelo MCP `apply_migration` com o mesmo SQL do arquivo. **Nunca `supabase db push`** no projeto compartilhado. Migration versionada não se edita.
- Depois de aplicar, rodar `get_advisors` (security e performance) filtrando `as_*` e regenerar `supabase/schema.sql` filtrado ao prefixo `as_` no mesmo commit.
- O bucket `assina-documentos` do R2 é criado à mão no painel da Cloudflare (README, com a regra de CORS e o token restrito ao bucket). Não há bucket no Supabase.
- Não há seed de dados. Os testes criam a fixture própria e limpam só ela.
- Supabase local nas portas **555xx** (API 55521, DB 55522). As faixas 543xx, 553xx e 554xx são de outros projetos.

---

## 8. Épicos e critérios de aceite

Os épicos estão em ordem de implementação. Os critérios de cada um são verificados com `npm run verify` mais o `verifier`.

### 8.0 Guardrails

Criar os arquivos do Anexo B, tornar os scripts executáveis e testar cada hook provocando a violação uma vez.

- [ ] Escrever `SUPABASE_SERVICE_ROLE_KEY` ou `SELO_P12_BASE64` em `src/app/(publico)/x.tsx` é bloqueado com a mensagem do hook.
- [ ] Escrever `.from('as_eventos').update(` ou `.delete(` em qualquer arquivo de `src/` é bloqueado.
- [ ] Editar uma migration já commitada é bloqueado.
- [ ] Com `.claude/fix-mode` presente, editar `*.test.ts` é bloqueado.
- [ ] Escrever em `supabase/migrations/` dispara o lembrete de advisors.
- [ ] Escrever "certificado digital" ou "ICP-Brasil" em `src/lib/copy.ts` fora da lista permitida é bloqueado (princípio 4).

### 8.1 Fundação: projeto, banco, login

**Objetivo:** o remetente entra com Google e a conta nasce com a chave de API.

**Fluxo:** `/entrar` → Google → callback → boas-vindas (primeira vez) → `/painel`.

- [ ] Migrations com todas as tabelas, enums, triggers e funções da seção 7, aplicadas local e remoto. Bucket R2 `assina-documentos` criado, privado, com CORS só para o site e localhost. Advisors sem alerta crítico em `as_*` (o aviso "RLS enabled no policy" é esperado e está documentado).
- [ ] `anon` e `authenticated` não conseguem `select` em nenhuma `as_*` (pgTAP). Uma URL do bucket sem assinatura responde 403, e uma pré-assinada vencida também (teste manual registrado no plano).
- [ ] O consentimento do Google pede só nome, e-mail e foto (sem tela de app não verificado).
- [ ] O primeiro login cria `as_contas` e uma `as_credenciais` `api` ativa. `valor_cifrado` não contém o prefixo `assina_` em claro.
- [ ] O segundo login com o mesmo Google não duplica conta nem chave.
- [ ] `termos_aceitos_em` nulo leva às boas-vindas. Sem marcar o aceite, "Continuar" fica desabilitado. Ao aceitar, grava a data e abre `/painel`.
- [ ] `/painel/*` sem cookie redireciona para `/entrar?volta=…`. `POST /sair` apaga o cookie.
- [ ] `as_fn_registra_evento` encadeia 3 eventos, e `as_fn_verifica_trilha` devolve nulo. Alterar `dados` do evento 2 pelo `postgres` (pulando o trigger) faz a função devolver 2 (pgTAP).
- [ ] `UPDATE` em `as_eventos` falha com `trilha_imutavel` (pgTAP).

### 8.2 Novo envelope (rascunho)

**Objetivo:** subir o PDF e definir destinatários e configurações.

**Fluxo:**
1. "Novo envelope".
2. Arrastar ou escolher o PDF.
3. Barra de progresso do upload.
4. Título (pré-preenchido com o nome do arquivo sem `.pdf`) e mensagem.
5. Destinatários: nome, e-mail, papel, exigir CPF, exigir data de nascimento (8.14), e arrastar para ordenar quando "Assinar em ordem" estiver ligado.
6. Configurações: prazo e lembrete.
7. "Próximo: posicionar campos" ou "Enviar sem campos".

**Estados:** carregando o upload, erro de arquivo (cada motivo da regra 11.1 com a frase da seção 15) e rascunho salvo automaticamente (debounce de 800 ms).

- [ ] `POST /api/painel/envelopes` cria o rascunho (`origem = painel`, `codigo_verificacao` gerado) e devolve uma URL assinada de upload válida por 2 h. O navegador faz o `PUT` direto no R2.
- [ ] `POST /api/painel/envelopes/{id}/arquivo` (depois do upload) baixa o PDF no servidor e valida a regra 11.1. Se for válido, grava `paginas`, `dimensoes_paginas`, `tamanho_bytes` e `nome_arquivo`. Se for inválido, apaga o objeto e devolve o código do erro.
- [ ] PDF de 10,1 MB, PDF com senha, PDF com 101 páginas e arquivo `.docx` renomeado para `.pdf` são recusados com as mensagens da seção 15.
- [ ] Trocar o arquivo num rascunho com campos apaga os campos e avisa "Os campos posicionados foram removidos."
- [ ] Dois destinatários com o mesmo e-mail: "Esse e-mail já está na lista." 11 assinantes: o botão de adicionar some e aparece "Até 10 pessoas assinam um documento."
- [ ] Rascunho sem nenhum assinante não avança.
- [ ] Gravações de rascunho de outra conta respondem 404 (teste de rota).

### 8.3 Editor de campos

**Objetivo:** posicionar os campos de cada assinante no PDF.

**Fluxo:**
- O PDF aparece renderizado (pdf.js), página a página, com rolagem.
- À esquerda, a lista de assinantes, cada um com uma cor (até 10 cores da seção 16) e os seis tipos de campo.
- Arrastar um campo para a página o cria no assinante selecionado.
- O campo pode ser movido, redimensionado pelas alças e apagado (tecla Delete ou ícone).
- Um painel mostra `obrigatório` (só para `texto`/`caixa`) e `rótulo`.
- "Salvar e revisar".

- [ ] Coordenadas gravadas em fração da página. Reabrir o editor em outra largura de janela mostra os campos no mesmo lugar relativo (screenshot em 1280 px e 1600 px).
- [ ] Tamanho padrão por tipo (regra 11.3). Campo arrastado para fora da página é empurrado para dentro (nunca grava `x + largura > 1`).
- [ ] Assinante sem nenhum campo `assinatura` num envelope com campos: o revisor mostra "{nome} não tem campo de assinatura. Ele vai assinar só no manifesto." e deixa enviar.
- [ ] O editor funciona com teclado (Tab entre campos, setas movem 1%) e mostra a mensagem "Use um computador para posicionar campos." abaixo de 768 px, com "Enviar sem campos" disponível.
- [ ] `PUT /api/painel/envelopes/{id}/campos` substitui todos os campos numa transação. Fora de `rascunho`, responde 409 `envelope_congelado`.

### 8.4 Revisar e enviar

**Objetivo:** congelar o documento e convidar.

**Fluxo:** tela de revisão (título, mensagem, destinatários na ordem, campos por pessoa, prazo e lembrete) → "Enviar para assinatura" → confirmação "Enviado." → detalhe do envelope.

- [ ] O envio, numa transação:
  1. revalida as regras 11.1–11.3 e os limites 11.12 e 11.20;
  2. calcula o `hash_original` do objeto no R2;
  3. aplica `rascunho → enviado`;
  4. preenche `enviado_em` e `prazo_em`;
  5. muda para `aguardando` os assinantes da vez (todos, ou só `ordem = 1` com `em_ordem`);
  6. registra os eventos `criado` (se ainda não houver) e `enviado` (com `hash_original` em `dados`);
  7. enfileira `as_notificacoes` `convite`.

  Os e-mails saem depois do commit.
- [ ] Destinatários `copia` não recebem convite. Recebem só o `concluido_destinatario`.
- [ ] Enviar duas vezes em paralelo resulta em um envio só (o segundo responde 409 `status_mudou`).
- [ ] Com o Resend falhando, o envelope fica `enviado`, a notificação fica `falhou`, o detalhe mostra a faixa laranja "Não consegui enviar o convite para {email}." com "Tentar de novo", e a faxina retenta (regra 11.16).
- [ ] O 31º envio do dia na mesma conta responde `limite_diario` (regra 11.12).
- [ ] Conta no nível 1 com 50 envelopes guardados: o 51º envio responde `limite_do_nivel` com a mensagem da seção 15; rascunhos continuam sendo criados; excluir um envelope libera a vaga (regra 11.20).
- [ ] A tela Conta e o topo da lista de envelopes mostram o uso "{n} de {limite} documentos · Nível {n}" (laranja a partir de 80%).

### 8.5 Assinatura (signatário)

**Objetivo:** do link à assinatura em até três passos.

**Fluxo:**
1. `/assinar/{token}` → cartão com remetente, título e "Enviar código para {e-mail mascarado}".
2. Código de 6 dígitos (campo com `autocomplete="one-time-code"`) → consentimento (caixa com o texto versionado, seção 15).
3. O documento aparece. Uma barra fixa mostra "Campos: 2 de 5" e o botão "Próximo campo". Tocar num campo de assinatura abre a folha "Sua assinatura" com as abas Digitar (nome em fonte cursiva, editável) e Desenhar (canvas, "Limpar"). Se for exigido, pede o CPF e a data de nascimento (8.14). "Assinar" → "Documento assinado."
4. Alternativa: "Recusar" com motivo obrigatório.

**Estados:**
- `pendente` em envelope em ordem: "Ainda não é a sua vez. Avisaremos por e-mail."
- Já assinou: "Você já assinou este documento.", com o status dos outros (só nomes).
- Envelope `recusado`, `cancelado` ou `expirado`: a frase da seção 15.
- `concluido`: "Documento concluído." com "Baixar documento assinado" (até 30 dias, regra 11.14).
- Token inválido: "Este link não é válido."

- [ ] O conteúdo do PDF não é servido antes do código: a URL assinada só é gerada depois da sessão de signatário (teste de rota).
- [ ] Código errado 5 vezes invalida o código atual: "Código bloqueado. Peça um novo." O 6º envio na mesma hora responde "Muitos códigos pedidos. Tente em uma hora." (regra 11.4).
- [ ] O evento `visualizou` é gravado uma vez por sessão de signatário, quando a primeira página é renderizada.
- [ ] "Assinar" fica desabilitado enquanto faltar campo obrigatório, CPF exigido (validado pelos dígitos verificadores), data de nascimento exigida (8.14) ou o consentimento.
- [ ] A assinatura grava, numa transação: valores dos campos, colunas de assinatura do signatário, `ip_assinatura`, `user_agent_assinatura`, status `assinou` e os eventos `consentiu` e `assinou`. O evento `assinou` leva `{"campos": n, "metodo": …}` em `dados`. Em seguida acontece uma de duas coisas: com `em_ordem`, o próximo passa a `aguardando` e recebe o convite; se for o último assinante, o envelope passa a `finalizando` (seção 12).
- [ ] Imagem desenhada maior que 200 KB ou que não é PNG é recusada no servidor.
- [ ] Recusar grava `recusou`, muda o envelope para `recusado`, avisa o remetente e os outros assinantes que já foram convidados (`recusado_destinatario`) e dispara o webhook `envelope.recusado`.
- [ ] Funciona em 375 px com o dedo: o canvas ocupa a largura toda e a rolagem da página trava enquanto se desenha.

### 8.6 Finalização, manifesto e selo

**Objetivo:** gerar o PDF final verificável.

- [ ] Ao entrar em `finalizando`, o servidor executa estes passos e, no fim, muda `finalizando → concluido`:
  1. carrega o original e confere que o SHA-256 bate com `hash_original` (se não bater: `integridade_violada`, alerta ao admin e o envelope não conclui);
  2. grava cada campo na posição (11.3);
  3. anexa o manifesto (11.9);
  4. sela (11.10);
  5. calcula o `hash_final`;
  6. sobe `final.pdf`;
  7. registra `finalizado` (`{"hash_final":…,"selo":…}`) e `concluido`;
  8. enfileira os e-mails `concluido_destinatario` (assinantes e cópias, com o PDF anexo se tiver até 7 MB, senão o link do signatário) e `concluido_remetente`;
  9. cria a entrega de webhook `envelope.concluido`.
- [ ] Abrir o `final.pdf` no Adobe Reader e no Preview mostra a assinatura de integridade da plataforma ("documento não foi modificado"). Com certificado autoassinado, a identidade aparece como desconhecida, o que é esperado (25.2).
- [ ] Alterar 1 byte do `final.pdf` faz a página de verificação responder "não encontrado" e o leitor de PDF acusar alteração.
- [ ] Com a TSA fora do ar (simulada), o selo sai `B-B` e o envelope conclui mesmo assim.
- [ ] Falha na finalização (exceção) mantém `finalizando` e incrementa `tentativas_finalizacao`, e a faxina retenta. Na 3ª falha, sai o e-mail `finalizacao_falhou_admin` para `ADMIN_EMAIL`.
- [ ] Um PDF de 100 páginas com 10 assinantes finaliza em menos de 20 s (critério de desempenho medido localmente e registrado no plano).

### 8.7 Painel: envelopes e detalhe

**Objetivo:** saber o que está pendente e agir.

- [ ] `/painel` lista os envelopes da conta, mais recentes primeiro, paginados de 30 em 30. Cada linha mostra título, status (pílula com a cor da seção 16), "2 de 3 assinaram" e data. Filtros: Todos, Aguardando, Concluídos, Rascunhos e Encerrados (recusado, cancelado ou expirado). Há busca por título ou e-mail de destinatário.
- [ ] Estados vazios da seção 15 por filtro, e esqueleto com a forma da lista enquanto carrega.
- [ ] O detalhe mostra:
  - o cabeçalho com título, status e código de verificação;
  - os destinatários com status, data e as ações "Lembrar" (11.5) e "Copiar link de assinatura";
  - a trilha em linha do tempo (data em Brasília, ator, ação e IP);
  - o selo "Trilha íntegra" ou "Trilha com divergência no evento {n}" (`as_fn_verifica_trilha`);
  - as ações Baixar original, Baixar assinado, Exportar trilha (CSV, seção 14), Cancelar e Excluir.
- [ ] "Copiar link de assinatura" **gera um token novo** para aquele signatário (o banco só tem o hash), invalida o anterior e registra `convite_enviado` com `{"canal":"link_copiado"}`. O aviso é "O link anterior deixa de funcionar."
- [ ] Cancelar pede um motivo opcional, aplica `enviado → cancelado`, registra o evento, avisa os já convidados (`cancelado_destinatario`) e dispara o webhook.
- [ ] Excluir pede para digitar o título e segue a seção 7.4.

### 8.8 Verificação pública

- [ ] `/verificar`: arrastar um PDF calcula o SHA-256 **no navegador** (Web Crypto) e chama `GET /api/verificar?hash=…`. O arquivo não é enviado.
- [ ] `/verificar/{codigo}` (o QR do manifesto aponta para cá) mostra o resumo da regra 11.11.
- [ ] O hash do original de um envelope concluído responde "Este é o documento original, antes das assinaturas.", com o resumo. O hash final responde "Documento assinado e íntegro."
- [ ] Um hash desconhecido responde "Não encontramos este documento. Ele pode ter sido alterado depois de assinado ou excluído pelo remetente."
- [ ] Limite de 30 consultas por minuto por IP (regra de firewall, documentada no README).

### 8.9 API REST v1 e webhooks

- [ ] As rotas da seção 13.2 funcionam com `Authorization: Bearer assina_…`. Chave ausente, revogada ou de conta suspensa → 401 `credencial_invalida`.
- [ ] `POST /api/v1/envelopes` com `Idempotency-Key` repetida devolve o mesmo envelope (200) sem criar outro.
- [ ] Fluxo completo por `curl` documentado no README: criar com `arquivo_url` **ou** upload pela `upload_url`, e depois enviar, consultar, receber o webhook e baixar o final.
- [ ] `arquivo_url` aceita só `https`, recusa IP privado ou de loopback (inclusive depois do DNS), segue no máximo 3 redirecionamentos, tem timeout de 10 s e recusa resposta maior que 10 MB (regra 11.18).
- [ ] O webhook sai com `Assina-Assinatura: t={epoch},v1={hmac}` (regra 11.17). O README traz um exemplo de verificação em Node.
- [ ] `GET /api/v1/openapi.json` válido (OpenAPI 3.1, conferido por um validador no teste), e `/docs/api` o mostra legível com os exemplos.
- [ ] A tela Integrações mostra a chave (mascarada, com "Mostrar" e "Copiar"), "Gerar nova chave" (com confirmação), a URL do webhook com "Enviar teste" e o segredo do webhook (mostrar e copiar).

### 8.10 MCP e OAuth

- [ ] O fluxo OAuth da seção 6.4 funciona no "Add custom connector" do Claude (claude.ai) e no ChatGPT (modo desenvolvedor). Roteiro manual no README, com prints.
- [ ] `/mcp` também aceita a chave de API como Bearer (Claude Code e Desktop por arquivo). A tela Integrações mostra os dois caminhos ("Pelo aplicativo" e "Por arquivo", com o JSON copiável).
- [ ] As ferramentas da seção 13.3 respondem e respeitam a regra 11.15: `criar_envelope` nunca envia, e `enviar_envelope` exige um rascunho com arquivo válido.
- [ ] A tela Integrações lista as conexões MCP (nome do cliente, criada em, último uso) com "Revogar". Um token revogado recebe 401 na próxima chamada.
- [ ] Código OAuth reutilizado → `invalid_grant`. PKCE errado → `invalid_grant`. `redirect_uri` diferente do registrado → `invalid_request` sem redirecionar.

### 8.11 Analytics (Visão do Produto)

- [ ] Os eventos da seção 21 saem do servidor, sem `await` no caminho do usuário (dispara e esquece, com timeout de 4 s), e nunca quebram um fluxo (teste com o ingest fora do ar).
- [ ] Nenhuma propriedade carrega título, nome, e-mail, CPF, mensagem, motivo, IP ou valor de campo (o tipo `PropriedadesDeEvento` é fechado, e há teste).
- [ ] O projeto "Assina" está criado no Visão do Produto com o prefixo `assina_`, e os eventos aparecem em Atividade.

### 8.12 Página inicial, páginas legais e proteções

- [ ] `/` sem sessão mostra a página inicial (o que é, "Entrar com Google", "Verificar um documento" e o rodapé Privacidade · Termos · Código aberto no GitHub · "Um produto DabLab"). Com sessão, vai para `/painel`.
- [ ] `/privacidade` e `/termos` completos em nome da DabLab (seção 20). Ficam indexáveis, junto com `/` e `/verificar`. O resto é `noindex`, e há um `robots.txt` real.
- [ ] Conta suspensa: a sessão e as credenciais deixam de valer (401), e os links de assinatura dos envelopes dela mostram "Este documento não está disponível." Reativar devolve tudo.
- [ ] `EMAILS_BLOQUEADOS`, `EMAILS_PERMITIDOS` e `CONTAS_NOVAS_POR_DIA` funcionam como no Reunião 8.10.
- [ ] Regras do Vercel Firewall documentadas no README: `/api/assinar/*` 20/min por IP, `/api/v1/*` e `/mcp` 120/min por IP, `/api/verificar` 30/min por IP.

### 8.13 Faxina diária, documentação e entrega

- [ ] `/api/cron/diario` (Bearer `CRON_SECRET`) faz, nesta ordem e de forma idempotente:
  1. expira envelopes vencidos (regra 11.7);
  2. manda lembretes (11.5);
  3. retenta finalizações (11.10);
  4. retenta notificações (11.16);
  5. retenta webhooks (11.17);
  6. expurga arquivos (11.14);
  7. apaga rascunhos abandonados (11.14);
  8. apaga códigos OAuth vencidos.

  Rodar duas vezes seguidas não reenvia nada.
- [ ] O teste da faxina limita-se às contas da fixture (`runDailyCleanup({ contaIds })`), como no Reunião.
- [ ] `DOCUMENTACAO-TECNICA.md`, `CLAUDE.md`, `README.md` (setup, variáveis, Google Cloud, Resend e DNS, geração do certificado do selo, firewall, conectar o MCP) e `THIRD_PARTY_NOTICES.md` (SignuDoc, MIT) completos. Arquivo `LICENSE` MIT.

### 8.14 Data de nascimento do assinante

Pedido de 20/11/2026, depois do lançamento (`plans/8.14-data-nascimento.md`).

- [ ] No editor, cada assinante tem "Pedir data de nascimento", separado de "Pedir CPF". Cópia nunca pede (check no banco).
- [ ] Na folha da assinatura, o campo "Data de nascimento" (seletor de data) aparece só quando exigido. "Usar esta assinatura" e "Assinar" ficam desabilitados com a data inválida ("Data de nascimento inválida.").
- [ ] Data válida: real, não futura e de no máximo 120 anos atrás, no dia de Brasília. O servidor (`isValidBirthdate`) e o banco (`as_fn_assina`, `nascimento_invalido`) conferem a mesma regra. Não exigida, a data enviada não é gravada.
- [ ] Depois do envio, `exigir_nascimento` não muda (`as_tg_filhos_congelados`).
- [ ] O manifesto mostra "Data de nascimento 15/03/1985", completa, abaixo do CPF.
- [ ] `exigir_nascimento` entra na API (`POST /envelopes`, OpenAPI) e no MCP (`criar_envelope`); `nascimento_exigido` no evento `assina_documento_assinado`.

---

## 9. Fluxos principais ponta a ponta

### 9.1 Envelope pelo painel, em ordem

1. O remetente cria o envelope, sobe `contrato.pdf`, adiciona Ana (ordem 1, CPF exigido), Bruno (ordem 2) e Carla (cópia) e liga "Assinar em ordem".
2. Posiciona os campos (assinatura e data para Ana; assinatura, rubrica e texto "Cargo" para Bruno) → revisa → envia.
3. Só Ana recebe o convite. Ela abre, recebe o código, consente, preenche, informa o CPF e assina.
4. Bruno recebe o convite e o remetente recebe "Ana assinou". Bruno assina.
5. O envelope vai a `finalizando`, e o PDF final é gerado e selado.
6. Ana, Bruno e Carla recebem o PDF final. O remetente recebe "Concluído". O webhook dispara, se houver.

### 9.2 Pela API, sem campos

1. `POST /api/v1/envelopes` com `arquivo_url`, dois signatários e `Idempotency-Key`. O envelope nasce `rascunho`, com o arquivo validado.
2. `POST /api/v1/envelopes/{id}/enviar`.
3. Os dois assinam (só no manifesto).
4. O webhook `envelope.concluido` chega ao sistema, que chama `GET /api/v1/envelopes/{id}/arquivo?versao=final` e baixa o PDF pela URL assinada.

### 9.3 Pelo Claude (MCP)

1. "Manda o contrato de prestação de serviços que está em {URL} para a Ana assinar."
2. O Claude chama `criar_envelope` (arquivo_url, Ana). A resposta traz o resumo do rascunho e o link do painel para posicionar campos, se ele quiser.
3. O Claude mostra o resumo e pergunta se pode enviar. Ao "sim", chama `enviar_envelope`.
4. Depois: "a Ana já assinou?" → `ver_envelope`.

### 9.4 Caminhos de exceção

- Signatário não recebe o código: "Reenviar código" (a partir de 60 s), e o remetente vê `codigo_enviado` na trilha.
- E-mail errado: o remetente cancela e manda um envelope novo com o e-mail certo (princípio 2). A seção 24 registra que não existe "corrigir destinatário".
- O signatário perdeu o e-mail: o remetente usa "Copiar link de assinatura" e manda por outro canal.
- O prazo vence com uma pessoa faltando: o envelope fica `expirado`, o remetente é avisado e as assinaturas feitas ficam na trilha, sem PDF final.
- Recusa: o envelope é encerrado, e reenviar exige um envelope novo.

---

## 10. Inventário de telas

| Tela | Rota | Perfil | O que mostra | Ações (L/E) | Tabelas |
|---|---|---|---|---|---|
| Página inicial | `/` | público | o que é, entrar, verificar, rodapé | L | — |
| Entrar | `/entrar` | público | botão Google, erros de acesso | — | `as_contas` (callback) |
| Boas-vindas | `/painel/boas-vindas` | remetente | nome, aceite dos Termos e da Privacidade | E | `as_contas` |
| [Remetente] Envelopes | `/painel` | remetente | lista, filtros, busca | L | `as_envelopes`, `as_signatarios` |
| [Remetente] Novo envelope | `/painel/envelopes/novo` e `/painel/envelopes/{id}/editar` | remetente | upload, título, mensagem, destinatários, ordem, prazo, lembrete | E | `as_envelopes`, `as_signatarios`, R2 |
| [Remetente] Posicionar campos | `/painel/envelopes/{id}/campos` | remetente | PDF com campos por assinante | E | `as_campos` |
| [Remetente] Revisar e enviar | `/painel/envelopes/{id}/revisar` | remetente | resumo final, avisos | E (enviar) | `as_envelopes`, `as_signatarios`, `as_eventos`, `as_notificacoes` |
| [Remetente] Detalhe do envelope | `/painel/envelopes/{id}` | remetente | status, destinatários, trilha, integridade, ações | L/E (lembrar, copiar link, cancelar, excluir, baixar, exportar) | todas as do envelope |
| [Remetente] Integrações | `/painel/integracoes` | remetente | chave de API, webhook, como conectar o Claude e o ChatGPT, conexões MCP | L/E | `as_credenciais`, `as_contas`, `as_entregas_webhook` |
| [Remetente] Conta | `/painel/conta` | remetente | nome, e-mail, nível e uso ("{n} de {limite} documentos"), sair, excluir conta | E | `as_contas`, `as_envelopes` (contagem) |
| [Signatário] Assinar | `/assinar/{token}` | signatário | identificação, código, consentimento, documento, campos, assinatura, recusa, estados finais | E | `as_signatarios`, `as_campos`, `as_eventos` |
| [Público] Verificar | `/verificar`, `/verificar/{codigo}` | público | arrastar PDF ou código, resultado | L | `as_envelopes`, `as_signatarios` |
| [Remetente] Verificar documento | `/painel/verificar` | remetente | o mesmo formulário, com o resultado do código na própria tela (desde a v0.18) | L | `as_envelopes`, `as_signatarios` |
| [Remetente] Autorizar conexão | `/oauth/autorizar` | remetente | cliente que pede acesso, o que poderá fazer, Permitir ou Cancelar | E | `as_oauth_codigos` |
| Documentação da API | `/docs/api` | público | OpenAPI legível, exemplos `curl`, webhooks | L | — |
| Privacidade, Termos | `/privacidade`, `/termos` | público | textos legais | L | — |

---

## 11. Regras de negócio

| # | Regra | Onde |
|---|---|---|
| **11.1** | **Arquivo aceito:** começa com `%PDF-`, até **10 MB** (10.485.760 bytes), de **1 a 100 páginas**, sem senha de abertura (pdf-lib carrega sem `ignoreEncryption`), com páginas de no máximo 1.440 × 1.440 pt. PDF que já tem assinatura digital é aceito, mas o revisor avisa "Este PDF já foi assinado eletronicamente. Essa assinatura deixa de valer depois das novas." (gravar campos reescreve o arquivo) | servidor (`src/server/pdf/validate.ts`) |
| **11.2** | **Destinatários:** de 1 a **10** assinantes e de 0 a **5** cópias. E-mail único por envelope. `ordem` de 1 a n sem buracos entre os assinantes (o servidor renumera ao salvar). O remetente pode ser um dos assinantes, com o próprio e-mail, e recebe convite como qualquer outro | servidor + índices 7.3 |
| **11.3** | **Campos:** tamanho padrão em fração da largura × altura de uma página A4 (convertido pela proporção da página): assinatura 0,30 × 0,06; rubrica 0,10 × 0,05; data 0,16 × 0,03; nome 0,30 × 0,03; texto 0,30 × 0,03; caixa 0,03 × 0,02. Gravação no PDF: assinatura e rubrica digitadas usam a fonte cursiva embutida (seção 16), centralizadas e reduzidas até caber; as desenhadas usam a imagem PNG preservando a proporção; data em `dd/mm/aaaa` de Brasília no momento da assinatura; nome = `as_signatarios.nome`; texto em Helvetica 10 pt, cortado em uma linha; caixa com ✓ ou vazia. Até **50 campos por assinante** | editor (cliente) + servidor ao gravar |
| **11.4** | **Código de acesso:** 6 dígitos (`crypto.randomInt`), válido por **10 min**, guardado como `sha256(signatario_id + código)`. **5** tentativas erradas invalidam o código. Reenvio só **60 s** depois do anterior, no máximo **5 códigos por hora** por signatário. Comparação em tempo constante. Pedir um código novo invalida o anterior. Cada envio grava o evento `codigo_enviado` (`{"para":"a***@dominio.com"}`), cada acerto `codigo_validado` e cada erro `codigo_recusado` (`{"tentativa":n}`) | servidor |
| **11.5** | **Lembretes:** com `lembrete_cada_dias = N`, a faxina manda lembrete a cada assinante `aguardando` cujo último contato (`notificado_em` ou `ultimo_lembrete_em`) tem N dias ou mais, até **10** lembretes. Lembrete manual: no máximo 1 a cada **24 h** por signatário ("Lembrete enviado há menos de 24 horas."). O lembrete perto do prazo sai normalmente e diz "Vence em {n} dias." | faxina + servidor |
| **11.6** | **Trilha encadeada:** `hash = sha256(hash_anterior ‖ "\n" ‖ canonico)`. O **canônico é em linhas** (v0.4, plano 8.1): `envelope_id`, `seq`, `tipo`, `ator`, `signatario_id`, `ip` (só o host), `user_agent`, `dados::text` e `ocorrido_em` em UTC no formato `AAAA-MM-DDTHH:MI:SS.ffffffZ`, unidos por `\n`, com nulo como texto vazio. `dados` entra como o texto que o próprio Postgres devolve, para o espelho em TypeScript não precisar reproduzir a ordem de chaves do jsonb (que é por tamanho e depois alfabética). O primeiro `hash_anterior` é 64 zeros. `ocorrido_em` vem de `clock_timestamp()`, para eventos da mesma transação terem horas distintas. Calculado **no banco** (`as_fn_registra_evento` + `as_fn_evento_canonico`, `pgcrypto.digest`). O espelho em TypeScript (`src/server/audit/chain.ts`) só confere e testa | banco |
| **11.7** | **Prazo:** `prazo_em = enviado_em + prazo_dias × 24 h`. A faxina diária muda para `expirado` todo envelope `enviado` com `prazo_em < now()`, registra `expirado`, avisa o remetente e dispara o webhook. Entre o vencimento e a faxina (até 24 h), o link do signatário já mostra "O prazo para assinar terminou." e o servidor recusa a assinatura (a checagem é por `prazo_em`, não pelo status) | servidor + faxina |
| **11.8** | **Chave de API:** uma ativa por conta, criada no primeiro login, formato `assina_` + 32 bytes em base64url (43 caracteres). Gerar uma nova revoga a anterior imediatamente. Seção 6.3 | servidor |
| **11.9** | **Manifesto de assinaturas** (páginas A4 anexadas ao fim do PDF): título "Manifesto de assinaturas"; título do envelope; nome e e-mail do remetente; código de verificação + QR para `{SITE}/verificar/{codigo}`; SHA-256 do original; enviado em e concluído em (Brasília, com "UTC−3"); por assinante: nome, e-mail mascarado (`a***@dominio.com`), CPF mascarado (`***.456.789-**`) se coletado, data de nascimento completa (`15/03/1985`) se coletada (8.14), assinatura (imagem ou nome em cursiva), "Autenticado por código enviado ao e-mail", IP, data e hora da assinatura; cópias: nome e e-mail mascarado; depois a **trilha completa** em tabela (data e hora, evento em português, quem, IP); rodapé com o texto legal da seção 15 e "Página X de Y do manifesto". O hash final não aparece no próprio arquivo (ele é calculado depois). Fica na página de verificação e no e-mail de conclusão. A Helvetica do PDF só tem os caracteres do WinAnsi: o que estiver fora vira o equivalente sem acento ("Ł" → "L", "−" → "-", então "UTC−3" sai "UTC-3") ou "?". **Selo de rodapé (emenda de 22/11/2026, pedido do Alexandre):** se algum assinante não tem campo de assinatura no documento (envelope do MCP, da API sem campos, ou campos só para outros), cada página do **original** ganha, no pé da página como ela é vista, a linha cinza 7 pt "Assinado eletronicamente por {nomes} em {data} · Código {código} · {site}/verificar" (nomes viram "Ana e mais N" e depois "N pessoas" se não couber); o manifesto não leva esse selo. O MCP avisa isso em `criar_envelope` e em `enviar_envelope` | servidor (`src/server/pdf/manifest.ts`, `src/server/pdf/stamp.ts`) |
| **11.10** | **Selo:** PAdES (`ETSI.CAdES.detached`), placeholder de 24 KB, motivo "Selo de integridade Assina", local "Brasil", com o certificado de `SELO_P12_BASE64`/`SELO_P12_SENHA`. Se `SELO_TSA_URL` existe, pede o carimbo do tempo RFC 3161 com timeout de **5 s**: se responder, `selo = 'B-T'`; se não, `'B-B'`, e o envelope conclui do mesmo jeito. Falha da finalização: até **3** tentativas (a do momento + 2 da faxina), depois alerta ao admin e o envelope continua `finalizando` até intervenção manual | servidor (`src/server/pdf/seal.ts`) |
| **11.11** | **Verificação:** `codigo_verificacao` de 12 caracteres base32 Crockford (sem I, L, O, U), único e gerado na criação. Consulta por hash ou código devolve só: status, título do envelope, enviado em, concluído em, nomes dos assinantes com data e hora da assinatura, tipo do selo e se o hash informado é o original ou o final. **Nunca** e-mail, CPF, data de nascimento, IP nem link de download. Envelopes `rascunho` não aparecem | servidor |
| **11.12** | **Proteções:** `CONTAS_NOVAS_POR_DIA` (padrão 50); **30 envelopes enviados por conta a cada 24 h**, em qualquer nível (anti-abuso, pelas três portas; contados em `as_envios`, que sobrevive à exclusão do envelope: cancelar e excluir não devolve a vaga do dia). O total guardado é a regra 11.20; conta suspensa = como inexistente; `EMAILS_BLOQUEADOS`/`EMAILS_PERMITIDOS` como no Reunião | servidor |
| **11.13** | **Volume-alvo do MVP** (base para o armazenamento): até 50 contas ativas, 1.000 envelopes por mês, PDF médio de 1 MB (original + final ≈ 2,2 MB), ou seja, cerca de 2,2 GB por mês de crescimento antes do expurgo. Ver o risco 23.1 | — |
| **11.14** | **Retenção:** concluídos ficam enquanto a conta existir. Recusados, cancelados e expirados têm os **arquivos** (original e imagens de assinatura) apagados **90 dias** depois de `encerrado_em`; a linha e a trilha ficam, e `arquivos_expurgados_em` é preenchido. Rascunhos sem atualização há **30 dias** são apagados por inteiro. O signatário baixa o final pelo link até **30 dias** depois de `concluido_em`; depois, "Peça o documento a {remetente}." | faxina |
| **11.15** | **MCP:** `criar_envelope` só cria `rascunho` (nunca envia no mesmo chamado). `enviar_envelope` é chamada separada, o que dá ao cliente a chance de pedir a confirmação da pessoa. O MCP não posiciona campos (ou vai sem campos ou devolve o link do editor), não exclui envelope e não mexe na chave nem no webhook | servidor MCP |
| **11.16** | **E-mails:** idempotentes pela `chave` (7.3). Até **5** tentativas: a imediata, mais as da faxina diária. O assunto e o corpo nunca trazem o conteúdo do documento, só o título dado pelo remetente. O código de acesso **não** é retentado pela faxina (expira antes), e a tela mostra "Não consegui enviar o código agora. Tente de novo em instantes." | servidor + faxina |
| **11.17** | **Webhooks:** eventos `signatario.assinou`, `envelope.concluido`, `envelope.recusado`, `envelope.cancelado`, `envelope.expirado`. `POST` JSON com timeout de 10 s. Sucesso é 2xx. Assinatura `Assina-Assinatura: t={epoch},v1={hex(hmac_sha256(segredo, t + "." + corpo))}`, mais os cabeçalhos `Assina-Entrega: {id}` e `Assina-Evento: {evento}`. Até **6** tentativas: a imediata, mais uma por execução diária da faxina. O corpo traz `{evento, envelope:{id, status, titulo, codigo_verificacao, concluido_em, hash_final}, signatario?:{id, email, assinado_em}, ocorrido_em}`, nunca o PDF | servidor + faxina |
| **11.18** | **`arquivo_url` (API e MCP):** só `https`. O host resolvido não pode ser privado, loopback, link-local nem metadado de nuvem (confere depois do DNS e em cada redirecionamento, no máximo 3). Timeout de 10 s, corta em 10 MB, `Content-Type` ignorado (vale o `%PDF-`). Grava no R2 e segue a regra 11.1 | servidor (`src/server/files/fetch-remote.ts`) |
| **11.19** | **Fuso:** tudo é gravado em UTC. Tela, e-mail e manifesto mostram `America/Sao_Paulo` com o rótulo "horário de Brasília". A API devolve ISO 8601 UTC | apresentação |
| **11.20** | **Níveis de conta:** nível 1 = **50**, nível 2 = **500**, nível 3 = **5.000** documentos guardados. "Documento guardado" = envelope da conta com `status <> 'rascunho'` que ainda existe (concluídos, em andamento e encerrados, inclusive os com arquivos já expurgados). Rascunhos não contam. Excluir um envelope libera a vaga. Toda conta nasce com `nivel = 1`. O envio que faria o total passar do limite é recusado com `limite_do_nivel`, conferido na mesma transação do envio (com `pg_advisory_xact_lock` pela conta, para dois envios paralelos não passarem juntos). Rebaixar o nível nunca apaga nada: a conta só deixa de enviar até voltar para baixo do limite. Os limites ficam em `src/lib/limits.ts` (`LIMITE_POR_NIVEL`), num lugar só. Mudar de nível no MVP: `update as_contas set nivel = …` pelo admin (sem tela) | servidor + banco (check) |

**O que não é automático:**
- não há "corrigir destinatário" nem "trocar arquivo" depois do envio;
- não há reenvio automático do convite a quem recusou;
- não há assinatura pelo remetente "em nome de";
- não há conversão de formato;
- não há OCR nem leitura do conteúdo do PDF.

---

## 12. Máquina de estado do envelope

```
rascunho ──enviar──▶ enviado ──último assinante assinou──▶ finalizando ──selado──▶ concluido
   │                   │  │  │
   │ excluir            │  │  └──prazo vencido (faxina)──▶ expirado
   ▼                   │  └────cancelar (remetente)─────▶ cancelado
 (apagado)             └───────recusar (signatário)─────▶ recusado
```

| De | Para | Quem | Condição | Efeitos |
|---|---|---|---|---|
| `rascunho` | `enviado` | remetente, API, MCP | regras 11.1–11.3 válidas, limites 11.12 e 11.20 | 8.4 |
| `enviado` | `finalizando` | sistema (dentro da transação do `assinou`) | todos os `assinar` estão `assinou` | inicia a 8.6 depois do commit |
| `finalizando` | `concluido` | sistema | PDF final gravado | e-mails e webhook |
| `enviado` | `recusado` | signatário | é a vez dele, dentro do prazo | e-mails e webhook |
| `enviado` | `cancelado` | remetente, API, MCP | — | e-mails e webhook |
| `enviado` | `expirado` | faxina | `prazo_em < now()` | e-mail ao remetente e webhook |

**Proibidas** (o servidor responde 409 `status_mudou` ou `envelope_congelado`):
- qualquer saída de `concluido`, `recusado`, `cancelado` ou `expirado`;
- `finalizando → cancelado`, porque as assinaturas já estão completas;
- voltar para `rascunho`;
- assinar com o envelope fora de `enviado` ou depois do `prazo_em`.

Toda transição usa `as_fn_transicao_envelope` (comparação com o status esperado), o que resolve a corrida "último assinante assina enquanto o remetente cancela": o primeiro a gravar vence, e o segundo recebe a mensagem "Este envelope mudou de situação. Atualize a página."

**Signatário:**

| De | Para | Condição |
|---|---|---|
| `pendente` | `aguardando` | envio (sem ordem) ou o anterior assinou |
| `aguardando` | `assinou` | 8.5 |
| `aguardando` | `recusou` | 8.5 |

`copia` fica em `pendente` para sempre. O status dela não aparece na tela, só "recebe cópia".

---

## 13. Contratos de API

### 13.1 Rotas internas (painel e signatário)

Ficam em `src/app/api/painel/*` e `src/app/api/assinar/[token]/*`, todas com `requireConta()` ou `requireSignatarioPorToken()` na primeira linha. As escritas do painel conferem `Origin = NEXT_PUBLIC_SITE_URL`.

| Método | Rota | O que faz |
|---|---|---|
| POST | `/api/painel/envelopes` | cria rascunho e devolve `upload_url` |
| PATCH | `/api/painel/envelopes/{id}` | título, mensagem, ordem, prazo, lembrete |
| POST | `/api/painel/envelopes/{id}/upload` | URL nova de upload para trocar o arquivo do rascunho (v0.5, épico 8.2) |
| POST | `/api/painel/envelopes/{id}/arquivo` | valida o arquivo enviado em `upload.pdf` (11.1) e só então o promove a `original.pdf`; arquivo inválido não destrói o anterior |
| PUT | `/api/painel/envelopes/{id}/signatarios` | substitui a lista (rascunho) |
| PUT | `/api/painel/envelopes/{id}/campos` | substitui os campos (rascunho) |
| POST | `/api/painel/envelopes/{id}/enviar` · `/cancelar` · `/signatarios/{sid}/lembrar` · `/signatarios/{sid}/link` | ações |
| POST | `/api/painel/envelopes/{id}/signatarios/{sid}/convite` | "Tentar de novo" do convite que falhou (v0.7, épico 8.4): reenvia com link novo; o anterior deixa de valer |
| GET | `/api/painel/envelopes/{id}/arquivo?versao=original\|final` | 302 para URL assinada de 5 min, e registra `baixou_*` |
| GET | `/api/painel/envelopes/{id}/trilha.csv` | seção 14 |
| DELETE | `/api/painel/envelopes/{id}` | 7.4 |
| POST | `/api/painel/integracoes/chave` · `/webhook` · `/webhook/teste` · `/conexoes/{id}/revogar` | Integrações |
| POST | `/api/painel/integracoes/revelar` | v0.12: devolve a chave de API ou o segredo do webhook em claro, só quando a pessoa pede ("Mostrar"/"Copiar"); o HTML da tela leva só o prefixo |
| POST | `/api/painel/conta/boas-vindas` · `/api/painel/conta/excluir` | Conta |
| POST | `/api/assinar/{token}/codigo` · `/validar` · `/visualizou` · `/assinar` · `/recusar` | signatário |
| GET | `/api/assinar/{token}/documento` | URL assinada de 5 min (exige sessão de signatário) |
| GET | `/api/final/{signatario_id}.{hmac}` | link do e-mail de conclusão acima de 7 MB (épico 8.6): baixa só o PDF final, até 30 dias depois de `concluido_em` (11.14), registra `baixou_final`; HMAC-SHA256 do id com `CHAVES_ENC_KEY`. Não usa `requireSignatarioPorToken`: o link de assinatura não pode ser repetido no e-mail (o banco só tem o hash), e trocá-lo derrubaria a sessão de quem acabou de assinar |
| GET | `/api/verificar?hash=` · `/api/verificar?codigo=` | público |

### 13.2 API REST pública v1

Base `{SITE}/api/v1`, autenticada por `Authorization: Bearer assina_…`, com JSON UTF-8 e campos em português (iguais ao banco). Os erros seguem o formato `{"codigo":"…","mensagem":"…"}`.

| Método | Rota | Entrada | Saída |
|---|---|---|---|
| POST | `/envelopes` | `{titulo, mensagem?, em_ordem?, prazo_dias?, lembrete_cada_dias?, arquivo_url?, nome_arquivo?, signatarios:[{nome, email, papel?, ordem?, exigir_cpf?, exigir_nascimento?}], campos?:[{signatario_email, tipo, pagina, x, y, largura?, altura?, obrigatorio?, rotulo?}]}` + cabeçalho `Idempotency-Key` opcional | `201 {envelope, upload_url?}`. Sem `arquivo_url`, devolve `upload_url` (PUT do PDF, 2 h) e espera `POST /envelopes/{id}/arquivo` |
| POST | `/envelopes/{id}/arquivo` | — | `200 {envelope}` depois da validação 11.1 |
| POST | `/envelopes/{id}/enviar` | — | `200 {envelope}` |
| GET | `/envelopes?status=&limite=&cursor=` | `limite` 1–100 (padrão 20), cursor opaco | `{envelopes, proximo_cursor}` |
| GET | `/envelopes/{id}` | — | `{envelope, signatarios:[{id, nome, email, papel, ordem, status, assinado_em, recusado_em, motivo_recusa}]}` |
| GET | `/envelopes/{id}/eventos` | — | trilha com `seq`, `tipo`, `ator`, `signatario_id`, `ip`, `ocorrido_em`, `hash` |
| GET | `/envelopes/{id}/arquivo?versao=original\|final` | — | `{url, expira_em}` (5 min) |
| POST | `/envelopes/{id}/cancelar` | `{motivo?}` | `{envelope}` |
| POST | `/envelopes/{id}/lembrar` | `{signatario_id?}` (sem ele, todos os `aguardando`) | `{lembrados: n}` |
| DELETE | `/envelopes/{id}` | — | `204`; só `rascunho` (`409 envelope_nao_e_rascunho` fora disso) |
| GET | `/openapi.json` | — | OpenAPI 3.1 (sem autenticação) |

Códigos de erro, com o status HTTP:
- `400`: `dados_invalidos` (com `campos:[{campo, motivo}]`) e `arquivo_invalido` (com `motivo`: `nao_e_pdf`, `grande_demais`, `paginas_demais`, `protegido_por_senha`, `pagina_grande_demais`, `url_recusada`, `download_falhou`);
- `401`: `credencial_invalida`;
- `404`: `nao_encontrado` (inclusive quando o envelope é de outra conta);
- `409`: `status_mudou`, `envelope_congelado`, `envelope_nao_e_rascunho`;
- `429`: `limite_diario` e `limite_do_nivel` (com `limite` e `usados` no corpo);
- `500`: `erro_interno` (sem detalhe).

Idempotência: `Idempotency-Key` (1–100 caracteres) gravada em `chave_idempotencia`. Repetir a mesma chave devolve o mesmo envelope com `200`.

### 13.3 Ferramentas do MCP

Endpoint `{SITE}/mcp`, Streamable HTTP. Bearer = token OAuth `assina_mcp_…` ou chave `assina_…`. As respostas são texto em português com os dados estruturados também em `structuredContent`.

| Ferramenta | Parâmetros | Faz |
|---|---|---|
| `listar_envelopes` | `status?` (um do enum ou `pendentes` = `enviado`), `busca?`, `limite?` (padrão 20, máx. 50) | Lista com título, status, "n de m assinaram", datas e id |
| `ver_envelope` | `id` | Status por destinatário, prazo, link do painel e os últimos 20 eventos da trilha em português |
| `criar_envelope` | `titulo`, `signatarios[]` (`nome`, `email`, `papel?`, `ordem?`, `exigir_cpf?`, `exigir_nascimento?`), `arquivo_url?`, `mensagem?`, `em_ordem?`, `prazo_dias?` | Cria `rascunho` (regra 11.15). Sem `arquivo_url`, devolve o link `/painel/envelopes/{id}/editar` para a pessoa anexar o PDF. Com ele, valida (11.1, 11.18). Sempre termina dizendo que o envelope **não foi enviado** |
| `enviar_envelope` | `id` | `rascunho → enviado` (8.4). A descrição da ferramenta instrui a confirmar com a pessoa antes |
| `lembrar_signatarios` | `id`, `email?` | Lembrete manual (11.5) |
| `cancelar_envelope` | `id`, `motivo?` | `enviado → cancelado` |
| `link_do_documento` | `id`, `versao` (`original`/`final`) | URL assinada de 5 min |

Anotações MCP: `readOnlyHint: true` nas de leitura e `destructiveHint: true` em `cancelar_envelope`. Os eventos da trilha registram `ator = 'mcp'`.

---

## 14. Relatórios e exportação

**Trilha em CSV** (`/api/painel/envelopes/{id}/trilha.csv`): nome do arquivo `trilha-{codigo_verificacao}.csv`, UTF-8 **com BOM**, separador `;`, uma linha por evento, nesta ordem de colunas:

| Coluna | Formato |
|---|---|
| `seq` | inteiro |
| `data_hora_brasilia` | `dd/mm/aaaa hh:mm:ss` |
| `data_hora_utc` | ISO 8601 |
| `evento` | rótulo em português (seção 15.3) |
| `ator` | `Remetente` / `Signatário` / `Sistema` / `API` / `MCP` |
| `pessoa` | nome do signatário ou vazio |
| `email` | e-mail completo do signatário ou vazio (o remetente é o controlador e já tem esse dado) |
| `ip` | texto ou vazio |
| `navegador` | user agent ou vazio |
| `detalhes` | `dados` em JSON compacto |
| `hash` | SHA-256 hex |

Não há outra exportação no MVP. A lista de envelopes não exporta.

---

## 15. Copy e tom de voz

O tom é direto, cordial, sem exclamação e sem jargão jurídico além do necessário. Este é o conteúdo **final**, centralizado em `src/lib/copy.ts`.

### 15.1 Telas

| Onde | Texto |
|---|---|
| Página inicial, título | "Mande documentos para assinar." |
| Página inicial, subtítulo | "Suba um PDF, diga quem assina e receba de volta o documento assinado, com a trilha de auditoria. Grátis." |
| Página inicial, botões | "Entrar com Google" · "Verificar um documento" |
| Página inicial, aviso (em `LEGAL_NEGATIVAS`) | "Para escrituras e atos que exigem certificado ICP-Brasil, use um cartório ou certificado próprio." |
| Rodapé | "Privacidade · Termos · Código aberto no GitHub · Um produto DabLab" |
| Entrar, erros | "Este e-mail não tem acesso." / "Esta conta está suspensa." / "Cadastros pausados por hoje. Tente amanhã." |
| Boas-vindas | "Boas-vindas ao Assina." / "Li e aceito os Termos de uso e a Política de privacidade." / "Continuar" |
| Menu | grupos **Documentos** (Envelopes, Novo envelope) e **Configurar** (Integrações, Conta) |
| Envelopes, título e botão | "Envelopes" · "Novo envelope" |
| Filtros | "Todos", "Aguardando", "Concluídos", "Rascunhos", "Encerrados" |
| Vazio (Todos) | "Nenhum envelope ainda." / "Mandar o primeiro" |
| Vazio (filtro) | "Nada por aqui." |
| Progresso na lista | "{n} de {m} assinaram" |
| Status do envelope | `rascunho` "Rascunho" · `enviado` "Aguardando" · `finalizando` "Finalizando" · `concluido` "Concluído" · `recusado` "Recusado" · `cancelado` "Cancelado" · `expirado` "Expirado" |
| Status do signatário | "Aguardando a vez" · "Aguardando" · "Assinou em {data}" · "Recusou em {data}" · "Recebe cópia" |
| Upload | "Arraste o PDF aqui ou escolha um arquivo" / "Até 10 MB e 100 páginas." |
| Erros de arquivo | "Isso não é um PDF." / "O arquivo passa de 10 MB." / "O PDF tem mais de 100 páginas." / "Este PDF está protegido por senha. Tire a senha e tente de novo." / "As páginas deste PDF são grandes demais (máximo de 50 × 50 cm)." / "Não consegui baixar o arquivo desse endereço." |
| Rascunho, campos (v0.5) | "Título" · "Mensagem (opcional)" · "Nome" · "E-mail" · "Trocar" · "Remover" · "Subir" / "Descer" (rótulos de acessibilidade da ordem) · "Enviando o arquivo… {n}%" · "Conferindo o arquivo…" |
| Rascunho, salvamento (v0.5) | "Salvando…" / "Rascunho salvo." / "Não consegui salvar. Tente de novo." |
| Arquivo já assinado (v0.5, regra 11.1) | "Este PDF já foi assinado eletronicamente. Essa assinatura deixa de valer depois das novas." |
| Destinatários | "Quem recebe" · "Adicionar pessoa" · "Assina" / "Recebe cópia" · "Pedir CPF" · "Pedir data de nascimento" · "Assinar em ordem" |
| Erros de destinatário | "Esse e-mail já está na lista." / "Até 10 pessoas assinam um documento." / "Adicione pelo menos uma pessoa para assinar." |
| Configurações | "Prazo para assinar" ("{n} dias") · "Lembrete automático" ("A cada 2 dias", "A cada 3 dias", "A cada 7 dias", "Sem lembrete") |
| Botões do rascunho | "Próximo: posicionar campos" · "Enviar sem campos" |
| Editor | "Campos de {nome}" · "Assinatura", "Rubrica", "Data", "Nome", "Texto", "Caixa de seleção" · "Obrigatório" · "Dica para quem preenche" · "Salvar e revisar" |
| Editor, documento (v0.6) | "Voltar" · "Carregando o documento…" / "Não consegui abrir o documento. Tente de novo." · "Arraste um campo para a página ou toque nele para pôr na página à vista." · "Página {n} de {total}" · "Tentar de novo" · "Setas movem o campo, Shift e setas mudam o tamanho, Delete apaga." (instrução para leitor de tela) |
| Editor no celular | "Use um computador para posicionar campos." |
| Revisar | "Revise antes de enviar" · "{nome} não tem campo de assinatura. Ele vai assinar só no manifesto." · "Depois de enviado, o documento não pode ser alterado." · "Enviar para assinatura" |
| Revisar, resumo (v0.7) | "Mensagem" · "Sem mensagem" · "1 campo" / "{n} campos" / "Sem campos (assina no manifesto)" · "Editar" |
| Uso do nível (v0.7, regra 11.20) | "{n} de {limite} documentos · Nível {n}" |
| Detalhe (v0.7) | "Código de verificação" · "Ver envelope" (botão dos e-mails de aviso ao remetente, v0.8) |
| Enviado | "Enviado." |
| Faixa de e-mail que falhou | "Não consegui enviar o convite para {email}." / "Tentar de novo" |
| Detalhe, ações | "Lembrar" · "Copiar link de assinatura" → "Link copiado. O link anterior deixa de funcionar." · "Baixar original" · "Baixar assinado" · "Exportar trilha" · "Cancelar envelope" · "Excluir" |
| Lista e detalhe, extras (v0.10, épico 8.7) | "Buscar por título ou e-mail" · "Buscar" · "Abrir" · "criado em {data}" / "enviado em {data}" · "Anterior" · "Próxima" · "Página {n} de {total}" · "Envelope excluído." · "Lembrete enviado." · "Este destinatário já recebeu 10 lembretes." · "Copie o link abaixo. O link anterior deixa de funcionar." (sem permissão de área de transferência) · "Trilha de auditoria" · "Voltar" · "O título não confere." · "Motivo: {motivo}" · atores da trilha "Remetente", "Signatário", "Sistema", "API", "MCP" |
| Lembrete limitado | "Lembrete enviado há menos de 24 horas." |
| Integridade da trilha | "Trilha íntegra" / "Trilha com divergência no evento {n}" |
| Cancelar | "Cancelar este envelope?" / "Quem ainda não assinou não vai mais conseguir. Motivo (opcional)" / "Cancelar envelope" |
| Excluir | "Excluir para sempre?" / "O documento, as assinaturas e a trilha serão apagados. A verificação deixa de encontrá-lo. Para confirmar, digite o título." |
| Mudou de situação | "Este envelope mudou de situação. Atualize a página." |
| Limites | "Você chegou ao limite de 30 envelopes em 24 horas." / "Você chegou ao limite de {limite} documentos do seu nível. Exclua envelopes antigos para liberar espaço." |
| Integrações | "Chave de API" · "Mostrar" · "Copiar" · "Gerar nova chave" → "A chave atual para de funcionar na hora. Continuar?" · "Webhook" · "Enviar teste" · "Segredo do webhook" · "Conectar ao Claude ou ao ChatGPT" · "Pelo aplicativo" · "Por arquivo" · "Conexões autorizadas" · "Revogar" · "Nenhuma conexão ainda." |
| Autorizar conexão | "{cliente} quer acessar seu Assina." / "Vai poder: ver seus envelopes, criar rascunhos, enviar, lembrar e cancelar envelopes." / "Não vai poder: excluir envelopes nem ver sua chave de API." / "Permitir" · "Cancelar" |
| Conta | "Sair" · "Excluir minha conta" → "Excluir minha conta?" / "Todos os envelopes, documentos e trilhas serão apagados. Baixe o que precisar antes. Para confirmar, digite seu e-mail." / "Excluir conta" · "Voltar"; e-mail que não confere: "O e-mail não confere." |
| **Signatário**, identificação | "{remetente} enviou um documento para você assinar." / "{título}" / "Para abrir, vamos mandar um código para {e-mail mascarado}." / "Enviar código" |
| Código | "Digite o código de 6 dígitos" · "Reenviar código" ("Reenviar em {s} s") · "Código errado. Restam {n} tentativas." · "Código bloqueado. Peça um novo." · "Código expirado. Peça um novo." · "Muitos códigos pedidos. Tente em uma hora." · "Não consegui enviar o código agora. Tente de novo em instantes." |
| Consentimento (versão `2026-11-17`) | "Concordo em assinar este documento eletronicamente. Entendo que minha assinatura será registrada com meu nome, e-mail, endereço IP, data e hora, e que tem validade jurídica entre as partes que aceitam este meio, nos termos do art. 10, § 2º, da MP 2.200-2/2001." |
| Leitura | "Campos: {n} de {m}" · "Próximo campo" · "Assinar" · "Recusar" |
| Folha da assinatura | "Sua assinatura" · "Digitar" · "Desenhar" · "Limpar" · "CPF" · "Data de nascimento" · "Usar esta assinatura" |
| Signatário, extras (v0.8) | "Sua rubrica" (folha da rubrica) · "Continuar" (depois do código e do consentimento) · "Confirmar" (campo de texto) |
| CPF inválido | "CPF inválido." |
| Data de nascimento inválida (8.14) | "Data de nascimento inválida." |
| Assinado | "Documento assinado." / "Quando todos assinarem, você recebe o documento final por e-mail." |
| Recusar | "Recusar este documento?" / "Conte o motivo para {remetente}." / "Recusar" |
| Recusado | "Você recusou este documento. Avisamos {remetente}." |
| Estados | "Ainda não é a sua vez. Avisaremos por e-mail." · "Você já assinou este documento." · "Este documento foi recusado por {nome}." · "Este documento foi cancelado por {remetente}." · "O prazo para assinar terminou." · "Documento concluído." / "Baixar documento assinado" · "Peça o documento a {remetente}." · "Este link não é válido." · "Este documento não está disponível." |
| **Verificar** | "Verificar um documento" / "Confira se um documento assinado pelo Assina é autêntico e se não foi alterado depois das assinaturas. Arraste o PDF ou digite o código que aparece no manifesto. O arquivo não sai do seu computador." · "Documento assinado e íntegro." + "Este arquivo é exatamente o que o Assina selou: nada foi alterado depois das assinaturas." · pelo código: "Este código é de um envelope do Assina." + "Para conferir se o seu PDF é exatamente o assinado, arraste o arquivo na verificação." · "Este é o documento original, antes das assinaturas." · "Não encontramos este documento. Ele pode ter sido alterado depois de assinado ou excluído pelo remetente." · "Este envelope ainda não foi concluído." |
| Verificar, extras (v0.11, épico 8.8) | "Arraste o PDF aqui ou escolha um arquivo" · "Conferindo o arquivo…" · "ou" · "Código de verificação" · "Verificar" · "Este código não é válido. Ele tem 12 letras e números." · "Não consegui ler este arquivo. Tente de novo." · "Verificar outro documento" · "Enviado em" · "Concluído em" · "Selo" ("Selo da plataforma" / "Selo da plataforma, com carimbo do tempo") · "Assinantes" · "Assinou em {data}" / "Não assinou" · "Este PDF original foi enviado em mais de um envelope. Para ver o resumo, digite o código que aparece no manifesto do documento assinado." · "Horário de Brasília." |
| Integrações e /docs/api, extras (v0.12, épico 8.9) | "Use no cabeçalho Authorization: Bearer da API REST." · "Ocultar" · "Copiado." · "Chave nova gerada. A anterior já não funciona." · "Cancelar" / "Continuar" (confirmação) · "URL do webhook" · "Salvar" / "Webhook salvo." · "Remover" / "Webhook removido." · "Use um endereço https público." · "O teste chegou (HTTP {n})." / "O teste não foi aceito (HTTP {n})." / "O teste não chegou: sem resposta em 10 segundos." · "Confira o cabeçalho Assina-Assinatura com este segredo." · "Documentação da API" · página "API do Assina" (`copy.docs`) e as mensagens dos erros da API (`copy.api.errors`) |
| Autorizar e MCP, extras (v0.13, épico 8.10) | "Você está conectando a conta {e-mail}." · "Depois, você volta para {host}." · "Este pedido de conexão não é válido." / "Volte ao aplicativo e tente conectar de novo." · Integrações: "Conectar ao Claude ou ao ChatGPT", "Pelo aplicativo" e "Por arquivo" com as instruções, "Criada em {data}" · "último uso em {data}" / "nunca usada", "Conexão revogada." · títulos, descrições e respostas das ferramentas em `copy.mcpTools` (ex.: "O envelope não foi enviado. Para enviar, use enviar_envelope depois de confirmar com a pessoa.") |
| Erro genérico | "Algo deu errado. Nada foi alterado. Tente de novo." |
| Texto legal do manifesto | "Documento assinado eletronicamente pela plataforma Assina (DabLab). As assinaturas acima foram feitas por pessoas que comprovaram o acesso ao próprio e-mail por código de uso único, nos termos do art. 10, § 2º, da Medida Provisória 2.200-2/2001. A integridade deste arquivo é protegida por selo eletrônico da plataforma e pode ser conferida em {SITE}/verificar." |

### 15.2 E-mails

O remetente técnico é `naoresponda@assina.app.br`, com nome de exibição "{remetente} via Assina". O `reply-to` é o e-mail do remetente do envelope.

| Tipo | Assunto | Corpo (essência) |
|---|---|---|
| `convite` | "{remetente} enviou um documento para você assinar: {título}" | mensagem do remetente (se houver), botão "Revisar e assinar", prazo "Assine até {data}." |
| `codigo` | "Seu código: {código}" | "Use o código {código} para abrir o documento de {remetente}. Ele vale por 10 minutos. Se não foi você, ignore este e-mail." |
| `lembrete` | "Lembrete: {título} aguarda sua assinatura" | "Vence em {n} dias." (no singular, "Vence em 1 dia."; no último dia, "Assine até {data}.") e o botão "Revisar e assinar" com um link novo |
| `assinou_remetente` | "{nome} assinou {título}" | progresso "{n} de {m}" |
| `concluido_destinatario` | "Concluído: {título}" | PDF anexo (ou botão "Baixar documento assinado"), código de verificação, SHA-256 final |
| `concluido_remetente` | "Concluído: {título}" | idem, com o link do detalhe |
| `recusado_remetente` | "{nome} recusou {título}" | motivo |
| `recusado_destinatario` | "{título} foi recusado" | "Não é mais preciso assinar." |
| `cancelado_destinatario` | "{título} foi cancelado" | motivo, se houver. Texto (v0.10): "Não é mais preciso assinar." e "Motivo: {motivo}" |
| `expirado_remetente` | "Prazo encerrado: {título}" | quem assinou e quem não assinou (v0.16): "Assinaram: {nomes}." (ou "Ninguém assinou.") e "Não assinaram: {nomes}.", botão "Ver envelope" |
| `finalizacao_falhou_admin` | "[Assina] Finalização falhou 3 vezes" | id do envelope e erro técnico, sem dado pessoal |

Textos do e-mail de conclusão (épico 8.6): título "{título} foi assinado por todos."; com anexo, "O documento assinado está anexo."; as linhas "Código de verificação: {código}" e "SHA-256 do documento assinado: {hash}"; e "Confira em {SITE}/verificar.". O botão do remetente é "Ver envelope". Sem anexo (acima de 7 MB), o botão do destinatário "Baixar documento assinado" leva a `/api/final/{signatario_id}.{hmac}`. Os e-mails da própria plataforma (avisos ao remetente e alerta ao admin) saem com o nome "Assina", sem "via". O do alerta ao admin diz "Envelope {id}", "Erro: {código}" e "O envelope continua em finalizando até intervenção manual.".

### 15.3 Rótulos dos eventos da trilha

| Evento | Rótulo |
|---|---|
| `criado` | "Envelope criado" |
| `enviado` | "Enviado para assinatura" |
| `convite_enviado` | "Convite enviado" |
| `codigo_enviado` | "Código de acesso enviado" |
| `codigo_validado` | "Código de acesso confirmado" |
| `codigo_recusado` | "Código de acesso incorreto" |
| `visualizou` | "Documento aberto" |
| `consentiu` | "Concordou em assinar eletronicamente" |
| `assinou` | "Assinou" |
| `recusou` | "Recusou" |
| `lembrete_enviado` | "Lembrete enviado" |
| `finalizado` | "Documento final gerado e selado" |
| `concluido` | "Concluído" |
| `cancelado` | "Cancelado" |
| `expirado` | "Prazo encerrado" |
| `baixou_original` | "Original baixado" |
| `baixou_final` | "Documento assinado baixado" |

**Palavras proibidas** como afirmação sobre o Assina (princípio 4 e hook do Anexo B): "certificado digital", "ICP-Brasil", "assinatura qualificada", "assinatura digital", "firma reconhecida", "100% válido" e "validade garantida". A única exceção são os textos que explicam (o aviso da página inicial e trechos de `/termos` e `/privacidade`) o que o Assina **não** é. Eles ficam na lista `LEGAL_NEGATIVAS` de `copy.ts`, ignorada pelo hook.

---

## 16. Direção visual

**Referência:** o Reunião (`reuniao.app.br`, seção 16 do spec dele) e o print do painel que o Alexandre mandou em 17/11/2026. **É a mesma família visual**, para que o Assina seja reconhecido como app dele. Os valores abaixo são os do Reunião, e o agente confere no código do `~/minha-agenda` (`src/app/globals.css`) antes de inventar.

- **Tipografia:** pilha de sistema `-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", sans-serif`. Títulos de página grandes e pesados (cerca de 34 px, peso 700, tracking negativo), como "Tipos de evento" no print. Datas e contadores com `tabular-nums`.
- **Cor de marca:** azul `#0071e3` (claro) e `#0a84ff` (escuro) como único destaque: botões primários em **pílula** com ícone "+" ("+ Novo envelope", canto superior direito do título, como "+ Novo tipo"), links ("Ver documento"), item ativo do menu e foco. O azul nunca indica status.
- **Superfícies:** fundo branco ou preto; menu lateral e linhas de lista em cinza `#f5f5f7` / `#1c1c1e`; texto secundário `#6e6e73` / `#98989d`.
- **Cores semânticas** (só com significado; as pílulas de status usam fundo da cor a 12% e texto na cor):
  - verde `#34c759`/`#30d158` = Concluído ou Assinou;
  - laranja `#ff9500`/`#ff9f0a` = Aguardando ou atenção (e-mail que falhou, prazo em menos de 3 dias);
  - vermelho `#ff3b30`/`#ff453a` = Recusado, Cancelado, erro ou trilha com divergência;
  - cinza `#8e8e93` = Rascunho ou Expirado;
  - azul-acinzentado neutro = Finalizando.
- **Lista de envelopes:** como a lista de "Tipos de evento" do print. Cada envelope é um **cartão cinza de cantos de 16–18 px, sem borda**, com título em semibold, linha de baixo secundária ("3 assinantes · enviado em 12/11") e, à direita, a pílula de status e as ações em botões brancos em pílula ("Copiar link", ícone de abrir). Espaço de 12 px entre os cartões.
- **Navegação do painel:** **menu lateral estilo App Store Connect**, igual ao do Reunião no print:
  - fundo cinza claro e nome do produto "Assina" no topo em negrito;
  - grupos com título em **negrito escuro**, caixa normal (**Documentos**: Envelopes, Novo envelope; **Configurar**: Integrações, Conta);
  - itens indentados sem marcador e hairline entre os grupos;
  - **um item ativo por vez**, em azul `#0071e3` com pílula azul clara ao fundo;
  - "Verificar documento" é item de Documentos e abre `/painel/verificar` (v0.18; antes ficava no rodapé);
  - rodapé separado por hairline, com nome e e-mail da conta;
  - Sair dentro de Conta.

  Abaixo de 1024 px, o menu vira gaveta.
- **Página do signatário:** uma coluna. O cartão de identificação é centralizado (máx. 440 px) com o nome do remetente em destaque. O documento ocupa a largura toda, com páginas em fundo cinza e sombra mínima. A barra inferior é fixa (altura 64 px + área segura) com o progresso e o botão primário azul. Os campos a preencher têm contorno tracejado na cor do signatário. Os já preenchidos ficam com fundo verde claro.
- **Cores dos signatários no editor** (10, na ordem, distintas do azul de marca): `#af52de`, `#ff9500`, `#30b0c7`, `#ff2d55`, `#a2845e`, `#34c759`, `#5856d6`, `#ffcc00`, `#00c7be`, `#8e8e93`.
- **Fonte da assinatura digitada:** uma cursiva de licença OFL embutida no PDF (sugestão: "Dancing Script" ou "Caveat"). A escolha final é do agente, que registra a licença em `THIRD_PARTY_NOTICES.md`.
- **Manifesto (PDF):** branco, Helvetica, título 18 pt, hairlines cinza, a "marca" é só o texto "Assina" em azul `#0071e3` no cabeçalho e o QR à direita.
- **Modo escuro:** obrigatório, seguindo o sistema, no painel, na página do signatário e na verificação (o PDF continua branco).
- **E-mails:** HTML simples, fundo branco, título grande, botão azul em pílula, rodapé discreto "Enviado pelo Assina, um produto DabLab", com versão em texto puro junto.
- **Livre para o agente:** ícones (traço fino, lucide), microanimações discretas, ilustração da página inicial (se houver, mínima) e o desenho exato do canvas de assinatura.

---

## 17. Requisitos não-funcionais

| Item | Alvo |
|---|---|
| Página do signatário até o botão "Enviar código" | < 1,5 s em 4G (p75) |
| Primeira página do PDF renderizada depois do código | < 3 s para um PDF de 2 MB em 4G |
| `POST …/assinar` (sem finalização) | < 1 s típico |
| Finalização (8.6) | < 20 s para 100 páginas e 10 assinantes; função com `maxDuration` de 60 s |
| Volume | regra 11.13 |
| Navegadores | Safari iOS 17+, Chrome Android atual, Safari/Chrome/Edge/Firefox desktop atuais |
| Acessibilidade | contraste AA, toque ≥ 44 px, foco visível, canvas de assinatura sempre com a alternativa "Digitar" (quem não consegue desenhar consegue assinar), campos do PDF navegáveis por Tab com `aria-label` ("Assinatura de Ana, obrigatório") |
| Idioma | pt-BR; datas "17 de novembro de 2026", 24 h |
| Offline | não suportado |
| SEO | indexáveis: `/`, `/verificar`, `/docs/api`, `/privacidade`, `/termos` (também no `sitemap.xml`). Todo o resto `noindex`. O `robots.txt` bloqueia `/painel`, `/assinar/`, `/api/`, `/oauth/`, `/mcp`, `/entrar` e `/sair` |
| Segurança de cabeçalhos | `Content-Security-Policy` restritiva (sem `unsafe-eval`, exceto o worker do pdf.js por `worker-src blob:` se necessário), `X-Frame-Options: DENY` em tudo, menos onde o MCP Apps pedir (não há no MVP). v0.16: a CSP segue o modelo "sem nonce" do Next, com `'unsafe-inline'` nos scripts (com nonce, toda página seria dinâmica) e o R2 liberado em `connect-src` e `img-src` |

---

## 18. Convenções de código e repositório

- **Idioma:** banco em português, `snake_case`, com prefixo `as_`. Código, variáveis e arquivos em inglês. Os tipos gerados mantêm os nomes do banco. A fronteira fica em `src/server/db/`. **A API pública usa os nomes do banco** (português) para não criar uma camada de tradução.
- **Comentários:** toda função, rota, hook, trigger e função SQL tem cabeçalho em português dizendo o que faz, o que recebe, o que devolve e a regra (ex.: `// Implementa a regra 11.4 (bloqueio após 5 tentativas)`). Lógica não óbvia leva comentário inline.
- **Copy** só em `src/lib/copy.ts` (seção 15). Números só das regras da seção 11, em `src/lib/limits.ts`, com o número da regra em cada constante.
- **Segredos** só em `src/server/`, `src/app/api/`, `src/app/mcp/`, `src/app/oauth/`, `src/app/sair/` e `scripts/`. Todo arquivo de `src/server/` começa com `import "server-only"`.
- **Armazenamento atrás de uma interface:** todo acesso a arquivo (gerar URL de upload ou download, ler, gravar, apagar, somar o uso) passa por `src/server/files/storage.ts`, que expõe uma interface `ArquivoStorage` e hoje tem uma implementação só (Cloudflare R2, bucket `assina-documentos`). Nenhum outro arquivo chama `supabase.storage` direto. Isso permite trocar o backend, ou ter um backend por nível no futuro (seção 28), sem tocar no domínio. Os caminhos gravados no banco (`*_path`) são relativos ao backend.
- **Um domínio, três portas:** `src/server/envelopes/` concentra criar, validar, enviar, assinar, recusar, cancelar, lembrar e finalizar. As rotas do painel, `src/app/api/v1/` e `src/app/mcp/` só fazem autenticação, parse (zod) e chamada.
- **Pastas:**

```
src/
  app/
    (publico)/            # /, /privacidade, /termos, /verificar, /docs/api
    entrar/  sair/
    painel/               # envelopes, integracoes, conta, boas-vindas
    assinar/[token]/
    api/
      auth/google/        # login
      painel/             # rotas internas do remetente
      assinar/[token]/    # rotas do signatário
      v1/                 # API REST pública
      verificar/
      cron/diario/
    mcp/                  # servidor MCP (route.ts)
    oauth/                # registrar, autorizar, token
    .well-known/          # oauth-authorization-server, oauth-protected-resource
  features/<feature>/     # componentes de cliente por feature (envelopes, editor, signing, integrations)
  components/             # nav, ui
  lib/                    # copy.ts, limits.ts, format.ts, cpf.ts
  server/
    db/  auth/  envelopes/  pdf/ (validate, stamp, manifest, seal)  audit/  email/
    files/ (storage, fetch-remote)  webhooks/  analytics/  mcp/ (tools)  cron.ts
supabase/ migrations/  tests/  schema.sql
scripts/  tests/  plans/
```

- **Documentação viva:** `supabase/schema.sql` (gerado, filtrado a `as_`), `README.md`, `DOCUMENTACAO-TECNICA.md` e `CLAUDE.md` (uma página, com "Regra de ouro", "Comandos" e "Pegadinhas"). Os quatro são atualizados no mesmo commit da mudança. **Quando o agente errar a mesma coisa duas vezes, a correção entra em "Pegadinhas".**
- **Variáveis de ambiente:**

| Variável | Pública? | Para quê |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | sim | origem (OAuth, links, metadados MCP) |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | não | banco |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | não | arquivos (R2; token restrito ao bucket) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | não | login |
| `SESSION_SECRET` | não | JWT das sessões (remetente e signatário) |
| `CHAVES_ENC_KEY` | não | AES-256-GCM da chave de API e do segredo do webhook (32 bytes base64) |
| `RESEND_API_KEY`, `EMAIL_REMETENTE` | não | e-mail |
| `CRON_SECRET` | não | faxina |
| `SELO_P12_BASE64`, `SELO_P12_SENHA` | não | certificado do selo (25.2) |
| `SELO_TSA_URL` | não | TSA RFC 3161, opcional |
| `VISAO_INGEST_URL`, `VISAO_API_KEY` | não (o Assina envia do servidor) | analytics |
| `EMAILS_PERMITIDOS`, `EMAILS_BLOQUEADOS`, `CONTAS_NOVAS_POR_DIA` | não | 11.12 |
| `ADMIN_EMAIL` | não | alerta 11.10 |
| *(reservadas v2)* `SMS_*` | — | — |

- **Scripts:** `npm run dev` (porta **3030**), `typecheck`, `lint`, `test` (pgTAP local + Vitest), `build`, `verify` (os quatro), `db:types`, `selo:gerar` (gera um certificado autoassinado `.p12` para dev e imprime o base64; nunca grava em arquivo versionado).

### 18.1 Guardrails executáveis

| Regra | Origem | Mecanismo |
|---|---|---|
| Segredo (service role, chaves, P12 do selo) nunca em código de cliente; `'use client'` não importa `src/server` | 18, 20 | hook `guard-secrets.sh` |
| Trilha só por `as_fn_registra_evento`; nada de `update`/`delete` em `as_eventos` no código | 0.1, 11.6 | hook `guard-audit.sh` + trigger `as_tg_eventos_imutaveis` (banco) |
| Palavras proibidas na copy | 0.4, 15.3 | hook `guard-copy.sh` |
| Migration versionada não se edita | 7.6 | hook `guard-migrations.sh` |
| Teste não se edita em correção de bug | 22.1 | hook `guard-tests.sh` |
| Advisors e schema depois de migration | 7.6, 20 | hook `remind-advisors.sh` |
| Documento congelado depois do envio | 0.2 | triggers `as_tg_envelope_congelado` e `as_tg_filhos_congelados` (banco) + pgTAP |
| Guardião na primeira linha de cada rota; toda consulta com `conta_id`/`token_hash` | 5, 6 | `verifier` + `REVIEW.md` |
| Nenhum dado pessoal em log nem em analytics | 20, 21 | `verifier` + teste do tipo fechado (8.11) |
| Critérios de aceite por épico | 8 | `verifier` |

---

## 19. Documentação técnica final

Ao fim da implementação, o agente gera o `DOCUMENTACAO-TECNICA.md` em português, descrevendo o que foi **de fato** implementado, nesta ordem:

1. modelo de dados explicado (cada tabela, coluna e valor de enum em linguagem de negócio);
2. relacionamentos com a cardinalidade em frase;
3. toda a lógica no banco (nome exato, tabela, quando dispara e o que faz);
4. mapa tela → tabelas, mais o mapa porta (painel/API/MCP) → função de domínio;
5. lógica por tela e por ferramenta MCP (o que valida, grava, calcula e onde, e o erro que o usuário vê);
6. divergências em relação a este spec, com o porquê.

Toda mudança de schema, trigger, rota ou lógica de tela atualiza este documento no mesmo commit.

---

## 20. Privacidade, segurança e conformidade

### 20.1 Enquadramento jurídico (o que o Assina é e o que não é)

- **É:** uma plataforma de **assinatura eletrônica** cuja validade entre as partes se apoia no **art. 10, § 2º, da MP 2.200-2/2001**, que admite outros meios de comprovar autoria e integridade quando as partes os aceitam. Pela **Lei 14.063/2020** (art. 4º), corresponde à assinatura eletrônica **simples**, e, por analogia, à **avançada**, pelo vínculo com o e-mail verificado por código e pela detecção de alteração. A lei trata da relação com entes públicos, então a copy **não** usa "avançada" como selo. O STJ (REsp 2.159.442/PR, 3ª Turma, 2024) reconheceu a validade de assinatura fora da ICP-Brasil com integridade por hash. O **CPC, art. 784, § 4º** (Lei 14.620/2023) admite título executivo com assinatura eletrônica de qualquer modalidade e dispensa testemunhas quando a integridade é conferida por provedor de assinatura (a redação deve ser conferida antes de citar em copy, assunção 24.12).
- **Não é:** assinatura digital ICP-Brasil, assinatura qualificada, nem substituto de firma reconhecida. Os Termos dizem expressamente que **atos que a lei exige com ICP-Brasil ou forma pública** (escrituras e atos registrais de imóveis, certos atos perante o poder público, procurações que exigem forma especial) **não devem ser feitos pelo Assina**.
- **O selo da plataforma** garante a integridade do arquivo. Ele **não** é a assinatura do signatário, e a copy nunca sugere o contrário.

### 20.2 Dados

| Dado | Por quê | Onde | Quem acessa | Retenção |
|---|---|---|---|---|
| Nome e e-mail do remetente | conta, avisos | `as_contas` | o próprio | até excluir a conta |
| PDF original e final | o serviço | Cloudflare R2, bucket `assina-documentos` (privado) | remetente; signatário pelo token | regra 11.14 |
| Nome, e-mail, CPF e data de nascimento (se exigidos) do signatário, IP, user agent, imagem da assinatura | prova de autoria | `as_signatarios`, `as_eventos`, R2 | remetente; o próprio signatário vê os seus | igual ao envelope |
| Valores dos campos | conteúdo do documento | `as_campos` | remetente | igual ao envelope |
| Chave de API (cifrada), tokens MCP (hash) | integrações | `as_credenciais` | remetente | até revogar ou excluir a conta |
| Logs | diagnóstico | Vercel | DabLab | padrão da Vercel; **nunca** registrar e-mail, nome, CPF, data de nascimento, título, token, código, URL `/assinar/…`, IP de signatário nem corpo de webhook |

- **LGPD:** a DabLab é **controladora** dos dados dos remetentes (base legal: execução de contrato, art. 7º, V, com o aceite registrado em `termos_aceitos_em`) e **operadora** dos dados dos signatários e do conteúdo dos documentos em nome de cada remetente, que é o controlador deles (base típica: art. 7º, V e VI). Os Termos têm cláusula de operador: tratamento só para o serviço, sem uso secundário, subprocessadores listados (Supabase, Vercel, Resend) e exclusão ao excluir a conta. O contato de privacidade é `alexandre@dablab.com.br`. O signatário que quiser excluir os próprios dados é orientado a pedir ao remetente, e a página de privacidade explica isso.
- **Dado sensível no conteúdo:** os Termos proíbem enviar documentos com dados de saúde, biometria ou de crianças sem base legal própria do remetente. O e-mail nunca cita o conteúdo, só o título que o remetente escolheu.

### 20.3 Segurança

- Segredos só no servidor (18.1). Credencial privilegiada nunca no bundle.
- Service role ignora RLS: os helpers de `src/server/db/` exigem `contaId` ou `tokenHash`, e isso é verificado pelo `verifier`.
- **CSRF:** escritas do painel e do signatário conferem `Origin = NEXT_PUBLIC_SITE_URL`, e os cookies são `SameSite=Lax`.
- **Token e código:** gerados com `crypto.randomBytes`/`randomInt`, guardados só como hash e comparados em tempo constante.
- **Uploads:** só por URL assinada para um caminho fixo `{conta}/{envelope}/original.pdf`. O servidor revalida tudo depois (11.1). Downloads por URL assinada de 5 min.
- **SSRF:** regra 11.18.
- **Webhook:** o segredo é cifrado; a URL fica restrita a `https` e passa pelo mesmo filtro de IP privado da regra 11.18.
- **Certificado do selo:** `SELO_P12_BASE64` só nas variáveis da Vercel. Trocar o certificado não invalida PDFs já selados.
- **Supabase:** advisors (security e performance) depois de cada DDL, filtrando `as_*`; funções com `search_path=''`; nenhuma `SECURITY DEFINER` exposta. **R2:** bucket privado, token só com leitura e escrita de objetos nesse bucket, CORS restrito ao site.
- **Dependências:** `npm audit --omit=dev` sem vulnerabilidade alta no `verify` (falha o build).

---

## 21. Métricas de sucesso e telemetria

**Métricas (90 dias depois do lançamento):**

| Métrica | Alvo |
|---|---|
| Envelopes concluídos sobre enviados | ≥ 70% |
| Mediana do tempo entre o envio e a conclusão | < 48 h |
| Signatários que abrem o link e assinam sem recusar nem abandonar | ≥ 80% |
| Contas com envelope pela API ou pelo MCP | ≥ 10% |

**Eventos (Visão do Produto, projeto "Assina", prefixo `assina_`).** Saem do servidor. Quando há registro, o `id` é derivado dele: sha256(`nome:id do registro`) em formato UUID, estável por evento e registro, para o ingest deduplicar sem confundir os vários eventos do mesmo envelope. O `distinct_id` é o e-mail do remetente nos eventos do remetente e `sig_{signatario_id}` nos do signatário: nunca o e-mail do signatário, que não é usuário do produto. Na verificação pública, que não tem conta, é `anon_{uuid}`, um por consulta. Pelo código, `resultado` é `final` se o envelope está concluído e `original` se não; `original_multiplo` conta como `original`. `assina_api_chamada` vale também para o `/mcp`, com a rota `/mcp`. `assina_envelope_expirado` e o lembrete automático saem da faxina (8.13).

| Evento | Tela | Propriedades (fechadas) |
|---|---|---|
| `assina_conta_criada` | `entrar` | — |
| `assina_envelope_criado` | `novo envelope` | `origem` |
| `assina_envelope_enviado` | `revisar` | `origem`, `nivel`, `assinantes`, `copias`, `em_ordem`, `com_campos`, `paginas`, `prazo_dias` |
| `assina_documento_aberto` | `assinar` | `ordem` |
| `assina_codigo_validado` | `assinar` | `tentativas` |
| `assina_documento_assinado` | `assinar` | `metodo`, `campos`, `cpf_exigido`, `nascimento_exigido`, `minutos_desde_convite` |
| `assina_documento_recusado` | `assinar` | — |
| `assina_envelope_concluido` | `sistema` | `origem`, `horas_ate_concluir`, `selo` |
| `assina_envelope_cancelado` | `detalhe` | `origem` |
| `assina_envelope_expirado` | `sistema` | `assinaram`, `faltaram` |
| `assina_lembrete_enviado` | `detalhe` | `automatico` |
| `assina_documento_verificado` | `verificar` | `por` (`arquivo`/`codigo`), `resultado` (`final`/`original`/`nao_encontrado`) |
| `assina_chave_api_gerada` | `integracoes` | — |
| `assina_webhook_configurado` | `integracoes` | — |
| `assina_mcp_conectado` | `autorizar` | `cliente` (nome do cliente OAuth, ex. "Claude") |
| `assina_api_chamada` | `api` | `rota` (padrão, sem id), `status` — **amostrado** em no máximo 1 a cada 10 s por credencial |

Nenhuma propriedade carrega título, nome, e-mail, CPF, mensagem, motivo, IP, valor de campo ou nome de arquivo. O tipo `PropriedadesDeEvento` é uma união fechada por evento.

---

## 22. Estratégia de teste

| O quê | Como |
|---|---|
| Validação do PDF (11.1) | Vitest com fixtures em `tests/fixtures/` (válido, 101 páginas, com senha, `.docx` renomeado, 10,1 MB gerado em memória, página gigante, PDF já assinado) |
| Gravação de campos e manifesto (11.3, 11.9) | Vitest: gera, reabre com pdf-lib, confere o número de páginas e extrai o texto do manifesto (pdfjs) com nomes, código e hash; snapshot visual da 1ª página do manifesto (PNG por pdfjs + canvas) comparado com tolerância |
| Selo (11.10) | Vitest: assina com o `.p12` de teste, verifica a assinatura CMS com node-forge, altera 1 byte e confirma que a verificação falha; TSA simulada fora do ar → `B-B` |
| Trilha (11.6) | pgTAP (encadeamento, imutabilidade, verificação) + Vitest comparando o hash do TS com o do banco |
| Código de acesso (11.4), CPF, token, cifra, base32 | Vitest |
| Máquina de estado (12) | Vitest de rotas com o banco local: cada transição permitida e cada proibida; corrida cancelar × último assinar (duas promessas em paralelo; exatamente uma vence) |
| Permissões (5) | Vitest de rotas: duas contas não se enxergam pelas três portas; signatário A não age pelo token de B; código antes do documento |
| API e OpenAPI (13.2) | Vitest: cada rota feliz e cada erro; o OpenAPI valida (`@apidevtools/swagger-parser`) |
| MCP (13.3) | Vitest com o cliente do SDK MCP em memória: lista de ferramentas, `criar_envelope` não envia, token revogado → 401 |
| OAuth (6.4) | Vitest: DCR, autorizar sem sessão, PKCE certo e errado, código reutilizado e expirado |
| SSRF (11.18) | Vitest com resolvedor de DNS injetável: `127.0.0.1`, `10.x`, `169.254.169.254`, IPv6 `::1`, redirecionamento para privado |
| Webhook (11.17) | Vitest: HMAC confere com o exemplo do README; retentativa pela faxina |
| Analytics (21) | Vitest: ingest fora do ar não quebra; tipo fechado (teste de compilação com `@ts-expect-error`) |
| Banco | pgTAP: RLS sem acesso de `anon`/`authenticated`, triggers de congelamento, `as_tg_valida_campo`. Filtrar sempre pelos dados da fixture |
| Manual | Fluxo 9.1 no celular real (iPhone e Android); PDF final aberto no Adobe Reader e no Preview; conector no claude.ai e no ChatGPT; webhook num endpoint de teste (ex. webhook.site) |

### 22.1 Loop de verificação

- `npm run typecheck` (`next typegen && tsc --noEmit`) · `npm run lint` · `npm test` (pgTAP local + Vitest) · `npm run build` · `npm run verify` (os quatro mais `npm audit --omit=dev --audit-level=high`, parando no primeiro erro). A saída saudável termina com a tabela de rotas do `next build` e código 0, com pgTAP "Result: PASS" e Vitest "Tests N passed".
- Nenhum épico é declarado pronto sem colar a saída do `npm run verify` e o relatório do `verifier` sem "não cumprido".
- Critério por épico:
  - 8.1: todos os testes pgTAP de trilha e RLS passam;
  - 8.5: os testes de código, de "documento antes do código" e de assinatura passam;
  - 8.6: os testes de selo e manifesto passam e o PDF abre no Preview;
  - telas: screenshot no navegador do app comparada com o design aprovado, em claro e escuro, em 375 px e 1280 px.
- **Bug:** teste que reproduz → ver falhar → commit → `touch .claude/fix-mode` → corrigir → `rm .claude/fix-mode`.
- **Regra de ouro** (literal no `CLAUDE.md`): se um teste falhar, corrija o código, não o teste; nunca pule nem apague teste que falha.

---

## 23. Riscos e mitigação

| # | Risco | Impacto | Prob. | Mitigação |
|---|---|---|---|---|
| 23.1 | **Armazenamento passa da camada gratuita do R2** (10 GB). Pela regra 11.20, uma conta cheia no nível 1 guarda uns 110 MB (50 × 2,2 MB), então seriam umas 90 contas cheias, ou uma conta cheia de nível 3 | baixo (acima disso o R2 cobra cerca de US$ 0,015 por GB por mês, sem custo de saída) | baixa | (a) expurgo da regra 11.14; (b) a faxina soma o uso pelo `ArquivoStorage` e manda e-mail ao `ADMIN_EMAIL` acima de 8 GB; (c) o nível 3 só é concedido à mão (11.20) |
| 23.2 | **Resend gratuito: 100 e-mails por dia.** Um envelope com 3 assinantes gasta cerca de 10 e-mails (convites, códigos, conclusão) | alto | alta | Pergunta 25.4 (plano pago antes do lançamento público); notificações `falhou` retentadas; código com mensagem clara; o limite da regra 11.12 protege a cota |
| 23.3 | Certificado autoassinado aparece como "identidade desconhecida" no leitor de PDF e assusta quem recebe | médio | alta | Copy da verificação explica; e-CNPJ A1 da DabLab (pergunta 25.2) |
| 23.4 | Signatário não recebe o convite ou o código (spam, domínio novo) | alto | média | SPF/DKIM/DMARC no DNS (README); "Copiar link de assinatura" no detalhe; o código vem com assunto curto e sem link |
| 23.5 | Abuso: phishing usando o Assina para mandar "documentos" falsos | alto | média | Limites da regra 11.12, conta Google obrigatória, nome e e-mail do remetente sempre visíveis e `reply-to` dele, suspensão de conta, e Termos com uso proibido. Turnstile na v2 se aparecer abuso |
| 23.6 | Vercel Hobby: cron 1×/dia (lembretes e expiração com atraso de até 24 h) e uso comercial | médio | média | A regra 11.7 confere o prazo na hora; aceitar o atraso no MVP; pergunta 25.4 |
| 23.7 | PDFs mal formados quebram o pdf-lib na finalização | médio | média | Validação no upload (11.1) já carrega com pdf-lib; finalização retentada; alerta ao admin |
| 23.8 | Finalização lenta passa o limite da função | médio | baixa | `maxDuration` 60 s; teste de desempenho em 8.6; TSA com timeout de 5 s |
| 23.9 | SSRF pelo `arquivo_url` ou pela URL do webhook | alto | média | Regra 11.18 com testes |
| 23.10 | Vazamento entre contas pela service role | alto | baixa | Helpers com parâmetro obrigatório, testes de "duas contas" nas três portas, `verifier` |
| 23.11 | Colisão ou alteração acidental no projeto compartilhado | alto | baixa | Prefixo `as_` conferido livre em 17/11/2026; advisors filtrados; nunca `db push` |
| 23.12 | Mudança no fluxo de conector do Claude ou do ChatGPT quebra o OAuth | médio | média | Mesmo desenho do Visão (já em produção); chave por arquivo como alternativa |
| 23.13 | Usuário usa o Assina para ato que exige ICP-Brasil e o documento é contestado | médio | média | Seção 20.1 nos Termos e aviso na página inicial ("Para escrituras e atos que exigem certificado ICP-Brasil, use um cartório ou certificado próprio.") |

---

## 24. Assunções declaradas

**Uma assunção não revisada vira verdade no minuto em que o agente começa a codar.**

| # | Assunção | Por quê | Se discordar |
|---|---|---|---|
| 24.1 | Um PDF por envelope | Simplicidade; o manifesto e o hash ficam únicos | Vários documentos na v2 |
| 24.2 | Até 10 assinantes e 5 cópias | Cobre contrato, distrato e ata pequena | É só uma constante (11.2) |
| 24.3 | Prazo padrão de 30 dias, lembrete padrão a cada 3 dias | Padrão de mercado | Ajustável por envelope |
| 24.4 | O signatário se identifica **só** por código no e-mail; CPF é opcional por pessoa e declarado (não confere em base externa) | Grátis e sem fricção; o mercado faz igual no plano básico | SMS ou WhatsApp na v2 (custo) |
| 24.5 | Sem "corrigir destinatário" depois do envio: cancela e manda de novo | Princípio 2; mantém a trilha limpa | Correção de e-mail com evento próprio, como o SignuDoc faz, na v2 |
| 24.6 | A chave de API fica guardada **cifrada** (não só o hash) para a tela poder mostrá-la de novo | Pedido do Alexandre: "uma chave predefinida por usuário" | Mostrar uma vez só, como no Visão, é mais seguro: avise e eu troco |
| 24.7 | O token OAuth do MCP não expira e não tem refresh; a revogação é manual | Igual ao Visão, que funciona com o Claude e o ChatGPT | Expiração de 90 dias com refresh token |
| 24.8 | O MCP também aceita a chave de API como Bearer | Claude Code e Desktop configurados por arquivo | Só OAuth no MCP |
| 24.9 | O MCP não posiciona campos: envia sem campos ou devolve o link do editor | Coordenada em PDF por conversa erra muito | Posicionar por texto âncora ("assinatura do contratante") na v2 |
| 24.10 | Assinatura digitada e desenhada valem igual, e a escolha fica na trilha | Padrão de mercado | Restringir a desenhada |
| 24.11 | O remetente pode excluir para sempre um envelope concluído | É o controlador e os signatários já têm o PDF | Bloquear a exclusão de concluídos por N anos |
| 24.12 | A redação do CPC 784 § 4º e as TSAs gratuitas (DigiCert, Sectigo, FreeTSA) não foram conferidas nas fontes primárias nesta pesquisa | A pesquisa usou resumo secundário | O agente confere antes de usar em copy ou em código (8.6) |
| 24.13 | Signatário vê o nome dos outros signatários e o status deles depois de assinar, nunca e-mail nem CPF | Transparência mínima sem expor contato | Esconder também os nomes |
| 24.14 | Interface só em pt-BR | Público brasileiro | Copy centralizada para a v2 |
| 24.15 | Licença MIT e repositório público desde o primeiro commit; nenhum segredo, nem certificado, no git | Padrão dos outros projetos | — |
| 24.16 | O limite dos níveis conta **documentos guardados** (envelopes enviados que ainda existem), não envios por mês. Excluir libera vaga | Conversa com o custo real, que é armazenamento | Limite por mês (contando `enviado_em` em 30 dias): avise e eu troco a regra 11.20 |
| 24.17 | O limite anti-abuso de 30 envios em 24 h vale igual para os três níveis | Proteção contra spam, não produto | Limite diário por nível |

---

## 25. Perguntas abertas

O agente de código **para e pergunta** ao cruzar com qualquer item abaixo.

| # | Pergunta | Quem decide | Até quando |
|---|---|---|---|
| 25.1 | ~~Domínio~~ **Respondida (17/11/2026):** nome **Assina**, domínio **`assina.app.br`** (comprado pelo Alexandre; "Firma" foi descartado porque `firma.app.br` tinha dono). Produção: `NEXT_PUBLIC_SITE_URL=https://assina.app.br`, `www` → 308 para o domínio principal, remetente `naoresponda@assina.app.br` (domínio verificado no Resend), redirect do OAuth `https://assina.app.br/api/auth/google/callback`, MCP em `https://assina.app.br/mcp`. Dev: `localhost:3030`, remetente de teste `onboarding@resend.dev` | — | — |
| 25.2 | **Certificado do selo:** começar com certificado autoassinado (grátis; o leitor mostra "identidade desconhecida") ou comprar um e-CNPJ A1 da DabLab (cerca de R$ 150–300 por ano, a conferir) antes do lançamento público? | Alexandre | antes do lançamento público (o MVP funciona com o autoassinado) **Respondida em 19/11/2026: autoassinado no lançamento** (certificado "Assina", DabLab, 5 anos, com carimbo do tempo da DigiCert, então `B-T`). O e-CNPJ A1 fica para depois; trocar o certificado não invalida os PDFs já selados. |
| 25.3 | ~~Storage~~ **Respondida (17/11/2026):** arquivos no **Cloudflare R2**, fora do Supabase, para não aumentar o custo do Supabase. O banco continua no projeto compartilhado | — | — |
| 25.4 | **Custos de lançamento público:** Resend pago (cerca de US$ 20/mês, 50 mil e-mails) e Vercel Pro (cron mais frequente e uso comercial) entram antes de abrir para todo mundo, ou o lançamento começa limitado por `EMAILS_PERMITIDOS`? | Alexandre | antes do 8.12 **Respondida em parte em 20/11/2026: lançamento aberto para qualquer conta Google** (sem `EMAILS_PERMITIDOS`). Plano pago do Resend em aberto. |
| 25.5 | **Níveis 2 e 3:** como uma conta chega lá (pedido manual, pagamento, convite)? E esses níveis terão armazenamento separado (seção 28)? No MVP só existe a coluna, o limite e a mudança manual por SQL | Alexandre | antes de oferecer os níveis 2 e 3 a alguém |

---

## 26. Definition of Done

- [ ] Todos os critérios de 8.0–8.13 cumpridos, com a saída do `npm run verify` colada em cada épico e o relatório do `verifier` sem "não cumprido".
- [ ] Banco em português, `snake_case`, prefixo `as_`, sem tabela ou coluna fora da seção 7.
- [ ] Todas as rotinas, rotas, triggers e funções comentadas com a regra que implementam.
- [ ] RLS ligado e sem acesso de `anon`/`authenticated` em todas as `as_*`; bucket R2 privado (pgTAP e teste).
- [ ] Advisors security e performance rodados depois do último DDL, sem alerta crítico em `as_*`.
- [ ] Guardrails do Anexo B instalados em `.claude/` e cada hook testado uma vez.
- [ ] `plans/` com o plano aprovado de cada épico, consistente com o código (ou divergência registrada).
- [ ] `DOCUMENTACAO-TECNICA.md` gerado e conferido; `CLAUDE.md` (uma página), `README.md`, `LICENSE` (MIT) e `THIRD_PARTY_NOTICES.md` em dia.
- [ ] Google Cloud com tela de consentimento "Em produção" e marca verificada; Resend com domínio verificado (SPF/DKIM/DMARC); Vercel com domínio, variáveis, cron e regras de firewall.
- [ ] Fluxo 9.1 feito ponta a ponta com e-mails reais, num iPhone e num Android; PDF final abre no Adobe Reader e no Preview com o selo íntegro.
- [ ] Fluxo 9.2 feito por `curl`, com o webhook recebido; fluxo 9.3 feito no claude.ai e no ChatGPT.
- [ ] Projeto "Assina" no Visão do Produto recebendo os eventos da seção 21.
- [ ] Modo escuro e 375 px conferidos por screenshot em todas as telas da seção 10.
- [ ] Nenhum segredo no histórico do git (`git log -p | grep -E "service_role|BEGIN PRIVATE|assina_[A-Za-z0-9_-]{40}"` vazio).

---

## 27. Próximos passos operacionais

1. O Alexandre revisa as seções 24 e 25 (principalmente 25.2 e 25.3).
2. `git init` em `~/assina`, repositório público `assina` no GitHub, conectado à Vercel.
3. Colar o prompt de implementação no Claude Code, a partir de `~/assina`.
4. Desenhar as telas no Claude Design com `prompt-design-assina.md`, em paralelo com os épicos 8.0–8.1.
5. Durante o 8.1, o Alexandre cria o cliente OAuth no projeto Google Cloud da DabLab (só escopos básicos) seguindo o README.
   No mesmo épico: criar o bucket R2 `assina-documentos` na conta Cloudflare da DabLab (privado, CORS para o site e localhost), um token de API restrito a esse bucket (leitura e escrita de objetos) e copiar as quatro variáveis `R2_*` para a Vercel e o `.env.local`, seguindo o README.
6. Durante o 8.6, rodar `npm run selo:gerar` para dev e decidir o 25.2 para produção.
7. Antes do 8.4: DNS de `assina.app.br` apontado para a Vercel e verificado no Resend.
8. Durante o 8.11: criar o projeto "Assina" no Visão do Produto e copiar a chave de ingestão para a Vercel.
9. Usar uma semana com documentos reais da DabLab e da BBZ antes de divulgar.

---

## 28. Roadmap: próximas releases

- **Níveis 2 e 3 e armazenamento por nível** (25.5): tela de nível e uso, caminho para subir de nível e, se fizer sentido, um backend de armazenamento por nível, com a coluna `as_contas.armazenamento` (`r2` padrão, `bucket_proprio`) escolhendo a implementação de `ArquivoStorage`. O R2 já é o backend de todos desde o MVP (decisão de 17/11/2026). A separação que sobra é o **bucket S3 do próprio cliente** no nível 3, se algum pedir. A migração de uma conta entre backends copia os objetos, confere o SHA-256 de cada um contra `hash_original`/`hash_final` e só então troca a coluna.
- **Modelos:** "Salvar como modelo" num envelope (arquivo + campos), com destinatários trocados por **papéis** ("Contratante", "Contratada"). Tabelas `as_modelos`, `as_modelos_papeis` e `as_modelos_campos`. "Novo envelope a partir de modelo" só pede nome e e-mail por papel. Na API, `POST /api/v1/modelos/{id}/envelopes`; no MCP, `listar_modelos` e `criar_envelope_de_modelo`. É o que torna o MCP útil sem posicionar campos.
- **Vários PDFs por envelope**, com manifesto único e hash por documento.
- **Código por SMS ou WhatsApp** (custo por mensagem; precisa de modelo de cobrança ou cota).
- **Corrigir destinatário** depois do envio, com evento `destinatario_corrigido` e invalidação do token antigo.
- **Carimbo do tempo ICP-Brasil e selo LTV** (B-LT/B-LTA) e certificado em KMS no lugar de P12.
- **Campos por texto âncora** (procurar "Assinatura do contratante" no PDF), para API e MCP.
- **Envio em massa** (mesmo documento para N pessoas, um envelope por pessoa) e importação de CSV.
- **Interface em inglês** e e-mails no idioma do signatário.
- **Turnstile** na página do signatário e no login, se aparecer abuso.
- **Cron horário** (Vercel Pro ou `pg_cron` + `pg_net`) para lembretes em hora marcada.

---

## 29. Protocolo de mudanças incrementais

1. Commit de checkpoint antes de qualquer mudança.
2. Não colar o spec inteiro de novo: só o trecho novo ou alterado, ou um spec da feature.
3. Escrever como diff: "o app já existe e funciona; mude só X".
4. Dizer nominalmente o que **não** deve mudar.
5. Pedir o plano em plan mode (arquivos, ordem, testes que provam) e salvar em `plans/<feature>.md` antes do código. Se for bug, o plano começa pelo teste que reproduz.
6. Revisar o `git diff` contra o plano e reverter o que passou do escopo. Se a divergência for necessária, atualizar o plano no mesmo commit.
7. Atualizar `DOCUMENTACAO-TECNICA.md` (e `CLAUDE.md`/README, quando couber) no mesmo commit.

Modelo:
```
O Assina já está implementado e funcionando (spec.md v0.x, DOCUMENTACAO-TECNICA.md).
Quero mudar só isto: <descrição>.
Não mexa em: <telas/rotas/tabelas que não devem mudar>; a trilha (as_eventos) e o congelamento do envelope continuam intocados.
Entre em plan mode, me mostre o plano (arquivos, ordem, testes) e salve em plans/<feature>.md depois de aprovado.
Rode npm run verify, cole a saída, acione o verifier e atualize DOCUMENTACAO-TECNICA.md no mesmo commit.
```

---

## Anexo A — Fontes (consultadas em 17/11/2026)

- SignuDoc, README e código (licença MIT): https://github.com/NYLLON-SOFTWARE/signudoc. Arquivos lidos: `src/lib/services/pdf-seal.ts`, `pdf-ltv.ts`, `audit.ts` e as migrations.
- MP 2.200-2/2001, art. 10: https://www.planalto.gov.br/ccivil_03/mpv/antigas_2001/2200-2.htm
- Lei 14.063/2020: https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2020/lei/l14063.htm
- STJ, REsp 2.159.442/PR (comentários): https://www.irib.org.br/stj-reconhece-validade-de-assinatura-eletronica-avancada-certificada-fora-do-sistema-icp-brasil/ · https://www.conjur.com.br/2024-nov-08/a-validade-de-assinaturas-digitais-em-contratos-bancarios-reflexoes-a-partir-do-resp-2-159-442-pr/
- Visão de Produto, `DOCUMENTACAO-TECNICA.md`, seção 5.5 (OAuth do MCP), e `spec.md`, seções 6.3, 8.2 e 12.1 (credenciais e ingestão).
- Reunião, `spec.md` v0.5 (arquitetura, seção 6, seção 16, Anexo B) e print do painel (17/11/2026).
- registro.br, whois dos domínios candidatos (17/11/2026): `firma.app.br` com dono; `assina.app.br` escolhido.
- Supabase, projeto `jeesdmfcrmhyufwzwzwt`: prefixos de tabela e extensões instaladas (17/11/2026).
- Cloudflare R2, preços e camada gratuita: https://developers.cloudflare.com/r2/pricing/ (valores a reconferir no 8.1, premissa (b)).

---

## Anexo B — Kit de guardrails do Claude Code

### `.claude/settings.json`
```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          { "type": "command", "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/guard-secrets.sh" },
          { "type": "command", "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/guard-audit.sh" },
          { "type": "command", "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/guard-copy.sh" },
          { "type": "command", "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/guard-migrations.sh" },
          { "type": "command", "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/guard-tests.sh" }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          { "type": "command", "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/remind-advisors.sh" }
        ]
      }
    ]
  }
}
```

### `.claude/hooks/guard-secrets.sh`
```bash
#!/bin/bash
# Bloqueia segredo ou import de src/server/ em código que pode rodar no cliente.
# Implementa as seções 18 e 20.3: segredo só existe no servidor.
command -v jq >/dev/null || { echo "Guardrail inativo: jq não está instalado. Instale o jq (brew install jq) antes de continuar." >&2; exit 2; }
input=$(cat)
path=$(echo "$input" | jq -r '.tool_input.file_path // empty')
content=$(echo "$input" | jq -r '.tool_input.content // .tool_input.new_string // empty')

# Rodam só no servidor: rotas de API, MCP, OAuth, src/server, scripts e o proxy.
case "$path" in
  */src/app/api/*|*/src/app/mcp/*|*/src/app/oauth/*|*/src/app/.well-known/*|*/src/app/sair/*|*/src/server/*|*/scripts/*|*/src/proxy.ts) exit 0 ;;
  */src/app/*|*/src/components/*|*/src/features/*|*/src/lib/*) ;;
  *) exit 0 ;;
esac

if echo "$content" | grep -qE 'SUPABASE_SERVICE_ROLE_KEY|service_role|GOOGLE_CLIENT_SECRET|SESSION_SECRET|CHAVES_ENC_KEY|RESEND_API_KEY|CRON_SECRET|SELO_P12|VISAO_API_KEY|R2_SECRET_ACCESS_KEY|R2_ACCESS_KEY_ID|NEXT_PUBLIC_[A-Z_]*(SECRET|KEY|P12)'; then
  echo "Bloqueado: segredo em código que pode rodar no cliente (seções 18 e 20.3). Leia o segredo só em src/server/ ou numa rota de src/app/api/ e chame essa rota do cliente." >&2
  exit 2
fi
if echo "$content" | grep -q "use client" && echo "$content" | grep -qE "from ['\"]@/server/|from ['\"](\.\./)+server/"; then
  echo "Bloqueado: componente de cliente importando src/server/ (seção 20.3). Exponha o dado por uma rota ou passe por props de um Server Component." >&2
  exit 2
fi
exit 0
```

### `.claude/hooks/guard-audit.sh`
```bash
#!/bin/bash
# A trilha de auditoria só aceita inserção pela função as_fn_registra_evento (princípio 1, regra 11.6).
command -v jq >/dev/null || { echo "Guardrail inativo: jq não está instalado. Instale o jq (brew install jq) antes de continuar." >&2; exit 2; }
input=$(cat)
path=$(echo "$input" | jq -r '.tool_input.file_path // empty')
content=$(echo "$input" | jq -r '.tool_input.content // .tool_input.new_string // empty')
case "$path" in
  */src/*|*/scripts/*) ;;
  *) exit 0 ;;
esac
# Junta as linhas: o Prettier quebra .from(...) e .update( em linhas separadas.
flat=$(echo "$content" | tr "\n" " ")
if echo "$flat" | grep -qE "from\(['\"]as_eventos['\"]\)[[:space:]]*\.(insert|update|upsert|delete)"; then
  echo "Bloqueado: escrita direta em as_eventos (princípio 1, regra 11.6). Registre eventos só com rpc('as_fn_registra_evento', …) dentro da mesma transação da mudança de estado; eventos nunca se alteram nem se apagam." >&2
  exit 2
fi
exit 0
```

### `.claude/hooks/guard-copy.sh`
```bash
#!/bin/bash
# Impede copy que promete o que o Assina não é (princípio 4, seção 15.3).
command -v jq >/dev/null || { echo "Guardrail inativo: jq não está instalado. Instale o jq (brew install jq) antes de continuar." >&2; exit 2; }
input=$(cat)
path=$(echo "$input" | jq -r '.tool_input.file_path // empty')
content=$(echo "$input" | jq -r '.tool_input.content // .tool_input.new_string // empty')
case "$path" in
  */src/lib/copy.ts|*/src/server/email/*|*/src/server/pdf/manifest.ts|*/src/app/*.tsx|*/src/features/*.tsx) ;;
  *) exit 0 ;;
esac
# Linhas dentro do bloco LEGAL_NEGATIVAS (textos que explicam o que o Assina NÃO é) ficam de fora.
# Só a declaração abre o bloco: um comentário ou uma referência ao nome não isenta nada.
filtered=$(echo "$content" | awk '/^export const LEGAL_NEGATIVAS/{skip=1} skip&&/^\}/{skip=0;next} !skip')
if echo "$filtered" | grep -qiE 'certificado digital|icp-brasil|assinatura qualificada|assinatura digital|firma reconhecida|100% v(a|á)lid|validade garantida'; then
  echo "Bloqueado: copy promete o que o Assina não é (princípio 4, seção 15.3). Use a base legal da seção 20.1 (art. 10, § 2º, MP 2.200-2/2001). Se o texto explica o que o Assina NÃO é, coloque-o em LEGAL_NEGATIVAS no copy.ts." >&2
  exit 2
fi
exit 0
```

### `.claude/hooks/guard-migrations.sh`
```bash
#!/bin/bash
# Impede editar migration já versionada no git; mudança de schema vira migration nova (seção 7.6).
command -v jq >/dev/null || { echo "Guardrail inativo: jq não está instalado. Instale o jq (brew install jq) antes de continuar." >&2; exit 2; }
input=$(cat)
path=$(echo "$input" | jq -r '.tool_input.file_path // empty')
case "$path" in
  */supabase/migrations/*) ;;
  *) exit 0 ;;
esac
rel="${path#"$CLAUDE_PROJECT_DIR"/}"
if git -C "$CLAUDE_PROJECT_DIR" ls-files --error-unmatch "$rel" >/dev/null 2>&1; then
  echo "Bloqueado: $rel já está versionada. Não se edita migration aplicada; crie uma nova migration com a alteração (seção 7.6)." >&2
  exit 2
fi
exit 0
```

### `.claude/hooks/guard-tests.sh`
```bash
#!/bin/bash
# Em correção de bug (arquivo .claude/fix-mode presente), impede editar testes para "fazer passar".
# Implementa a seção 22.1: bug se corrige no código, não no teste.
[ -f "$CLAUDE_PROJECT_DIR/.claude/fix-mode" ] || exit 0
command -v jq >/dev/null || { echo "Guardrail inativo: jq não está instalado. Instale o jq (brew install jq) antes de continuar." >&2; exit 2; }
input=$(cat)
path=$(echo "$input" | jq -r '.tool_input.file_path // empty')
case "$path" in
  *.test.ts|*.test.tsx|*.spec.ts|*/__tests__/*|*/tests/*|*/supabase/tests/*)
    echo "Bloqueado: modo de correção ativo (.claude/fix-mode). Corrija o código, não o teste (seção 22.1). Se o teste estiver errado de fato, pare e explique ao humano." >&2
    exit 2 ;;
esac
exit 0
```
Uso: `touch .claude/fix-mode` depois de commitar o teste que reproduz o bug, e `rm .claude/fix-mode` ao terminar. `.claude/fix-mode` vai no `.gitignore`.

### `.claude/hooks/remind-advisors.sh`
```bash
#!/bin/bash
# Depois de escrever uma migration, lembra de aplicar pelo MCP, rodar os advisors e regenerar o schema (seções 7.6 e 20.3).
command -v jq >/dev/null || { echo "Guardrail inativo: jq não está instalado. Instale o jq (brew install jq) antes de continuar." >&2; exit 2; }
input=$(cat)
path=$(echo "$input" | jq -r '.tool_input.file_path // empty')
case "$path" in
  */supabase/migrations/*)
    echo "Migration escrita. Aplique no local e no remoto (MCP apply_migration, mesmo SQL; nunca db push no projeto compartilhado), rode get_advisors (security e performance) filtrando objetos as_*, resolva alertas críticos e regenere supabase/schema.sql filtrado a as_ (seções 7.6 e 20.3)." >&2
    exit 2 ;;
esac
exit 0
```

### `.claude/agents/verifier.md`
```markdown
---
name: verifier
description: Confere em contexto limpo se o épico implementado cumpre os critérios de aceite do spec.md. Use ao terminar cada épico, antes de declarar pronto.
tools: Bash, Read, Grep
---
Você verifica; não corrige nada.

1. Leia no spec.md a seção 8.X do épico indicado, a matriz de permissões (seção 5), a seção 6, as regras da seção 11 e a máquina de estado (seção 12) que o épico toca.
2. Leia o plano em plans/ correspondente e o git diff do épico.
3. Rode `npm run verify` e guarde a saída.
4. Para cada critério de aceite: cumprido / não cumprido / não verificável — com evidência (saída de comando ou arquivo:linha).
5. Para cada rota nova: a primeira linha chama requireConta() (painel), requireCredencial() (API/MCP) ou requireSignatarioPorToken() (assinatura)? Toda consulta ao banco filtra por conta_id ou token_hash?
6. Toda mudança de status de envelope passa por as_fn_transicao_envelope e grava o evento da trilha na mesma transação (princípio 1)? Algum caminho altera arquivo, campos ou destinatários fora de rascunho (princípio 2)?
7. A rota do signatário entrega o documento antes do código validado (regra 11.4)?
8. As rotas de API e as ferramentas MCP chamam src/server/envelopes/ em vez de reimplementar regra (princípio 5)? criar_envelope nunca envia (11.15)?
9. Algum log, evento de analytics ou corpo de erro carrega e-mail, nome, CPF, título, token, código, IP de signatário ou URL /assinar/ (seções 20 e 21)?
10. Liste divergências entre o diff e o plano.

Termine com uma linha: PRONTO ou NÃO PRONTO, e os itens que impedem.
```

### `REVIEW.md`
```markdown
# Instruções de revisão

## Passes
Faça três passes e marque cada achado com o passe:
- Bugs: transições proibidas da seção 12 e corrida cancelar × último assinar; prazo conferido por prazo_em (11.7); ordem de assinatura; coordenadas em fração (11.3) e páginas de tamanhos diferentes; hash calculado sobre o arquivo certo; finalização retentável sem duplicar e-mail nem webhook; fuso (UTC gravado, Brasília exibido).
- Segurança: matriz da seção 5; guardião na primeira linha; toda consulta com conta_id ou token_hash (service role ignora RLS); documento só depois do código; tokens, códigos e chaves só como hash (exceto a chave de API cifrada, 6.3) e comparados em tempo constante; SSRF (11.18) em arquivo_url e webhook; Origin conferido nas escritas; nada pessoal em log ou analytics.
- Conformidade: spec.md (épicos 8, regras 11 sem número inventado, copy da seção 15 em src/lib/copy.ts sem as palavras proibidas), plano em plans/, convenções da seção 18 — banco em português snake_case com prefixo as_, rotinas comentadas com a regra que implementam, uma regra num lugar só (princípio 5).

## O que é Importante
Importante é o que deixa uma assinatura sem prova, altera documento enviado, expõe documento ou dado de uma conta a outra pessoa, deixa de avisar alguém ou viola regra do spec. Estilo e nome são detalhe.

## Limite de detalhes
No máximo cinco detalhes por revisão; resuma o resto como contagem.

## Não reportar
Arquivos gerados (src/server/db/types.ts, supabase/schema.sql) e o que o lint/CI já garante.
```
