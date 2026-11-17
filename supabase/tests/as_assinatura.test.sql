-- Épico 8.5 / regra 11.4 / seção 12: código de acesso, assinatura e recusa no banco.
begin;
create extension if not exists pgtap with schema extensions;
select plan(38);

insert into public.as_contas (id, google_sub, email, nome, webhook_url, webhook_segredo_cifrado)
values ('00000000-0000-0000-0000-0000000000f1', 'sub-ass', 'ass@teste.dev', 'Remetente', 'https://hook.example/assina', 'x');
-- Envelope em ordem, enviado: Ana (1, CPF exigido, com campos), Bruno (2), Carla (cópia).
insert into public.as_envelopes (id, conta_id, titulo, origem, codigo_verificacao, paginas, arquivo_original_path, em_ordem)
values ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000f1', 'Contrato', 'painel', 'ASSN2345ASSN', 1, 'a/b/original-1.pdf', true);
insert into public.as_signatarios (id, envelope_id, conta_id, papel, ordem, nome, email, token_hash, exigir_cpf) values
  ('00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000f1', 'assinar', 1, 'Ana', 'ana@ass.dev', 'tok-ana', true),
  ('00000000-0000-0000-0000-0000000000f4', '00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000f1', 'assinar', 2, 'Bruno', 'bruno@ass.dev', 'tok-bruno', false),
  ('00000000-0000-0000-0000-0000000000f5', '00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000f1', 'copia', 1, 'Carla', 'carla@ass.dev', 'tok-carla', false);
insert into public.as_campos (id, envelope_id, signatario_id, tipo, pagina, x, y, largura, altura, obrigatorio) values
  ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000f3', 'assinatura', 1, 0.1, 0.8, 0.3, 0.06, true),
  ('00000000-0000-0000-0000-00000000c002', '00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000f3', 'data', 1, 0.5, 0.8, 0.16, 0.03, true),
  ('00000000-0000-0000-0000-00000000c003', '00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000f3', 'texto', 1, 0.1, 0.1, 0.3, 0.03, true),
  ('00000000-0000-0000-0000-00000000c004', '00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000f3', 'caixa', 1, 0.1, 0.2, 0.03, 0.02, false);
update public.as_envelopes set status = 'enviado', hash_original = repeat('a', 64), enviado_em = now(), prazo_em = now() + interval '30 days'
 where id = '00000000-0000-0000-0000-0000000000f2';
update public.as_signatarios set status = 'aguardando' where id = '00000000-0000-0000-0000-0000000000f3';

-- Código (regra 11.4).
select is(public.as_fn_novo_codigo('00000000-0000-0000-0000-0000000000f4', 'h', 600, 60, 5), 'indisponivel', 'quem ainda não é da vez não recebe código');
select is(public.as_fn_novo_codigo('00000000-0000-0000-0000-0000000000f3', 'h1', 600, 60, 5), 'ok', 'primeiro código');
select is(public.as_fn_novo_codigo('00000000-0000-0000-0000-0000000000f3', 'h2', 600, 60, 5), 'aguarde', 'novo código antes de 60 s é recusado');
-- Volta o relógio do último envio para simular a espera.
update public.as_signatarios set codigo_expira_em = now() + interval '9 minutes' - interval '2 minutes' where id = '00000000-0000-0000-0000-0000000000f3';
select is(public.as_fn_novo_codigo('00000000-0000-0000-0000-0000000000f3', 'h2', 600, 60, 5), 'ok', 'depois de 60 s, código novo');
select results_eq($$select * from public.as_fn_valida_codigo('00000000-0000-0000-0000-0000000000f3', 'h1', 5)$$, $$values ('errado'::text, 4)$$, 'o código anterior deixou de valer');
select results_eq($$select * from public.as_fn_valida_codigo('00000000-0000-0000-0000-0000000000f3', 'x', 5)$$, $$values ('errado'::text, 3)$$, 'segundo erro');
select results_eq($$select * from public.as_fn_valida_codigo('00000000-0000-0000-0000-0000000000f3', 'x', 5)$$, $$values ('errado'::text, 2)$$, 'terceiro erro');
select results_eq($$select * from public.as_fn_valida_codigo('00000000-0000-0000-0000-0000000000f3', 'x', 5)$$, $$values ('errado'::text, 1)$$, 'quarto erro');
select results_eq($$select * from public.as_fn_valida_codigo('00000000-0000-0000-0000-0000000000f3', 'x', 5)$$, $$values ('bloqueado'::text, 0)$$, 'quinto erro bloqueia');
select results_eq($$select * from public.as_fn_valida_codigo('00000000-0000-0000-0000-0000000000f3', 'h2', 5)$$, $$values ('bloqueado'::text, 0)$$, 'bloqueado nem com o código certo');
select is((select count(*)::int from public.as_eventos where envelope_id = '00000000-0000-0000-0000-0000000000f2' and tipo = 'codigo_recusado'), 5, 'cinco codigo_recusado na trilha');

