-- Épico 8.10 / seção 6.4: código de autorização (redirect_uri exato, PKCE) e a troca pelo token
-- mcp, numa transação; código usado, vencido, de outro cliente ou com PKCE errado não troca.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

insert into public.as_contas (id, google_sub, email, nome) values ('00000000-0000-0000-0000-00000000aaf1', 'sub-oauth', 'oauth@teste.dev', 'Remetente');
insert into public.as_oauth_clientes (id, nome, redirect_uris) values
  ('00000000-0000-0000-0000-00000000aac1', 'Claude', array['https://claude.ai/cb']),
  ('00000000-0000-0000-0000-00000000aac2', 'Outro', array['https://outro.example/cb']);

select throws_ok($$select public.as_fn_cria_codigo_oauth('h1', '00000000-0000-0000-0000-00000000aac1', '00000000-0000-0000-0000-00000000aaf1', 'https://evil.example/cb', repeat('a', 43), 600)$$,
  'P0001', 'invalid_request', 'redirect_uri fora da lista');
select throws_ok($$select public.as_fn_cria_codigo_oauth('h1', '00000000-0000-0000-0000-00000000aac9', '00000000-0000-0000-0000-00000000aaf1', 'https://claude.ai/cb', repeat('a', 43), 600)$$,
  'P0001', 'invalid_client', 'cliente inexistente');
select throws_ok($$select public.as_fn_cria_codigo_oauth('h1', '00000000-0000-0000-0000-00000000aac1', '00000000-0000-0000-0000-00000000aaf1', 'https://claude.ai/cb', 'curto', 600)$$,
  'P0001', 'invalid_request', 'code_challenge malformado');
select lives_ok($$select public.as_fn_cria_codigo_oauth('h1', '00000000-0000-0000-0000-00000000aac1', '00000000-0000-0000-0000-00000000aaf1', 'https://claude.ai/cb', repeat('a', 43), 600)$$, 'código criado');

select is(public.as_fn_troca_codigo_oauth('h1', '00000000-0000-0000-0000-00000000aac1', 'https://claude.ai/cb', repeat('b', 43), 't1', 'assina_mcp_t1'), null, 'PKCE errado');
select is(public.as_fn_troca_codigo_oauth('h1', '00000000-0000-0000-0000-00000000aac2', 'https://claude.ai/cb', repeat('a', 43), 't1', 'assina_mcp_t1'), null, 'outro cliente');
select is(public.as_fn_troca_codigo_oauth('h1', '00000000-0000-0000-0000-00000000aac1', 'https://claude.ai/outro', repeat('a', 43), 't1', 'assina_mcp_t1'), null, 'redirect_uri diferente');
select is(public.as_fn_troca_codigo_oauth('h1', '00000000-0000-0000-0000-00000000aac1', 'https://claude.ai/cb', repeat('a', 43), 't1', 'assina_mcp_t1'), '00000000-0000-0000-0000-00000000aaf1'::uuid, 'troca e devolve a conta');
select results_eq($$select tipo::text, nome, oauth_cliente_id, valor_cifrado is null, revogada_em is null from public.as_credenciais where valor_hash = 't1'$$,
  $$values ('mcp'::text, 'Claude'::text, '00000000-0000-0000-0000-00000000aac1'::uuid, true, true)$$, 'credencial mcp com o nome do cliente, só hash');
select is(public.as_fn_troca_codigo_oauth('h1', '00000000-0000-0000-0000-00000000aac1', 'https://claude.ai/cb', repeat('a', 43), 't2', 'assina_mcp_t2'), null, 'código reutilizado não troca');
select is((select revogada_em is not null from public.as_credenciais where valor_hash = 't1'), true, 'e revoga o token que o código gerou (RFC 9700)');
select is((select count(*)::int from public.as_credenciais where valor_hash = 't2'), 0, 'nenhum token novo no reuso');

select public.as_fn_cria_codigo_oauth('h2', '00000000-0000-0000-0000-00000000aac1', '00000000-0000-0000-0000-00000000aaf1', 'https://claude.ai/cb', repeat('a', 43), 600);
update public.as_oauth_codigos set expira_em = now() - interval '1 second' where codigo_hash = 'h2';
select is(public.as_fn_troca_codigo_oauth('h2', '00000000-0000-0000-0000-00000000aac1', 'https://claude.ai/cb', repeat('a', 43), 't3', 'assina_mcp_t3'), null, 'código vencido');

select public.as_fn_cria_codigo_oauth('h4', '00000000-0000-0000-0000-00000000aac1', '00000000-0000-0000-0000-00000000aaf1', 'https://claude.ai/cb', repeat('a', 43), 600);
update public.as_contas set suspensa_em = now() where id = '00000000-0000-0000-0000-00000000aaf1';
select is(public.as_fn_troca_codigo_oauth('h4', '00000000-0000-0000-0000-00000000aac1', 'https://claude.ai/cb', repeat('a', 43), 't4', 'assina_mcp_t4'), null, 'conta suspensa não recebe token');

select * from finish();
rollback;
