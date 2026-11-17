-- Épico 8.7 / seções 7.4 e 12 / regra 11.5: lista, lembrete, link copiado, cancelamento e
-- exclusão no banco, sempre presos à conta.
begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

insert into public.as_contas (id, google_sub, email, nome, webhook_url, webhook_segredo_cifrado) values
  ('00000000-0000-0000-0000-0000000007f1', 'sub-pai', 'pai@teste.dev', 'Remetente', 'https://hook.example/p', 'x'),
  ('00000000-0000-0000-0000-0000000007f2', 'sub-out', 'out@teste.dev', 'Outra', null, null);
insert into public.as_envelopes (id, conta_id, titulo, origem, codigo_verificacao, paginas, arquivo_original_path, em_ordem) values
  ('00000000-0000-0000-0000-0000000007e1', '00000000-0000-0000-0000-0000000007f1', 'Contrato 50%_off', 'painel', 'PNXA2345PNXA', 1, 'a/b/o1.pdf', true),
  ('00000000-0000-0000-0000-0000000007e2', '00000000-0000-0000-0000-0000000007f1', 'Rascunho X', 'painel', 'PNXB2345PNXB', null, null, false);
insert into public.as_signatarios (id, envelope_id, conta_id, papel, ordem, nome, email, token_hash) values
  ('00000000-0000-0000-0000-0000000007a1', '00000000-0000-0000-0000-0000000007e1', '00000000-0000-0000-0000-0000000007f1', 'assinar', 1, 'Ana', 'ana@pnl.dev', 'tok-pnl-ana'),
  ('00000000-0000-0000-0000-0000000007a2', '00000000-0000-0000-0000-0000000007e1', '00000000-0000-0000-0000-0000000007f1', 'assinar', 2, 'Bia', 'bia@pnl.dev', 'tok-pnl-bia'),
  ('00000000-0000-0000-0000-0000000007a3', '00000000-0000-0000-0000-0000000007e1', '00000000-0000-0000-0000-0000000007f1', 'copia', 1, 'Caio', 'caio@pnl.dev', 'tok-pnl-caio');
update public.as_envelopes set status = 'enviado', hash_original = repeat('a', 64), enviado_em = now(), prazo_em = now() + interval '30 days' where id = '00000000-0000-0000-0000-0000000007e1';
update public.as_signatarios set status = 'aguardando' where id = '00000000-0000-0000-0000-0000000007a1';

-- Lista.
select is((select count(*)::int from public.as_fn_lista_envelopes('00000000-0000-0000-0000-0000000007f1', 'todos', null, 30, 0)), 2, 'todos da conta');
select is((select id from public.as_fn_lista_envelopes('00000000-0000-0000-0000-0000000007f1', 'aguardando', null, 30, 0)), '00000000-0000-0000-0000-0000000007e1'::uuid, 'aguardando');
select is((select id from public.as_fn_lista_envelopes('00000000-0000-0000-0000-0000000007f1', 'rascunhos', null, 30, 0)), '00000000-0000-0000-0000-0000000007e2'::uuid, 'rascunhos');
select is((select count(*)::int from public.as_fn_lista_envelopes('00000000-0000-0000-0000-0000000007f1', 'encerrados', null, 30, 0)), 0, 'encerrados vazio');
select is((select titulo from public.as_fn_lista_envelopes('00000000-0000-0000-0000-0000000007f1', 'todos', '50%_', 30, 0)), 'Contrato 50%_off', '% e _ como texto');
select is((select count(*)::int from public.as_fn_lista_envelopes('00000000-0000-0000-0000-0000000007f1', 'todos', '5_%', 30, 0)), 0, '"5_%" não casa como curinga');
select is((select titulo from public.as_fn_lista_envelopes('00000000-0000-0000-0000-0000000007f1', 'todos', 'BIA@PNL', 30, 0)), 'Contrato 50%_off', 'busca por e-mail, sem maiúsculas');
select results_eq($$select assinaram, assinantes, total::int from public.as_fn_lista_envelopes('00000000-0000-0000-0000-0000000007f1', 'aguardando', null, 30, 0)$$, $$values (0, 2, 1)$$, 'progresso e total');
select is((select count(*)::int from public.as_fn_lista_envelopes('00000000-0000-0000-0000-0000000007f2', 'todos', null, 30, 0)), 0, 'outra conta não vê');

