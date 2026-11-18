-- Assina — épico 8.10: MCP e OAuth 2.1 (spec.md, seções 6.3, 6.4, 8.10 e 13.3). Mesmo desenho do
-- Visão de Produto: cliente público registrado sozinho (RFC 7591), código de autorização de 10 min
-- com PKCE S256, troca por um token `assina_mcp_…` que só existe como hash e vale até ser revogado.

-- Credencial emitida por cada código: se o código for apresentado de novo, o token que ele gerou é
-- revogado (RFC 9700: um código reutilizado indica que vazou).
alter table public.as_oauth_codigos add column credencial_id uuid references public.as_credenciais (id) on delete set null;

-- ---------------------------------------------------------------------------------------------
-- as_fn_cria_codigo_oauth: "Permitir" na tela de consentimento (6.4, passo 4). Confere que o
-- redirect_uri é exatamente um dos registrados pelo cliente e grava o código (hash), com a conta,
-- o redirect_uri e o code_challenge, valendo pelo tempo pedido.
-- Recebe: hash do código, cliente, conta, redirect_uri, code_challenge e validade em segundos.
-- Lança: 'invalid_client' (cliente não existe) ou 'invalid_request' (redirect_uri fora da lista).
-- ---------------------------------------------------------------------------------------------
create function public.as_fn_cria_codigo_oauth(
  p_codigo_hash text, p_cliente_id uuid, p_conta_id uuid, p_redirect_uri text, p_code_challenge text, p_validade_s integer
) returns void
language plpgsql set search_path = '' as $$
declare
  v_uris text[];
begin
  select redirect_uris into v_uris from public.as_oauth_clientes where id = p_cliente_id;
  if v_uris is null then
    raise exception 'invalid_client';
  end if;
  if not (p_redirect_uri = any (v_uris)) or p_code_challenge !~ '^[A-Za-z0-9_-]{43}$' then
    raise exception 'invalid_request';
  end if;
  insert into public.as_oauth_codigos (codigo_hash, cliente_id, conta_id, redirect_uri, code_challenge, expira_em)
  values (p_codigo_hash, p_cliente_id, p_conta_id, p_redirect_uri, p_code_challenge, now() + make_interval(secs => p_validade_s));
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- as_fn_troca_codigo_oauth: POST /oauth/token (6.4, passo 5), numa transação com o código
-- travado (duas trocas ao mesmo tempo não geram dois tokens). Confere: existe, não foi usado, não
-- venceu, é do mesmo cliente, o redirect_uri é o mesmo da autorização e o PKCE (o servidor manda o
-- S256 do code_verifier, que tem de ser igual ao code_challenge guardado). Conta suspensa não
-- recebe token. Queima o código e cria a credencial `mcp` com o nome do cliente.
-- Código já usado: revoga o token que ele gerou (RFC 9700) e não emite outro.
-- Não lança exceção: devolve nulo quando não vale (invalid_grant), para a revogação do reuso ser
-- gravada (uma exceção desfaria a transação inteira).
-- Recebe: hash do código, cliente, redirect_uri, S256 do verifier, hash e prefixo do token.
-- Devolve: a conta, ou nulo.
-- ---------------------------------------------------------------------------------------------
create function public.as_fn_troca_codigo_oauth(
  p_codigo_hash text, p_cliente_id uuid, p_redirect_uri text, p_challenge_do_verifier text, p_token_hash text, p_token_prefixo text
) returns uuid
language plpgsql set search_path = '' as $$
declare
  v_c public.as_oauth_codigos;
  v_nome text;
  v_cred uuid;
begin
  select * into v_c from public.as_oauth_codigos where codigo_hash = p_codigo_hash for update;
  if v_c.codigo_hash is null then
    return null;
  end if;
  if v_c.usado_em is not null then
    update public.as_credenciais set revogada_em = now() where id = v_c.credencial_id and revogada_em is null;
    return null;
  end if;
  if v_c.expira_em <= now()
     or v_c.cliente_id <> p_cliente_id
     or v_c.redirect_uri is distinct from p_redirect_uri
     or v_c.code_challenge is distinct from p_challenge_do_verifier then
    return null;
  end if;
  if exists (select 1 from public.as_contas where id = v_c.conta_id and suspensa_em is not null) then
    return null;
  end if;
  select nome into v_nome from public.as_oauth_clientes where id = p_cliente_id;
  insert into public.as_credenciais (conta_id, tipo, nome, prefixo, valor_hash, oauth_cliente_id)
  values (v_c.conta_id, 'mcp', v_nome, p_token_prefixo, p_token_hash, p_cliente_id)
  returning id into v_cred;
  update public.as_oauth_codigos set usado_em = now(), credencial_id = v_cred where codigo_hash = p_codigo_hash;
  return v_c.conta_id;
end;
$$;

revoke execute on function
  public.as_fn_cria_codigo_oauth(text, uuid, uuid, text, text, integer),
  public.as_fn_troca_codigo_oauth(text, uuid, text, text, text, text)
from public, anon, authenticated;

grant execute on function
  public.as_fn_cria_codigo_oauth(text, uuid, uuid, text, text, integer),
  public.as_fn_troca_codigo_oauth(text, uuid, text, text, text, text)
to service_role;
