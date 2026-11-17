-- Épico 8.4 / regras 11.12 e 11.20 / seção 12: envio numa transação, com limites e convites.
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

insert into public.as_contas (id, google_sub, email, nome)
values ('00000000-0000-0000-0000-0000000000a9', 'sub-envio', 'envio@teste.dev', 'Envio');

-- Rascunho em ordem: Ana (1), Bruno (2), Carla (cópia).
insert into public.as_envelopes (id, conta_id, titulo, origem, codigo_verificacao, paginas, arquivo_original_path, em_ordem, prazo_dias)
values ('00000000-0000-0000-0000-0000000000e9', '00000000-0000-0000-0000-0000000000a9', 'Contrato', 'painel', 'ENVA1234ENVA', 1, 'a/e/original-1.pdf', true, 10);
insert into public.as_signatarios (id, envelope_id, conta_id, papel, ordem, nome, email, token_hash) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000e9', '00000000-0000-0000-0000-0000000000a9', 'assinar', 1, 'Ana', 'ana@envio.dev', 'prov-1'),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000e9', '00000000-0000-0000-0000-0000000000a9', 'assinar', 2, 'Bruno', 'bruno@envio.dev', 'prov-2'),
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000e9', '00000000-0000-0000-0000-0000000000a9', 'copia', 1, 'Carla', 'carla@envio.dev', 'prov-3');

-- Atalho para chamar o envio com os tokens dos dois assinantes.
create function pg_temp.envia(p_caminho text default 'a/e/original-1.pdf', p_limite_diario integer default 30, p_limites integer[] default '{50,500,5000}',
                              p_envelope uuid default '00000000-0000-0000-0000-0000000000e9', p_tokens jsonb default null)
returns setof public.as_signatarios language sql as $$
  select * from public.as_fn_envia_envelope(p_envelope, '00000000-0000-0000-0000-0000000000a9', p_caminho, repeat('a', 64),
    coalesce(p_tokens, '[{"signatario_id":"00000000-0000-0000-0000-0000000000c1","token_hash":"tok-ana"},{"signatario_id":"00000000-0000-0000-0000-0000000000c2","token_hash":"tok-bruno"}]'),
    p_limite_diario, p_limites, 'remetente', '203.0.113.5', 'UA');
$$;

select throws_ok($$select * from pg_temp.envia(p_caminho => 'outro.pdf')$$, 'P0001', 'envelope_mudou', 'arquivo diferente do que o servidor leu');
select throws_ok($$select * from pg_temp.envia(p_tokens => '[{"signatario_id":"00000000-0000-0000-0000-0000000000c1","token_hash":"x"}]')$$,
  'P0001', 'envelope_mudou', 'tokens que não cobrem todos os assinantes');

select results_eq($$select nome from pg_temp.envia()$$, $$values ('Ana'::text)$$, 'em ordem, só a primeira recebe o convite');
select results_eq(
  $$select status::text, hash_original, enviado_em is not null, prazo_em = enviado_em + interval '10 days' from public.as_envelopes where id = '00000000-0000-0000-0000-0000000000e9'$$,
  $$values ('enviado'::text, repeat('a', 64), true, true)$$,
  'enviado, com hash, data de envio e prazo'
);
select results_eq(
  $$select nome, status::text, token_hash from public.as_signatarios where envelope_id = '00000000-0000-0000-0000-0000000000e9' order by papel, ordem$$,
  $$values ('Ana'::text, 'aguardando'::text, 'tok-ana'::text), ('Bruno', 'pendente', 'tok-bruno'), ('Carla', 'pendente', 'prov-3')$$,
  'tokens gravados; Ana aguardando, Bruno na fila, cópia intocada'
);
select results_eq(
  $$select tipo::text, dados ->> 'hash_original' from public.as_eventos where envelope_id = '00000000-0000-0000-0000-0000000000e9' order by seq$$,
  $$values ('criado'::text, null::text), ('enviado', repeat('a', 64))$$,
  'eventos criado (que faltava) e enviado com o hash'
);
select results_eq(
  $$select tipo::text, chave, status::text from public.as_notificacoes where envelope_id = '00000000-0000-0000-0000-0000000000e9'$$,
  $$values ('convite'::text, 'convite:00000000-0000-0000-0000-0000000000c1'::text, 'pendente'::text)$$,
  'um convite enfileirado, só para a Ana'
);
select throws_ok($$select * from pg_temp.envia()$$, 'P0001', 'status_mudou', 'segundo envio do mesmo envelope é recusado');
select is(public.as_fn_verifica_trilha('00000000-0000-0000-0000-0000000000e9'), null::integer, 'trilha íntegra');

