-- Épico 8.8 / regra 11.11: a consulta pública devolve só o resumo permitido, por hash ou código;
-- rascunho e conta suspensa não aparecem.
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into public.as_contas (id, google_sub, email, nome) values
  ('00000000-0000-0000-0000-0000000008f1', 'sub-ver', 'ver@teste.dev', 'Remetente');
insert into public.as_envelopes (id, conta_id, titulo, origem, codigo_verificacao, paginas, arquivo_original_path) values
  ('00000000-0000-0000-0000-0000000008e1', '00000000-0000-0000-0000-0000000008f1', 'Contrato', 'painel', 'VRFA2345VRFA', 1, 'a/b/o.pdf'),
  ('00000000-0000-0000-0000-0000000008e2', '00000000-0000-0000-0000-0000000008f1', 'Rascunho', 'painel', 'VRFB2345VRFB', null, null);
insert into public.as_signatarios (id, envelope_id, conta_id, papel, ordem, nome, email, token_hash, cpf) values
  ('00000000-0000-0000-0000-0000000008a1', '00000000-0000-0000-0000-0000000008e1', '00000000-0000-0000-0000-0000000008f1', 'assinar', 1, 'Ana', 'ana@ver.dev', 'tok-ver-ana', '52998224725'),
  ('00000000-0000-0000-0000-0000000008a2', '00000000-0000-0000-0000-0000000008e1', '00000000-0000-0000-0000-0000000008f1', 'copia', 1, 'Caio', 'caio@ver.dev', 'tok-ver-caio', null);
update public.as_envelopes set status = 'enviado', hash_original = repeat('1', 64), enviado_em = now() - interval '1 hour', prazo_em = now() + interval '30 days'
 where id = '00000000-0000-0000-0000-0000000008e1';
update public.as_envelopes set status = 'finalizando' where id = '00000000-0000-0000-0000-0000000008e1';
update public.as_signatarios set status = 'assinou', assinado_em = now() where id = '00000000-0000-0000-0000-0000000008a1';
update public.as_envelopes set status = 'concluido', hash_final = repeat('2', 64), selo = 'B-T', concluido_em = now(), arquivo_final_path = 'a/b/final-x.pdf'
 where id = '00000000-0000-0000-0000-0000000008e1';

select is((select resultado from public.as_fn_verifica_documento(repeat('2', 64), null)), 'final', 'hash final');
select is((select resultado from public.as_fn_verifica_documento(repeat('1', 64), null)), 'original', 'hash original');
select is((select resultado from public.as_fn_verifica_documento(null, 'VRFA2345VRFA')), 'codigo', 'código');
select is((select envelope from public.as_fn_verifica_documento(repeat('2', 64), null)) - 'enviado_em' - 'concluido_em' - 'assinantes',
  '{"status": "concluido", "titulo": "Contrato", "selo": "B-T"}'::jsonb, 'resumo: só status, título, datas, selo e assinantes');
select is((select jsonb_array_length(envelope -> 'assinantes') from public.as_fn_verifica_documento(repeat('2', 64), null)), 1, 'cópia não aparece como assinante');
select is((select (envelope -> 'assinantes' -> 0) ? 'email' or (envelope -> 'assinantes' -> 0) ? 'cpf' from public.as_fn_verifica_documento(repeat('2', 64), null)), false, 'sem e-mail nem CPF');
select is((select count(*)::int from public.as_fn_verifica_documento(null, 'VRFB2345VRFB')), 0, 'rascunho não aparece');
select is((select count(*)::int from public.as_fn_verifica_documento('nao-e-hash', null)), 0, 'hash malformado: nada');
-- O mesmo original em outro envelope: sem resumo de ninguém.
insert into public.as_envelopes (id, conta_id, titulo, origem, codigo_verificacao, paginas, arquivo_original_path)
values ('00000000-0000-0000-0000-0000000008e3', '00000000-0000-0000-0000-0000000008f1', 'Outro', 'painel', 'VRFC2345VRFC', 1, 'a/b/o3.pdf');
insert into public.as_signatarios (id, envelope_id, conta_id, papel, ordem, nome, email, token_hash) values
  ('00000000-0000-0000-0000-0000000008a3', '00000000-0000-0000-0000-0000000008e3', '00000000-0000-0000-0000-0000000008f1', 'assinar', 1, 'Bia', 'bia@ver.dev', 'tok-ver-bia');
update public.as_envelopes set status = 'enviado', hash_original = repeat('1', 64), enviado_em = now(), prazo_em = now() + interval '30 days' where id = '00000000-0000-0000-0000-0000000008e3';
select results_eq($$select resultado, envelope from public.as_fn_verifica_documento(repeat('1', 64), null)$$,
  $$values ('original_multiplo'::text, null::jsonb)$$, 'original em vários envelopes: sem resumo');
update public.as_contas set suspensa_em = now() where id = '00000000-0000-0000-0000-0000000008f1';
select is((select count(*)::int from public.as_fn_verifica_documento(repeat('2', 64), null)), 0, 'conta suspensa: como inexistente');

select * from finish();
rollback;
