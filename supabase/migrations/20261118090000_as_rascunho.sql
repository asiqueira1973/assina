-- Assina — épico 8.2: rascunho de envelope (spec.md, seções 7.5, 8.2 e regra 11.2).
-- 1) A ordem única dos assinantes vira exclusion constraint DIFERIDA, para reordenar dentro de
--    uma transação sem colidir no meio do caminho.
-- 2) as_fn_cria_rascunho: envelope e evento "criado" nascem juntos (princípio 1).
-- 3) as_fn_substitui_signatarios: troca a lista de destinatários de um rascunho numa transação.
-- 4) as_fn_anexa_arquivo: aponta o rascunho para o arquivo novo, já validado, numa transação
--    (achado do verifier no 8.2: a troca não podia ficar fora da trava do envelope).

create extension if not exists btree_gist with schema extensions;

drop index public.as_signatarios_ordem_uk;
alter table public.as_signatarios
  add constraint as_signatarios_ordem_ex
  exclude using gist (envelope_id extensions.gist_uuid_ops with =, ordem extensions.gist_int2_ops with =)
  where (papel = 'assinar')
  deferrable initially deferred;

-- ---------------------------------------------------------------------------------------------
-- as_fn_cria_rascunho: cria o envelope em rascunho e registra o evento "criado" na mesma
-- transação (princípio 1, critério 8.2).
-- Recebe: conta, título, origem, código de verificação (gerado no servidor, regra 11.11), ator,
-- IP e user agent de quem criou. Devolve: o envelope criado.
-- ---------------------------------------------------------------------------------------------
create function public.as_fn_cria_rascunho(
  p_conta_id uuid,
  p_titulo text,
  p_origem public.as_origem,
  p_codigo_verificacao text,
  p_ator public.as_ator,
  p_ip inet default null,
  p_user_agent text default null
) returns public.as_envelopes
language plpgsql set search_path = '' as $$
declare
  v_envelope public.as_envelopes;
begin
  insert into public.as_envelopes (conta_id, titulo, origem, codigo_verificacao)
  values (p_conta_id, p_titulo, p_origem, p_codigo_verificacao)
  returning * into v_envelope;

  perform public.as_fn_registra_evento(v_envelope.id, 'criado', p_ator, null, p_ip, p_user_agent,
    jsonb_build_object('origem', p_origem));
  return v_envelope;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- as_fn_substitui_signatarios: troca a lista de destinatários de um rascunho (regra 11.2).
-- - O envelope precisa ser da conta e estar em rascunho ('envelope_congelado' se não estiver;
--   'nao_encontrado' se não for da conta).
-- - Quem continua (mesmo e-mail) mantém o id, e com ele os campos já posicionados.
-- - Quem saiu é apagado, e os campos dele vão em cascata.
-- - A ordem dos assinantes é a posição na lista (1..n, sem buraco). Cópias ficam com ordem 1.
-- - Limites: até 10 assinantes ('assinantes_demais') e 5 cópias ('copias_demais'); e-mail repetido
--   na lista é recusado ('email_repetido').
-- - Quem entra recebe um token_hash provisório; o link real nasce no envio (8.4).
-- Recebe: envelope, conta e a lista em jsonb [{nome, email, papel, exigir_cpf}].
-- Devolve: os destinatários como ficaram, na ordem da lista.
-- ---------------------------------------------------------------------------------------------
create function public.as_fn_substitui_signatarios(p_envelope_id uuid, p_conta_id uuid, p_lista jsonb)
returns setof public.as_signatarios
language plpgsql set search_path = '' as $$
declare
  v_status public.as_status_envelope;
  v_item jsonb;
  v_posicao integer := 0;
  v_ordem smallint;
  v_papel public.as_papel;
  v_email text;
  v_emails text[] := '{}';
  v_assinantes integer := 0;
  v_copias integer := 0;
