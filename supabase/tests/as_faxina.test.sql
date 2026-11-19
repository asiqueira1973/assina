-- Épico 8.13 / regras 11.5, 11.7 e 11.14: expiração (uma vez só, com aviso e webhook), lembretes
-- devidos (intervalo pelo último contato, limite, conta suspensa), expurgo (só encerrados há 90
-- dias, uma vez só) e o canal do lembrete automático na trilha.
begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

insert into public.as_contas (id, google_sub, email, nome, webhook_url, webhook_segredo_cifrado) values
  ('00000000-0000-0000-0000-0000000009f1', 'sub-fx1', 'fx1@teste.dev', 'Remetente', 'https://hook.example/fx', 'x'),
  ('00000000-0000-0000-0000-0000000009f2', 'sub-fx2', 'fx2@teste.dev', 'Suspensa', null, null);
update public.as_contas set suspensa_em = now() where id = '00000000-0000-0000-0000-0000000009f2';

insert into public.as_envelopes (id, conta_id, titulo, origem, codigo_verificacao, paginas, arquivo_original_path, lembrete_cada_dias) values
  ('00000000-0000-0000-0000-0000000009e1', '00000000-0000-0000-0000-0000000009f1', 'Vencido', 'painel', 'FXNA2345FXNA', 1, 'fx/e1/o.pdf', 3),
  ('00000000-0000-0000-0000-0000000009e2', '00000000-0000-0000-0000-0000000009f1', 'No prazo', 'painel', 'FXNB2345FXNB', 1, 'fx/e2/o.pdf', 3),
  ('00000000-0000-0000-0000-0000000009e3', '00000000-0000-0000-0000-0000000009f1', 'Cancelado', 'painel', 'FXNC2345FXNC', 1, 'fx/e3/o.pdf', null),
  ('00000000-0000-0000-0000-0000000009e4', '00000000-0000-0000-0000-0000000009f2', 'Da suspensa', 'painel', 'FXND2345FXND', 1, 'fx/e4/o.pdf', 3);
insert into public.as_signatarios (id, envelope_id, conta_id, papel, ordem, nome, email, token_hash) values
  ('00000000-0000-0000-0000-0000000009a1', '00000000-0000-0000-0000-0000000009e1', '00000000-0000-0000-0000-0000000009f1', 'assinar', 1, 'Ana', 'ana@fx.dev', 'tok-fx-1'),
  ('00000000-0000-0000-0000-0000000009a2', '00000000-0000-0000-0000-0000000009e2', '00000000-0000-0000-0000-0000000009f1', 'assinar', 1, 'Bia', 'bia@fx.dev', 'tok-fx-2'),
  ('00000000-0000-0000-0000-0000000009a3', '00000000-0000-0000-0000-0000000009e2', '00000000-0000-0000-0000-0000000009f1', 'assinar', 2, 'Caio', 'caio@fx.dev', 'tok-fx-3'),
  ('00000000-0000-0000-0000-0000000009a4', '00000000-0000-0000-0000-0000000009e3', '00000000-0000-0000-0000-0000000009f1', 'assinar', 1, 'Duda', 'duda@fx.dev', 'tok-fx-4'),
  ('00000000-0000-0000-0000-0000000009a5', '00000000-0000-0000-0000-0000000009e4', '00000000-0000-0000-0000-0000000009f2', 'assinar', 1, 'Eva', 'eva@fx.dev', 'tok-fx-5');
update public.as_envelopes set status = 'enviado', hash_original = repeat('f', 64), enviado_em = now() - interval '31 days', prazo_em = now() - interval '1 hour'
 where id = '00000000-0000-0000-0000-0000000009e1';
update public.as_envelopes set status = 'enviado', hash_original = repeat('f', 64), enviado_em = now() - interval '5 days', prazo_em = now() + interval '25 days'
 where id in ('00000000-0000-0000-0000-0000000009e2', '00000000-0000-0000-0000-0000000009e3', '00000000-0000-0000-0000-0000000009e4');
