-- Épico 8.2 / regra 11.2 / princípio 1: rascunho nasce com o evento "criado"; a lista de
-- destinatários se troca numa transação, preservando quem continua e renumerando a ordem.
begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

insert into public.as_contas (id, google_sub, email, nome)
values ('00000000-0000-0000-0000-0000000000a5', 'sub-rasc', 'rasc@teste.dev', 'Rasc'),
       ('00000000-0000-0000-0000-0000000000a6', 'sub-outra', 'outra@teste.dev', 'Outra');

select is(
  (public.as_fn_cria_rascunho('00000000-0000-0000-0000-0000000000a5', 'Contrato', 'painel', 'RASC1234RASC', 'remetente', '203.0.113.9', 'UA')).status,
  'rascunho'::public.as_status_envelope, 'rascunho criado'
);
select results_eq(
  $$select e.seq, e.tipo::text, e.dados ->> 'origem' from public.as_eventos e
      join public.as_envelopes v on v.id = e.envelope_id where v.codigo_verificacao = 'RASC1234RASC'$$,
  $$values (1, 'criado', 'painel')$$,
  'o evento "criado" nasceu junto, com a origem'
);

-- Lista inicial: Ana e Bruno assinam, Carla recebe cópia.
select results_eq(
  $$select nome, ordem, papel::text from public.as_fn_substitui_signatarios(
      (select id from public.as_envelopes where codigo_verificacao = 'RASC1234RASC'), '00000000-0000-0000-0000-0000000000a5',
      '[{"nome":"Ana","email":"Ana@Teste.dev","papel":"assinar","exigir_cpf":true},
        {"nome":"Bruno","email":"bruno@teste.dev","papel":"assinar"},
        {"nome":"Carla","email":"carla@teste.dev","papel":"copia","exigir_cpf":true}]')$$,
  $$values ('Ana'::text, 1::smallint, 'assinar'::text), ('Bruno', 2::smallint, 'assinar'), ('Carla', 1::smallint, 'copia')$$,
  'lista inicial com a ordem pela posição'
);
select is((select email from public.as_signatarios where nome = 'Ana' and envelope_id = (select id from public.as_envelopes where codigo_verificacao = 'RASC1234RASC')), 'ana@teste.dev', 'e-mail em minúsculas');
select is((select exigir_cpf from public.as_signatarios where nome = 'Carla' and envelope_id = (select id from public.as_envelopes where codigo_verificacao = 'RASC1234RASC')), false, 'cópia nunca exige CPF');

-- Campo da Ana (precisa de páginas no envelope).
update public.as_envelopes set paginas = 1 where codigo_verificacao = 'RASC1234RASC';
insert into public.as_campos (envelope_id, signatario_id, tipo, pagina, x, y, largura, altura)
select envelope_id, id, 'assinatura', 1, 0.1, 0.8, 0.3, 0.06 from public.as_signatarios where nome = 'Ana' and envelope_id = (select id from public.as_envelopes where codigo_verificacao = 'RASC1234RASC');
select id as ana_id from public.as_signatarios where nome = 'Ana' and envelope_id = (select id from public.as_envelopes where codigo_verificacao = 'RASC1234RASC') \gset

-- Inverte a ordem (Bruno primeiro): a ordem diferida permite a troca dentro da transação.
select lives_ok(
  $$select public.as_fn_substitui_signatarios(
      (select id from public.as_envelopes where codigo_verificacao = 'RASC1234RASC'), '00000000-0000-0000-0000-0000000000a5',
      '[{"nome":"Bruno","email":"bruno@teste.dev"},{"nome":"Ana Maria","email":"ana@teste.dev","exigir_cpf":true}]')$$,
  'inverter a ordem passa'
);
select results_eq(
  $$select nome, ordem from public.as_signatarios s join public.as_envelopes v on v.id = s.envelope_id
     where v.codigo_verificacao = 'RASC1234RASC' order by ordem$$,
  $$values ('Bruno'::text, 1::smallint), ('Ana Maria', 2::smallint)$$,
  'ordem renumerada e nome atualizado; Carla saiu'
);
select is((select id from public.as_signatarios where email = 'ana@teste.dev' and envelope_id = (select id from public.as_envelopes where codigo_verificacao = 'RASC1234RASC')), :'ana_id'::uuid, 'Ana mantém o id');
select is((select count(*)::int from public.as_campos where signatario_id = :'ana_id'), 1, 'e mantém o campo');

-- Ana vira cópia: perde o campo.
select lives_ok(
  $$select public.as_fn_substitui_signatarios(
      (select id from public.as_envelopes where codigo_verificacao = 'RASC1234RASC'), '00000000-0000-0000-0000-0000000000a5',
      '[{"nome":"Bruno","email":"bruno@teste.dev"},{"nome":"Ana Maria","email":"ana@teste.dev","papel":"copia"}]')$$,
  'Ana vira cópia'
);
select is((select count(*)::int from public.as_campos where signatario_id = :'ana_id'), 0, 'quem vira cópia perde os campos');