-- Sem ordem: todos os assinantes recebem.
insert into public.as_envelopes (id, conta_id, titulo, origem, codigo_verificacao, paginas, arquivo_original_path)
values ('00000000-0000-0000-0000-0000000000ea', '00000000-0000-0000-0000-0000000000a9', 'Livre', 'painel', 'XVRE1234XVRE', 1, 'a/e/original-2.pdf');
insert into public.as_signatarios (id, envelope_id, conta_id, papel, ordem, nome, email, token_hash) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000ea', '00000000-0000-0000-0000-0000000000a9', 'assinar', 1, 'Ana', 'ana@envio.dev', 'prov-4'),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000ea', '00000000-0000-0000-0000-0000000000a9', 'assinar', 2, 'Bruno', 'bruno@envio.dev', 'prov-5');
select is(
  (select count(*)::int from pg_temp.envia(p_caminho => 'a/e/original-2.pdf', p_envelope => '00000000-0000-0000-0000-0000000000ea',
     p_tokens => '[{"signatario_id":"00000000-0000-0000-0000-0000000000d1","token_hash":"t1"},{"signatario_id":"00000000-0000-0000-0000-0000000000d2","token_hash":"t2"}]')),
  2, 'sem ordem, todos os assinantes recebem'
);

-- Sem assinante.
insert into public.as_envelopes (id, conta_id, titulo, origem, codigo_verificacao, paginas, arquivo_original_path)
values ('00000000-0000-0000-0000-0000000000eb', '00000000-0000-0000-0000-0000000000a9', 'Vazio', 'painel', 'VAZE1234VAZE', 1, 'a/e/original-3.pdf');
select throws_ok($$select * from pg_temp.envia(p_caminho => 'a/e/original-3.pdf', p_envelope => '00000000-0000-0000-0000-0000000000eb', p_tokens => '[]')$$,
  'P0001', 'sem_assinante', 'sem assinante não envia');

-- Limites: já há 2 envios nas últimas 24 h e 2 documentos guardados.
insert into public.as_signatarios (id, envelope_id, conta_id, papel, ordem, nome, email, token_hash) values
  ('00000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-0000000000eb', '00000000-0000-0000-0000-0000000000a9', 'assinar', 1, 'Ana', 'ana@envio.dev', 'prov-6');
select throws_ok(
  $$select * from pg_temp.envia(p_caminho => 'a/e/original-3.pdf', p_envelope => '00000000-0000-0000-0000-0000000000eb', p_limite_diario => 2,
     p_tokens => '[{"signatario_id":"00000000-0000-0000-0000-0000000000d3","token_hash":"t3"}]')$$,
  'P0001', 'limite_diario', 'o envio além do limite diário é recusado');
select throws_ok(
  $$select * from pg_temp.envia(p_caminho => 'a/e/original-3.pdf', p_envelope => '00000000-0000-0000-0000-0000000000eb', p_limites => '{2,500,5000}',
     p_tokens => '[{"signatario_id":"00000000-0000-0000-0000-0000000000d3","token_hash":"t3"}]')$$,
  'P0001', 'limite_do_nivel', 'nível 1 com o limite cheio não envia');
select is((select status::text from public.as_envelopes where id = '00000000-0000-0000-0000-0000000000eb'), 'rascunho', 'a recusa não mexe no rascunho');

