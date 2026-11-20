-- Épico 8.14: data de nascimento do assinante (plans/8.14-data-nascimento.md).
-- Pedida por assinante (nunca para cópia), conferida e gravada por as_fn_assina, congelada no envio.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into public.as_contas (id, google_sub, email, nome)
values ('00000000-0000-0000-0000-0000000008a1', 'sub-nasc', 'nasc@teste.dev', 'Remetente');

-- Rascunho: a lista do editor liga exigir_nascimento; cópia nunca exige.
insert into public.as_envelopes (id, conta_id, titulo, origem, codigo_verificacao)
values ('00000000-0000-0000-0000-0000000008a2', '00000000-0000-0000-0000-0000000008a1', 'Rascunho', 'painel', 'NASD6789NASD');
select lives_ok(
  $$select * from public.as_fn_substitui_signatarios('00000000-0000-0000-0000-0000000008a2', '00000000-0000-0000-0000-0000000008a1',
      '[{"nome":"Ana","email":"ana@nasc.dev","papel":"assinar","exigir_nascimento":true},
        {"nome":"Carla","email":"carla@nasc.dev","papel":"copia","exigir_nascimento":true}]')$$,
  'lista com exigir_nascimento'
);
select results_eq(
  $$select email, exigir_nascimento from public.as_signatarios where envelope_id = '00000000-0000-0000-0000-0000000008a2' order by email$$,
  $$values ('ana@nasc.dev'::text, true), ('carla@nasc.dev', false)$$,
  'assinante exige; cópia nunca exige'
);
select throws_ok(
  $$update public.as_signatarios set exigir_nascimento = true where envelope_id = '00000000-0000-0000-0000-0000000008a2' and email = 'carla@nasc.dev'$$,
  '23514', null, 'check: cópia não pode exigir data de nascimento'
);

-- Enviado: Ana (exige) e Bruno (não exige), sem ordem.
insert into public.as_envelopes (id, conta_id, titulo, origem, codigo_verificacao, paginas, arquivo_original_path)
values ('00000000-0000-0000-0000-0000000008b2', '00000000-0000-0000-0000-0000000008a1', 'Contrato', 'painel', 'NASC2345NASC', 1, 'a/b/original-1.pdf');
insert into public.as_signatarios (id, envelope_id, conta_id, papel, ordem, nome, email, token_hash, exigir_nascimento) values
  ('00000000-0000-0000-0000-0000000008b3', '00000000-0000-0000-0000-0000000008b2', '00000000-0000-0000-0000-0000000008a1', 'assinar', 1, 'Ana', 'ana@nasc.dev', 'tok-ana-n', true),
  ('00000000-0000-0000-0000-0000000008b4', '00000000-0000-0000-0000-0000000008b2', '00000000-0000-0000-0000-0000000008a1', 'assinar', 2, 'Bruno', 'bruno@nasc.dev', 'tok-bruno-n', false),
  ('00000000-0000-0000-0000-0000000008b5', '00000000-0000-0000-0000-0000000008b2', '00000000-0000-0000-0000-0000000008a1', 'assinar', 3, 'Caio', 'caio@nasc.dev', 'tok-caio-n', true),
  ('00000000-0000-0000-0000-0000000008b6', '00000000-0000-0000-0000-0000000008b2', '00000000-0000-0000-0000-0000000008a1', 'assinar', 4, 'Dani', 'dani@nasc.dev', 'tok-dani-n', true);
update public.as_envelopes set status = 'enviado', hash_original = repeat('a', 64), enviado_em = now(), prazo_em = now() + interval '30 days'
 where id = '00000000-0000-0000-0000-0000000008b2';
update public.as_signatarios set status = 'aguardando' where envelope_id = '00000000-0000-0000-0000-0000000008b2';

select throws_ok(
  $$update public.as_signatarios set exigir_nascimento = false where id = '00000000-0000-0000-0000-0000000008b3'$$,
  'P0001', 'envelope_congelado', 'depois do envio, exigir_nascimento não muda'
);

create function pg_temp.assina(p_id uuid, p_token text, p_nascimento date)
returns table (envelope_status public.as_status_envelope, proximo_id uuid) language sql as $$
  select * from public.as_fn_assina(p_id, p_token, 'digitada', 'Nome', null, null, null, null, '[]', '2026-11-17', null, null, p_nascimento);
$$;
select throws_ok($$select * from pg_temp.assina('00000000-0000-0000-0000-0000000008b3', 'tok-ana-n', null)$$,
  'P0001', 'nascimento_invalido', 'exigida e ausente');
select throws_ok($$select * from pg_temp.assina('00000000-0000-0000-0000-0000000008b3', 'tok-ana-n', ((now() at time zone 'America/Sao_Paulo')::date + 1))$$,
  'P0001', 'nascimento_invalido', 'data futura');
select throws_ok($$select * from pg_temp.assina('00000000-0000-0000-0000-0000000008b3', 'tok-ana-n', ((now() at time zone 'America/Sao_Paulo')::date - interval '121 years')::date)$$,
  'P0001', 'nascimento_invalido', 'mais de 120 anos');

select lives_ok($$select * from pg_temp.assina('00000000-0000-0000-0000-0000000008b3', 'tok-ana-n', '1985-03-15')$$, 'data válida assina');
-- Limites: exatamente 120 anos atrás e o dia de hoje (Brasília) valem.
select lives_ok($$select * from pg_temp.assina('00000000-0000-0000-0000-0000000008b5', 'tok-caio-n', ((now() at time zone 'America/Sao_Paulo')::date - interval '120 years')::date)$$, 'exatamente 120 anos vale');
select lives_ok($$select * from pg_temp.assina('00000000-0000-0000-0000-0000000008b6', 'tok-dani-n', (now() at time zone 'America/Sao_Paulo')::date)$$, 'hoje vale');
select is((select data_nascimento from public.as_signatarios where id = '00000000-0000-0000-0000-0000000008b3'), '1985-03-15'::date, 'data gravada');

-- Bruno não tem a exigência: a data enviada não é gravada.
select pg_temp.assina('00000000-0000-0000-0000-0000000008b4', 'tok-bruno-n', '1990-01-01');
select is((select data_nascimento from public.as_signatarios where id = '00000000-0000-0000-0000-0000000008b4'), null, 'sem exigência, nada gravado');

select * from finish();
rollback;