-- Lembrete.
select throws_ok($$select * from public.as_fn_reserva_lembrete('00000000-0000-0000-0000-0000000007f2', '00000000-0000-0000-0000-0000000007e1', '00000000-0000-0000-0000-0000000007a1', 24, 10)$$, 'P0001', 'nao_encontrado', 'lembrete de outra conta');
select throws_ok($$select * from public.as_fn_reserva_lembrete('00000000-0000-0000-0000-0000000007f1', '00000000-0000-0000-0000-0000000007e1', '00000000-0000-0000-0000-0000000007a2', 24, 10)$$, 'P0001', 'status_mudou', 'quem ainda não é da vez');
create temp table l1 as select * from public.as_fn_reserva_lembrete('00000000-0000-0000-0000-0000000007f1', '00000000-0000-0000-0000-0000000007e1', '00000000-0000-0000-0000-0000000007a1', 24, 10);
select is((select numero from l1), 1, '1º lembrete reservado');
select throws_ok($$select * from public.as_fn_reserva_lembrete('00000000-0000-0000-0000-0000000007f1', '00000000-0000-0000-0000-0000000007e1', '00000000-0000-0000-0000-0000000007a1', 24, 10)$$, 'P0001', 'lembrete_recente', 'segundo em menos de 24 h');
select is(public.as_fn_confirma_lembrete('00000000-0000-0000-0000-0000000007f1', '00000000-0000-0000-0000-0000000007e1', '00000000-0000-0000-0000-0000000007a1', (select chave from l1), 'tok-novo', 'r1', 'remetente'), true, 'confirma e troca o link');
select results_eq($$select (select token_hash from public.as_signatarios where id = '00000000-0000-0000-0000-0000000007a1'),
                           (select status::text from public.as_notificacoes where chave = (select chave from l1)),
                           (select dados from public.as_eventos where envelope_id = '00000000-0000-0000-0000-0000000007e1' and tipo = 'lembrete_enviado')$$,
  $$values ('tok-novo'::text, 'enviada'::text, '{"canal":"manual"}'::jsonb)$$, 'link novo, notificação enviada, evento manual');
-- Desfazer volta a contagem (e-mail que falhou).
update public.as_signatarios set ultimo_lembrete_em = now() - interval '25 hours' where id = '00000000-0000-0000-0000-0000000007a1';
create temp table l2 as select * from public.as_fn_reserva_lembrete('00000000-0000-0000-0000-0000000007f1', '00000000-0000-0000-0000-0000000007e1', '00000000-0000-0000-0000-0000000007a1', 24, 10);
select lives_ok($$select public.as_fn_desfaz_lembrete('00000000-0000-0000-0000-0000000007f1', '00000000-0000-0000-0000-0000000007a1', 2, (select chave from l2), (select anterior from l2), 'resend_500')$$, 'desfaz');
select results_eq($$select lembretes_enviados::int, ultimo_lembrete_em = (select anterior from l2) from public.as_signatarios where id = '00000000-0000-0000-0000-0000000007a1'$$,
  $$values (1, true)$$, 'contagem e último contato de volta');
-- A tentativa que falhou não bloqueia a próxima (chave única por tentativa).
create temp table l3 as select * from public.as_fn_reserva_lembrete('00000000-0000-0000-0000-0000000007f1', '00000000-0000-0000-0000-0000000007e1', '00000000-0000-0000-0000-0000000007a1', 24, 10);
select is((select numero from l3), 2, 'nova tentativa depois da falha');
select is((select count(*)::int from public.as_notificacoes where signatario_id = '00000000-0000-0000-0000-0000000007a1' and tipo = 'lembrete'), 3, 'cada tentativa com a sua notificação');
-- O signatário assina entre a reserva e a confirmação: o envio fica registrado, o link não muda.
update public.as_signatarios set status = 'assinou', assinado_em = now() where id = '00000000-0000-0000-0000-0000000007a1';
select is(public.as_fn_confirma_lembrete('00000000-0000-0000-0000-0000000007f1', '00000000-0000-0000-0000-0000000007e1', '00000000-0000-0000-0000-0000000007a1', (select chave from l3), 'tok-tarde', 'r3', 'remetente'), false, 'confirma tarde: não troca o link');
select results_eq($$select (select token_hash from public.as_signatarios where id = '00000000-0000-0000-0000-0000000007a1'),
                           (select status::text from public.as_notificacoes where chave = (select chave from l3)),
                           (select count(*)::int from public.as_eventos where envelope_id = '00000000-0000-0000-0000-0000000007e1' and tipo = 'lembrete_enviado')$$,
  $$values ('tok-novo'::text, 'enviada'::text, 2)$$, 'mas o e-mail que saiu fica registrado');
