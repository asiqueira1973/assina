-- Assina — épico 8.5: assinatura pelo signatário (spec.md, seções 6.2, 8.5, 12 e regras 11.4 e 11.7).
-- Os contadores do código e as mudanças de status vivem aqui, com a linha travada, para não haver
-- corrida entre dois pedidos do mesmo signatário. Os números (validade, intervalo, máximos) vêm
-- do servidor (src/lib/limits.ts), num lugar só.

-- ---------------------------------------------------------------------------------------------
-- as_fn_novo_codigo: guarda um código novo de acesso (regra 11.4). Recusa se o signatário não
-- está aguardando num envelope enviado ('indisponivel'), se o último saiu há menos que o
-- intervalo ('aguarde') ou se já saíram os da hora ('limite_hora'). O código novo invalida o
-- anterior e zera as tentativas. O evento codigo_enviado é do servidor, depois que o e-mail sai.
-- Recebe: signatário, sha256(id + código), validade e intervalo em segundos, máximo por hora.
-- Devolve: 'ok' | 'aguarde' | 'limite_hora' | 'indisponivel' | 'prazo_encerrado'.
-- ---------------------------------------------------------------------------------------------
create function public.as_fn_novo_codigo(
  p_signatario_id uuid, p_codigo_hash text, p_validade_s integer, p_intervalo_s integer, p_max_hora integer
) returns text
language plpgsql set search_path = '' as $$
declare
  v_s public.as_signatarios;
  v_status public.as_status_envelope;
  v_enviados smallint;
  v_desde timestamptz;
  v_prazo timestamptz;
begin
  select * into v_s from public.as_signatarios where id = p_signatario_id for update;
  select status, prazo_em into v_status, v_prazo from public.as_envelopes where id = v_s.envelope_id;
  if v_s.id is null or v_s.status <> 'aguardando' or v_status <> 'enviado' then
    return 'indisponivel';
  end if;
  -- Regra 11.7: vale o prazo_em; a faxina só muda o status depois.
  if v_prazo <= now() then
    return 'prazo_encerrado';
  end if;

  -- O último código saiu em (expira_em − validade).
  if v_s.codigo_expira_em is not null
     and v_s.codigo_expira_em - make_interval(secs => p_validade_s) > now() - make_interval(secs => p_intervalo_s) then
    return 'aguarde';
  end if;

  v_enviados := v_s.codigos_enviados_hora;
  v_desde := v_s.janela_codigos_desde;
  if v_desde is null or v_desde < now() - interval '1 hour' then
    v_enviados := 0;
    v_desde := now();
  end if;
  if v_enviados >= p_max_hora then
    return 'limite_hora';
  end if;

  update public.as_signatarios
     set codigo_hash = p_codigo_hash,
         codigo_expira_em = now() + make_interval(secs => p_validade_s),
         codigo_tentativas = 0,
         codigos_enviados_hora = v_enviados + 1,
         janela_codigos_desde = v_desde
   where id = p_signatario_id;
  return 'ok';
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- as_fn_valida_codigo: confere o código digitado (regra 11.4). Código de uso único: o acerto o
-- apaga. Cada erro conta; no último, o código é invalidado ('bloqueado'). Registra
-- codigo_validado ou codigo_recusado ({"tentativa": n}) na trilha.
-- Recebe: signatário, sha256(id + código digitado), máximo de tentativas, IP e user agent.
-- Devolve: resultado ('ok' | 'errado' | 'bloqueado' | 'expirado' | 'sem_codigo' | 'indisponivel' |
-- 'prazo_encerrado')
-- e quantas tentativas restam.
-- ---------------------------------------------------------------------------------------------
create function public.as_fn_valida_codigo(
  p_signatario_id uuid, p_codigo_hash text, p_max_tentativas integer, p_ip inet default null, p_user_agent text default null
) returns table (resultado text, restantes integer)
language plpgsql set search_path = '' as $$
declare
  v_s public.as_signatarios;
  v_status public.as_status_envelope;
  v_tentativas integer;
  v_prazo timestamptz;
