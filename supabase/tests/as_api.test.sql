-- Épico 8.9 / seções 6.3 e 13.2 / regras 11.8 e 11.17: lista por cursor, troca da chave,
-- webhook signatario.assinou na transação da assinatura e reserva das entregas.
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

insert into public.as_contas (id, google_sub, email, nome, webhook_url, webhook_segredo_cifrado) values
  ('00000000-0000-0000-0000-0000000009f1', 'sub-api', 'api@teste.dev', 'Remetente', 'https://hook.example/api', 'x');
insert into public.as_credenciais (conta_id, tipo, nome, prefixo, valor_hash, valor_cifrado)
values ('00000000-0000-0000-0000-0000000009f1', 'api', 'Chave de API', 'assina_aaaaa', repeat('a', 64), 'cifrado-a');

-- Troca da chave: a anterior revogada na mesma transação, uma ativa só.
select lives_ok($$select public.as_fn_troca_chave_api('00000000-0000-0000-0000-0000000009f1', repeat('b', 64), 'assina_bbbbb', 'cifrado-b')$$, 'troca a chave');
select results_eq($$select valor_hash, revogada_em is null from public.as_credenciais where conta_id = '00000000-0000-0000-0000-0000000009f1' order by criado_em, valor_hash$$,
  $$values (repeat('a', 64), false), (repeat('b', 64), true)$$, 'a anterior revogada, a nova ativa');

-- Lista por cursor: 3 envelopes, mais recentes primeiro.
insert into public.as_envelopes (id, conta_id, titulo, origem, codigo_verificacao, criado_em) values
  ('00000000-0000-0000-0000-0000000009e1', '00000000-0000-0000-0000-0000000009f1', 'E1', 'api', 'APXA2345APXA', now() - interval '3 minutes'),
  ('00000000-0000-0000-0000-0000000009e2', '00000000-0000-0000-0000-0000000009f1', 'E2', 'api', 'APXB2345APXB', now() - interval '2 minutes'),
  ('00000000-0000-0000-0000-0000000009e3', '00000000-0000-0000-0000-0000000009f1', 'E3', 'api', 'APXC2345APXC', now() - interval '1 minute');
select results_eq($$select titulo from public.as_fn_api_lista_envelopes('00000000-0000-0000-0000-0000000009f1', null, 2, null, null)$$,
  $$values ('E3'::text), ('E2'::text)$$, 'primeira página');
select results_eq($$select titulo from public.as_fn_api_lista_envelopes('00000000-0000-0000-0000-0000000009f1', null, 2,
                      (select criado_em from public.as_envelopes where id = '00000000-0000-0000-0000-0000000009e2'), '00000000-0000-0000-0000-0000000009e2')$$,
  $$values ('E1'::text)$$, 'depois do cursor');
select is((select count(*)::int from public.as_fn_api_lista_envelopes('00000000-0000-0000-0000-0000000009f1', 'enviado', 10, null, null)), 0, 'filtro por status');
select is((select count(*)::int from public.as_fn_api_lista_envelopes('00000000-0000-0000-0000-0000000009f1', null, 1000, null, null)), 3, 'limite com teto');

-- Webhook signatario.assinou: entra junto com a assinatura.
insert into public.as_signatarios (id, envelope_id, conta_id, papel, ordem, nome, email, token_hash) values
  ('00000000-0000-0000-0000-0000000009a1', '00000000-0000-0000-0000-0000000009e1', '00000000-0000-0000-0000-0000000009f1', 'assinar', 1, 'Ana', 'ana@api.dev', 'tok-api-ana');
update public.as_envelopes set status = 'enviado', hash_original = repeat('c', 64), enviado_em = now(), prazo_em = now() + interval '30 days', paginas = 1, arquivo_original_path = 'a/b/o.pdf'
 where id = '00000000-0000-0000-0000-0000000009e1';
update public.as_signatarios set status = 'aguardando' where id = '00000000-0000-0000-0000-0000000009a1';
select is((select count(*)::int from public.as_entregas_webhook where envelope_id = '00000000-0000-0000-0000-0000000009e1'), 0, 'aguardando não gera webhook');
update public.as_signatarios set status = 'assinou', assinado_em = now() where id = '00000000-0000-0000-0000-0000000009a1';
select results_eq($$select evento, corpo -> 'signatario' ->> 'email', corpo -> 'envelope' ->> 'status' from public.as_entregas_webhook where envelope_id = '00000000-0000-0000-0000-0000000009e1'$$,
  $$values ('signatario.assinou'::text, 'ana@api.dev'::text, 'enviado'::text)$$, 'signatario.assinou com o signatário');

-- Reserva da entrega: conta a tentativa, uma por vez, até o máximo.
select is(public.as_fn_reserva_entrega((select id from public.as_entregas_webhook where envelope_id = '00000000-0000-0000-0000-0000000009e1'), 6), true, 'reserva');
select is(public.as_fn_reserva_entrega((select id from public.as_entregas_webhook where envelope_id = '00000000-0000-0000-0000-0000000009e1'), 6), false, 'segunda reserva enquanto vale');
update public.as_entregas_webhook set reservada_em = null, tentativas = 6 where envelope_id = '00000000-0000-0000-0000-0000000009e1';
select is(public.as_fn_reserva_entrega((select id from public.as_entregas_webhook where envelope_id = '00000000-0000-0000-0000-0000000009e1'), 6), false, 'esgotada no 6º');

select * from finish();
rollback;
