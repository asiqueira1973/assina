# Documentação técnica — Assina

Descreve o sistema **como está implementado**, não como foi planejado (spec.md, seção 19). Atualizado no mesmo commit de toda mudança de schema, trigger, rota ou tela.

| | |
|---|---|
| Estado | Épicos 8.0 a 8.11 concluídos em 17/11/2026. Migrations aplicadas no **Supabase local**; o remoto compartilhado aguarda (`PENDENCIAS.md`, P1) |
| Stack | Next.js 16.4.6 (App Router, Cache Components, `proxy.ts`), React 19.3, TypeScript, Supabase Postgres (projeto compartilhado, prefixo `as_`), Vitest, pgTAP |

---

## 1. Modelo de dados

Banco em português, prefixo `as_`. Toda tabela com RLS ligado e **nenhuma política**, sem privilégio para `anon`/`authenticated`: só o servidor (service role) lê e escreve. Fonte: `supabase/migrations/20261117130000_as_schema.sql`; dump vivo em `supabase/schema.sql`.

| Tabela | Para que serve | Colunas que pedem explicação |
|---|---|---|
| `as_contas` | Uma por conta Google de quem envia documentos (o remetente) | `google_sub`: identificador estável do Google (o e-mail pode mudar). `termos_aceitos_em`: nulo até passar pelas boas-vindas. `suspensa_em`: preenchido pelo admin para bloquear a conta. `nivel`: 1, 2 ou 3; limita os documentos guardados (50, 500, 5.000; regra 11.20). `webhook_url`/`webhook_segredo_cifrado`: existem juntos ou não existem (check `as_contas_webhook_ck`) |
| `as_credenciais` | Chave de API da conta e tokens do MCP | `tipo` `api`: a chave que nasce com a conta, guardada como hash (para busca) **e** cifrada (para a tela mostrar de novo). `tipo` `mcp`: token entregue pelo OAuth, só o hash. `prefixo`: os 12 primeiros caracteres, para exibir. `revogada_em`: nulo = válida. Uma chave de API ativa por conta (índice `as_credenciais_api_uk`) |
| `as_oauth_clientes` | Clientes MCP (Claude, ChatGPT) que se registram sozinhos | `id` é o `client_id`; `redirect_uris` de 1 a 5 |
| `as_oauth_codigos` | Código de autorização do OAuth do MCP, de uso único | `codigo_hash`: só o hash; `expira_em`: 10 min; `usado_em`: nulo até ser trocado |
| `as_envelopes` | Um documento enviado para assinatura | `status`: ver enum. `origem`: por onde nasceu (painel, API ou MCP). `hash_original`: SHA-256 do PDF, preenchido no envio e nunca mais alterado. `codigo_verificacao`: 12 caracteres base32 Crockford, impresso no manifesto. `arquivos_expurgados_em`: quando a faxina apagou os arquivos de um envelope encerrado sem conclusão. `finalizacao_reserva` / `finalizacao_reservada_em`: quem está finalizando agora e desde quando (vence em 5 min). `tentativas_finalizacao`: contada ao reservar. `erro_finalizacao`: código da última falha. `arquivo_final_path`: `{conta}/{id}/final-{reserva}.pdf`. `hash_final`, `arquivo_final_path`, `selo` e `concluido_em` não mudam depois de preenchidos (`as_tg_final_imutavel`) |
| `as_signatarios` | Quem assina (`assinar`) ou só recebe cópia (`copia`) | `token_hash`: SHA-256 do token do link (o link em si não fica no banco). `ordem`: 1–10, única entre os assinantes do envelope (exclusion constraint diferida, para reordenar numa transação); nas cópias é sempre 1 e não significa nada. `codigo_*`: o código de 6 dígitos atual e seus contadores. `ip_assinatura`/`user_agent_assinatura`: evidência do momento da assinatura |
| `as_campos` | Campos posicionados no PDF | `x`, `y`, `largura`, `altura` em fração da página (0–1, origem no canto superior esquerdo); o campo nunca passa da borda (check). `valor`: preenchido na assinatura |
| `as_eventos` | Trilha de auditoria | Só inserção. `seq` 1, 2, 3… por envelope. `hash` encadeado no `hash_anterior` (regra 11.6). `ocorrido_em`: relógio do banco |
| `as_notificacoes` | Cada e-mail a enviar, para não repetir e para retentar | `chave`: idempotência (o mesmo e-mail não sai duas vezes). `reservada_em`: reserva de 2 min de quem está mandando agora |
| `as_envios` | Um registro por envio, para o limite de 30 em 24 h | Fica mesmo se o envelope for excluído: cancelar e excluir não devolve a vaga do dia |
| `as_entregas_webhook` | Cada aviso de webhook para o sistema do remetente | `tentativas` até 6 |

**Enums** (valores e significado):

| Enum | Valores |
|---|---|
| `as_status_envelope` | `rascunho` (sendo montado), `enviado` (aguardando assinaturas), `finalizando` (todos assinaram, gerando o PDF final), `concluido`, `recusado` (alguém recusou), `cancelado` (o remetente cancelou), `expirado` (prazo venceu) |
| `as_status_signatario` | `pendente` (ainda não é a vez, ou rascunho), `aguardando` (convite enviado), `assinou`, `recusou` |
| `as_papel` | `assinar`, `copia` |
| `as_tipo_campo` | `assinatura`, `rubrica`, `data`, `nome`, `texto`, `caixa` |
| `as_metodo_assinatura` | `digitada` (nome em fonte cursiva), `desenhada` (imagem) |
| `as_origem` | `painel`, `api`, `mcp` |
| `as_tipo_credencial` | `api`, `mcp` |
| `as_ator` | quem causou o evento: `remetente`, `signatario`, `sistema`, `api`, `mcp` |
| `as_tipo_evento` | `criado`, `enviado`, `convite_enviado`, `codigo_enviado`, `codigo_validado`, `codigo_recusado`, `visualizou`, `consentiu`, `assinou`, `recusou`, `lembrete_enviado`, `finalizado`, `concluido`, `cancelado`, `expirado`, `baixou_original`, `baixou_final` |
| `as_tipo_notificacao`, `as_status_notificacao`, `as_status_entrega` | seção 7.2 do spec |

## 2. Relacionamentos

```
as_contas 1 ── N as_credenciais N ── 0..1 as_oauth_clientes 1 ── N as_oauth_codigos
as_contas 1 ── N as_envelopes 1 ── N as_signatarios 1 ── N as_campos
                as_envelopes 1 ── N as_eventos · as_notificacoes · as_entregas_webhook
```

