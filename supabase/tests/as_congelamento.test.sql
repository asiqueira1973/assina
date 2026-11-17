-- Princípio 2 e seção 12 / 7.5: depois do envio, documento, destinatários e campos não mudam;
-- só as transições permitidas acontecem; a faxina 11.14 consegue expurgar o arquivo.
begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

insert into public.as_contas (id, google_sub, email, nome)
values ('00000000-0000-0000-0000-0000000000a2', 'sub-cong', 'cong@teste.dev', 'Cong');
insert into public.as_envelopes (id, conta_id, titulo, origem, codigo_verificacao, paginas, arquivo_original_path)
values ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000a2', 'Contrato', 'painel', 'QWER5678TYAB', 2,
        '00000000-0000-0000-0000-0000000000a2/00000000-0000-0000-0000-0000000000e3/original.pdf');
insert into public.as_signatarios (id, envelope_id, conta_id, papel, ordem, nome, email, token_hash) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000a2', 'assinar', 1, 'Ana', 'ana@teste.dev', 't1'),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000a2', 'copia', 1, 'Carla', 'carla@teste.dev', 't2');

-- Em rascunho, campos se validam (as_tg_valida_campo).
select lives_ok(
  $$insert into public.as_campos (id, envelope_id, signatario_id, tipo, pagina, x, y, largura, altura)
    values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000b1', 'assinatura', 1, 0.1, 0.8, 0.3, 0.06)$$,
  'campo de assinatura na página 1 entra'
);
select throws_ok(
  $$insert into public.as_campos (envelope_id, signatario_id, tipo, pagina, x, y, largura, altura)
    values ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000b1', 'data', 3, 0.1, 0.1, 0.1, 0.03)$$,
  'P0001', 'campo_invalido', 'campo em página que não existe é recusado'
);
select throws_ok(
  $$insert into public.as_campos (envelope_id, signatario_id, tipo, pagina, x, y, largura, altura)
    values ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000b2', 'data', 1, 0.1, 0.1, 0.1, 0.03)$$,
  'P0001', 'campo_invalido', 'campo para quem só recebe cópia é recusado'
);
select throws_ok(
  $$insert into public.as_campos (envelope_id, signatario_id, tipo, pagina, x, y, largura, altura)
    values ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000b1', 'texto', 1, 0.9, 0.1, 0.3, 0.03)$$,
  '23514', null, 'campo que passa da borda da página é recusado'
);

select is(public.as_fn_transicao_envelope('00000000-0000-0000-0000-0000000000e3', 'enviado', 'cancelado'), false,
  'transição a partir do status errado não muda nada');

-- Envio (rascunho → enviado) com o hash do original.
select lives_ok(
  $$update public.as_envelopes set status = 'enviado', hash_original = repeat('a', 64), enviado_em = now(), prazo_em = now() + interval '30 days'
     where id = '00000000-0000-0000-0000-0000000000e3'$$,
  'rascunho → enviado com hash_original'
);

select throws_ok($$update public.as_envelopes set titulo = 'Outro' where id = '00000000-0000-0000-0000-0000000000e3'$$,
  'P0001', 'envelope_congelado', 'título não muda depois do envio');
select throws_ok($$update public.as_envelopes set hash_original = repeat('b', 64) where id = '00000000-0000-0000-0000-0000000000e3'$$,
  'P0001', 'envelope_congelado', 'hash_original não muda depois de preenchido');
select throws_ok($$update public.as_envelopes set arquivo_original_path = 'outro.pdf' where id = '00000000-0000-0000-0000-0000000000e3'$$,
  'P0001', 'envelope_congelado', 'o arquivo não é trocado depois do envio');
select throws_ok(
  $$insert into public.as_signatarios (envelope_id, conta_id, papel, ordem, nome, email, token_hash)
    values ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000a2', 'assinar', 2, 'Bruno', 'bruno@teste.dev', 't3')$$,
  'P0001', 'envelope_congelado', 'não entra destinatário depois do envio');
select throws_ok($$update public.as_signatarios set email = 'outra@teste.dev' where id = '00000000-0000-0000-0000-0000000000b1'$$,
  'P0001', 'envelope_congelado', 'e-mail do destinatário não muda depois do envio');
select lives_ok($$update public.as_signatarios set status = 'aguardando', token_hash = 't1-novo' where id = '00000000-0000-0000-0000-0000000000b1'$$,
  'status e link novo do signatário mudam (andamento)');
