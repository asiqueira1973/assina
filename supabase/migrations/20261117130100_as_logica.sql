-- Assina — lógica que vive no banco (spec.md, seção 7.5).
-- Toda função: search_path vazio (nomes qualificados), SECURITY INVOKER, sem EXECUTE para
-- anon/authenticated; só a service role chama (seção 6.5).

-- ---------------------------------------------------------------------------------------------
-- as_tg_atualizado_em: grava now() em atualizado_em a cada UPDATE (as_contas, as_envelopes).
-- ---------------------------------------------------------------------------------------------
create function public.as_fn_atualizado_em() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

create trigger as_tg_atualizado_em before update on public.as_contas
  for each row execute function public.as_fn_atualizado_em();
create trigger as_tg_atualizado_em before update on public.as_envelopes
  for each row execute function public.as_fn_atualizado_em();

-- ---------------------------------------------------------------------------------------------
-- as_fn_evento_canonico: texto canônico de um evento da trilha (regra 11.6, formato em linhas,
-- divergência 1 do plano 8.1). Campos na ordem fixa, unidos por \n, nulos como texto vazio,
-- ocorrido_em em UTC com microssegundos. dados entra como dados::text do próprio Postgres, para
-- o espelho em TypeScript não precisar reproduzir a ordem de chaves do jsonb.
-- Recebe: as colunas do evento. Devolve: o texto que entra no hash.
-- ---------------------------------------------------------------------------------------------
create function public.as_fn_evento_canonico(
  p_envelope_id uuid, p_seq integer, p_tipo public.as_tipo_evento, p_ator public.as_ator,
  p_signatario_id uuid, p_ip inet, p_user_agent text, p_dados jsonb, p_ocorrido_em timestamptz
) returns text
language sql stable set search_path = '' as $$
  select concat_ws(
    e'\n',
    p_envelope_id::text,
    p_seq::text,
    p_tipo::text,
    p_ator::text,
    coalesce(p_signatario_id::text, ''),
    coalesce(pg_catalog.host(p_ip), ''),
    coalesce(p_user_agent, ''),
    p_dados::text,
    to_char(p_ocorrido_em at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
  );
$$;

-- ---------------------------------------------------------------------------------------------
-- as_fn_registra_evento: ÚNICA forma de inserir na trilha (princípio 1, regra 11.6).
-- Trava a trilha do envelope (advisory lock da transação), lê o último seq e hash, calcula
-- hash = sha256(hash_anterior || \n || canônico) e insere. ocorrido_em = clock_timestamp(), não
-- now(), para eventos da mesma transação terem horas distintas (divergência 3 do plano 8.1).
-- Recebe: envelope, tipo, ator, signatário (opcional), IP, user agent e dados.
-- Devolve: a linha inserida.
-- ---------------------------------------------------------------------------------------------
create function public.as_fn_registra_evento(
  p_envelope_id uuid,
  p_tipo public.as_tipo_evento,
  p_ator public.as_ator,
  p_signatario_id uuid default null,
  p_ip inet default null,
  p_user_agent text default null,
  p_dados jsonb default '{}'
) returns public.as_eventos
language plpgsql set search_path = '' as $$
declare
  v_seq integer;
  v_anterior text;
  v_quando timestamptz := clock_timestamp();
  v_ua text := left(p_user_agent, 500);
  v_dados jsonb := coalesce(p_dados, '{}'::jsonb);
  v_linha public.as_eventos;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_envelope_id::text, 0));

  select e.seq, e.hash into v_seq, v_anterior
    from public.as_eventos e
   where e.envelope_id = p_envelope_id
   order by e.seq desc
   limit 1;

  v_seq := coalesce(v_seq, 0) + 1;
  v_anterior := coalesce(v_anterior, repeat('0', 64));

  insert into public.as_eventos (envelope_id, seq, tipo, ator, signatario_id, ip, user_agent, dados, ocorrido_em, hash_anterior, hash)
  values (
    p_envelope_id, v_seq, p_tipo, p_ator, p_signatario_id, p_ip, v_ua, v_dados, v_quando, v_anterior,
    encode(extensions.digest(
      v_anterior || e'\n' || public.as_fn_evento_canonico(p_envelope_id, v_seq, p_tipo, p_ator, p_signatario_id, p_ip, v_ua, v_dados, v_quando),
      'sha256'), 'hex')
  )
  returning * into v_linha;

  return v_linha;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- as_fn_verifica_trilha: recalcula a cadeia de um envelope (regra 11.6).