update public.as_signatarios set status = 'aguardando', assinado_em = null where id = '00000000-0000-0000-0000-0000000007a1';
-- Prazo vencido (antes da faxina): sem lembrete nem link.
update public.as_envelopes set prazo_em = now() - interval '1 second' where id = '00000000-0000-0000-0000-0000000007e1';
select throws_ok($$select public.as_fn_copia_link('00000000-0000-0000-0000-0000000007f1', '00000000-0000-0000-0000-0000000007e1', '00000000-0000-0000-0000-0000000007a1', 'x', 'remetente')$$, 'P0001', 'prazo_encerrado', 'link depois do prazo');
update public.as_envelopes set prazo_em = now() + interval '30 days' where id = '00000000-0000-0000-0000-0000000007e1';
update public.as_signatarios set ultimo_lembrete_em = null, lembretes_enviados = 10 where id = '00000000-0000-0000-0000-0000000007a1';
select throws_ok($$select * from public.as_fn_reserva_lembrete('00000000-0000-0000-0000-0000000007f1', '00000000-0000-0000-0000-0000000007e1', '00000000-0000-0000-0000-0000000007a1', 24, 10)$$, 'P0001', 'limite_lembretes', '11º lembrete');

-- Link copiado.
select lives_ok($$select public.as_fn_copia_link('00000000-0000-0000-0000-0000000007f1', '00000000-0000-0000-0000-0000000007e1', '00000000-0000-0000-0000-0000000007a1', 'tok-copiado', 'remetente')$$, 'copia link');
select results_eq($$select (select token_hash from public.as_signatarios where id = '00000000-0000-0000-0000-0000000007a1'),
                           (select dados from public.as_eventos where envelope_id = '00000000-0000-0000-0000-0000000007e1' and tipo = 'convite_enviado' order by seq desc limit 1)$$,
  $$values ('tok-copiado'::text, '{"canal":"link_copiado"}'::jsonb)$$, 'token novo e evento link_copiado');

-- Excluir enviado: não. Cancelar.
select throws_ok($$select public.as_fn_exclui_envelope('00000000-0000-0000-0000-0000000007f1', '00000000-0000-0000-0000-0000000007e1', 'Contrato 50%_off')$$, 'P0001', 'status_mudou', 'enviado não se exclui');
select lives_ok($$select public.as_fn_cancela_envelope('00000000-0000-0000-0000-0000000007f1', '00000000-0000-0000-0000-0000000007e1', '  Valor mudou ', 'remetente')$$, 'cancela');
select results_eq($$select status::text, motivo_cancelamento, encerrado_em is not null,
                           (select count(*)::int from public.as_notificacoes where envelope_id = '00000000-0000-0000-0000-0000000007e1' and tipo = 'cancelado_destinatario'),
                           (select count(*)::int from public.as_entregas_webhook where envelope_id = '00000000-0000-0000-0000-0000000007e1' and evento = 'envelope.cancelado'),
                           (select tipo::text from public.as_eventos where envelope_id = '00000000-0000-0000-0000-0000000007e1' order by seq desc limit 1)
                      from public.as_envelopes where id = '00000000-0000-0000-0000-0000000007e1'$$,
  $$values ('cancelado'::text, 'Valor mudou'::text, true, 1, 1, 'cancelado'::text)$$, 'cancelado: motivo, aviso só a quem foi convidado, webhook, evento');

-- Excluir: título exato, depois cascata.
select throws_ok($$select public.as_fn_exclui_envelope('00000000-0000-0000-0000-0000000007f1', '00000000-0000-0000-0000-0000000007e1', 'contrato 50%_off')$$, 'P0001', 'titulo_nao_confere', 'título precisa ser exato');
select throws_ok($$select public.as_fn_exclui_envelope('00000000-0000-0000-0000-0000000007f2', '00000000-0000-0000-0000-0000000007e1', 'Contrato 50%_off')$$, 'P0001', 'nao_encontrado', 'outra conta não exclui');
select lives_ok($$select public.as_fn_exclui_envelope('00000000-0000-0000-0000-0000000007f1', '00000000-0000-0000-0000-0000000007e1', 'Contrato 50%_off')$$, 'exclui, com a trilha em cascata');

select * from finish();
rollback;