- Uma conta tem muitas credenciais, mas no máximo uma chave de API ativa.
- Uma conta tem muitos envelopes; um envelope pertence a exatamente uma conta.
- Um envelope tem de 1 a 15 destinatários (10 assinam, 5 recebem cópia); um destinatário pertence a um envelope só (o mesmo e-mail em dois envelopes são duas linhas).
- Um assinante tem muitos campos; quem recebe cópia não tem campo.
- Um envelope tem muitos eventos de trilha, numerados sem buraco.
- Apagar a conta leva tudo em cascata; apagar um envelope leva destinatários, campos, trilha, e-mails e webhooks.

## 3. Lógica que vive no banco

Fonte: `supabase/migrations/20261117130100_as_logica.sql`. Toda função com `search_path = ''`, sem `EXECUTE` para `anon`/`authenticated`.

| Nome | Tipo | Tabela | Quando | O que faz |
|---|---|---|---|---|
| `as_tg_atualizado_em` (`as_fn_atualizado_em`) | trigger BEFORE UPDATE | `as_contas`, `as_envelopes` | todo update | grava `now()` em `atualizado_em` |
| `as_fn_evento_canonico` | função | — | chamada pelas duas abaixo | monta o texto canônico de um evento: 9 campos em linhas, nulo como vazio, data em UTC com microssegundos |
| `as_fn_registra_evento` | função | `as_eventos` | servidor, a cada ação relevante | **única** forma de gravar na trilha: trava o envelope, calcula o próximo `seq` e o hash encadeado, grava com `clock_timestamp()` |
| `as_fn_verifica_trilha` | função | `as_eventos` | tela de detalhe e testes | recalcula a cadeia; devolve o primeiro `seq` quebrado ou nulo |
| `as_tg_eventos_imutaveis` | trigger BEFORE UPDATE/DELETE | `as_eventos` | update ou delete | recusa (`trilha_imutavel`); delete só passa quando vem em cascata do envelope ou da conta |
| `as_tg_envelope_congelado` | trigger BEFORE UPDATE | `as_envelopes` | update | só aceita as transições de status da seção 12 (`status_mudou`); fora de rascunho, recusa mudar título, mensagem, ordem, prazo, dados do arquivo e `hash_original` (`envelope_congelado`); deixa a faxina limpar o caminho do arquivo de envelope encerrado sem conclusão |
| `as_tg_envelope_nasce_rascunho` | trigger BEFORE INSERT | `as_envelopes` | insert | envelope só nasce em rascunho, sem hash nem datas de envio (`status_mudou`) |
| `as_tg_envelope_exclusao` | trigger BEFORE DELETE | `as_envelopes` | delete | envelope enviado ou finalizando não se exclui (`envelope_em_andamento`); a exclusão da conta passa em cascata |
| `as_tg_filhos_congelados` | trigger BEFORE INSERT/UPDATE/DELETE | `as_signatarios`, `as_campos` | qualquer escrita | com o envelope fora de rascunho, ninguém entra nem sai e nome, e-mail, ordem e coordenadas não mudam; status, código, assinatura, token e valor continuam mudando |
| `as_tg_valida_campo` | trigger BEFORE INSERT/UPDATE | `as_campos` | escrita de campo | página existe no PDF e o campo é de um assinante do mesmo envelope (`campo_invalido`) |
| `as_fn_transicao_envelope` | função | `as_envelopes` | servidor, a cada mudança de status | muda o status só se ele ainda é o esperado; devolve se mudou (trava de concorrência) |
| `as_fn_cria_rascunho` | função | `as_envelopes`, `as_eventos` | criar envelope (painel, API, MCP) | cria o rascunho e o evento `criado` na mesma transação |
| `as_fn_substitui_signatarios` | função | `as_signatarios`, `as_campos` | salvar a lista de destinatários | troca a lista de um rascunho da conta: recusa e-mail repetido e limites (10 assinantes, 5 cópias); mantém quem continua (e os campos), apaga quem saiu, renumera a ordem pela posição, tira os campos de quem virou cópia |
| `as_fn_anexa_arquivo` | função | `as_envelopes`, `as_campos` | depois de validar um PDF | com o envelope travado e ainda em rascunho, apaga os campos e aponta para o arquivo novo (caminho por versão); devolve o caminho anterior para o servidor apagar |
| `as_fn_substitui_campos` | função | `as_campos` | salvar o editor de campos | troca todos os campos do rascunho numa transação; até 50 por assinante; assinatura, rubrica, data e nome sempre obrigatórios |
| `as_fn_envia_envelope` | função | `as_envelopes`, `as_signatarios`, `as_eventos`, `as_notificacoes` | enviar (painel, API, MCP) | numa transação, com a conta e o envelope travados: confere rascunho, arquivo, assinantes e limites (30/24 h, documentos do nível); congela com o hash e o prazo; grava os tokens; põe os da vez em aguardando; registra os eventos; enfileira os convites |
| `as_fn_reserva_notificacao` | função | `as_notificacoes` | antes de mandar um e-mail | reserva a notificação por 2 min e conta a tentativa; um segundo pedido não passa; reserva vencida (servidor caiu) libera sozinha |
| `as_fn_novo_codigo` | função | `as_signatarios` | pedir código | guarda o código novo (hash) com validade de 10 min; 60 s entre envios; 5 por hora; invalida o anterior |
| `as_fn_valida_codigo` | função | `as_signatarios`, `as_eventos` | digitar o código | uso único; 5 erros bloqueiam; registra acerto e erro na trilha |
| `as_fn_assina` | função | envelope, signatário, campos, trilha, notificações | assinar | tudo numa transação: confere link, status, prazo, assinatura, CPF, campos; grava; registra consentiu e assinou; próximo da ordem ou finalizando |
| `as_fn_recusa` | função | envelope, signatário, trilha, notificações, webhooks | recusar | envelope recusado e encerrado; avisos; webhook na fila |
| `as_fn_reserva_finalizacao` | função | envelope, notificações | finalizar | um finalizador por vez, com id de reserva; conta a tentativa; esgotado sem alerta → enfileira o alerta |
| `as_fn_alerta_finalizacao` | função | `as_notificacoes` | finalizar | alerta ao admin uma vez só |
| `as_fn_lista_envelopes` | função | envelopes, signatários | `/painel` | filtros, busca escapada, progresso e total, sempre da conta |
| `as_fn_signatario_ativo` | função | envelope, signatário | lembrar, copiar link | trava e confere que o signatário está aguardando num envelope enviado da conta |
| `as_fn_reserva_lembrete` · `as_fn_confirma_lembrete` · `as_fn_desfaz_lembrete` | funções | signatário, notificações, trilha | Lembrar | 1 a cada 24 h, até 10; o link só muda se o e-mail saiu |
| `as_fn_copia_link` | função | signatário, trilha | Copiar link | link novo e `convite_enviado` `{canal: link_copiado}` |
| `as_fn_cancela_envelope` | função | envelope, trilha, notificações, webhooks | Cancelar | `enviado → cancelado`, avisos e webhook |
| `as_fn_exclui_envelope` | função | envelope (cascata) | Excluir | 7.4: status e título conferidos |
| `as_fn_verifica_documento` · `as_fn_resumo_publico` | funções | envelopes, signatários, contas | `/verificar` | consulta pública por hash ou código; só o resumo da regra 11.11 |
| `as_fn_api_lista_envelopes` | função | envelopes | `GET /api/v1/envelopes` | cursor por (criado_em, id) |
| `as_fn_troca_chave_api` | função | credenciais | Integrações | revoga e grava numa transação |
| `as_tg_webhook_assinou` | trigger | signatários → entregas | assinar | `signatario.assinou` na mesma transação |
| `as_fn_reserva_entrega` | função | entregas | webhooks | um envio por vez, até 6 tentativas |
| `as_fn_cria_codigo_oauth` · `as_fn_troca_codigo_oauth` | funções | códigos OAuth, credenciais | OAuth do MCP | código com redirect exato e PKCE; troca transacional pelo token `mcp` |
| `as_fn_conclui_envelope` | função | envelope, trilha, notificações, webhooks | finalizar | `finalizando → concluido` com hash, selo e caminho; eventos `finalizado` e `concluido`; e-mails de conclusão e webhook na mesma transação |
| `as_fn_falha_finalizacao` | função | envelope, notificações | finalizar | registra a falha só da própria reserva; na 3ª tentativa (ou na `integridade_violada`), alerta ao admin |
| `as_tg_final_imutavel` | trigger | `as_envelopes` | — | o resultado da finalização não se reescreve |
| `as_fn_entra_conta` | função | `as_contas`, `as_credenciais` | login | cria a conta já com a chave de API, na mesma transação; conta existente atualiza só o e-mail; suspensa não é tocada |

