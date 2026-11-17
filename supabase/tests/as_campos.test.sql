-- Épico 8.3 / regra 11.3: os campos de um rascunho se trocam numa transação, com os limites.
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

insert into public.as_contas (id, google_sub, email, nome)
values ('00000000-0000-0000-0000-0000000000a7', 'sub-campos', 'campos@teste.dev', 'Campos'),
       ('00000000-0000-0000-0000-0000000000a8', 'sub-campos-outra', 'campos-outra@teste.dev', 'Outra');
insert into public.as_envelopes (id, conta_id, titulo, origem, codigo_verificacao, paginas)
values ('00000000-0000-0000-0000-0000000000e7', '00000000-0000-0000-0000-0000000000a7', 'Campos', 'painel', 'CAMP1234CAMP', 2);
insert into public.as_signatarios (id, envelope_id, conta_id, papel, ordem, nome, email, token_hash) values
  ('00000000-0000-0000-0000-0000000000b7', '00000000-0000-0000-0000-0000000000e7', '00000000-0000-0000-0000-0000000000a7', 'assinar', 1, 'Ana', 'ana@campos.dev', 'tc1'),
  ('00000000-0000-0000-0000-0000000000b8', '00000000-0000-0000-0000-0000000000e7', '00000000-0000-0000-0000-0000000000a7', 'copia', 1, 'Carla', 'carla@campos.dev', 'tc2');

select is(
  (select count(*)::int from public.as_fn_substitui_campos('00000000-0000-0000-0000-0000000000e7', '00000000-0000-0000-0000-0000000000a7',
    '[{"signatario_id":"00000000-0000-0000-0000-0000000000b7","tipo":"assinatura","pagina":2,"x":0.1,"y":0.8,"largura":0.3,"altura":0.06,"obrigatorio":false},
      {"signatario_id":"00000000-0000-0000-0000-0000000000b7","tipo":"texto","pagina":1,"x":0.1,"y":0.1,"largura":0.3,"altura":0.03,"obrigatorio":false,"rotulo":" Cargo "}]')),
  2, 'grava a lista'
);
select results_eq(
  $$select tipo::text, obrigatorio, rotulo from public.as_campos where envelope_id = '00000000-0000-0000-0000-0000000000e7' order by pagina$$,
  $$values ('texto'::text, false, 'Cargo'::text), ('assinatura', true, null)$$,
  'assinatura é sempre obrigatória; texto segue a lista; rótulo aparado'
);

select is(
  (select rotulo from public.as_fn_substitui_campos('00000000-0000-0000-0000-0000000000e7', '00000000-0000-0000-0000-0000000000a7',
    '[{"signatario_id":"00000000-0000-0000-0000-0000000000b7","tipo":"assinatura","pagina":1,"x":0.1,"y":0.8,"largura":0.3,"altura":0.06,"rotulo":"Ignorado"}]')),
  null, 'assinatura não guarda rótulo'
);
select is(
  (select count(*)::int from public.as_fn_substitui_campos('00000000-0000-0000-0000-0000000000e7', '00000000-0000-0000-0000-0000000000a7',
    '[{"signatario_id":"00000000-0000-0000-0000-0000000000b7","tipo":"data","pagina":1,"x":0.5,"y":0.5,"largura":0.16,"altura":0.03}]')),
  1, 'substitui tudo (os dois anteriores saíram)'
);
select is(
  (select count(*)::int from public.as_fn_substitui_campos('00000000-0000-0000-0000-0000000000e7', '00000000-0000-0000-0000-0000000000a7', '[]')),
  0, 'lista vazia apaga todos'
);

select throws_ok(
  $$select public.as_fn_substitui_campos('00000000-0000-0000-0000-0000000000e7', '00000000-0000-0000-0000-0000000000a7',
    (select jsonb_agg(jsonb_build_object('signatario_id', '00000000-0000-0000-0000-0000000000b7', 'tipo', 'caixa', 'pagina', 1,
       'x', 0.01, 'y', 0.01, 'largura', 0.03, 'altura', 0.02)) from generate_series(1, 51)))$$,
  'P0001', 'campos_demais', '51 campos para um assinante é recusado'
);
select throws_ok(
  $$select public.as_fn_substitui_campos('00000000-0000-0000-0000-0000000000e7', '00000000-0000-0000-0000-0000000000a7',
    '[{"signatario_id":"00000000-0000-0000-0000-0000000000b8","tipo":"data","pagina":1,"x":0.1,"y":0.1,"largura":0.16,"altura":0.03}]')$$,
  'P0001', 'campo_invalido', 'campo para quem só recebe cópia é recusado'
);
select throws_ok(
  $$select public.as_fn_substitui_campos('00000000-0000-0000-0000-0000000000e7', '00000000-0000-0000-0000-0000000000a7',
    '[{"signatario_id":"00000000-0000-0000-0000-0000000000b7","tipo":"data","pagina":3,"x":0.1,"y":0.1,"largura":0.16,"altura":0.03}]')$$,
  'P0001', 'campo_invalido', 'página que não existe é recusada'
);
select throws_ok(
  $$select public.as_fn_substitui_campos('00000000-0000-0000-0000-0000000000e7', '00000000-0000-0000-0000-0000000000a7',
    '[{"signatario_id":"00000000-0000-0000-0000-0000000000b7","tipo":"texto","pagina":1,"x":0.9,"y":0.1,"largura":0.3,"altura":0.03}]')$$,
  '23514', null, 'campo que passa da borda é recusado'
);
select throws_ok(
  $$select public.as_fn_substitui_campos('00000000-0000-0000-0000-0000000000e7', '00000000-0000-0000-0000-0000000000a8', '[]')$$,
  'P0001', 'nao_encontrado', 'outra conta não mexe nos campos'
);
-- Uma falha no meio não deixa a troca pela metade: o campo gravado antes continua.
select public.as_fn_substitui_campos('00000000-0000-0000-0000-0000000000e7', '00000000-0000-0000-0000-0000000000a7',
  '[{"signatario_id":"00000000-0000-0000-0000-0000000000b7","tipo":"nome","pagina":1,"x":0.2,"y":0.2,"largura":0.3,"altura":0.03}]');
select throws_ok(
  $$select public.as_fn_substitui_campos('00000000-0000-0000-0000-0000000000e7', '00000000-0000-0000-0000-0000000000a7',
    '[{"signatario_id":"00000000-0000-0000-0000-0000000000b7","tipo":"data","pagina":1,"x":0.1,"y":0.1,"largura":0.16,"altura":0.03},
      {"signatario_id":"00000000-0000-0000-0000-0000000000b7","tipo":"data","pagina":9,"x":0.1,"y":0.1,"largura":0.16,"altura":0.03}]')$$,
  'P0001', 'campo_invalido', 'lista com um campo inválido é recusada inteira'
);
select results_eq(
  $$select tipo::text from public.as_campos where envelope_id = '00000000-0000-0000-0000-0000000000e7'$$,
  $$values ('nome'::text)$$,
  'depois da recusa, continua só o campo que já estava gravado'
);

update public.as_envelopes set status = 'enviado', hash_original = repeat('a', 64) where id = '00000000-0000-0000-0000-0000000000e7';
select throws_ok(
  $$select public.as_fn_substitui_campos('00000000-0000-0000-0000-0000000000e7', '00000000-0000-0000-0000-0000000000a7', '[]')$$,
  'P0001', 'envelope_congelado', 'fora de rascunho é recusado'
);

select * from finish();
rollback;