-- Limites e escopo.
select throws_ok(
  $$select public.as_fn_substitui_signatarios(
      (select id from public.as_envelopes where codigo_verificacao = 'RASC1234RASC'), '00000000-0000-0000-0000-0000000000a5',
      (select jsonb_agg(jsonb_build_object('nome', 'P' || i, 'email', 'p' || i || '@teste.dev')) from generate_series(1, 11) i))$$,
  'P0001', 'assinantes_demais', '11 assinantes é recusado'
);
select throws_ok(
  $$select public.as_fn_substitui_signatarios(
      (select id from public.as_envelopes where codigo_verificacao = 'RASC1234RASC'), '00000000-0000-0000-0000-0000000000a5',
      (select jsonb_agg(jsonb_build_object('nome', 'C' || i, 'email', 'c' || i || '@teste.dev', 'papel', 'copia')) from generate_series(1, 6) i))$$,
  'P0001', 'copias_demais', '6 cópias é recusado'
);
select throws_ok(
  $$select public.as_fn_substitui_signatarios(
      (select id from public.as_envelopes where codigo_verificacao = 'RASC1234RASC'), '00000000-0000-0000-0000-0000000000a6', '[]')$$,
  'P0001', 'nao_encontrado', 'outra conta não mexe no rascunho'
);
select throws_ok(
  $$select public.as_fn_substitui_signatarios(
      (select id from public.as_envelopes where codigo_verificacao = 'RASC1234RASC'), '00000000-0000-0000-0000-0000000000a5',
      '[{"nome":"X","email":"x@teste.dev"},{"nome":"Y","email":"X@teste.dev"}]')$$,
  'P0001', 'email_repetido', 'e-mail repetido na mesma lista é recusado'
);

-- as_fn_anexa_arquivo: troca atômica do arquivo (Bruno ainda assina; dá um campo a ele).
insert into public.as_campos (envelope_id, signatario_id, tipo, pagina, x, y, largura, altura)
select envelope_id, id, 'assinatura', 1, 0.1, 0.8, 0.3, 0.06 from public.as_signatarios
 where email = 'bruno@teste.dev' and envelope_id = (select id from public.as_envelopes where codigo_verificacao = 'RASC1234RASC');
select results_eq(
  $$select caminho_anterior, campos_removidos from public.as_fn_anexa_arquivo(
      (select id from public.as_envelopes where codigo_verificacao = 'RASC1234RASC'), '00000000-0000-0000-0000-0000000000a5',
      'c/e/original-v2.pdf', 'novo.pdf', 2048, 3::smallint, '[{"l":1,"a":1}]')$$,
  $$values (null::text, true)$$,
  'troca atômica: devolve o caminho anterior e avisa que campos saíram'
);
select results_eq(
  $$select arquivo_original_path, paginas, tamanho_bytes, nome_arquivo from public.as_envelopes where codigo_verificacao = 'RASC1234RASC'$$,
  $$values ('c/e/original-v2.pdf'::text, 3::smallint, 2048, 'novo.pdf'::text)$$,
  'o envelope aponta para o arquivo novo'
);
select is(
  (select count(*)::int from public.as_campos where envelope_id = (select id from public.as_envelopes where codigo_verificacao = 'RASC1234RASC')),
  0, 'os campos saíram junto'
);
select throws_ok(
  $$select public.as_fn_anexa_arquivo((select id from public.as_envelopes where codigo_verificacao = 'RASC1234RASC'),
      '00000000-0000-0000-0000-0000000000a6', 'x.pdf', 'x.pdf', 1, 1::smallint, '[]')$$,
  'P0001', 'nao_encontrado', 'outra conta não troca o arquivo'
);

update public.as_envelopes set status = 'enviado', hash_original = repeat('e', 64) where codigo_verificacao = 'RASC1234RASC';
select throws_ok(
  $$select public.as_fn_anexa_arquivo((select id from public.as_envelopes where codigo_verificacao = 'RASC1234RASC'),
      '00000000-0000-0000-0000-0000000000a5', 'y.pdf', 'y.pdf', 1, 1::smallint, '[]')$$,
  'P0001', 'envelope_congelado', 'fora de rascunho não troca o arquivo'
);
select throws_ok(
  $$select public.as_fn_substitui_signatarios(
      (select id from public.as_envelopes where codigo_verificacao = 'RASC1234RASC'), '00000000-0000-0000-0000-0000000000a5', '[]')$$,
  'P0001', 'envelope_congelado', 'fora de rascunho é recusado'
);

select * from finish();
rollback;