Os erros de negócio sobem com a mensagem igual ao código (`trilha_imutavel`, `envelope_congelado`, `envelope_em_andamento`, `status_mudou`, `campo_invalido`, `campos_demais`, `status_mudou`, `envelope_mudou`, `sem_assinante`, `limite_diario`, `limite_do_nivel`, `nao_encontrado`, `email_repetido`, `assinantes_demais`, `copias_demais`).

## 4. Mapa tela → tabelas (até o 8.8)

| Tela / rota | Lê | Escreve | Passa por |
|---|---|---|---|
| `/entrar` | — | — | — |
| `GET /api/auth/google` | — | cookie `as_oauth_google` | — |
| `GET /api/auth/google/callback` | `as_contas` (situação, contagem de 24 h) | `as_contas`, `as_credenciais` | `as_fn_entra_conta` |
| Painel (layout), boas-vindas | `as_contas` | — | `getCurrentAccount` |
| `POST /api/painel/conta/boas-vindas` | `as_contas` | `as_contas.termos_aceitos_em` | `requireConta` |
| `/painel` (Envelopes: filtros, busca, paginação) | `as_envelopes`, `as_signatarios` | — | `listEnvelopes` → `as_fn_lista_envelopes` |
| `/painel/conta` | `as_contas` | — | `getCurrentAccount` |
| `POST /sair` | — | apaga o cookie | confere o Origin |
| `/painel/envelopes/novo` | — | via as rotas abaixo | — |
| `POST /api/painel/envelopes` | — | `as_envelopes`, `as_eventos` | `requireConta`, `as_fn_cria_rascunho`, URL de upload |
| `POST /api/painel/envelopes/{id}/upload` | `as_envelopes` | — | `requireConta`, URL de upload |
| `POST /api/painel/envelopes/{id}/arquivo` | `as_envelopes`, arquivo `upload.pdf` | arquivo `original-{versao}.pdf`, e por `as_fn_anexa_arquivo` `as_envelopes` (arquivo, páginas, dimensões) e `as_campos` (apaga na troca) | `requireConta`, `validatePdf`, `as_fn_anexa_arquivo` |
| `/painel/envelopes/{id}/editar` | `as_envelopes`, `as_signatarios` | via PATCH e PUT | `getCurrentAccount` |
| `PATCH /api/painel/envelopes/{id}` | `as_envelopes` | `as_envelopes` (título, mensagem, ordem, prazo, lembrete) | `requireConta` |
| `PUT /api/painel/envelopes/{id}/signatarios` | — | `as_signatarios`, `as_campos` | `requireConta`, `as_fn_substitui_signatarios` |
| `/painel/envelopes/{id}/campos` | `as_envelopes`, `as_signatarios` (assinantes), `as_campos`, URL assinada do original | via PUT | `getCurrentAccount` |
| `PUT /api/painel/envelopes/{id}/campos` | — | `as_campos` | `requireConta`, `as_fn_substitui_campos` |
| `/painel/envelopes/{id}/revisar` | `as_envelopes`, `as_signatarios`, `as_campos`, arquivo original | — | `getCurrentAccount` |
| `POST /api/painel/envelopes/{id}/enviar` | arquivo original | `as_envelopes`, `as_signatarios`, `as_eventos`, `as_notificacoes` | `requireConta`, `validatePdf`, `as_fn_envia_envelope`, `sendInvite` |
| `/painel/envelopes/{id}` (detalhe) | `as_envelopes`, `as_signatarios`, `as_notificacoes`, `as_eventos` (linha do tempo e `as_fn_verifica_trilha`) | via as rotas abaixo | `getEnvelope`, `getSigners`, `getTrail`, `invitesWithProblem` |
| `POST …/{id}/signatarios/{sid}/lembrar` · `…/link` | — | signatário, notificações, trilha | `remindSigner`, `copySignerLink` |
| `POST …/{id}/cancelar` · `DELETE /api/painel/envelopes/{id}` | — | via `as_fn_cancela_envelope` / `as_fn_exclui_envelope`; a exclusão apaga a pasta no armazenamento | `cancelEnvelope`, `deleteEnvelope` |
| `GET …/{id}/arquivo?versao=` · `GET …/{id}/trilha.csv` | envelope, trilha | `as_eventos` (`baixou_*`) | `downloadUrl`, `getTrail`, `trailCsv` |
| `/verificar` (público) | — (o hash é calculado no navegador) | — | `VerifyForm` → `GET /api/verificar?hash=` |
| `/verificar/{codigo}` (público, o QR do manifesto) e `GET /api/verificar?codigo=` | envelopes, signatários, contas | — | `verifyDocument` → `as_fn_verifica_documento` |
| `/api/v1/*` (API REST) | as do domínio | as do domínio, com origem e ator `api` | `requireCredential` (só chave de API) → `apiRoute` → as funções de `src/server/envelopes/` |
| `/painel/integracoes` e `POST /api/painel/integracoes/{chave,revelar,webhook,webhook/teste}` | `as_credenciais`, `as_contas` | `as_credenciais` (troca), `as_contas` (webhook) | `integrationsView`, `rotateApiKey`, `revealSecret`, `saveWebhookUrl`, `sendTestWebhook` |
| `/docs/api` (público) e `GET /api/v1/openapi.json` | — | — | `openApiDocument` |
| `/.well-known/oauth-*`, `POST /oauth/registrar`, `POST /oauth/token` | `as_oauth_clientes`, `as_oauth_codigos` | clientes, códigos, credenciais `mcp` | `src/server/oauth/server.ts` |
| `/oauth/autorizar` (consentimento) e `POST /oauth/autorizar/decidir` | cliente, conta da sessão | `as_oauth_codigos` | `checkAuthorizeParams`, `createAuthorizationCode` |
| `/mcp` (POST/GET/DELETE) | as do domínio | as do domínio, com origem e ator `mcp` | `requireCredential(["api","mcp"])` → `buildMcpServer` (`src/server/mcp/tools.ts`) → `WebStandardStreamableHTTPServerTransport` |
| `POST /api/painel/integracoes/conexoes/{id}/revogar` | `as_credenciais` | `as_credenciais.revogada_em` | `revokeMcpConnection` |
| `POST /api/painel/envelopes/{id}/signatarios/{sid}/convite` | `as_signatarios`, `as_notificacoes` | `as_signatarios` (token), `as_notificacoes`, `as_eventos` | `requireConta`, `sendInvite` |
| `/painel` e `/painel/conta` (uso do nível) | `as_envelopes` (contagem) | — | `getUsage` |
| `/assinar/{token}` (signatário) | `as_signatarios`, `as_envelopes`, `as_contas`, `as_campos` | via as rotas abaixo | `loadSignerByToken`, `signerPageState` |
| `POST /api/assinar/{token}/codigo` · `/validar` | `as_signatarios` | `as_signatarios`, `as_eventos` (cookie `as_sig_{id}` ao validar) | `requireSignatarioPorToken`, `as_fn_novo_codigo`, `as_fn_valida_codigo` |
| `POST /api/assinar/{token}/visualizou` | `as_eventos` | `as_eventos` | sessão do signatário |
| `POST /api/assinar/{token}/assinar` · `/recusar` | — | via `as_fn_assina` / `as_fn_recusa`; imagens no armazenamento. A última assinatura dispara a finalização depois da resposta (`after`, `maxDuration` 60 s) | sessão do signatário |
| `GET /api/final/{signatario_id}.{hmac}` (link do e-mail de conclusão acima de 7 MB) | signatário, envelope, conta | `as_eventos` (`baixou_final`) | `readFinalDownloadKey` (HMAC); 30 dias depois de `concluido_em` |
| Finalização (servidor, sem tela) | envelope, signatários, campos, trilha; original e imagens no armazenamento | `final.pdf` no armazenamento; via `as_fn_conclui_envelope` / `as_fn_falha_finalizacao` | `finalizeEnvelope`, `retryFinalizations` |
| `GET /api/assinar/{token}/documento` | `as_envelopes` | `as_eventos` (`baixou_final`) | sessão para o original; só o link para o final (até 30 dias) |
| `PUT/GET /api/dev/arquivos/{caminho}` (só dev) | arquivo local | arquivo local | HMAC + validade; 404 em produção ou com R2 |