begin
  select * into v_s from public.as_signatarios where id = p_signatario_id for update;
  select status, prazo_em into v_status, v_prazo from public.as_envelopes where id = v_s.envelope_id;
  if v_s.id is null or v_s.status <> 'aguardando' or v_status <> 'enviado' then
    return query select 'indisponivel'::text, 0;
    return;
  end if;
  if v_prazo <= now() then
    return query select 'prazo_encerrado'::text, 0;
    return;
  end if;
  if v_s.codigo_hash is null then
    return query select case when v_s.codigo_tentativas >= p_max_tentativas then 'bloqueado' else 'sem_codigo' end::text, 0;
    return;
  end if;
  if v_s.codigo_expira_em < now() then
    return query select 'expirado'::text, 0;
    return;
  end if;

  -- Compara hashes sha256, não o código: o tempo da comparação não revela nada do código
  -- (a regra 11.4 pede tempo constante para isso).
  if v_s.codigo_hash = p_codigo_hash then
    update public.as_signatarios set codigo_hash = null, codigo_tentativas = 0 where id = p_signatario_id;
    perform public.as_fn_registra_evento(v_s.envelope_id, 'codigo_validado', 'signatario', p_signatario_id, p_ip, p_user_agent, '{}');
    return query select 'ok'::text, 0;
    return;
  end if;

  v_tentativas := v_s.codigo_tentativas + 1;
  update public.as_signatarios
     set codigo_tentativas = v_tentativas,
         codigo_hash = case when v_tentativas >= p_max_tentativas then null else codigo_hash end
   where id = p_signatario_id;
  perform public.as_fn_registra_evento(v_s.envelope_id, 'codigo_recusado', 'signatario', p_signatario_id, p_ip, p_user_agent,
    jsonb_build_object('tentativa', v_tentativas));
  if v_tentativas >= p_max_tentativas then
    return query select 'bloqueado'::text, 0;
  else
    return query select 'errado'::text, p_max_tentativas - v_tentativas;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- as_fn_assina: grava a assinatura numa transação (critério 8.5, princípio 1).
-- Confere: o link atual (token_hash, 'link_invalido'), o signatário aguardando e o envelope
-- enviado ('status_mudou'), o prazo ('prazo_encerrado', regra 11.7 — pelo prazo_em, não pelo
-- status), a assinatura ('assinatura_ausente'), a rubrica quando há campo de rubrica, o CPF
-- exigido (formato; os dígitos verificadores são conferidos no servidor) e os campos
-- (obrigatórios preenchidos, só do próprio signatário: 'campo_obrigatorio' / 'campo_invalido').
-- Grava: os valores (data em Brasília e nome feitos aqui; texto e caixa da lista), as colunas da
-- assinatura, IP, user agent e o status 'assinou'; os eventos 'consentiu' e 'assinou'
-- ({campos, metodo}); o aviso 'assinou_remetente'. Depois: se todos assinaram, envelope vai a
-- 'finalizando'; se não, em ordem, o próximo passa a 'aguardando' com o convite na fila.
-- Recebe: signatário, token_hash do link, dados da assinatura, campos [{id, valor}],
-- versão do consentimento, IP e user agent. Devolve: o status do envelope e o próximo (se houver).
-- ---------------------------------------------------------------------------------------------
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
  p_user_agent text default null
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

