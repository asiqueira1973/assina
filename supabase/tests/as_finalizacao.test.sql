-- Épico 8.6 / regra 11.10 / seção 12: reserva (com a tentativa contada nela), conclusão, falhas,
-- finalizador atrasado e alerta ao admin, no banco.
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

insert into public.as_contas (id, google_sub, email, nome, webhook_url, webhook_segredo_cifrado)
values ('00000000-0000-0000-0000-0000000006f1', 'sub-fin', 'fin@teste.dev', 'Remetente', 'https://hook.example/fin', 'x');
insert into public.as_envelopes (id, conta_id, titulo, origem, codigo_verificacao, paginas, arquivo_original_path)
values ('00000000-0000-0000-0000-0000000006e1', '00000000-0000-0000-0000-0000000006f1', 'Contrato', 'painel', 'FNZA2345FNZA', 1, 'a/b/original-1.pdf');
insert into public.as_signatarios (id, envelope_id, conta_id, papel, ordem, nome, email, token_hash) values
  ('00000000-0000-0000-0000-0000000006a1', '00000000-0000-0000-0000-0000000006e1', '00000000-0000-0000-0000-0000000006f1', 'assinar', 1, 'Ana', 'ana@fin.dev', 'tok-fin-ana'),
  ('00000000-0000-0000-0000-0000000006a2', '00000000-0000-0000-0000-0000000006e1', '00000000-0000-0000-0000-0000000006f1', 'copia', 1, 'Caio', 'caio@fin.dev', 'tok-fin-caio');
update public.as_envelopes set status = 'enviado', hash_original = repeat('a', 64), enviado_em = now() - interval '1 hour', prazo_em = now() + interval '30 days'
 where id = '00000000-0000-0000-0000-0000000006e1';

create function pg_temp.reserva(p_max integer default 3) returns table (resultado text, reserva uuid) language sql as $$
  select * from public.as_fn_reserva_finalizacao('00000000-0000-0000-0000-0000000006e1', p_max)
$$;
create function pg_temp.caminho(p_reserva uuid) returns text language sql as $$
  select '00000000-0000-0000-0000-0000000006f1/00000000-0000-0000-0000-0000000006e1/final-' || p_reserva || '.pdf'
$$;
create function pg_temp.vencer() returns void language sql as $$
  update public.as_envelopes set finalizacao_reservada_em = now() - interval '6 minutes' where id = '00000000-0000-0000-0000-0000000006e1'
$$;

-- Fora de finalizando não há reserva.
select is((select resultado from pg_temp.reserva()), 'ocupado', 'enviado não se reserva para finalizar');
select is(public.as_fn_transicao_envelope('00000000-0000-0000-0000-0000000006e1', 'enviado', 'finalizando'), true, 'enviado → finalizando');

-- 1ª tentativa: reserva conta e falha registra.
create temp table r1 as select * from pg_temp.reserva();
select is((select resultado from r1), 'ok', '1ª reserva');
select is((select tentativas_finalizacao::int from public.as_envelopes where id = '00000000-0000-0000-0000-0000000006e1'), 1, 'a tentativa conta ao reservar');
select is((select resultado from pg_temp.reserva()), 'ocupado', 'segunda reserva enquanto a primeira vale');
select results_eq($$select tentativas, alerta from public.as_fn_falha_finalizacao('00000000-0000-0000-0000-0000000006e1', (select reserva from r1), 'selo_sem_certificado', 3)$$,
  $$values (1, false)$$, '1ª falha registrada, sem alerta');
select results_eq($$select status::text, tentativas_finalizacao::int, erro_finalizacao, finalizacao_reserva is null from public.as_envelopes where id = '00000000-0000-0000-0000-0000000006e1'$$,
  $$values ('finalizando'::text, 1, 'selo_sem_certificado'::text, true)$$, 'continua finalizando, reserva solta');

-- 2ª tentativa (A) vence; 3ª (B) a toma. A, atrasado, não conclui nem solta a reserva de B.
create temp table ra as select * from pg_temp.reserva();
select pg_temp.vencer();
create temp table rb as select * from pg_temp.reserva();
select is((select resultado from rb), 'ok', 'reserva vencida é tomada (3ª tentativa)');
select throws_ok($$select public.as_fn_conclui_envelope('00000000-0000-0000-0000-0000000006e1', (select reserva from ra), pg_temp.caminho((select reserva from ra)), repeat('b', 64), 'B-B', now())$$,
  'P0001', 'sem_reserva', 'finalizador atrasado não conclui');
select results_eq($$select tentativas, alerta from public.as_fn_falha_finalizacao('00000000-0000-0000-0000-0000000006e1', (select reserva from ra), 'atrasado', 3)$$,
  $$values (3, false)$$, 'a falha do atrasado não mexe em nada');
select is((select finalizacao_reserva from public.as_envelopes where id = '00000000-0000-0000-0000-0000000006e1'), (select reserva from rb), 'a reserva de B continua');

-- Conclusão por B: caminho da reserva e data conferidos.
select throws_ok($$select public.as_fn_conclui_envelope('00000000-0000-0000-0000-0000000006e1', (select reserva from rb), '00000000-0000-0000-0000-0000000006f1/00000000-0000-0000-0000-0000000006e1/final.pdf', repeat('b', 64), 'B-B', now())$$,
  'P0001', 'caminho_invalido', 'final fora do caminho da reserva');
select throws_ok($$select public.as_fn_conclui_envelope('00000000-0000-0000-0000-0000000006e1', (select reserva from rb), pg_temp.caminho((select reserva from rb)), repeat('b', 64), 'B-B', now() + interval '1 day')$$,
  'P0001', 'data_invalida', 'conclusão no futuro');