update public.as_signatarios set status = 'aguardando', notificado_em = now() - interval '5 days' where id in (
  '00000000-0000-0000-0000-0000000009a1', '00000000-0000-0000-0000-0000000009a2', '00000000-0000-0000-0000-0000000009a3',
  '00000000-0000-0000-0000-0000000009a4', '00000000-0000-0000-0000-0000000009a5');
update public.as_signatarios set ultimo_lembrete_em = now() - interval '1 day', lembretes_enviados = 1 where id = '00000000-0000-0000-0000-0000000009a3';

-- Expiração (11.7).
select is(public.as_fn_expira_envelope('00000000-0000-0000-0000-0000000009e2'), false, 'no prazo: não expira');
select is(public.as_fn_expira_envelope('00000000-0000-0000-0000-0000000009e1'), true, 'vencido: expira');
select results_eq($$select status::text, encerrado_em is not null from public.as_envelopes where id = '00000000-0000-0000-0000-0000000009e1'$$,
  $$values ('expirado', true)$$, 'status expirado e encerrado_em');
select results_eq($$select ator::text from public.as_eventos where envelope_id = '00000000-0000-0000-0000-0000000009e1' and tipo = 'expirado'$$,
  $$values ('sistema')$$, 'evento expirado pelo sistema');
select is((select count(*)::int from public.as_notificacoes where chave = 'expirado_remetente:00000000-0000-0000-0000-0000000009e1'), 1, 'aviso ao remetente enfileirado');
select results_eq($$select evento, corpo->'envelope'->>'status' from public.as_entregas_webhook where envelope_id = '00000000-0000-0000-0000-0000000009e1'$$,
  $$values ('envelope.expirado', 'expirado')$$, 'webhook envelope.expirado');
select is(public.as_fn_expira_envelope('00000000-0000-0000-0000-0000000009e1'), false, 'segunda vez: nada');
select is((select count(*)::int from public.as_eventos where envelope_id = '00000000-0000-0000-0000-0000000009e1' and tipo = 'expirado'), 1, 'um evento só');
select is((select count(*)::int from public.as_entregas_webhook where envelope_id = '00000000-0000-0000-0000-0000000009e1'), 1, 'uma entrega só');

-- Lembretes devidos (11.5).
select results_eq(
  $$select signatario_id, cada_dias::int from public.as_fn_lembretes_devidos(10, 60, array['00000000-0000-0000-0000-0000000009f1', '00000000-0000-0000-0000-0000000009f2']::uuid[]) order by signatario_id$$,
  $$values ('00000000-0000-0000-0000-0000000009a2'::uuid, 3)$$,
  'só quem tem o último contato há N dias: sem o expirado, o lembrado ontem, o sem lembrete e a suspensa');
select is((select count(*)::int from public.as_fn_lembretes_devidos(10, 60, array['00000000-0000-0000-0000-0000000009f1']::uuid[]) where signatario_id = '00000000-0000-0000-0000-0000000009a3'), 0,
  'lembrado ontem: ainda não');
update public.as_signatarios set lembretes_enviados = 10 where id = '00000000-0000-0000-0000-0000000009a2';
select is((select count(*)::int from public.as_fn_lembretes_devidos(10, 60, array['00000000-0000-0000-0000-0000000009f1']::uuid[]) where signatario_id = '00000000-0000-0000-0000-0000000009a2'), 0,
  'no limite de 10: não');
update public.as_signatarios set lembretes_enviados = 0, notificado_em = now() - interval '3 days' + interval '30 minutes' where id = '00000000-0000-0000-0000-0000000009a2';
select is((select count(*)::int from public.as_fn_lembretes_devidos(10, 60, array['00000000-0000-0000-0000-0000000009f1']::uuid[]) where signatario_id = '00000000-0000-0000-0000-0000000009a2'), 1,
  'faltando 30 min para os N dias, dentro da folga: sai');