-- Limite de 5 por hora (já saíram 2).
update public.as_signatarios set codigo_expira_em = null where id = '00000000-0000-0000-0000-0000000000f3';
select is(public.as_fn_novo_codigo('00000000-0000-0000-0000-0000000000f3', 'h3', 600, 0, 5), 'ok', 'terceiro da hora');
select is(public.as_fn_novo_codigo('00000000-0000-0000-0000-0000000000f3', 'h4', 600, 0, 5), 'ok', 'quarto da hora');
select is(public.as_fn_novo_codigo('00000000-0000-0000-0000-0000000000f3', 'h5', 600, 0, 5), 'ok', 'quinto da hora');
select is(public.as_fn_novo_codigo('00000000-0000-0000-0000-0000000000f3', 'h6', 600, 0, 5), 'limite_hora', 'sexto da hora é recusado');
select results_eq($$select * from public.as_fn_valida_codigo('00000000-0000-0000-0000-0000000000f3', 'h5', 5)$$, $$values ('ok'::text, 0)$$, 'código certo');
select is((select codigo_hash from public.as_signatarios where id = '00000000-0000-0000-0000-0000000000f3'), null, 'código de uso único');
update public.as_signatarios set codigo_expira_em = now() - interval '1 minute', codigo_hash = 'h7' where id = '00000000-0000-0000-0000-0000000000f3';
select results_eq($$select * from public.as_fn_valida_codigo('00000000-0000-0000-0000-0000000000f3', 'h7', 5)$$, $$values ('expirado'::text, 0)$$, 'código vencido');

-- Assinar (Ana).
create function pg_temp.ana(p_token text default 'tok-ana', p_metodo public.as_metodo_assinatura default 'digitada', p_texto text default 'Ana Souza',
                             p_cpf text default '52998224725', p_campos jsonb default '[{"id":"00000000-0000-0000-0000-00000000c003","valor":"Diretora"}]')
returns table (envelope_status public.as_status_envelope, proximo_id uuid) language sql as $$
  select * from public.as_fn_assina('00000000-0000-0000-0000-0000000000f3', p_token, p_metodo, p_texto, null, null, null, p_cpf, p_campos, '2026-11-17', '203.0.113.8', 'UA');
$$;
select throws_ok($$select * from pg_temp.ana(p_token => 'antigo')$$, 'P0001', 'link_invalido', 'link trocado não assina');
select throws_ok($$select * from pg_temp.ana(p_cpf => null)$$, 'P0001', 'cpf_invalido', 'CPF exigido');
select throws_ok($$select * from pg_temp.ana(p_texto => '  ')$$, 'P0001', 'assinatura_ausente', 'assinatura digitada vazia');
select throws_ok($$select * from pg_temp.ana(p_campos => '[]')$$, 'P0001', 'campo_obrigatorio', 'texto obrigatório vazio');
select throws_ok($$select * from pg_temp.ana(p_campos => '[{"id":"00000000-0000-0000-0000-00000000c003","valor":"x"},{"id":"00000000-0000-0000-0000-00000000dead","valor":"y"}]')$$,
  'P0001', 'campo_invalido', 'campo que não é dela');