## 5. Lógica por tela

- **Login:** `/api/auth/google` gera state e PKCE, guarda os dois e a rota de volta (saneada: só `/painel…` e `/oauth/autorizar…`) num cookie de 10 min e vai ao Google com `openid email profile`. O callback confere o state, troca o código com o verifier, valida o `id_token` (assinatura, `aud`, `iss`, `exp`, `email_verified`), aplica bloqueados, permitidos, suspensão e o limite diário de contas novas **antes de gravar qualquer coisa**, gera a chave de API e chama `as_fn_entra_conta`. Qualquer falha volta para `/entrar?erro=…` com a frase da seção 15.
- **Proxy:** `/painel*` sem sessão válida vai para `/entrar?volta=<rota>`; sessão com mais de 7 dias é renovada; `/` redireciona para o painel ou para `/entrar` até a página inicial existir.
- **Painel:** o layout lê a conta (conta suspensa conta como inexistente) e, sem aceite, mostra só as boas-vindas. O aceite é um POST; o painel só aparece depois que o servidor confirmou (`router.refresh`), nunca por estado local.

- **Novo envelope:** escolher o PDF cria o rascunho (`POST /api/painel/envelopes`, título do nome do arquivo), sobe direto para o armazenamento pela URL assinada (progresso por XHR) e pede a validação. O servidor lê `upload.pdf` numa leitura só, limitada a 10 MB (no R2, com `Range`), apaga o upload, valida a regra 11.1 (`%PDF-`, 10 MB, senha, 1–100 páginas, página ≤ 1.440 pt) e grava **os mesmos bytes que validou** em `original-{versao}.pdf`; `as_fn_anexa_arquivo` aponta o envelope para ele numa transação e o original anterior é apagado. Arquivo inválido: nada muda e a tela mostra a frase da seção 15. Troca válida apaga os campos e avisa. PDF já assinado digitalmente passa, com aviso.
- **Editar rascunho:** o estado da tela é o que a pessoa digita; cada mudança é gravada com debounce de 800 ms (PATCH das configurações, PUT da lista inteira). A lista só é enviada se estiver válida (nome, e-mail, sem repetido). "Rascunho salvo." só depois da resposta do servidor; falha mostra "Não consegui salvar. Tente de novo." Os botões de avançar só liberam com arquivo, título e ao menos um assinante **salvo**, sem gravação pendente nem erro.
- **Editor de campos:** o servidor manda as dimensões das páginas, os assinantes, os campos e uma URL assinada de 5 min do original (ver no editor não registra `baixou_original`). O pdf.js (worker em `/pdf.worker.min.mjs`, copiado por `scripts/copy-pdf-worker.mjs` no `predev`/`prebuild`) desenha cada página quando ela chega perto da tela, na largura da coluna. Cada página tem a proporção real (`aspect-ratio`) e os campos ficam por cima em porcentagem, por isso o lugar relativo não muda com a largura. Campo novo: arrastar o tipo para a página (cai onde soltou) ou clicar (cai no centro da página que cruza o meio da tela), com o tamanho padrão da regra 11.3 ajustado à página (`defaultFieldSize`). Mover e redimensionar com o ponteiro, setas (1%), Shift + setas, Delete. Tudo passa por `clampField` (nunca fora da página). Salvamento automático em fila (`use-debounced-save.ts`, o mesmo do rascunho); "Salvar e revisar" grava na hora e só avança se o servidor confirmou. Abaixo de 768 px só aparece o aviso de usar um computador.
- **Revisar e enviar:** a revisão mostra o resumo e os avisos (assinante sem campo de assinatura num envelope com campos; PDF que já vinha assinado, recalculado lendo o original). "Enviar para assinatura" chama `sendEnvelope`: lê o original, revalida a regra 11.1, calcula o SHA-256, gera um token por assinante e chama `as_fn_envia_envelope`. Depois do commit manda os convites dos da vez (`sendInvite`, com o token que a transação gravou). Cada envio de convite reserva a notificação no banco (`as_fn_reserva_notificacao`): dois pedidos ao mesmo tempo (outra aba, faxina) não mandam dois e-mails nem trocam o link de um convite que pode estar chegando. Conta suspensa não manda convite. Falha de e-mail não desfaz o envio: a notificação fica "falhou", o detalhe mostra a faixa laranja com "Tentar de novo" (link novo) e `retryFailedInvites` (faxina, regra 11.16; rota do cron no 8.13) reenvia até 5 tentativas. Os erros saem com as frases da seção 15 (limites 429, "mudou de situação" 409).
- **Assinatura (signatário):** `/assinar/{token}` resolve o link pelo hash (`loadSignerByToken`) e o estado no servidor (`signerPageState`: inválido, indisponível, concluído, cancelado, recusado, prazo, já assinou, pendente ou ativo). No ativo, `SignerFlow` (cliente) conduz:
  - "Enviar código" chama `requestCode`, que usa `as_fn_novo_codigo` e manda o e-mail; o evento `codigo_enviado` só é gravado se o e-mail saiu;
  - o código chama `validateCode` (`as_fn_valida_codigo`) e abre o cookie `as_sig_{id}` (JWT de 2 h com o `token_hash` atual e um `jti`);
  - consentimento;
  - documento pelo pdf.js (`/documento` só com sessão), com os campos do signatário, a barra "Campos: n de m" e "Próximo campo";
  - folha da assinatura (Digitar em "Dancing Script" ou Desenhar em canvas que trava a rolagem; CPF validado pelos dígitos);
  - "Assinar" chama `sign`: confere CPF e PNG (até 200 KB), grava as imagens, chama `as_fn_assina` e, depois do commit, manda o convite do próximo e o aviso ao remetente;
  - "Recusar" chama `decline` (`as_fn_recusa`) e manda os avisos;
  - "visualizou" sai quando a primeira página aparece, uma vez por sessão (pelo `jti`).