-- O nível conta: no nível 2 o mesmo envio passa.
update public.as_contas set nivel = 2 where id = '00000000-0000-0000-0000-0000000000a9';
select is(
  (select count(*)::int from pg_temp.envia(p_caminho => 'a/e/original-3.pdf', p_envelope => '00000000-0000-0000-0000-0000000000eb', p_limites => '{2,500,5000}',
     p_tokens => '[{"signatario_id":"00000000-0000-0000-0000-0000000000d3","token_hash":"t3"}]')),
  1, 'no nível 2 o limite é outro'
);

-- Excluir um envelope encerrado libera a vaga (regra 11.20).
update public.as_contas set nivel = 1 where id = '00000000-0000-0000-0000-0000000000a9';
insert into public.as_envelopes (id, conta_id, titulo, origem, codigo_verificacao, paginas, arquivo_original_path)
values ('00000000-0000-0000-0000-0000000000ec', '00000000-0000-0000-0000-0000000000a9', 'Quarto', 'painel', 'QRTA1234QRTA', 1, 'a/e/original-4.pdf');
insert into public.as_signatarios (id, envelope_id, conta_id, papel, ordem, nome, email, token_hash) values
  ('00000000-0000-0000-0000-0000000000d4', '00000000-0000-0000-0000-0000000000ec', '00000000-0000-0000-0000-0000000000a9', 'assinar', 1, 'Ana', 'ana@envio.dev', 'prov-7');
select throws_ok(
  $$select * from pg_temp.envia(p_caminho => 'a/e/original-4.pdf', p_envelope => '00000000-0000-0000-0000-0000000000ec', p_limites => '{3,500,5000}',
     p_tokens => '[{"signatario_id":"00000000-0000-0000-0000-0000000000d4","token_hash":"t4"}]')$$,
  'P0001', 'limite_do_nivel', '3 guardados com limite 3: recusado');
select ok(public.as_fn_transicao_envelope('00000000-0000-0000-0000-0000000000ea', 'enviado', 'cancelado'), 'cancela um envelope');
delete from public.as_envelopes where id = '00000000-0000-0000-0000-0000000000ea';
select is(
  (select count(*)::int from pg_temp.envia(p_caminho => 'a/e/original-4.pdf', p_envelope => '00000000-0000-0000-0000-0000000000ec', p_limites => '{3,500,5000}',
     p_tokens => '[{"signatario_id":"00000000-0000-0000-0000-0000000000d4","token_hash":"t4"}]')),
  1, 'excluído o encerrado, a vaga volta'
);
select throws_ok(
  $$select * from public.as_fn_envia_envelope('00000000-0000-0000-0000-0000000000ec', '00000000-0000-0000-0000-0000000000a6', 'x', repeat('a', 64), '[]', 30, '{50,500,5000}', 'remetente')$$,
  'P0001', 'nao_encontrado', 'outra conta não envia'
);

-- Reserva de notificação (regra 11.16).
select ok(public.as_fn_reserva_notificacao((select id from public.as_notificacoes where chave = 'convite:00000000-0000-0000-0000-0000000000c1'), 5), 'primeira reserva passa');
select ok(not public.as_fn_reserva_notificacao((select id from public.as_notificacoes where chave = 'convite:00000000-0000-0000-0000-0000000000c1'), 5), 'segunda reserva logo em seguida não passa');
update public.as_notificacoes set reservada_em = now() - interval '3 minutes' where chave = 'convite:00000000-0000-0000-0000-0000000000c1';
select ok(public.as_fn_reserva_notificacao((select id from public.as_notificacoes where chave = 'convite:00000000-0000-0000-0000-0000000000c1'), 5), 'reserva vencida (servidor caiu) passa de novo');
select is((select tentativas::int from public.as_notificacoes where chave = 'convite:00000000-0000-0000-0000-0000000000c1'), 2, 'cada reserva conta uma tentativa');

-- Excluir envelopes não devolve a vaga do dia (as_envios fica).
select is((select count(*)::int from public.as_envios where conta_id = '00000000-0000-0000-0000-0000000000a9'), 4, 'quatro envios registrados, mesmo com um envelope excluído');

select * from finish();
rollback;
