@AGENTS.md

# CLAUDE.md — Assina

Fonte única de verdade: `spec.md`. Planos aprovados: `plans/`. Os princípios da seção 0 desempatam dúvidas. Itens da seção 25 → **pare e pergunte**. A partir do fim da implementação, o `DOCUMENTACAO-TECNICA.md` descreve o que existe. Mudou schema, rota ou tela → atualize-o no mesmo commit, junto com este arquivo e o README quando couber.

## Regra de ouro
Se um teste falhar, corrija o código, não o teste; nunca pule nem apague teste que falha.
Bug: teste que reproduz → ver falhar → commit → `touch .claude/fix-mode` → corrigir → `rm .claude/fix-mode`.

## Estado
Épicos 8.0 (guardrails) e 8.1 (banco, login Google, boas-vindas) concluídos. Migrations do 8.1 aplicadas só no **local**; o remoto aguarda o Alexandre (`plans/8.1-fundacao.md`). Próximo: 8.2 (novo envelope, R2).

## Convenções (seção 18)
- Banco em português `snake_case`, **sempre com prefixo `as_`** (projeto Supabase compartilhado `jeesdmfcrmhyufwzwzwt`). Código, variáveis e arquivos em inglês; fronteira em `src/server/db/`.
- Cabeçalho em português em toda função, rota, trigger e função SQL: o que faz, recebe, devolve e a regra (`// Implementa a regra 11.4`).
- Segredos só em `src/server/`, `src/app/api/`, `src/app/mcp/`, `src/app/oauth/`, `src/app/sair/` e `scripts/`. Todo arquivo de `src/server/` começa com `import "server-only"`.
- Copy só em `src/lib/copy.ts`; números só em `src/lib/limits.ts`, com o número da regra.
- Painel, API REST e MCP chamam `src/server/envelopes/` (princípio 5). Arquivo só por `src/server/files/storage.ts` (Cloudflare R2).

## Comandos
- `npm run verify` — typecheck, lint, `test` (guardrails 27/27 + pgTAP + Vitest), build e `npm audit`. Saída saudável: `27 de 27 casos ok`, `Result: PASS`, `Tests N passed`, tabela de rotas do `next build`, `found 0 vulnerabilities`, código 0.
- `npm run dev` em `http://localhost:3030` · `supabase start` (portas 555xx) · `npm run db:types` · `npm run db:schema`.

## Pegadinhas
- Remoto compartilhado: migrations pelo MCP `apply_migration` (mesmo SQL do arquivo), **nunca** `supabase db push`; advisors filtrados a `as_*`; regenerar `supabase/schema.sql` no mesmo commit. Supabase local nas portas **555xx**.
- Service role ignora RLS: toda consulta filtra por `conta_id` ou `token_hash`.
- Trilha (`as_eventos`) só por `rpc('as_fn_registra_evento')`. O hook bloqueia escrita direta.
- Texto que explica o que o Assina **não** é ("ICP-Brasil", "certificado digital") fica no bloco `LEGAL_NEGATIVAS` do `copy.ts`. Um Edit que mexa só no meio desse bloco é barrado pelo `guard-copy` porque o trecho não traz a linha `LEGAL_NEGATIVAS`: nesse caso, edite o bloco inteiro.
- Regex com acento em hook: o grep do macOS compara byte a byte dentro de `[...]`. Use alternância `(a|á)`, nunca `[aá]`.
- Hook novo ou alterado → acrescente casos em `scripts/test-guardrails.sh` e atualize o Anexo B do spec no mesmo commit.
- Nunca logar e-mail, nome, CPF, título, token, código ou URL `/assinar/…`.
- Página ou layout do painel (lê a sessão) leva `export const instant = false`, senão o Next 16.4 acusa "Could not validate that a segment… has instant navigation". O opt-out vale por segmento: página nova também precisa.
- O console do navegador guarda erros antigos entre recargas na mesma aba: para conferir se um erro sumiu, abra uma aba nova.
- Docker dividido com outros Supabase locais (otcb, Reunião): se o Postgres travar ou der `57014`, pare os outros.
- Testes de rota usam o banco local real: cada teste cria a própria conta e apaga no `afterAll`; nunca apague "tudo".
- `next typegen` gera `PageProps`/`LayoutProps`: rode `npm run typecheck`, não `tsc` direto.
- Quando o agente errar a mesma coisa duas vezes, a correção entra aqui.