- **Avisos por e-mail:** `src/server/notifications/notices.ts` manda `assinou_remetente`, `recusado_remetente` e `recusado_destinatario` com a mesma reserva do convite; `retryFailedNotices` é a parte da faxina (rota no 8.13).
- **MCP e OAuth (épico 8.10):**
  - **OAuth 2.1** (`src/server/oauth/`), mesmo desenho do Visão de Produto:
    - metadados com as URLs de `NEXT_PUBLIC_SITE_URL` (o do recurso também em `/…/mcp`);
    - registro de cliente público (redirect https, ou http em localhost/127.0.0.1);
    - consentimento com sessão: sem ela, vai para `/entrar?volta=` e volta;
    - a decisão por formulário, com Origin conferido;
    - código de 10 min com PKCE S256;
    - troca transacional pelo token `assina_mcp_…`, só em hash, sem prazo e sem refresh token.
  - **Erros do fluxo:** nenhum erro de `/oauth/autorizar` redireciona; tudo vai para a tela de erro (divergência 49). Código reutilizado revoga o token que gerou (divergência 51).
  - **/mcp:** SDK oficial 1.32.2, com `WebStandardStreamableHTTPServerTransport`, sem sessão e com resposta JSON; um servidor por requisição, preso à conta da credencial.
    - Sem credencial: 401 com `WWW-Authenticate: Bearer resource_metadata=…`, exposto pelo CORS.
    - As ferramentas chamam as funções do domínio com ator `mcp`. `criar_envelope` reaproveita a criação da API sem campos e sempre diz que não enviou.
    - Erro de negócio volta como `isError` com a mensagem de `copy.api.errors`.
  - **Integrações:** "Pelo aplicativo" (o endereço), "Por arquivo" (o JSON com a chave de API) e as conexões (nome, criada em, último uso) com "Revogar".
- **API REST v1 (épico 8.9):**
  - Toda rota passa por `apiRoute` (`src/server/api/v1.ts`): Bearer → hash → credencial `api` ativa → conta não suspensa (`src/server/auth/api-credential.ts`), e os erros no formato `{codigo, mensagem}` da 13.2.
  - As rotas chamam as mesmas funções do painel (princípio 5), com origem e ator `api`.
  - A criação (`src/server/envelopes/api-create.ts`) respeita a `Idempotency-Key` (índice único por conta) e desfaz o rascunho se qualquer passo falha.
  - `arquivo_url` passa por `src/server/files/fetch-remote.ts`:
    - só https;
    - o IP é conferido no lookup do próprio socket, contra DNS rebinding;
    - bloqueia privado, loopback, link-local, CGNAT, ULA e metadado de nuvem;
    - até 3 redirecionamentos conferidos de novo, 10 s e 10 MB.
  - O documento OpenAPI (`src/server/api/openapi.ts`) é validado no teste.
- **Webhooks (`src/server/webhooks/deliver.ts`):**
  - As entregas nascem na transação do fato:
    - `signatario.assinou`, pelo trigger;
    - `envelope.concluido`, `envelope.recusado` e `envelope.cancelado`, pelas funções.
  - Saem logo depois do commit (`deliverEnvelopeWebhooks`), pelo mesmo fetch protegido, sem seguir redirecionamento, com `Assina-Assinatura` (HMAC-SHA256 de `t.corpo`), `Assina-Entrega` e `Assina-Evento`.
  - Fora de 2xx, a entrega fica "falhou" com o status, e `retryWebhooks` (faxina, 8.13) reentrega até 6 vezes.
- **Integrações:** a página só recebe o prefixo da chave e a URL. A chave e o segredo em claro saem por `POST /api/painel/integracoes/revelar`, sem cache, quando a pessoa pede. O segredo `whsec_…` nasce com a primeira URL, continua o mesmo quando a URL muda e sai junto com a URL removida.
- **Verificação pública (épico 8.8):**
  - `/verificar` (`VerifyForm`, cliente) calcula o SHA-256 do PDF com a Web Crypto e manda só o hash para `GET /api/verificar`; o arquivo não sai do computador.
  - O código passa por `normalizeVerificationCode` (`src/lib/verification-code.ts`: minúsculas, espaços, hífens, O→0, I/L→1) e abre `/verificar/{codigo}`, que é renderizada no servidor.
  - As duas usam `verifyDocument` (`src/server/verification/lookup.ts`) e o mesmo `VerifyResult`.
  - A resposta da API é `no-store`.
  - Só `/verificar` é indexável; `/verificar/{codigo}` fica com o `noindex` do layout.
  - O limite de 30 por minuto por IP é regra do Vercel Firewall (README; PENDENCIAS P8).
