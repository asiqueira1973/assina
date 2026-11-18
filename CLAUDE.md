@AGENTS.md

# CLAUDE.md — Assina

Fonte única de verdade: `spec.md`. Planos aprovados: `plans/`. Os princípios da seção 0 desempatam dúvidas. Itens da seção 25 → **pare e pergunte**. A partir do fim da implementação, o `DOCUMENTACAO-TECNICA.md` descreve o que existe. Mudou schema, rota ou tela → atualize-o no mesmo commit, junto com este arquivo e o README quando couber.

## Regra de ouro
Se um teste falhar, corrija o código, não o teste; nunca pule nem apague teste que falha.
Bug: teste que reproduz → ver falhar → commit → `touch .claude/fix-mode` → corrigir → `rm .claude/fix-mode`.

## Estado
Épicos 8.0 a 8.11 (rascunho, upload, editor de campos, envio, assinatura, finalização com manifesto e selo, painel, verificação pública, API REST, webhooks, MCP e OAuth, analytics) concluídos. Migrations aplicadas só no **local**; pendências do Alexandre em `PENDENCIAS.md`. Próximo: 8.12 (página inicial, páginas legais e proteções). E-mail em dev vai para `.caixa-de-saida-local/`.

## Convenções (seção 18)
- Banco em português `snake_case`, **sempre com prefixo `as_`** (projeto Supabase compartilhado `jeesdmfcrmhyufwzwzwt`). Código, variáveis e arquivos em inglês; fronteira em `src/server/db/`.
- Cabeçalho em português em toda função, rota, trigger e função SQL: o que faz, recebe, devolve e a regra (`// Implementa a regra 11.4`).
- Segredos só em `src/server/`, `src/app/api/`, `src/app/mcp/`, `src/app/oauth/`, `src/app/sair/` e `scripts/`. Todo arquivo de `src/server/` começa com `import "server-only"`.
- Copy só em `src/lib/copy.ts`; números só em `src/lib/limits.ts`, com o número da regra.
- Painel, API REST e MCP chamam `src/server/envelopes/` (princípio 5). Arquivo só por `src/server/files/storage.ts` (Cloudflare R2).

## Comandos
- `npm run verify` — typecheck, lint, `test` (guardrails 29/29 + pgTAP + Vitest), build e `npm audit`. Saída saudável: `29 de 29 casos ok`, `Result: PASS`, `Tests N passed`, tabela de rotas do `next build`, `found 0 vulnerabilities`, código 0.
- `npm run dev` em `http://localhost:3030` · `supabase start` (portas 555xx) · `npm run db:types` · `npm run db:schema`.