select throws_ok($$delete from public.as_signatarios where id = '00000000-0000-0000-0000-0000000000b2'$$,
  'P0001', 'envelope_congelado', 'destinatário não sai depois do envio');
select throws_ok($$update public.as_campos set x = 0.2 where id = '00000000-0000-0000-0000-0000000000c1'$$,
  'P0001', 'envelope_congelado', 'campo não se move depois do envio');
select lives_ok($$update public.as_campos set valor = 'sim' where id = '00000000-0000-0000-0000-0000000000c1'$$,
  'valor do campo é preenchido na assinatura');
select throws_ok($$delete from public.as_campos where id = '00000000-0000-0000-0000-0000000000c1'$$,
  'P0001', 'envelope_congelado', 'campo não sai depois do envio');

-- Máquina de estado (seção 12).
select throws_ok($$update public.as_envelopes set status = 'rascunho' where id = '00000000-0000-0000-0000-0000000000e3'$$,
  'P0001', 'status_mudou', 'não volta para rascunho');
select throws_ok($$update public.as_envelopes set status = 'concluido' where id = '00000000-0000-0000-0000-0000000000e3'$$,
  'P0001', 'status_mudou', 'enviado não pula para concluido');
select throws_ok($$delete from public.as_envelopes where id = '00000000-0000-0000-0000-0000000000e3'$$,
  'P0001', 'envelope_em_andamento', 'envelope enviado não se exclui (7.4: primeiro cancela)');
select throws_ok(
  $$insert into public.as_envelopes (conta_id, titulo, origem, codigo_verificacao, status)
    values ('00000000-0000-0000-0000-0000000000a2', 'Pulo', 'api', 'PVZA1234PVZA', 'concluido')$$,
  'P0001', 'status_mudou', 'envelope não nasce fora de rascunho');
select throws_ok(
  $$insert into public.as_envelopes (conta_id, titulo, origem, codigo_verificacao, hash_original)
    values ('00000000-0000-0000-0000-0000000000a2', 'Pulo', 'api', 'PVZA1234PVZA', repeat('c', 64))$$,
  'P0001', 'status_mudou', 'envelope não nasce com hash do original');
select is(public.as_fn_transicao_envelope('00000000-0000-0000-0000-0000000000e3', 'enviado', 'cancelado'), true,
  'enviado → cancelado');
select is(public.as_fn_transicao_envelope('00000000-0000-0000-0000-0000000000e3', 'enviado', 'finalizando'), false,
  'a segunda transição concorrente perde (o status já mudou)');
select throws_ok($$update public.as_envelopes set status = 'enviado' where id = '00000000-0000-0000-0000-0000000000e3'$$,
  'P0001', 'status_mudou', 'cancelado é final');

-- Expurgo da regra 11.14: só limpando o caminho junto com arquivos_expurgados_em.
select throws_ok($$update public.as_envelopes set arquivo_original_path = null where id = '00000000-0000-0000-0000-0000000000e3'$$,
  'P0001', 'envelope_congelado', 'limpar o arquivo sem marcar o expurgo é recusado');
select lives_ok(
  $$update public.as_envelopes set arquivo_original_path = null, arquivos_expurgados_em = now(), encerrado_em = now()
     where id = '00000000-0000-0000-0000-0000000000e3'$$,
  'o expurgo de envelope encerrado passa');

-- Excluir o envelope encerrado leva destinatários e campos em cascata (7.4).
select lives_ok($$delete from public.as_envelopes where id = '00000000-0000-0000-0000-0000000000e3'$$,
  'excluir o envelope encerrado passa, com destinatários e campos em cascata');

insert into public.as_envelopes (id, conta_id, titulo, origem, codigo_verificacao)
values ('00000000-0000-0000-0000-0000000000e4', '00000000-0000-0000-0000-0000000000a2', 'Andando', 'painel', 'ANDA1234ANDA');
update public.as_envelopes set status = 'enviado', hash_original = repeat('d', 64) where id = '00000000-0000-0000-0000-0000000000e4';
select lives_ok($$delete from public.as_contas where id = '00000000-0000-0000-0000-0000000000a2'$$,
  'excluir a conta leva junto até envelope em andamento (cascata)');

select * from finish();
rollback;