- **Painel (`src/server/envelopes/manage.ts`, épico 8.7):** a lista é lida no servidor (`?filtro=&q=&pagina=`; filtro desconhecido vira "todos"), com o esqueleto no Suspense e os estados vazios da seção 15. O detalhe mostra ações por destinatário (Lembrar, Copiar link) e do envelope (downloads, Exportar trilha, Cancelar, Excluir) em componentes de cliente que chamam as rotas e releem a página (`router.refresh`).
  - **Lembrete manual:** reserva no banco, e-mail com link novo e confirmação. Se o e-mail falha, desfaz, e o link antigo continua.
  - **Copiar link:** sem permissão de área de transferência, o link aparece selecionado num campo, com o aviso.
  - **Excluir:** o servidor confere o título (no rascunho ele pode ter mudado depois de a tela carregar). O banco apaga em cascata, e depois `storage().deletePrefix("{conta}/{id}/")` limpa os arquivos; se isso falhar, fica `arquivos_nao_apagados` no log. O rascunho tem o "Excluir" no fim da tela de edição.
  - **CSV da trilha:** BOM, `;`, CRLF, aspas quando preciso, e um apóstrofo antes de `=`, `+`, `-` e `@` (injeção de fórmula).
- **Finalização (`src/server/envelopes/finalize.ts`):** `finalizeEnvelope(id)` reserva o envelope (com id de reserva; a tentativa conta ali, então um timeout também conta), lê o original e confere o SHA-256 (se não bater: `integridade_violada`, falha definitiva com alerta ao admin), grava os campos (`src/server/pdf/stamp.ts`), anexa o manifesto (`src/server/pdf/manifest.ts`), sela (`src/server/pdf/seal.ts`), sobe `{conta}/{id}/final-{reserva}.pdf` e chama `as_fn_conclui_envelope` com a reserva. Um finalizador atrasado (reserva vencida e tomada) não conclui, não registra falha e não grava por cima do final de ninguém; o arquivo dele é apagado. Depois do commit, manda os e-mails de conclusão. Qualquer exceção vira `as_fn_falha_finalizacao` com o código do erro, e a função nunca lança. `retryFinalizations` é a parte da faxina (rota no 8.13).
  - **Campos (11.3):** a fração gravada pelo editor é a da página como o pdf.js a mostra (CropBox, já girada). `fieldFrame` desfaz essa conta para os quatro giros, e o teste compara com `viewport.convertToPdfPoint` do próprio pdf.js. Assinatura e rubrica digitadas saem em "Dancing Script" embutida (subconjunto, `@pdf-lib/fontkit`); as desenhadas, como PNG com a proporção preservada; texto, data e nome em Helvetica 10 pt numa linha; a caixa marcada vira um ✓ em dois traços.
  - **Texto no PDF:** tudo passa por `safeText` (`src/server/pdf/fonts.ts`), porque a Helvetica padrão só codifica WinAnsi e um caractere fora dele quebraria o `drawText`.
  - **Selo (11.10):** o placeholder de 24 KB entra pelo `@signpdf/placeholder-pdf-lib` com `ETSI.CAdES.detached`, e o CMS é montado à mão com node-forge (`CadesSigner`). Os atributos assinados são `contentType`, `messageDigest` e `signingCertificateV2`; não há `signingTime`, porque no PAdES a hora vai no `/M`. Com `SELO_TSA_URL`, pede o carimbo RFC 3161 (5 s) e o põe como atributo não assinado: sai `B-T`; sem resposta, `B-B`. `verifySeal` confere o hash do ByteRange e a assinatura RSA (testes). Conferido também com `openssl cms -verify`.
  - **E-mails de conclusão:** `concluido_destinatario` (assinantes e cópias) e `concluido_remetente` levam o PDF anexo se ele tiver até 7 MB. Acima disso, o do destinatário leva o botão para o link próprio `/api/final/{signatario_id}.{hmac}` (`src/server/envelopes/final-link.ts`), estável e só para o final; o link de assinatura não muda. O do remetente leva o link do detalhe. Sem `ADMIN_EMAIL`, o alerta fica pendente e o log avisa (`alerta_admin_sem_destino`). O `finalizacao_falhou_admin` vai para `ADMIN_EMAIL`.
- **Analytics (épico 8.11, `src/server/analytics/`):**
  - `events.ts` é o catálogo da seção 21: um esquema zod `.strict()` por evento (`EVENT_SCHEMAS`), a tela de cada um (`EVENT_SCREENS`) e o tipo `PropriedadesDeEvento`, derivado dos esquemas. Propriedade fora do esquema não compila e, em tempo de execução, descarta o evento (`analytics_evento_invalido`, só com o nome).
  - `track(nome, {quem, chave?, propriedades})` (`client.ts`):
    - é síncrona, nunca lança e não espera a rede;
    - o trabalho vai para o `after()` do Next (aninhável) e, fora de uma requisição, para uma promessa solta;
    - o POST para `VISAO_INGEST_URL`, com `x-api-key: VISAO_API_KEY` e `{"eventos":[…]}`, tem timeout de 4 s;
    - falha vira só `analytics_falhou` com o status, `timeout` ou o código;
    - sem as duas variáveis, nada sai (dev e testes).
  - **Propriedades:** as que precisam de consulta (envio, assinado, concluído, MCP) são uma função que roda depois da resposta.
  - **`id`:** sha256(`nome:registro`) em formato UUID v8 (divergência 53). Sem registro, é aleatório.
  - **`distinct_id`:**
    - o e-mail do remetente, lido depois da resposta pela conta ou pelo envelope;
    - `sig_{signatario_id}` para o signatário;
    - `anon_{uuid}` na verificação.
  - **Onde nasce cada evento:**
    - callback do Google (conta nova);
    - `createDraft` (painel) ou o fim de `createEnvelopeFromApi` (API e MCP, que desfazem o rascunho se um passo falha);
    - `sendEnvelope`, `recordView`, `validateCode`, `sign` (minutos desde o primeiro convite), `decline`;
    - `finalizeEnvelope`, `cancelEnvelope`, `remindSigner`, `verifyDocument`;
    - `rotateApiKey`, `saveWebhookUrl` (com URL), `exchangeCode`;
    - `apiRoute` e `/mcp` (`trackApiCall`: amostra de 1 a cada 10 s por credencial, por instância, e rota como padrão, em que segmento desconhecido vira `{id}`).
  - **Ficam para a faxina do 8.13:** `envelope_expirado` e o lembrete automático.