select is((select count(*)::int from public.as_fn_lembretes_devidos(10, 0, array['00000000-0000-0000-0000-0000000009f1']::uuid[]) where signatario_id = '00000000-0000-0000-0000-0000000009a2'), 0,
  'sem folga: ainda não');
select is((select count(*)::int from public.as_fn_lembretes_devidos(10, 60, array['00000000-0000-0000-0000-0000000009f2']::uuid[])), 0, 'conta suspensa: nenhum');

-- Canal do lembrete automático na trilha.
create temp table lx as select * from public.as_fn_reserva_lembrete('00000000-0000-0000-0000-0000000009f1', '00000000-0000-0000-0000-0000000009e3', '00000000-0000-0000-0000-0000000009a4', 71, 10);
select is(public.as_fn_confirma_lembrete('00000000-0000-0000-0000-0000000009f1', '00000000-0000-0000-0000-0000000009e3', '00000000-0000-0000-0000-0000000009a4', (select chave from lx), 'tok-fx-4b', 'r-fx', 'sistema'), true, 'confirma o automático');
select results_eq($$select ator::text, dados->>'canal' from public.as_eventos where envelope_id = '00000000-0000-0000-0000-0000000009e3' and tipo = 'lembrete_enviado'$$,
  $$values ('sistema', 'automatico')$$, 'canal automatico, ator sistema');

-- Expurgo (11.14).
select public.as_fn_cancela_envelope('00000000-0000-0000-0000-0000000009f1', '00000000-0000-0000-0000-0000000009e3', null, 'remetente');
update public.as_signatarios set assinatura_imagem_path = 'fx/e3/assinaturas/a.png' where id = '00000000-0000-0000-0000-0000000009a4';
select is(public.as_fn_expurga_envelope('00000000-0000-0000-0000-0000000009e3', 90), false, 'cancelado agora: ainda não');
update public.as_envelopes set encerrado_em = now() - interval '91 days' where id = '00000000-0000-0000-0000-0000000009e3';
select is(public.as_fn_expurga_envelope('00000000-0000-0000-0000-0000000009e3', 90), true, 'encerrado há 91 dias: expurga');
select results_eq($$select arquivo_original_path, arquivos_expurgados_em is not null, status::text from public.as_envelopes where id = '00000000-0000-0000-0000-0000000009e3'$$,
  $$values (null::text, true, 'cancelado')$$, 'sem original, marcado, status igual');
select is((select assinatura_imagem_path from public.as_signatarios where id = '00000000-0000-0000-0000-0000000009a4'), null, 'imagem da assinatura esquecida');
select is(public.as_fn_expurga_envelope('00000000-0000-0000-0000-0000000009e3', 90), false, 'segunda vez: nada');
select ok((select count(*) from public.as_eventos where envelope_id = '00000000-0000-0000-0000-0000000009e3') > 0, 'a trilha fica');
select is(public.as_fn_expurga_envelope('00000000-0000-0000-0000-0000000009e2', 90), false, 'envelope em andamento: nunca');

-- Rascunho: mexer nos destinatários renova atualizado_em (a faxina não apaga rascunho em uso).
insert into public.as_envelopes (id, conta_id, titulo, origem, codigo_verificacao, atualizado_em) values
  ('00000000-0000-0000-0000-0000000009e5', '00000000-0000-0000-0000-0000000009f1', 'Rascunho antigo', 'painel', 'FXNE2345FXNE', now() - interval '40 days');
select ok((select atualizado_em < now() - interval '39 days' from public.as_envelopes where id = '00000000-0000-0000-0000-0000000009e5'), 'rascunho nasce com a data antiga');
insert into public.as_signatarios (envelope_id, conta_id, nome, email, token_hash) values
  ('00000000-0000-0000-0000-0000000009e5', '00000000-0000-0000-0000-0000000009f1', 'Fábio', 'fabio@fx.dev', 'tok-fx-6');
select ok((select atualizado_em > now() - interval '1 minute' from public.as_envelopes where id = '00000000-0000-0000-0000-0000000009e5'), 'destinatário novo renova a data');

select * from finish();
rollback;