-- ---------------------------------------------------------------------------------------------
-- as_fn_recusa: o signatário recusa (critério 8.5, seção 12: enviado → recusado).
-- Confere o link atual, o status e o prazo, como em as_fn_assina; motivo de 1 a 500
-- caracteres ('motivo_invalido'). Grava o signatário em 'recusou' com o motivo, IP e user
-- agent, o envelope encerrado, o evento 'recusou', os avisos ao remetente e aos outros
-- assinantes já convidados, e a entrega de webhook envelope.recusado na fila (se a conta tiver
-- webhook; o envio HTTP é do épico 8.9).
-- Recebe: signatário, token_hash, motivo, IP e user agent. Devolve: 'recusado'.
-- ---------------------------------------------------------------------------------------------
create function public.as_fn_recusa(
  p_signatario_id uuid, p_token_hash text, p_motivo text, p_ip inet default null, p_user_agent text default null
) returns text
language plpgsql set search_path = '' as $$
declare
  v_s public.as_signatarios;
  v_e public.as_envelopes;
  v_motivo text := trim(coalesce(p_motivo, ''));
  v_webhook text;
begin
  select * into v_s from public.as_signatarios where id = p_signatario_id;
  if v_s.id is null then
    raise exception 'link_invalido';
  end if;
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
  -- 500 = MOTIVO_MAX (src/lib/limits.ts).
  if char_length(v_motivo) not between 1 and 500 then
    raise exception 'motivo_invalido';
  end if;

  if not public.as_fn_transicao_envelope(v_e.id, 'enviado', 'recusado') then
    raise exception 'status_mudou';
  end if;
  update public.as_envelopes set encerrado_em = now() where id = v_e.id;
  update public.as_signatarios
     set status = 'recusou', recusado_em = now(), motivo_recusa = v_motivo,
         ip_assinatura = p_ip, user_agent_assinatura = left(p_user_agent, 500), codigo_hash = null
   where id = p_signatario_id;

  perform public.as_fn_registra_evento(v_e.id, 'recusou', 'signatario', p_signatario_id, p_ip, p_user_agent,
    jsonb_build_object('motivo', v_motivo));

  insert into public.as_notificacoes (conta_id, envelope_id, signatario_id, tipo, chave)
  values (v_e.conta_id, v_e.id, p_signatario_id, 'recusado_remetente', 'recusado_remetente:' || v_e.id)
  on conflict (chave) do nothing;
  insert into public.as_notificacoes (conta_id, envelope_id, signatario_id, tipo, chave)
  select v_e.conta_id, v_e.id, s.id, 'recusado_destinatario', 'recusado_destinatario:' || s.id
    from public.as_signatarios s
   where s.envelope_id = v_e.id and s.id <> p_signatario_id and s.papel = 'assinar' and s.status in ('aguardando', 'assinou')
  on conflict (chave) do nothing;

  select webhook_url into v_webhook from public.as_contas where id = v_e.conta_id;
  if v_webhook is not null then
    insert into public.as_entregas_webhook (conta_id, envelope_id, evento, corpo)
    values (v_e.conta_id, v_e.id, 'envelope.recusado', jsonb_build_object(
      'evento', 'envelope.recusado',
      'envelope', jsonb_build_object('id', v_e.id, 'status', 'recusado', 'titulo', v_e.titulo, 'codigo_verificacao', v_e.codigo_verificacao),
      'ocorrido_em', now()
    ));
  end if;
  return 'recusado';
end;
$$;

revoke execute on function
  public.as_fn_novo_codigo(uuid, text, integer, integer, integer),
  public.as_fn_valida_codigo(uuid, text, integer, inet, text),
  public.as_fn_assina(uuid, text, public.as_metodo_assinatura, text, text, text, text, text, jsonb, text, inet, text),
  public.as_fn_recusa(uuid, text, text, inet, text)
from public, anon, authenticated;
grant execute on function
  public.as_fn_novo_codigo(uuid, text, integer, integer, integer),
  public.as_fn_valida_codigo(uuid, text, integer, inet, text),
  public.as_fn_assina(uuid, text, public.as_metodo_assinatura, text, text, text, text, text, jsonb, text, inet, text),
  public.as_fn_recusa(uuid, text, text, inet, text)
to service_role;
