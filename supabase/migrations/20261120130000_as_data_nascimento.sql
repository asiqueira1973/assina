-- Assina — épico 8.14: data de nascimento do assinante (plans/8.14-data-nascimento.md).
-- Como o CPF (regra 11.9 e seção 7), o remetente decide por assinante se pede a data; quem assina
-- informa na folha da assinatura. A data é real, não futura e de no máximo 120 anos atrás.
-- As três funções abaixo são as mesmas de 20261117130100_as_logica.sql (congelamento),
-- 20261118090000_as_rascunho.sql (destinatários) e 20261118180000_as_assinatura.sql (assinatura),
-- com o campo novo.

alter table public.as_signatarios
  add column exigir_nascimento boolean not null default false,
  add column data_nascimento date,
  add constraint as_signatarios_nascimento_ck check (not exigir_nascimento or papel = 'assinar');

comment on column public.as_signatarios.exigir_nascimento is 'O remetente pede a data de nascimento (só para assinar).';
comment on column public.as_signatarios.data_nascimento is 'Informada pelo próprio signatário ao assinar, se exigida; nula caso contrário.';

-- ---------------------------------------------------------------------------------------------
-- as_fn_substitui_signatarios: igual ao 8.2, agora com exigir_nascimento na lista.
-- Recebe: envelope, conta e a lista em jsonb [{nome, email, papel, exigir_cpf, exigir_nascimento}].
-- ---------------------------------------------------------------------------------------------
create or replace function public.as_fn_substitui_signatarios(p_envelope_id uuid, p_conta_id uuid, p_lista jsonb)
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

    insert into public.as_signatarios (envelope_id, conta_id, papel, ordem, nome, email, exigir_cpf, exigir_nascimento, token_hash)
    values (
      p_envelope_id, p_conta_id, v_papel, v_ordem, trim(v_item ->> 'nome'), v_email,
      coalesce((v_item ->> 'exigir_cpf')::boolean, false) and v_papel = 'assinar',
      coalesce((v_item ->> 'exigir_nascimento')::boolean, false) and v_papel = 'assinar',
      encode(extensions.digest(extensions.gen_random_bytes(32), 'sha256'), 'hex')
    )
    on conflict (envelope_id, email) do update
      set papel = excluded.papel,
          ordem = excluded.ordem,
          nome = excluded.nome,
          exigir_cpf = excluded.exigir_cpf,
          exigir_nascimento = excluded.exigir_nascimento;

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
-- as_tg_filhos_congelados: igual ao 8.0, e exigir_nascimento também não muda depois do envio.
-- ---------------------------------------------------------------------------------------------
create or replace function public.as_fn_filhos_congelados() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_envelope_id uuid;
  v_status public.as_status_envelope;
begin
  v_envelope_id := case when tg_op = 'DELETE' then old.envelope_id else new.envelope_id end;
  select status into v_status from public.as_envelopes where id = v_envelope_id;

  -- Envelope inexistente (cascata em andamento) ou ainda em rascunho: nada a conferir.
  if v_status is null or v_status = 'rascunho' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' then
    if pg_catalog.pg_trigger_depth() > 1 then
      return old;
    end if;
    raise exception 'envelope_congelado';
  end if;

  if tg_op = 'INSERT' then
    raise exception 'envelope_congelado';
  end if;

  if tg_table_name = 'as_signatarios' then
    if new.envelope_id is distinct from old.envelope_id
       or new.conta_id is distinct from old.conta_id
       or new.nome is distinct from old.nome
       or new.email is distinct from old.email
       or new.papel is distinct from old.papel
       or new.ordem is distinct from old.ordem
       or new.exigir_cpf is distinct from old.exigir_cpf
       or new.exigir_nascimento is distinct from old.exigir_nascimento
    then
      raise exception 'envelope_congelado';
    end if;
  else
    if new.envelope_id is distinct from old.envelope_id
       or new.signatario_id is distinct from old.signatario_id
       or new.tipo is distinct from old.tipo
       or new.pagina is distinct from old.pagina
       or new.x is distinct from old.x
       or new.y is distinct from old.y
       or new.largura is distinct from old.largura
       or new.altura is distinct from old.altura
       or new.obrigatorio is distinct from old.obrigatorio
       or new.rotulo is distinct from old.rotulo
    then
      raise exception 'envelope_congelado';
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- as_fn_assina: igual ao 8.5, com p_data_nascimento (último parâmetro, opcional): exigida e
-- ausente, futura ou de mais de 120 anos → 'nascimento_invalido'; grava só se exigida.
-- A assinatura muda (parâmetro novo), então a versão antiga sai.
-- ---------------------------------------------------------------------------------------------
drop function public.as_fn_assina(uuid, text, public.as_metodo_assinatura, text, text, text, text, text, jsonb, text, inet, text);

