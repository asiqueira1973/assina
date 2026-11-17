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