update public.as_envelopes set prazo_em = now() - interval '1 second' where id = '00000000-0000-0000-0000-0000000000f2';
select throws_ok($$select * from pg_temp.ana()$$, 'P0001', 'prazo_encerrado', 'prazo vencido não assina, mesmo antes da faxina');
select is(public.as_fn_novo_codigo('00000000-0000-0000-0000-0000000000f3', 'h9', 600, 0, 99), 'prazo_encerrado', 'prazo vencido não manda código');
select is((select resultado from public.as_fn_valida_codigo('00000000-0000-0000-0000-0000000000f3', 'h9', 5)), 'prazo_encerrado', 'prazo vencido não valida código');
update public.as_envelopes set prazo_em = now() + interval '30 days' where id = '00000000-0000-0000-0000-0000000000f2';

select results_eq($$select envelope_status::text, proximo_id from pg_temp.ana()$$,
  $$values ('enviado'::text, '00000000-0000-0000-0000-0000000000f4'::uuid)$$, 'Ana assina; o próximo é o Bruno');
select results_eq(
  $$select status::text, metodo_assinatura::text, assinatura_texto, cpf, consentimento_versao, host(ip_assinatura) from public.as_signatarios where id = '00000000-0000-0000-0000-0000000000f3'$$,
  $$values ('assinou'::text, 'digitada'::text, 'Ana Souza'::text, '52998224725'::text, '2026-11-17'::text, '203.0.113.8'::text)$$,
  'colunas da assinatura gravadas'
);
select results_eq(
  $$select tipo::text, valor from public.as_campos where signatario_id = '00000000-0000-0000-0000-0000000000f3' order by tipo$$,
  $$values ('assinatura'::text, null::text), ('caixa', 'nao'), ('data', to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM/YYYY')), ('texto', 'Diretora')$$,
  'valores: data de Brasília feita no banco, texto da lista, caixa desmarcada'
);
select results_eq(
  $$select tipo::text, dados from public.as_eventos where envelope_id = '00000000-0000-0000-0000-0000000000f2' and tipo in ('consentiu', 'assinou') order by seq$$,
  $$values ('consentiu'::text, '{"versao": "2026-11-17"}'::jsonb), ('assinou', '{"campos": 4, "metodo": "digitada"}')$$,
  'consentiu e assinou com campos e método'
);
select results_eq(
  $$select status::text from public.as_signatarios where id = '00000000-0000-0000-0000-0000000000f4'$$, $$values ('aguardando'::text)$$, 'Bruno passa a aguardando');
select is((select count(*)::int from public.as_notificacoes where chave in ('convite:00000000-0000-0000-0000-0000000000f4', 'assinou_remetente:00000000-0000-0000-0000-0000000000f3')), 2,
  'convite do Bruno e aviso ao remetente na fila');
select throws_ok($$select * from pg_temp.ana()$$, 'P0001', 'status_mudou', 'quem já assinou não assina de novo');

-- O último assinante leva o envelope a finalizando.
select results_eq(
  $$select envelope_status::text, proximo_id from public.as_fn_assina('00000000-0000-0000-0000-0000000000f4', 'tok-bruno', 'digitada', 'Bruno', null, null, null, null, '[]', '2026-11-17')$$,
  $$values ('finalizando'::text, null::uuid)$$, 'último assinante → finalizando'
);

-- Recusa num envelope novo (sem ordem): Dora recusa, Edu (já convidado) é avisado, webhook na fila.
insert into public.as_envelopes (id, conta_id, titulo, origem, codigo_verificacao, paginas, arquivo_original_path)
values ('00000000-0000-0000-0000-0000000000f6', '00000000-0000-0000-0000-0000000000f1', 'Proposta', 'painel', 'RCSA2345RCSA', 1, 'a/b/original-2.pdf');
insert into public.as_signatarios (id, envelope_id, conta_id, papel, ordem, nome, email, token_hash) values
  ('00000000-0000-0000-0000-0000000000f7', '00000000-0000-0000-0000-0000000000f6', '00000000-0000-0000-0000-0000000000f1', 'assinar', 1, 'Dora', 'dora@ass.dev', 'tok-dora'),
  ('00000000-0000-0000-0000-0000000000f8', '00000000-0000-0000-0000-0000000000f6', '00000000-0000-0000-0000-0000000000f1', 'assinar', 2, 'Edu', 'edu@ass.dev', 'tok-edu');
update public.as_envelopes set status = 'enviado', hash_original = repeat('b', 64), enviado_em = now(), prazo_em = now() + interval '30 days' where id = '00000000-0000-0000-0000-0000000000f6';
update public.as_signatarios set status = 'aguardando' where envelope_id = '00000000-0000-0000-0000-0000000000f6';
select throws_ok($$select public.as_fn_recusa('00000000-0000-0000-0000-0000000000f7', 'tok-dora', '   ')$$, 'P0001', 'motivo_invalido', 'recusa sem motivo');
select is(public.as_fn_recusa('00000000-0000-0000-0000-0000000000f7', 'tok-dora', 'Valor errado', '203.0.113.9', 'UA'), 'recusado', 'Dora recusa');
select results_eq(
  $$select (select status::text from public.as_envelopes where id = '00000000-0000-0000-0000-0000000000f6'),
           (select encerrado_em is not null from public.as_envelopes where id = '00000000-0000-0000-0000-0000000000f6'),
           (select motivo_recusa from public.as_signatarios where id = '00000000-0000-0000-0000-0000000000f7'),
           (select count(*)::int from public.as_notificacoes where chave in ('recusado_remetente:00000000-0000-0000-0000-0000000000f6', 'recusado_destinatario:00000000-0000-0000-0000-0000000000f8')),
           (select count(*)::int from public.as_entregas_webhook where envelope_id = '00000000-0000-0000-0000-0000000000f6' and evento = 'envelope.recusado')$$,
  $$values ('recusado'::text, true, 'Valor errado'::text, 2, 1)$$,
  'envelope recusado e encerrado; avisos ao remetente e ao Edu; webhook na fila'
);

-- Sem webhook_url na conta, a recusa não enfileira entrega.
update public.as_contas set webhook_url = null, webhook_segredo_cifrado = null where id = '00000000-0000-0000-0000-0000000000f1';
insert into public.as_envelopes (id, conta_id, titulo, origem, codigo_verificacao, paginas, arquivo_original_path)
values ('00000000-0000-0000-0000-0000000000f9', '00000000-0000-0000-0000-0000000000f1', 'Aditivo', 'painel', 'SMHK2345SMHK', 1, 'a/b/original-3.pdf');
insert into public.as_signatarios (id, envelope_id, conta_id, papel, ordem, nome, email, token_hash) values
  ('00000000-0000-0000-0000-0000000000fa', '00000000-0000-0000-0000-0000000000f9', '00000000-0000-0000-0000-0000000000f1', 'assinar', 1, 'Fábio', 'fabio@ass.dev', 'tok-fabio');
update public.as_envelopes set status = 'enviado', hash_original = repeat('c', 64), enviado_em = now(), prazo_em = now() + interval '30 days' where id = '00000000-0000-0000-0000-0000000000f9';
update public.as_signatarios set status = 'aguardando' where envelope_id = '00000000-0000-0000-0000-0000000000f9';
select is(
  (select public.as_fn_recusa('00000000-0000-0000-0000-0000000000fa', 'tok-fabio', 'Não concordo')::text
   || ':' || (select count(*) from public.as_entregas_webhook where envelope_id = '00000000-0000-0000-0000-0000000000f9')),
  'recusado:0', 'sem webhook_url, nenhuma entrega na fila'
);

select * from finish();
rollback;