-- Recebe: envelope. Devolve: o primeiro seq quebrado (hash, encadeamento ou buraco na
-- sequência) ou null se a trilha está íntegra.
-- ---------------------------------------------------------------------------------------------
create function public.as_fn_verifica_trilha(p_envelope_id uuid) returns integer
language plpgsql stable set search_path = '' as $$
declare
  v_ev public.as_eventos;
  v_esperado_seq integer := 1;
  v_anterior text := repeat('0', 64);
begin
  for v_ev in
    select * from public.as_eventos where envelope_id = p_envelope_id order by seq
  loop
    if v_ev.seq <> v_esperado_seq
       or v_ev.hash_anterior <> v_anterior
       or v_ev.hash <> encode(extensions.digest(
            v_anterior || e'\n' || public.as_fn_evento_canonico(v_ev.envelope_id, v_ev.seq, v_ev.tipo, v_ev.ator,
              v_ev.signatario_id, v_ev.ip, v_ev.user_agent, v_ev.dados, v_ev.ocorrido_em),
            'sha256'), 'hex')
    then
      return v_ev.seq;
    end if;
    v_anterior := v_ev.hash;
    v_esperado_seq := v_esperado_seq + 1;
  end loop;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- as_tg_eventos_imutaveis: a trilha não se altera (princípio 1). UPDATE sempre recusado;
-- DELETE só quando vem em cascata da exclusão do envelope ou da conta (pg_trigger_depth > 1).
-- ---------------------------------------------------------------------------------------------
create function public.as_fn_eventos_imutaveis() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' or pg_catalog.pg_trigger_depth() <= 1 then
    raise exception 'trilha_imutavel';
  end if;
  return old;
end;
$$;

create trigger as_tg_eventos_imutaveis before update or delete on public.as_eventos
  for each row execute function public.as_fn_eventos_imutaveis();

-- ---------------------------------------------------------------------------------------------
-- as_tg_envelope_congelado: princípio 2 e máquina de estado (seção 12).
-- 1) Só as transições da seção 12 são aceitas, venham de onde vierem ('status_mudou').
-- 2) Fora de rascunho, título, mensagem, ordem, prazo e o arquivo não mudam ('envelope_congelado').
--    hash_original só pode ser preenchido uma vez. Exceção: a faxina da regra 11.14 pode limpar
--    arquivo_original_path ao preencher arquivos_expurgados_em, em envelope encerrado sem
--    conclusão.
-- ---------------------------------------------------------------------------------------------
create function public.as_fn_envelope_congelado() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status is distinct from old.status and not (
       (old.status = 'rascunho' and new.status = 'enviado')
    or (old.status = 'enviado' and new.status in ('finalizando', 'recusado', 'cancelado', 'expirado'))
    or (old.status = 'finalizando' and new.status = 'concluido')
  ) then
    raise exception 'status_mudou';
  end if;

  if old.status <> 'rascunho' then
    if new.titulo is distinct from old.titulo
       or new.mensagem is distinct from old.mensagem
       or new.em_ordem is distinct from old.em_ordem
       or new.prazo_dias is distinct from old.prazo_dias
       or new.nome_arquivo is distinct from old.nome_arquivo
       or new.tamanho_bytes is distinct from old.tamanho_bytes
       or new.paginas is distinct from old.paginas
       or new.dimensoes_paginas is distinct from old.dimensoes_paginas
       or new.conta_id is distinct from old.conta_id
       or new.codigo_verificacao is distinct from old.codigo_verificacao
       or (old.hash_original is not null and new.hash_original is distinct from old.hash_original)
    then
      raise exception 'envelope_congelado';
    end if;
    -- O caminho do original só pode sumir pelo expurgo (11.14), nunca trocar por outro.
    if new.arquivo_original_path is distinct from old.arquivo_original_path
       and not (
         new.arquivo_original_path is null
         and new.arquivos_expurgados_em is not null
         and new.status in ('recusado', 'cancelado', 'expirado')
       )
    then
      raise exception 'envelope_congelado';
    end if;
  end if;
  return new;
