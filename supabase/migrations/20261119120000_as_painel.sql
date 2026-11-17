-- Assina — épico 8.7: painel, envelopes e detalhe (spec.md, seções 7.4, 8.7, 12, 14 e regras 11.5
-- e 11.17). Lista, lembrete manual, link copiado, cancelamento e exclusão. Toda função recebe a
-- conta e filtra por ela (seção 6.5: o service role ignora a RLS).

-- ---------------------------------------------------------------------------------------------
-- as_fn_lista_envelopes: a lista do painel (critério 8.7). Filtros da seção 15: 'todos',
-- 'aguardando' (enviado, finalizando), 'concluidos', 'rascunhos', 'encerrados' (recusado,
-- cancelado, expirado). Busca por título ou e-mail de destinatário, sem diferenciar maiúsculas;
-- '%' e '_' digitados valem como texto. Mais recentes primeiro.
-- Recebe: conta, filtro, busca (ou nulo), limite e deslocamento. Devolve: as linhas da página
-- com "n de m assinaram" e o total de linhas do filtro (para paginar).
-- ---------------------------------------------------------------------------------------------
create function public.as_fn_lista_envelopes(
  p_conta_id uuid, p_filtro text, p_busca text, p_limite integer, p_deslocamento integer
) returns table (
  id uuid, titulo text, status public.as_status_envelope, criado_em timestamptz, enviado_em timestamptz,
  concluido_em timestamptz, encerrado_em timestamptz, assinaram integer, assinantes integer, total bigint
)
language sql stable set search_path = '' as $$
  with filtrados as (
    select e.*
      from public.as_envelopes e
     where e.conta_id = p_conta_id
       and case p_filtro
             when 'aguardando' then e.status in ('enviado', 'finalizando')
             when 'concluidos' then e.status = 'concluido'
             when 'rascunhos' then e.status = 'rascunho'
             when 'encerrados' then e.status in ('recusado', 'cancelado', 'expirado')
             else true
           end
       and (
         coalesce(p_busca, '') = ''
         or e.titulo ilike '%' || replace(replace(replace(p_busca, '\', '\\'), '%', '\%'), '_', '\_') || '%'
         or exists (
           select 1 from public.as_signatarios s
            where s.envelope_id = e.id
              and s.email ilike '%' || replace(replace(replace(p_busca, '\', '\\'), '%', '\%'), '_', '\_') || '%'
         )
       )
  )
  select f.id, f.titulo, f.status, f.criado_em, f.enviado_em, f.concluido_em, f.encerrado_em,
         (select count(*)::integer from public.as_signatarios s where s.envelope_id = f.id and s.papel = 'assinar' and s.status = 'assinou'),
         (select count(*)::integer from public.as_signatarios s where s.envelope_id = f.id and s.papel = 'assinar'),
         count(*) over ()
    from filtrados f
   order by f.criado_em desc, f.id
   limit greatest(p_limite, 0) offset greatest(p_deslocamento, 0);
$$;

-- Signatário aguardando num envelope enviado da conta, dentro do prazo, travado (lembrete e link
-- copiado). Lança: 'nao_encontrado' (não é da conta), 'status_mudou' (não está aguardando a vez)
-- ou 'prazo_encerrado' (regra 11.7: vale o prazo_em, antes mesmo de a faxina mudar o status).
create function public.as_fn_signatario_ativo(p_conta_id uuid, p_envelope_id uuid, p_signatario_id uuid)
returns public.as_signatarios
language plpgsql set search_path = '' as $$
declare
  v_s public.as_signatarios;
  v_status public.as_status_envelope;
  v_prazo timestamptz;
begin
  select status, prazo_em into v_status, v_prazo from public.as_envelopes where id = p_envelope_id and conta_id = p_conta_id for update;
  select * into v_s from public.as_signatarios
   where id = p_signatario_id and envelope_id = p_envelope_id and conta_id = p_conta_id for update;
  if v_status is null or v_s.id is null then
    raise exception 'nao_encontrado';
  end if;
  if v_status <> 'enviado' or v_s.status <> 'aguardando' or v_s.papel <> 'assinar' then
    raise exception 'status_mudou';
  end if;
  if v_prazo <= now() then
    raise exception 'prazo_encerrado';
  end if;
  return v_s;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Lembrete manual (regra 11.5): no máximo 1 a cada intervalo (24 h) e até o máximo (10) por
-- signatário. Em três passos, para o link do signatário só mudar se o e-mail com o link novo sair:
--  1) as_fn_reserva_lembrete conta o lembrete (dois cliques não passam) e enfileira a
--     notificação 'lembrete:{sid}:{uuid}' (chave única por tentativa: uma tentativa que falhou
--     não bloqueia a próxima, achado do verifier); devolve n, a chave e o último contato anterior;
--  2) o servidor manda o e-mail com um link novo;
--  3) saiu → as_fn_confirma_lembrete marca a notificação, registra 'lembrete_enviado'
--     ({"canal":"manual"}) e troca o token_hash se o signatário ainda está aguardando;
--     falhou → as_fn_desfaz_lembrete volta a contagem e marca a notificação como falha.
-- Erros: 'nao_encontrado', 'status_mudou', 'prazo_encerrado', 'lembrete_recente', 'limite_lembretes'.
-- ---------------------------------------------------------------------------------------------
create function public.as_fn_reserva_lembrete(
  p_conta_id uuid, p_envelope_id uuid, p_signatario_id uuid, p_intervalo_h integer, p_max integer
) returns table (numero integer, chave text, anterior timestamptz)
language plpgsql set search_path = '' as $$
declare
  v_s public.as_signatarios := public.as_fn_signatario_ativo(p_conta_id, p_envelope_id, p_signatario_id);
  v_chave text := 'lembrete:' || p_signatario_id || ':' || gen_random_uuid();
begin
  if v_s.ultimo_lembrete_em is not null and v_s.ultimo_lembrete_em > now() - make_interval(hours => p_intervalo_h) then
    raise exception 'lembrete_recente';
  end if;
  if v_s.lembretes_enviados >= p_max then
    raise exception 'limite_lembretes';
  end if;
  update public.as_signatarios
     set ultimo_lembrete_em = now(), lembretes_enviados = lembretes_enviados + 1
   where id = p_signatario_id;
  insert into public.as_notificacoes (conta_id, envelope_id, signatario_id, tipo, chave, tentativas)
  values (p_conta_id, p_envelope_id, p_signatario_id, 'lembrete', v_chave, 1);
  return query select (v_s.lembretes_enviados + 1)::integer, v_chave, v_s.ultimo_lembrete_em;
end;
$$;

-- Passo 3 do lembrete, quando o e-mail saiu. O e-mail saiu, então a notificação e o evento
-- 'lembrete_enviado' ficam registrados sempre (princípio 1). O link só troca se o signatário
-- ainda está aguardando: se ele assinou (ou o envelope mudou) entre a reserva e o e-mail, o link
-- novo do e-mail não abre nada, e o atual continua o que era.
-- Recebe: conta, envelope, signatário, chave da notificação, hash do link novo, id do provedor,
-- ator, IP e user agent. Devolve: true se o link foi trocado.
create function public.as_fn_confirma_lembrete(
  p_conta_id uuid, p_envelope_id uuid, p_signatario_id uuid, p_chave text, p_token_hash text,
  p_resend_id text, p_ator public.as_ator, p_ip inet default null, p_user_agent text default null
) returns boolean
language plpgsql set search_path = '' as $$
declare
  v_trocou boolean := true;
begin
  begin
    perform public.as_fn_signatario_ativo(p_conta_id, p_envelope_id, p_signatario_id);
  exception when raise_exception then
    v_trocou := false;
  end;
  if v_trocou then
    update public.as_signatarios set token_hash = p_token_hash where id = p_signatario_id and conta_id = p_conta_id;
  end if;
  update public.as_notificacoes
     set status = 'enviada', resend_id = p_resend_id, enviada_em = now(), erro = null
   where chave = p_chave and conta_id = p_conta_id and signatario_id = p_signatario_id;
  if not found then
    raise exception 'nao_encontrado';
  end if;
  perform public.as_fn_registra_evento(p_envelope_id, 'lembrete_enviado', p_ator, p_signatario_id, p_ip, p_user_agent,
    jsonb_build_object('canal', 'manual'));
  return v_trocou;
end;
$$;

-- Passo 3 do lembrete, quando o e-mail falhou: volta a contagem e o último contato, e marca a
-- notificação como falha (o link antigo continua valendo). Recebe: conta, signatário, número e
-- chave do lembrete, último contato anterior e o código do erro.
create function public.as_fn_desfaz_lembrete(
  p_conta_id uuid, p_signatario_id uuid, p_numero integer, p_chave text, p_anterior timestamptz, p_erro text
) returns void
language plpgsql set search_path = '' as $$
begin
  update public.as_signatarios
     set ultimo_lembrete_em = p_anterior, lembretes_enviados = greatest(lembretes_enviados - 1, 0)
   where id = p_signatario_id and conta_id = p_conta_id and lembretes_enviados = p_numero;
  update public.as_notificacoes
     set status = 'falhou', erro = left(p_erro, 200)
   where chave = p_chave and conta_id = p_conta_id;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- as_fn_copia_link: "Copiar link de assinatura" (critério 8.7). Grava o hash do token novo (o
-- anterior deixa de valer) e registra 'convite_enviado' com {"canal":"link_copiado"}.
-- Recebe: conta, envelope, signatário, hash do token novo, ator, IP e user agent.
-- ---------------------------------------------------------------------------------------------
create function public.as_fn_copia_link(
  p_conta_id uuid, p_envelope_id uuid, p_signatario_id uuid, p_token_hash text,
  p_ator public.as_ator, p_ip inet default null, p_user_agent text default null
) returns void
language plpgsql set search_path = '' as $$
begin
  perform public.as_fn_signatario_ativo(p_conta_id, p_envelope_id, p_signatario_id);
  update public.as_signatarios set token_hash = p_token_hash where id = p_signatario_id;
  perform public.as_fn_registra_evento(p_envelope_id, 'convite_enviado', p_ator, p_signatario_id, p_ip, p_user_agent,
    jsonb_build_object('canal', 'link_copiado'));
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- as_fn_cancela_envelope: cancela (critério 8.7, seção 12: enviado → cancelado). Grava o motivo
-- (opcional) e encerrado_em; registra 'cancelado'; avisa quem já foi convidado (aguardando ou
-- assinou) com 'cancelado_destinatario'; enfileira o webhook 'envelope.cancelado' se a conta
-- tem URL. Erros: 'nao_encontrado', 'status_mudou' (finalizando ou já encerrado).
-- Recebe: conta, envelope, motivo, ator, IP e user agent. Devolve: nada.
-- ---------------------------------------------------------------------------------------------
create function public.as_fn_cancela_envelope(
  p_conta_id uuid, p_envelope_id uuid, p_motivo text, p_ator public.as_ator,
  p_ip inet default null, p_user_agent text default null
) returns void
language plpgsql set search_path = '' as $$
declare
  v_e public.as_envelopes;
  v_motivo text := nullif(left(trim(coalesce(p_motivo, '')), 500), '');
  v_webhook text;
begin
  select * into v_e from public.as_envelopes where id = p_envelope_id and conta_id = p_conta_id for update;
  if v_e.id is null then
    raise exception 'nao_encontrado';
  end if;
  if v_e.status <> 'enviado' or not public.as_fn_transicao_envelope(p_envelope_id, 'enviado', 'cancelado') then
    raise exception 'status_mudou';
  end if;
  update public.as_envelopes set motivo_cancelamento = v_motivo, encerrado_em = now() where id = p_envelope_id;
  perform public.as_fn_registra_evento(p_envelope_id, 'cancelado', p_ator, null, p_ip, p_user_agent, '{}');

  insert into public.as_notificacoes (conta_id, envelope_id, signatario_id, tipo, chave)
  select p_conta_id, p_envelope_id, s.id, 'cancelado_destinatario', 'cancelado_destinatario:' || s.id
    from public.as_signatarios s
   where s.envelope_id = p_envelope_id and s.papel = 'assinar' and s.status in ('aguardando', 'assinou')
  on conflict (chave) do nothing;

  select webhook_url into v_webhook from public.as_contas where id = p_conta_id;
  if v_webhook is not null then
    insert into public.as_entregas_webhook (conta_id, envelope_id, evento, corpo)
    values (p_conta_id, p_envelope_id, 'envelope.cancelado', jsonb_build_object(
      'evento', 'envelope.cancelado',
      'envelope', jsonb_build_object('id', v_e.id, 'status', 'cancelado', 'titulo', v_e.titulo, 'codigo_verificacao', v_e.codigo_verificacao,
        'concluido_em', null, 'hash_final', null),
      'ocorrido_em', now()
    ));
  end if;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- as_fn_exclui_envelope: exclusão pelo remetente (seção 7.4, critério 8.7). Só rascunho ou status
-- final ('status_mudou' em enviado ou finalizando: primeiro cancela). O título digitado tem de
-- ser exatamente o do envelope ('titulo_nao_confere'). Apaga a linha; signatários, campos,
-- trilha, notificações e entregas caem em cascata. Os arquivos ficam com o servidor, que apaga a
-- pasta {conta}/{envelope}/ depois do commit.
-- Recebe: conta, envelope e o título digitado. Devolve: nada.
-- ---------------------------------------------------------------------------------------------
create function public.as_fn_exclui_envelope(p_conta_id uuid, p_envelope_id uuid, p_titulo text)
returns void
language plpgsql set search_path = '' as $$
declare
  v_e public.as_envelopes;
begin
  select * into v_e from public.as_envelopes where id = p_envelope_id and conta_id = p_conta_id for update;
  if v_e.id is null then
    raise exception 'nao_encontrado';
  end if;
  if v_e.status in ('enviado', 'finalizando') then
    raise exception 'status_mudou';
  end if;
  if p_titulo is distinct from v_e.titulo then
    raise exception 'titulo_nao_confere';
  end if;
  delete from public.as_envelopes where id = p_envelope_id;
end;
$$;

revoke execute on function
  public.as_fn_lista_envelopes(uuid, text, text, integer, integer),
  public.as_fn_signatario_ativo(uuid, uuid, uuid),
  public.as_fn_reserva_lembrete(uuid, uuid, uuid, integer, integer),
  public.as_fn_confirma_lembrete(uuid, uuid, uuid, text, text, text, public.as_ator, inet, text),
  public.as_fn_desfaz_lembrete(uuid, uuid, integer, text, timestamptz, text),
  public.as_fn_copia_link(uuid, uuid, uuid, text, public.as_ator, inet, text),
  public.as_fn_cancela_envelope(uuid, uuid, text, public.as_ator, inet, text),
  public.as_fn_exclui_envelope(uuid, uuid, text)
from public, anon, authenticated;

grant execute on function
  public.as_fn_lista_envelopes(uuid, text, text, integer, integer),
  public.as_fn_reserva_lembrete(uuid, uuid, uuid, integer, integer),
  public.as_fn_confirma_lembrete(uuid, uuid, uuid, text, text, text, public.as_ator, inet, text),
  public.as_fn_desfaz_lembrete(uuid, uuid, integer, text, timestamptz, text),
  public.as_fn_copia_link(uuid, uuid, uuid, text, public.as_ator, inet, text),
  public.as_fn_cancela_envelope(uuid, uuid, text, public.as_ator, inet, text),
  public.as_fn_exclui_envelope(uuid, uuid, text)
to service_role;