select lives_ok($$select public.as_fn_conclui_envelope('00000000-0000-0000-0000-0000000006e1', (select reserva from rb), pg_temp.caminho((select reserva from rb)), repeat('b', 64), 'B-T', now())$$,
  'conclui');
select results_eq($$select status::text, hash_final, selo, arquivo_final_path = pg_temp.caminho((select reserva from rb)), concluido_em is not null, finalizacao_reserva is null, erro_finalizacao is null, tentativas_finalizacao::int
                     from public.as_envelopes where id = '00000000-0000-0000-0000-0000000006e1'$$,
  $$values ('concluido'::text, repeat('b', 64), 'B-T'::text, true, true, true, true, 3)$$, 'concluido com hash, selo, caminho e as tentativas usadas');
select results_eq($$select tipo::text, dados from public.as_eventos where envelope_id = '00000000-0000-0000-0000-0000000006e1' order by seq desc limit 2$$,
  $$values ('concluido'::text, '{}'::jsonb), ('finalizado'::text, jsonb_build_object('hash_final', repeat('b', 64), 'selo', 'B-T'))$$, 'eventos finalizado e concluido');
select is((select count(*)::int from public.as_notificacoes where envelope_id = '00000000-0000-0000-0000-0000000006e1' and tipo in ('concluido_destinatario', 'concluido_remetente')), 3,
  'e-mails: Ana, a cópia e o remetente');
select is((select corpo -> 'envelope' ->> 'hash_final' from public.as_entregas_webhook where envelope_id = '00000000-0000-0000-0000-0000000006e1' and evento = 'envelope.concluido'),
  repeat('b', 64), 'webhook envelope.concluido na fila com o hash final');
select throws_ok($$update public.as_envelopes set hash_final = repeat('c', 64) where id = '00000000-0000-0000-0000-0000000006e1'$$,
  'P0001', 'envelope_congelado', 'hash final não se reescreve');

-- Envelope 2: falha definitiva (integridade violada) alerta na hora.
insert into public.as_envelopes (id, conta_id, titulo, origem, codigo_verificacao, paginas, arquivo_original_path)
values ('00000000-0000-0000-0000-0000000006e2', '00000000-0000-0000-0000-0000000006f1', 'Aditivo', 'painel', 'FNZB2345FNZB', 1, 'a/b/original-2.pdf');
insert into public.as_signatarios (id, envelope_id, conta_id, papel, ordem, nome, email, token_hash) values
  ('00000000-0000-0000-0000-0000000006a3', '00000000-0000-0000-0000-0000000006e2', '00000000-0000-0000-0000-0000000006f1', 'assinar', 1, 'Bia', 'bia@fin.dev', 'tok-fin-bia');
update public.as_envelopes set status = 'enviado', hash_original = repeat('d', 64), enviado_em = now(), prazo_em = now() + interval '30 days' where id = '00000000-0000-0000-0000-0000000006e2';
update public.as_envelopes set status = 'finalizando' where id = '00000000-0000-0000-0000-0000000006e2';
create temp table r2 as select * from public.as_fn_reserva_finalizacao('00000000-0000-0000-0000-0000000006e2', 3);
select results_eq($$select tentativas, alerta from public.as_fn_falha_finalizacao('00000000-0000-0000-0000-0000000006e2', (select reserva from r2), 'integridade_violada', 3, true)$$,
  $$values (3, true)$$, 'falha definitiva alerta o admin na hora');
select is((select resultado from public.as_fn_reserva_finalizacao('00000000-0000-0000-0000-0000000006e2', 3)), 'esgotado', 'sem tentativa: não reserva, e o alerta já existe');

-- Envelope 3: a última tentativa cai sem registrar falha; a reserva seguinte alerta uma vez.
insert into public.as_envelopes (id, conta_id, titulo, origem, codigo_verificacao, paginas, arquivo_original_path)
values ('00000000-0000-0000-0000-0000000006e3', '00000000-0000-0000-0000-0000000006f1', 'Termo', 'painel', 'FNZC2345FNZC', 1, 'a/b/original-3.pdf');
insert into public.as_signatarios (id, envelope_id, conta_id, papel, ordem, nome, email, token_hash) values
  ('00000000-0000-0000-0000-0000000006a4', '00000000-0000-0000-0000-0000000006e3', '00000000-0000-0000-0000-0000000006f1', 'assinar', 1, 'Duda', 'duda@fin.dev', 'tok-fin-duda');
update public.as_envelopes set status = 'enviado', hash_original = repeat('e', 64), enviado_em = now(), prazo_em = now() + interval '30 days' where id = '00000000-0000-0000-0000-0000000006e3';
update public.as_envelopes set status = 'finalizando', tentativas_finalizacao = 3, finalizacao_reserva = gen_random_uuid(), finalizacao_reservada_em = now() - interval '6 minutes'
 where id = '00000000-0000-0000-0000-0000000006e3';
select is((select resultado from public.as_fn_reserva_finalizacao('00000000-0000-0000-0000-0000000006e3', 3)), 'esgotado_alerta', 'última caiu sem falha: a faxina enfileira o alerta');
select is((select resultado from public.as_fn_reserva_finalizacao('00000000-0000-0000-0000-0000000006e3', 3)), 'esgotado', 'e só uma vez');
select is((select count(*)::int from public.as_notificacoes where chave = 'finalizacao_falhou_admin:00000000-0000-0000-0000-0000000006e3'), 1, 'um alerta');

select * from finish();
rollback;