## Pegadinhas
- Remoto compartilhado: migrations pelo MCP `apply_migration` (mesmo SQL do arquivo), **nunca** `supabase db push`; advisors filtrados a `as_*`; regenerar `supabase/schema.sql` no mesmo commit. Supabase local nas portas **555xx**.
- Service role ignora RLS: toda consulta filtra por `conta_id` ou `token_hash`.
- Trilha (`as_eventos`) só por `rpc('as_fn_registra_evento')`. O hook bloqueia escrita direta.
- Texto que explica o que o Assina **não** é ("ICP-Brasil", "certificado digital") fica no bloco `LEGAL_NEGATIVAS` do `copy.ts`. Um Edit que mexa só no meio desse bloco é barrado pelo `guard-copy` porque o trecho não traz a linha `LEGAL_NEGATIVAS`: nesse caso, edite o bloco inteiro.
- O `guard-copy` lê o arquivo inteiro, comentários inclusive: em `src/app`, `src/features`, `copy.ts`, e-mail e manifesto, nem comentário pode dizer "assinatura digital", "certificado digital" etc. Escreva "assinado eletronicamente".
- Regex com acento em hook: o grep do macOS compara byte a byte dentro de `[...]`. Use alternância `(a|á)`, nunca `[aá]`.
- Hook novo ou alterado → acrescente casos em `scripts/test-guardrails.sh` e atualize o Anexo B do spec no mesmo commit.
- Nunca logar e-mail, nome, CPF, título, token, código ou URL `/assinar/…`.
- Página ou layout do painel (lê a sessão) leva `export const instant = false`, senão o Next 16.4 acusa "Could not validate that a segment… has instant navigation". O opt-out vale por segmento: página nova também precisa.
- O console do navegador guarda erros antigos entre recargas na mesma aba: para conferir se um erro sumiu, abra uma aba nova.
- Docker dividido com outros Supabase locais (otcb, Reunião): se o Postgres travar ou der `57014`, pare os outros.
- Testes de rota usam o banco local real: cada teste cria a própria conta e apaga no `afterAll`; nunca apague "tudo". No pgTAP também: toda consulta filtra pelo id ou código da fixture (o banco local tem dados de teste manual; um `where email = …` solto pega linha de outro envelope e quebra o plano).
- O Next 16 mantém a página anterior escondida no DOM: em teste no navegador, `querySelector` pode achar a cópia invisível (largura 0). Filtre pelo elemento visível.
- O worker do pdf.js vai para `public/` pelo `predev`/`prebuild` (não versionado, fora do ESLint). Rodar `next dev` direto, sem `npm run`, deixa o editor sem worker.
- Código de verificação em teste: 12 caracteres de `0-9A-HJKMNP-TV-Z` (base32 Crockford, sem I, L, O, U). Inventar "LIVR…" ou "OUTR…" quebra o check do banco e o teste falha longe do motivo (errado quatro vezes): no Vitest use `generateVerificationCode()`; no pgTAP o `npm run test:db` agora recusa um literal com I, L, O ou U antes de rodar.
- CSS module: o mesmo nome de classe declarado duas vezes no arquivo vale pela última, para todos os elementos que o usam (o campo do formulário virou o campo do PDF). Nome por papel: `.field` (formulário), `.docField` (sobre o PDF).
- Parâmetro de função SQL sem default vira `string` obrigatória nos tipos gerados; para mandar nulo use o helper `nullable()` (`src/server/signing/actions.ts`) em vez de `undefined`.
- Editou uma migration já aplicada no local? O banco não muda sozinho: `supabase db reset --local` e `npm run db:types`. Sem isso, a chamada dá `PGRST202` (função não encontrada) e o teste falha longe do motivo.
- Texto desenhado no PDF passa por `safeText` (`src/server/pdf/fonts.ts`): a Helvetica padrão só tem WinAnsi, e um "−" ou "Ł" quebraria o `drawText`. Selo e certificado de teste: `tests/fixtures/seal.ts` (o `tests/setup.ts` já põe no ambiente).
- `next typegen` gera `PageProps`/`LayoutProps`: rode `npm run typecheck`, não `tsc` direto.
- Enquanto os hooks do Assina não disparam na sessão (PENDENCIAS P4), os guardas rodam à mão, e um bloqueio tem de **impedir o commit** (`[ "$n" -eq 0 ] && git commit …`). No 8.8, um bloqueio do `guard-secrets` (componente de cliente importando tipo de `src/server/`) passou porque o commit vinha encadeado depois da varredura. Tipos usados pelo cliente moram fora de `src/server/` (ex.: `src/features/verify/types.ts`).
- Fetch para URL de fora (arquivo_url, webhook) só por `src/server/files/fetch-remote.ts` (SSRF); a exceção é o POST ao Visão do Produto, cuja URL vem do operador. Nos testes, `setRemoteFetchTestMode(true)` libera loopback, http e certificado autoassinado (`tests/https-server.ts`); o banco só aceita webhook `https://`.
- Analytics só por `track()` (`src/server/analytics/client.ts`), que não espera nem lança; propriedade nova entra no esquema `.strict()` de `events.ts` (o que não está lá é descartado). Teste: `setAnalyticsSinkForTests` + `flushAnalytics()`. O `tests/setup.ts` apaga `VISAO_*`.
- Quando o agente errar a mesma coisa duas vezes, a correção entra aqui.