begin
  select status into v_status from public.as_envelopes where id = p_envelope_id and conta_id = p_conta_id for update;
  if v_status is null then
    raise exception 'nao_encontrado';
  end if;
  if v_status <> 'rascunho' then
    raise exception 'envelope_congelado';
  end if;

  for v_item in select value from jsonb_array_elements(coalesce(p_lista, '[]'::jsonb)) loop
    v_papel := coalesce(v_item ->> 'papel', 'assinar')::public.as_papel;
    if v_papel = 'assinar' then v_assinantes := v_assinantes + 1; else v_copias := v_copias + 1; end if;
    v_emails := v_emails || lower(trim(v_item ->> 'email'));
  end loop;
  -- E-mail repetido na lista: sem esta checagem o ON CONFLICT abaixo juntaria as duas pessoas numa só.
  if cardinality(v_emails) <> (select count(distinct e) from unnest(v_emails) e) then
    raise exception 'email_repetido';
  end if;
  -- Limites da regra 11.2 (os mesmos de src/lib/limits.ts: MAX_ASSINANTES e MAX_COPIAS).
  if v_assinantes > 10 then raise exception 'assinantes_demais'; end if;
  if v_copias > 5 then raise exception 'copias_demais'; end if;

  -- Quem saiu da lista: apagado (campos em cascata).
  delete from public.as_signatarios
   where envelope_id = p_envelope_id and not (email = any (v_emails));

  v_assinantes := 0;
  for v_item in select value from jsonb_array_elements(coalesce(p_lista, '[]'::jsonb)) loop
    v_posicao := v_posicao + 1;
    v_papel := coalesce(v_item ->> 'papel', 'assinar')::public.as_papel;
    v_email := lower(trim(v_item ->> 'email'));
    if v_papel = 'assinar' then
      v_assinantes := v_assinantes + 1;
      v_ordem := v_assinantes;
    else
      v_ordem := 1;
    end if;

    insert into public.as_signatarios (envelope_id, conta_id, papel, ordem, nome, email, exigir_cpf, token_hash)
    values (
      p_envelope_id, p_conta_id, v_papel, v_ordem, trim(v_item ->> 'nome'), v_email,
      coalesce((v_item ->> 'exigir_cpf')::boolean, false) and v_papel = 'assinar',
      encode(extensions.digest(extensions.gen_random_bytes(32), 'sha256'), 'hex')
    )
    on conflict (envelope_id, email) do update
      set papel = excluded.papel,
          ordem = excluded.ordem,
          nome = excluded.nome,
          exigir_cpf = excluded.exigir_cpf;

    -- Quem deixou de assinar e virou cópia perde os campos (campo é só de assinante, 7.5).
    if v_papel = 'copia' then
      delete from public.as_campos c
       using public.as_signatarios s
       where s.envelope_id = p_envelope_id and s.email = v_email and c.signatario_id = s.id;
    end if;
  end loop;

  return query
    select s.* from public.as_signatarios s
     where s.envelope_id = p_envelope_id
     order by array_position(v_emails, s.email);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- as_fn_anexa_arquivo: troca o arquivo do rascunho de forma atômica (épico 8.2, princípio 2).
-- O servidor já validou os bytes (regra 11.1) e os gravou num caminho novo, por versão. Aqui,
-- com o envelope travado: confere que é da conta e ainda está em rascunho, apaga os campos se
-- havia arquivo antes, e grava caminho, nome, tamanho, páginas e dimensões. Um envio concorrente
-- (8.4) espera a trava e vê o arquivo novo inteiro, ou já mudou o status e esta função recusa.
-- Recebe: envelope, conta, caminho novo e os dados do arquivo.
-- Devolve: o caminho anterior (para o servidor apagar) e se havia campos removidos.
-- ---------------------------------------------------------------------------------------------
create function public.as_fn_anexa_arquivo(
  p_envelope_id uuid, p_conta_id uuid, p_caminho text, p_nome text, p_tamanho integer,
  p_paginas smallint, p_dimensoes jsonb
) returns table (caminho_anterior text, campos_removidos boolean)
language plpgsql set search_path = '' as $$
declare
  v_envelope public.as_envelopes;
  v_removidos integer;
begin
  select * into v_envelope from public.as_envelopes where id = p_envelope_id and conta_id = p_conta_id for update;
  if not found then
    raise exception 'nao_encontrado';
  end if;
  if v_envelope.status <> 'rascunho' then
    raise exception 'envelope_congelado';
  end if;

  delete from public.as_campos where envelope_id = p_envelope_id;
  get diagnostics v_removidos = row_count;

  update public.as_envelopes
     set arquivo_original_path = p_caminho,
         nome_arquivo = left(p_nome, 200),
         tamanho_bytes = p_tamanho,
         paginas = p_paginas,
         dimensoes_paginas = p_dimensoes
   where id = p_envelope_id;

  return query select v_envelope.arquivo_original_path, v_removidos > 0;
end;
$$;

revoke execute on function
  public.as_fn_anexa_arquivo(uuid, uuid, text, text, integer, smallint, jsonb),
  public.as_fn_cria_rascunho(uuid, text, public.as_origem, text, public.as_ator, inet, text),
  public.as_fn_substitui_signatarios(uuid, uuid, jsonb)
from public, anon, authenticated;

grant execute on function
  public.as_fn_anexa_arquivo(uuid, uuid, text, text, integer, smallint, jsonb),
  public.as_fn_cria_rascunho(uuid, text, public.as_origem, text, public.as_ator, inet, text),
  public.as_fn_substitui_signatarios(uuid, uuid, jsonb)
to service_role;