end;
$$;

create trigger as_tg_envelope_congelado before update on public.as_envelopes
  for each row execute function public.as_fn_envelope_congelado();

-- ---------------------------------------------------------------------------------------------
-- as_tg_envelope_nasce_rascunho: todo envelope nasce em rascunho, sem hash e sem arquivo final
-- (seção 12). Impede um INSERT que pule a máquina de estado e a trilha (achado do verifier, 8.1).
-- as_tg_envelope_exclusao: envelope em enviado ou finalizando não se exclui (seção 7.4: primeiro
-- cancela); exceção para a cascata da exclusão da conta (pg_trigger_depth > 1).
-- ---------------------------------------------------------------------------------------------
create function public.as_fn_envelope_nasce_rascunho() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status <> 'rascunho' or new.hash_original is not null or new.hash_final is not null
     or new.arquivo_final_path is not null or new.enviado_em is not null or new.concluido_em is not null
  then
    raise exception 'status_mudou';
  end if;
  return new;
end;
$$;

create trigger as_tg_envelope_nasce_rascunho before insert on public.as_envelopes
  for each row execute function public.as_fn_envelope_nasce_rascunho();

create function public.as_fn_envelope_exclusao() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.status in ('enviado', 'finalizando') and pg_catalog.pg_trigger_depth() <= 1 then
    raise exception 'envelope_em_andamento';
  end if;
  return old;
end;
$$;

create trigger as_tg_envelope_exclusao before delete on public.as_envelopes
  for each row execute function public.as_fn_envelope_exclusao();

-- ---------------------------------------------------------------------------------------------
-- as_tg_filhos_congelados: com o envelope fora de rascunho, destinatários e campos não entram,
-- não saem e não mudam o que foi enviado (princípio 2). Continuam mudando os campos de
-- andamento: status, código, assinatura, token (link novo, 8.7) e valor do campo.
-- DELETE em cascata (exclusão do envelope ou da conta) passa: pg_trigger_depth > 1.
-- ---------------------------------------------------------------------------------------------
create function public.as_fn_filhos_congelados() returns trigger
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

create trigger as_tg_filhos_congelados before insert or update or delete on public.as_signatarios
  for each row execute function public.as_fn_filhos_congelados();
create trigger as_tg_filhos_congelados before insert or update or delete on public.as_campos
  for each row execute function public.as_fn_filhos_congelados();

-- ---------------------------------------------------------------------------------------------
-- as_tg_valida_campo: o campo cai numa página que existe e pertence a um assinante do mesmo
-- envelope (7.5, regra 11.3). Sem arquivo validado (paginas nulo) não há campo.
-- ---------------------------------------------------------------------------------------------
create function public.as_fn_valida_campo() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_paginas smallint;
  v_ok boolean;
begin
  select paginas into v_paginas from public.as_envelopes where id = new.envelope_id;
  if v_paginas is null or new.pagina > v_paginas then
    raise exception 'campo_invalido';
  end if;
  select exists (
    select 1 from public.as_signatarios s
     where s.id = new.signatario_id and s.envelope_id = new.envelope_id and s.papel = 'assinar'
  ) into v_ok;
  if not v_ok then
    raise exception 'campo_invalido';
  end if;
  return new;
end;
$$;

create trigger as_tg_valida_campo before insert or update on public.as_campos
  for each row execute function public.as_fn_valida_campo();

