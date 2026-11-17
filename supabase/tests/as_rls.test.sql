-- Seção 6.5 / critério 8.1: todas as as_* com RLS ligado, sem política, sem privilégio para
-- anon/authenticated, e nenhuma função as_fn_* executável por eles (o banco só é usado pelo
-- servidor com service role).
begin;
create extension if not exists pgtap with schema extensions;
select plan(137);

select ok(c.relrowsecurity, 'RLS ligado em ' || c.relname)
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'as\_%'
order by c.relname;

select is(
  (select count(*)::int from pg_policies where schemaname = 'public' and tablename like 'as\_%'),
  0, 'nenhuma política nas tabelas as_*'
);

select ok(not has_table_privilege(r, c.oid, p), r || ' sem ' || p || ' em ' || c.relname)
from pg_class c join pg_namespace n on n.oid = c.relnamespace,
     unnest(array['anon', 'authenticated']) r,
     unnest(array['select', 'insert', 'update', 'delete']) p
where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'as\_%'
order by c.relname, r, p;

select ok(not has_function_privilege(r, p.oid, 'execute'), r || ' não executa ' || p.proname)
from pg_proc p join pg_namespace n on n.oid = p.pronamespace,
     unnest(array['anon', 'authenticated']) r
where n.nspname = 'public' and p.proname like 'as\_fn\_%'
order by p.proname, r;

-- Como anon, selecionar falha com permissão negada.
set local role anon;
select throws_ok('select * from public.as_contas', '42501', null, 'anon não lê as_contas');
reset role;

select * from finish();
rollback;