create function public.as_fn_assina(
  p_signatario_id uuid,
  p_token_hash text,
  p_metodo public.as_metodo_assinatura,
  p_assinatura_texto text,
  p_assinatura_path text,
  p_rubrica_texto text,
  p_rubrica_path text,
  p_cpf text,
  p_campos jsonb,
  p_consentimento text,
  p_ip inet default null,
  p_user_agent text default null,
  p_data_nascimento date default null
) returns table (envelope_status public.as_status_envelope, proximo_id uuid)
language plpgsql set search_path = '' as $$
declare
  v_s public.as_signatarios;
  v_e public.as_envelopes;
  v_campo public.as_campos;
  v_valor text;
  v_n_campos integer;
  v_proximo uuid;
begin
  select * into v_s from public.as_signatarios where id = p_signatario_id;
  if v_s.id is null then
    raise exception 'link_invalido';
  end if;
  -- Trava o envelope antes do signatário: dois últimos assinantes ao mesmo tempo ficam em fila.
  select * into v_e from public.as_envelopes where id = v_s.envelope_id for update;
  select * into v_s from public.as_signatarios where id = p_signatario_id for update;
  if v_s.token_hash <> p_token_hash then
    raise exception 'link_invalido';
  end if;
  if v_s.status <> 'aguardando' or v_e.status <> 'enviado' then
    raise exception 'status_mudou';
  end if;
  if v_e.prazo_em <= now() then
    raise exception 'prazo_encerrado';
  end if;
  if p_consentimento is null or p_consentimento = '' then
    raise exception 'sem_consentimento';
  end if;
  if (p_metodo = 'digitada' and coalesce(trim(p_assinatura_texto), '') = '')
     or (p_metodo = 'desenhada' and p_assinatura_path is null) then
    raise exception 'assinatura_ausente';
  end if;
  if exists (select 1 from public.as_campos where signatario_id = p_signatario_id and tipo = 'rubrica')
     and coalesce(trim(p_rubrica_texto), '') = '' and p_rubrica_path is null then
    raise exception 'assinatura_ausente';
  end if;
  if v_s.exigir_cpf and (p_cpf is null or p_cpf !~ '^[0-9]{11}$') then
    raise exception 'cpf_invalido';
  end if;
  -- Data de nascimento (épico 8.14): real, não futura e de no máximo 120 anos atrás
  -- (NASCIMENTO_IDADE_MAX em src/lib/limits.ts). O dia de hoje vale; amanhã, não.
  if v_s.exigir_nascimento and (
       p_data_nascimento is null
       or p_data_nascimento > (now() at time zone 'America/Sao_Paulo')::date
       or p_data_nascimento < (now() at time zone 'America/Sao_Paulo')::date - interval '120 years'
     ) then
    raise exception 'nascimento_invalido';
  end if;

  -- Só campos do próprio signatário podem vir na lista.
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_campos, '[]'::jsonb)) c
     where not exists (select 1 from public.as_campos f where f.id = (c ->> 'id')::uuid and f.signatario_id = p_signatario_id)
  ) then
    raise exception 'campo_invalido';
  end if;

  v_n_campos := 0;
  for v_campo in select * from public.as_campos where signatario_id = p_signatario_id loop
    v_n_campos := v_n_campos + 1;
    select c ->> 'valor' into v_valor from jsonb_array_elements(coalesce(p_campos, '[]'::jsonb)) c where (c ->> 'id')::uuid = v_campo.id;
    if v_campo.tipo = 'texto' then
      -- 200 = TEXTO_CAMPO_MAX (src/lib/limits.ts); o servidor já recusa acima disso, aqui é a trava final.
      v_valor := nullif(left(trim(coalesce(v_valor, '')), 200), '');
      if v_campo.obrigatorio and v_valor is null then raise exception 'campo_obrigatorio'; end if;
    elsif v_campo.tipo = 'caixa' then
      v_valor := case when v_valor = 'sim' then 'sim' else 'nao' end;
      if v_campo.obrigatorio and v_valor <> 'sim' then raise exception 'campo_obrigatorio'; end if;
    elsif v_campo.tipo = 'data' then
      v_valor := to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM/YYYY');
    elsif v_campo.tipo = 'nome' then
      v_valor := v_s.nome;
    else
      v_valor := null; -- assinatura e rubrica usam as colunas do signatário
    end if;
    update public.as_campos set valor = v_valor where id = v_campo.id;
  end loop;

  update public.as_signatarios
     set status = 'assinou',
         assinado_em = now(),
         metodo_assinatura = p_metodo,
         -- 100 = NOME_MAX (src/lib/limits.ts), trava final.
         assinatura_texto = case when p_metodo = 'digitada' then left(trim(p_assinatura_texto), 100) end,
         assinatura_imagem_path = case when p_metodo = 'desenhada' then p_assinatura_path end,
         rubrica_texto = nullif(left(trim(coalesce(p_rubrica_texto, '')), 100), ''),
         rubrica_imagem_path = p_rubrica_path,
         cpf = case when v_s.exigir_cpf then p_cpf end,
         data_nascimento = case when v_s.exigir_nascimento then p_data_nascimento end,
         consentimento_versao = p_consentimento,
         ip_assinatura = p_ip,
         user_agent_assinatura = left(p_user_agent, 500),
         codigo_hash = null
   where id = p_signatario_id;

  perform public.as_fn_registra_evento(v_e.id, 'consentiu', 'signatario', p_signatario_id, p_ip, p_user_agent,
    jsonb_build_object('versao', p_consentimento));
  perform public.as_fn_registra_evento(v_e.id, 'assinou', 'signatario', p_signatario_id, p_ip, p_user_agent,
    jsonb_build_object('campos', v_n_campos, 'metodo', p_metodo));

  insert into public.as_notificacoes (conta_id, envelope_id, signatario_id, tipo, chave)
  values (v_e.conta_id, v_e.id, p_signatario_id, 'assinou_remetente', 'assinou_remetente:' || p_signatario_id)
  on conflict (chave) do nothing;

  if not exists (select 1 from public.as_signatarios where envelope_id = v_e.id and papel = 'assinar' and status <> 'assinou') then
    if not public.as_fn_transicao_envelope(v_e.id, 'enviado', 'finalizando') then
      raise exception 'status_mudou';
    end if;
    return query select 'finalizando'::public.as_status_envelope, null::uuid;
    return;
  end if;

  if v_e.em_ordem and not exists (select 1 from public.as_signatarios where envelope_id = v_e.id and papel = 'assinar' and status = 'aguardando') then
    select id into v_proximo from public.as_signatarios
     where envelope_id = v_e.id and papel = 'assinar' and status = 'pendente'
     order by ordem limit 1;
    if v_proximo is not null then
      update public.as_signatarios set status = 'aguardando' where id = v_proximo;
      insert into public.as_notificacoes (conta_id, envelope_id, signatario_id, tipo, chave)
      values (v_e.conta_id, v_e.id, v_proximo, 'convite', 'convite:' || v_proximo)
      on conflict (chave) do nothing;
    end if;
  end if;
  return query select 'enviado'::public.as_status_envelope, v_proximo;
end;
$$;

revoke execute on function public.as_fn_assina(uuid, text, public.as_metodo_assinatura, text, text, text, text, text, jsonb, text, inet, text, date) from public, anon, authenticated;
grant execute on function public.as_fn_assina(uuid, text, public.as_metodo_assinatura, text, text, text, text, text, jsonb, text, inet, text, date) to service_role;