- **Erros em log:** `src/server/error-code.ts` (`errorCode`) dá o código do erro (Postgres, `resend_NNN`) ou o nome da classe; é o que vai para o log e para `as_notificacoes.erro`, nunca a mensagem livre.
- **E-mail:** `src/server/email/mailer.ts` escolhe o driver: Resend com `RESEND_API_KEY`; caixa local em `.caixa-de-saida-local/` (um `.txt` e um `.html` por e-mail) só fora de produção; em produção sem chave o app falha. O modelo do convite fica em `templates.ts` (seção 15.2, HTML escapado e texto puro), com remetente "{nome} via Assina" e `reply-to` do remetente.
- **Uso do nível:** "{n} de {limite} documentos · Nível {n}" no topo da lista e na Conta, em laranja a partir de 80% (`getUsage`).
- **Armazenamento:** `src/server/files/storage.ts` escolhe o driver. `r2` com as variáveis `R2_*`; `local` (disco em `.armazenamento-local/`, URLs com HMAC servidas por `/api/dev/arquivos`) só fora de produção; em produção sem R2 o app falha.

## 6. Divergências em relação ao spec

| # | O quê | Por quê |
|---|---|---|
| 1 | Canônico da trilha em linhas, e não JSON ordenado (regra 11.6, já atualizada no spec v0.4) | O `jsonb::text` ordena chaves por tamanho; reproduzir em TypeScript seria frágil |
| 2 | Função `as_fn_entra_conta` (seção 7.5, já no spec) | Conta e chave nascem na mesma transação; o cliente do Supabase não tem transação |
| 3 | `ocorrido_em` com `clock_timestamp()` | Eventos da mesma transação teriam a mesma hora |
| 4 | `as_tg_envelope_congelado` também valida as transições de status e permite o expurgo da regra 11.14 (spec atualizado) | Como estava, o trigger barraria a própria faxina; e um `UPDATE` direto poderia tirar um envelope de `concluido` |
| 5 | As boas-vindas aparecem **no lugar do painel** (layout), não numa rota `/painel/boas-vindas` | Mesmo padrão do Reunião; uma rota própria debaixo do layout do painel entraria em laço de redirecionamento |
| 6 | `export const instant = false` no layout e nas páginas do painel | O Next 16.4 valida a navegação instantânea e acusa as rotas que dependem da sessão; o opt-out é o caminho documentado para elas |
| 7 | Next 16.4.6 em vez de 16.4.3 | 16.4.3 tem alerta moderado de segurança (GHSA-mfr8-8qww-v76h) |
| 8 | Dois triggers a mais em `as_envelopes` (`as_tg_envelope_nasce_rascunho`, `as_tg_envelope_exclusao`), já no spec | Achados do verifier no 8.1: um INSERT pulava a máquina de estado, e a 7.4 (não excluir envelope em andamento) dependia só do servidor |
| 9 | Bucket R2 ainda não criado | Precisa da conta Cloudflare da DabLab (README, seção R2); entra antes do 8.2, que é o primeiro épico a usar arquivo |
| 10 | Upload em duas etapas (`upload.pdf` → `original-{versao}.pdf`, gravando os bytes validados), troca atômica por `as_fn_anexa_arquivo` e rota extra `POST /api/painel/envelopes/{id}/upload` (spec v0.5) | Validar antes de substituir; o arquivo gravado é exatamente o validado (a URL de upload vale 2 h); um envio concorrente nunca vê arquivo pela metade |
| 11 | Driver local de arquivos e rota `/api/dev/arquivos` (só dev) | O bucket R2 ainda não existe (P2); a interface única permite trocar sem tocar no domínio |
| 12 | Ordem dos assinantes como exclusion constraint diferida, e não índice único parcial (spec v0.5) | Reordenar dentro de uma transação colidia no índice |
| 13 | Clicar num tipo da paleta também cria o campo (além de arrastar) | Caminho do teclado e do toque; arrastar e soltar nativo não existe no toque |
| 14 | Reenviar convite gera um link novo, e o anterior deixa de valer | O banco guarda só o hash do token (6.2); o token em claro não existe depois do envio |
| 15 | ~~Detalhe do envelope em versão mínima~~ | Resolvida no 8.7 |
| 16 | E-mail em dev numa caixa local (`.caixa-de-saida-local/`) | Ainda não há chave do Resend (PENDENCIAS P5) |
| 17 | Cookie do signatário com `Path=/` (spec v0.8) | Com `/assinar`, o cookie não chegaria às rotas `/api/assinar/...` |
| 18 | Webhook `envelope.recusado` só fica na fila do banco | A entrega HTTP é do épico 8.9 |
| 19 | Componentes do pdf.js extraídos para `src/features/pdf/pdf-page.tsx` | Usados pelo editor de campos e pela página do signatário |
| 20 | CSP completa adiada para o 8.13 | Precisa de nonce para os scripts do Next e do worker do pdf.js; os outros cabeçalhos da seção 17 já valem |
| 21 | Código conferido por `=` entre hashes sha256 (regra 11.4 pede tempo constante) | Comparar hashes não revela o código pelo tempo; o efeito pedido pela regra se mantém |
| 22 | `integridade_violada` é código de erro (em `erro_finalizacao` e no alerta), não evento da trilha | O enum `as_tipo_evento` da seção 7 não tem esse tipo; o envelope continua em `finalizando` e o admin recebe o alerta na hora |
| 23 | "UTC−3" sai "UTC-3" no PDF e letras fora do WinAnsi perdem o acento ou viram "?" (spec v0.9) | A Helvetica padrão do PDF só tem WinAnsi; embutir outra fonte para o texto só por isso aumentaria todo arquivo |
| 24 | E-mail de conclusão acima de 7 MB leva um link próprio de download (`/api/final/{id}.{hmac}`), não o "link do signatário" do critério | O banco guarda só o hash do link de assinatura; trocá-lo derrubaria a sessão de quem acabou de assinar e, numa retentativa do e-mail, deixaria a pessoa sem link (achado do verifier). Cópias nem tinham link |
| 25 | `validatePdf` passou a guardar o tamanho visível da página (CropBox, girado) | Era o MediaBox sem giro: numa página girada ou recortada, o editor esticava a página e o campo caía fora do lugar no PDF final |
| 26 | Webhook `signatario.assinou` ainda não é enfileirado | Fica com a entrega HTTP no 8.9; `envelope.concluido` e `envelope.recusado` já vão para a fila |
| 27 | Abrir o `final.pdf` no Adobe Reader e no Preview (critério 8.6) ainda não foi feito | Esta máquina não tem o Adobe Reader; o selo foi conferido pelo `openssl cms -verify` e pelos testes. Fica na `PENDENCIAS.md` (P6) |
| 28 | O final fica em `final-{reserva}.pdf`, e não em `final.pdf` (spec v0.9) | Com o caminho da tentativa, um finalizador atrasado nunca sobrescreve o final de um envelope concluído (achado do verifier) |
| 29 | Lembrete manual e "Copiar link" trocam o link do signatário; quem estiver no meio da assinatura com o link anterior perde a sessão | O banco só tem o hash do link: o e-mail do lembrete precisa de um link novo. No lembrete, a troca só acontece se o e-mail saiu |
| 30 | Busca da lista compara com `ilike` (maiúsculas e minúsculas), mas não ignora acento | Sem a extensão `unaccent` no projeto compartilhado; "servico" não acha "serviço" |
| 31 | CSV da trilha põe um apóstrofo antes de valores que começam com `=`, `+`, `-` ou `@` | Proteção contra injeção de fórmula na planilha; a seção 14 não pedia |
| 32 | Hash do original presente em mais de um envelope responde `original_multiplo`, sem resumo ("…digite o código que aparece no manifesto…") | O `hash_original` não é único: um modelo público enviado por várias contas mostraria título e assinantes de terceiros a quem tem o modelo (achado do verifier). Com um envelope só, o resumo aparece como no critério |
| 33 | Envelope não concluído aparece na verificação com o status; "Este envelope ainda não foi concluído." só em enviado e finalizando | A regra 11.11 só exclui rascunhos. O texto da seção 15 existe para esse caso |
| 34 | O código aceita hífens, minúsculas e as trocas do Crockford (O→0, I/L→1) | Quem copia do papel ou do QR digita como lê; o banco continua com o formato canônico |
| 35 | Limite por IP só pelo Vercel Firewall, sem contador no app | Critério 8.8 ("regra de firewall"); a regra ainda não foi criada (P8) |
| 36 | `campos` no `POST /api/v1/envelopes` só junto com `arquivo_url` | Campos precisam das páginas do arquivo; com `upload_url`, o arquivo chega depois, e a v1 não tem rota de campos (o cliente posiciona no editor) |
| 37 | Rota extra `POST /api/painel/integracoes/revelar` (spec v0.12) | Para a chave e o segredo não irem no HTML da página; só saem quando a pessoa pede "Mostrar" ou "Copiar" |
| 38 | O webhook usa o mesmo fetch protegido do `arquivo_url` (SSRF) e não segue redirecionamento | A URL é de quem configura: sem isso, daria para o servidor chamar a rede interna ou o metadado de nuvem |
| 39 | `GET /api/v1/envelopes/{id}/eventos` devolve também `divergencia` (null quando a trilha está íntegra) | Quem integra confere a integridade sem refazer a cadeia |
| 40 | `POST /lembrar` sem `signatario_id` pula, sem erro, quem recebeu lembrete há menos de 24 h ou já tem 10 | "Lembra todos" não falha por causa de um; com `signatario_id`, os erros valem |
| 41 | Códigos e status além da lista da 13.2: `lembrete_recente` (429), `limite_lembretes` e `prazo_encerrado` (409), `email_falhou` (502) e o `motivo` `arquivo_ausente` | Vêm das ações do painel que a API reaproveita (8.5 e 8.7) e que a 13.2 não previa; todos com `{codigo, mensagem}` |
| 42 | Repetir uma `Idempotency-Key` de rascunho ainda sem arquivo devolve uma `upload_url` nova | A resposta do 1º pedido pode ter se perdido; sem isso, o cliente ficaria sem como subir o PDF (achado do verifier) |
| 43 | Textos de descrição do OpenAPI ficam em `src/server/api/openapi.ts`, não em `copy.ts` | São o contrato da API para quem integra, versionado junto com as rotas; os limites vêm de `limits.ts` |
| 44 | SDK do MCP na versão estável 1.32.2 (transporte web padrão), e não a linha 2.x usada no Visão de Produto | A 1.x tem o transporte Request→Response que a rota do Next precisa e não é beta |
| 45 | A decisão do consentimento vai por `POST /oauth/autorizar/decidir` (spec v0.13) | No App Router, a página e a rota não moram no mesmo segmento; a rota confere tudo de novo e exige sessão e Origin |
| 46 | Metadados do recurso também em `/.well-known/oauth-protected-resource/mcp` | Alguns clientes pedem a forma com o caminho do recurso (RFC 9728) antes da raiz |
| 47 | `listar_envelopes` busca pela lista do painel (até 500 por grupo de status) e filtra o status exato | Reaproveita a busca escapada e o "n de m"; o limite cobre o volume do MVP (11.13) |
| 48 | Roteiro do Claude e do ChatGPT no README sem prints | Sem deploy, os aplicativos não alcançam o `/mcp` (PENDENCIAS P9) |
| 49 | Nenhum erro de `/oauth/autorizar` redireciona para o cliente: pedido inválido mostra a tela "Este pedido de conexão não é válido."; só "Permitir" e "Cancelar", com sessão, voltam | Qualquer um registra um cliente com o redirect que quiser; redirecionar pedido malformado sem sessão nem clique tornaria o domínio um redirecionador aberto (RFC 9700 §4.11.2, achado do verifier) |
| 50 | Consentimento mostra também "Depois, você volta para {host}." | O nome do cliente é autodeclarado (um cliente pode se chamar "Claude"); o host de volta não mente |
| 51 | Código reutilizado revoga o token emitido com ele; a troca não lança exceção, devolve nulo (coluna `as_oauth_codigos.credencial_id`) | RFC 9700: reuso indica vazamento. Uma exceção desfaria a revogação na mesma transação |
| 52 | Migrations ainda não aplicadas no remoto | O hook `guard-production.sh` da sessão em que o épico foi feito (pasta do agenda-psi) bloqueou o `apply_migration`; aguardando o Alexandre |
| 53 | `id` do evento de analytics é sha256(`nome:registro`) em formato UUID, e não o id do registro em si | O mesmo envelope gera vários eventos (criado, enviado, concluído…). Com o id puro, o ingest deduplicaria todos menos o primeiro. Continua estável por evento e registro, que é o que a seção 21 queria |
| 54 | Na verificação pública, `distinct_id` = `anon_{uuid}`, um por consulta | A seção 21 não diz; quem verifica não tem conta, e o ingest exige `distinct_id` |
| 55 | `documento_verificado` pelo código: `resultado` é `final` se o envelope está concluído, senão `original`; `original_multiplo` conta como `original` | A seção 21 fecha o resultado em três valores; o banco tem cinco |
| 56 | `assina_api_chamada` também para o `/mcp` (rota `/mcp`), com a mesma amostragem | O MCP é a outra porta de máquina; a métrica "contas pela API ou pelo MCP" precisa das duas |
