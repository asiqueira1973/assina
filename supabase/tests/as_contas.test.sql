-- Seção 6.1 / regra 11.8 / critério 8.1: a conta nasce junto com a chave de API; o segundo login
-- não duplica nada; conta suspensa não é tocada; no máximo uma chave de API ativa por conta.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

select results_eq(
  $$select nova, suspensa from public.as_fn_entra_conta('sub-1', 'Ana@Teste.dev', 'Ana', 'hash-1', 'assina_abcde', 'cifrada-1')$$,
  $$values (true, false)$$,
  'primeiro login cria a conta'
);
select is((select email from public.as_contas where google_sub = 'sub-1'), 'ana@teste.dev', 'e-mail gravado em minúsculas');
select is(
  (select count(*)::int from public.as_credenciais c join public.as_contas a on a.id = c.conta_id
    where a.google_sub = 'sub-1' and c.tipo = 'api' and c.revogada_em is null),
  1, 'conta nova nasce com uma chave de API ativa'
);

select results_eq(
  $$select nova, suspensa from public.as_fn_entra_conta('sub-1', 'ana.nova@teste.dev', 'Outro Nome', 'hash-2', 'assina_fghij', 'cifrada-2')$$,
  $$values (false, false)$$,
  'segundo login não cria conta'
);
select is((select count(*)::int from public.as_contas where google_sub = 'sub-1'), 1, 'continua uma conta só');
select is(
  (select count(*)::int from public.as_credenciais c join public.as_contas a on a.id = c.conta_id where a.google_sub = 'sub-1'),
  1, 'segundo login não cria outra chave'
);
select results_eq(
  $$select email, nome from public.as_contas where google_sub = 'sub-1'$$,
  $$values ('ana.nova@teste.dev'::text, 'Ana'::text)$$,
  'e-mail atualizado; nome editável não é sobrescrito'
);

update public.as_contas set suspensa_em = now() where google_sub = 'sub-1';
select results_eq(
  $$select nova, suspensa from public.as_fn_entra_conta('sub-1', 'outro@teste.dev', 'Ana', 'hash-3', 'assina_klmno', 'cifrada-3')$$,
  $$values (false, true)$$,
  'conta suspensa é reconhecida e não é tocada'
);

select throws_ok(
  $$insert into public.as_credenciais (conta_id, tipo, nome, prefixo, valor_hash, valor_cifrado)
    select id, 'api', 'Chave de API', 'assina_x', 'hash-4', 'cifrada-4' from public.as_contas where google_sub = 'sub-1'$$,
  '23505', null, 'segunda chave de API ativa na mesma conta é recusada'
);

select * from finish();
rollback;
