# Documentação técnica — Assina

Descreve o sistema **como está implementado**, não como foi planejado (spec.md, seção 19). Atualizado no mesmo commit de toda mudança de schema, trigger, rota ou tela.

| | |
|---|---|
| Estado | Épicos 8.0 e 8.1 concluídos em 17/11/2026. Migrations aplicadas no **Supabase local**; o remoto compartilhado aguarda (ver seção 6) |
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
| `as_envelopes` | Um documento enviado para assinatura | `status`: ver enum. `origem`: por onde nasceu (painel, API ou MCP). `hash_original`: SHA-256 do PDF, preenchido no envio e nunca mais alterado. `codigo_verificacao`: 12 caracteres base32 Crockford, impresso no manifesto. `arquivos_expurgados_em`: quando a faxina apagou os arquivos de um envelope encerrado sem conclusão |
| `as_signatarios` | Quem assina (`assinar`) ou só recebe cópia (`copia`) | `token_hash`: SHA-256 do token do link (o link em si não fica no banco). `ordem`: 1–10, única entre os assinantes do envelope. `codigo_*`: o código de 6 dígitos atual e seus contadores. `ip_assinatura`/`user_agent_assinatura`: evidência do momento da assinatura |
| `as_campos` | Campos posicionados no PDF | `x`, `y`, `largura`, `altura` em fração da página (0–1, origem no canto superior esquerdo); o campo nunca passa da borda (check). `valor`: preenchido na assinatura |
| `as_eventos` | Trilha de auditoria | Só inserção. `seq` 1, 2, 3… por envelope. `hash` encadeado no `hash_anterior` (regra 11.6). `ocorrido_em`: relógio do banco |
| `as_notificacoes` | Cada e-mail a enviar, para não repetir e para retentar | `chave`: idempotência (o mesmo e-mail não sai duas vezes) |
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
| `as_fn_entra_conta` | função | `as_contas`, `as_credenciais` | login | cria a conta já com a chave de API, na mesma transação; conta existente atualiza só o e-mail; suspensa não é tocada |

Os erros de negócio sobem com a mensagem igual ao código (`trilha_imutavel`, `envelope_congelado`, `envelope_em_andamento`, `status_mudou`, `campo_invalido`).

## 4. Mapa tela → tabelas (até o 8.1)

| Tela / rota | Lê | Escreve | Passa por |
|---|---|---|---|
| `/entrar` | — | — | — |
| `GET /api/auth/google` | — | cookie `as_oauth_google` | — |
| `GET /api/auth/google/callback` | `as_contas` (situação, contagem de 24 h) | `as_contas`, `as_credenciais` | `as_fn_entra_conta` |
| Painel (layout), boas-vindas | `as_contas` | — | `getCurrentAccount` |
| `POST /api/painel/conta/boas-vindas` | `as_contas` | `as_contas.termos_aceitos_em` | `requireConta` |
| `/painel` (Envelopes, estado vazio) | — | — | — |
| `/painel/conta` | `as_contas` | — | `getCurrentAccount` |
| `POST /sair` | — | apaga o cookie | confere o Origin |

## 5. Lógica por tela

- **Login:** `/api/auth/google` gera state e PKCE, guarda os dois e a rota de volta (saneada: só `/painel…` e `/oauth/autorizar…`) num cookie de 10 min e vai ao Google com `openid email profile`. O callback confere o state, troca o código com o verifier, valida o `id_token` (assinatura, `aud`, `iss`, `exp`, `email_verified`), aplica bloqueados, permitidos, suspensão e o limite diário de contas novas **antes de gravar qualquer coisa**, gera a chave de API e chama `as_fn_entra_conta`. Qualquer falha volta para `/entrar?erro=…` com a frase da seção 15.
- **Proxy:** `/painel*` sem sessão válida vai para `/entrar?volta=<rota>`; sessão com mais de 7 dias é renovada; `/` redireciona para o painel ou para `/entrar` até a página inicial existir.
- **Painel:** o layout lê a conta (conta suspensa conta como inexistente) e, sem aceite, mostra só as boas-vindas. O aceite é um POST; o painel só aparece depois que o servidor confirmou (`router.refresh`), nunca por estado local.

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
| 10 | Migrations ainda não aplicadas no remoto | O hook `guard-production.sh` da sessão em que o épico foi feito (pasta do agenda-psi) bloqueou o `apply_migration`; aguardando o Alexandre |
