-- Regra 11.6 / princípio 1 / critério 8.1: trilha encadeada por hash, só inserção, verificável.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

insert into public.as_contas (id, google_sub, email, nome)
values ('00000000-0000-0000-0000-0000000000a1', 'sub-trilha', 'trilha@teste.dev', 'Trilha');
insert into public.as_envelopes (id, conta_id, titulo, origem, codigo_verificacao)
values ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a1', 'Contrato', 'painel', 'ABCD1234EFGH');

select public.as_fn_registra_evento('00000000-0000-0000-0000-0000000000e1', 'criado', 'remetente', null, '203.0.113.7', 'Navegador/1.0', '{}');
select public.as_fn_registra_evento('00000000-0000-0000-0000-0000000000e1', 'enviado', 'remetente', null, null, null, '{"hash_original": "x"}');
select public.as_fn_registra_evento('00000000-0000-0000-0000-0000000000e1', 'convite_enviado', 'sistema');

select results_eq(
  $$select seq from public.as_eventos where envelope_id = '00000000-0000-0000-0000-0000000000e1' order by seq$$,
  $$values (1), (2), (3)$$,
  'seq 1, 2, 3 sem buraco'
);
select is(
  (select hash_anterior from public.as_eventos where envelope_id = '00000000-0000-0000-0000-0000000000e1' and seq = 1),
  repeat('0', 64), 'o primeiro hash_anterior é 64 zeros'
);
select ok(
  (select bool_and(e2.hash_anterior = e1.hash)
     from public.as_eventos e1 join public.as_eventos e2 on e2.envelope_id = e1.envelope_id and e2.seq = e1.seq + 1
    where e1.envelope_id = '00000000-0000-0000-0000-0000000000e1'),
  'cada evento aponta para o hash do anterior'
);

-- Formato canônico em linhas (regra 11.6, divergência 1 do plano 8.1), conferido à mão.
select is(
  (select hash from public.as_eventos where envelope_id = '00000000-0000-0000-0000-0000000000e1' and seq = 1),
  (select encode(extensions.digest(
     repeat('0', 64) || e'\n' ||
     '00000000-0000-0000-0000-0000000000e1' || e'\n1\ncriado\nremetente\n\n203.0.113.7\nNavegador/1.0\n{}\n' ||
     to_char(ocorrido_em at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'), 'sha256'), 'hex')
   from public.as_eventos where envelope_id = '00000000-0000-0000-0000-0000000000e1' and seq = 1),
  'hash do evento 1 bate com o formato canônico escrito à mão'
);
select ok(
  (select e3.ocorrido_em > e2.ocorrido_em
     from public.as_eventos e2 join public.as_eventos e3 on e3.envelope_id = e2.envelope_id
    where e2.envelope_id = '00000000-0000-0000-0000-0000000000e1' and e2.seq = 2 and e3.seq = 3),
  'eventos da mesma transação têm horas distintas (clock_timestamp)'
);
select is(public.as_fn_verifica_trilha('00000000-0000-0000-0000-0000000000e1'), null::integer, 'trilha íntegra');

select throws_ok(
  $$update public.as_eventos set dados = '{"x": 1}' where envelope_id = '00000000-0000-0000-0000-0000000000e1' and seq = 2$$,
  'P0001', 'trilha_imutavel', 'UPDATE na trilha é recusado'
);
select throws_ok(
  $$delete from public.as_eventos where envelope_id = '00000000-0000-0000-0000-0000000000e1' and seq = 3$$,
  'P0001', 'trilha_imutavel', 'DELETE direto na trilha é recusado'
);
select throws_ok(
  $$insert into public.as_eventos (envelope_id, seq, tipo, ator, hash_anterior, hash)
    values ('00000000-0000-0000-0000-0000000000e1', 3, 'assinou', 'signatario', repeat('0', 64), repeat('0', 64))$$,
  '23505', null, 'seq repetido é recusado'
);

-- Adulteração pulando o trigger (como faria alguém com acesso ao banco): a verificação acusa.
alter table public.as_eventos disable trigger as_tg_eventos_imutaveis;
update public.as_eventos set dados = '{"hash_original": "y"}' where envelope_id = '00000000-0000-0000-0000-0000000000e1' and seq = 2;
alter table public.as_eventos enable trigger as_tg_eventos_imutaveis;
select is(public.as_fn_verifica_trilha('00000000-0000-0000-0000-0000000000e1'), 2, 'adulterar o evento 2 é detectado no 2');

-- Um envelope não enxerga a trilha do outro: seq recomeça em 1.
insert into public.as_envelopes (id, conta_id, titulo, origem, codigo_verificacao)
values ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000a1', 'Outro', 'api', 'ZZZZ9999YYYY');
select is(
  (public.as_fn_registra_evento('00000000-0000-0000-0000-0000000000e2', 'criado', 'api')).seq,
  1, 'outro envelope começa a própria trilha em 1'
);

-- Exclusão do envelope leva a trilha em cascata (7.4).
select lives_ok(
  $$delete from public.as_envelopes where id = '00000000-0000-0000-0000-0000000000e1'$$,
  'excluir o envelope passa'
);
select is(
  (select count(*)::int from public.as_eventos where envelope_id = '00000000-0000-0000-0000-0000000000e1'),
  0, 'a trilha foi junto em cascata'
);
select lives_ok(
  $$delete from public.as_contas where id = '00000000-0000-0000-0000-0000000000a1'$$,
  'excluir a conta leva tudo em cascata'
);

select * from finish();
rollback;