-- ---------------------------------------------------------------------------------------------
-- as_fn_transicao_envelope: muda o status só a partir do status esperado (seção 12). É a trava
-- contra duas transições simultâneas: o primeiro a gravar vence.
-- Recebe: envelope, status esperado, status novo. Devolve: true se mudou.
-- ---------------------------------------------------------------------------------------------
create function public.as_fn_transicao_envelope(
  p_envelope_id uuid, p_de public.as_status_envelope, p_para public.as_status_envelope
) returns boolean
language plpgsql set search_path = '' as $$
begin
  update public.as_envelopes set status = p_para where id = p_envelope_id and status = p_de;
  return found;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- as_fn_entra_conta: login do remetente (seção 6.1, passos 4 e 5; divergência 2 do plano 8.1).
-- Conta nova nasce junto com a chave de API (regra 11.8), na mesma transação. Conta existente:
-- atualiza só o e-mail (o nome é editável e não é sobrescrito); suspensa não é tocada.
-- Recebe: sub e e-mail do Google, nome, e a chave de API já gerada pelo servidor (hash, prefixo,
-- valor cifrado). Devolve: id da conta, se é nova e se está suspensa.
-- ---------------------------------------------------------------------------------------------
create function public.as_fn_entra_conta(
  p_google_sub text, p_email text, p_nome text,
  p_chave_hash text, p_chave_prefixo text, p_chave_cifrada text
) returns table (conta_id uuid, nova boolean, suspensa boolean)
language plpgsql set search_path = '' as $$
declare
  v_conta public.as_contas;
begin
  select * into v_conta from public.as_contas c where c.google_sub = p_google_sub;

  if not found then
    insert into public.as_contas (google_sub, email, nome)
    values (p_google_sub, lower(p_email), left(p_nome, 100))
    on conflict (google_sub) do nothing
    returning * into v_conta;

    if v_conta.id is not null then
      insert into public.as_credenciais (conta_id, tipo, nome, prefixo, valor_hash, valor_cifrado)
      values (v_conta.id, 'api', 'Chave de API', p_chave_prefixo, p_chave_hash, p_chave_cifrada);
      return query select v_conta.id, true, false;
      return;
    end if;
    -- Corrida: outro login criou a conta entre o select e o insert. Segue como existente.
    select * into v_conta from public.as_contas c where c.google_sub = p_google_sub;
  end if;

  if v_conta.suspensa_em is not null then
    return query select v_conta.id, false, true;
    return;
  end if;

  if v_conta.email <> lower(p_email) then
    update public.as_contas set email = lower(p_email) where id = v_conta.id;
  end if;
  return query select v_conta.id, false, false;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Privilégios (seção 6.5): nenhuma função é chamável por anon/authenticated (pega pelo advisor
-- "função exposta como RPC"). Só a service role.
-- ---------------------------------------------------------------------------------------------
revoke execute on function
  public.as_fn_atualizado_em(),
  public.as_fn_evento_canonico(uuid, integer, public.as_tipo_evento, public.as_ator, uuid, inet, text, jsonb, timestamptz),
  public.as_fn_registra_evento(uuid, public.as_tipo_evento, public.as_ator, uuid, inet, text, jsonb),
  public.as_fn_verifica_trilha(uuid),
  public.as_fn_eventos_imutaveis(),
  public.as_fn_envelope_congelado(),
  public.as_fn_envelope_nasce_rascunho(),
  public.as_fn_envelope_exclusao(),
  public.as_fn_filhos_congelados(),
  public.as_fn_valida_campo(),
  public.as_fn_transicao_envelope(uuid, public.as_status_envelope, public.as_status_envelope),
  public.as_fn_entra_conta(text, text, text, text, text, text)
from public, anon, authenticated;

grant execute on function
  public.as_fn_evento_canonico(uuid, integer, public.as_tipo_evento, public.as_ator, uuid, inet, text, jsonb, timestamptz),
  public.as_fn_registra_evento(uuid, public.as_tipo_evento, public.as_ator, uuid, inet, text, jsonb),
  public.as_fn_verifica_trilha(uuid),
  public.as_fn_transicao_envelope(uuid, public.as_status_envelope, public.as_status_envelope),
  public.as_fn_entra_conta(text, text, text, text, text, text)
to service_role;
