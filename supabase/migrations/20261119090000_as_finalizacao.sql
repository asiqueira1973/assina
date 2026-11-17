-- Assina — épico 8.6: finalização, manifesto e selo (spec.md, seção 8.6, seção 12 e regras 11.10,
-- 11.16 e 11.17). O PDF final é gerado no servidor (src/server/envelopes/finalize.ts); o banco
-- guarda a reserva, conta as tentativas, conclui numa transação (status, colunas, trilha, e-mails
-- e webhook) e registra as falhas.

-- ---------------------------------------------------------------------------------------------
-- Colunas novas em as_envelopes:
-- - finalizacao_reserva / finalizacao_reservada_em: quem está finalizando (o pedido do último
--   assinante ou a faxina) e desde quando. Só o dono da reserva conclui ou registra a falha; um
--   segundo pedido não começa enquanto ela vale (5 min, acima do maxDuration de 60 s). Se o
--   servidor cair no meio, a reserva vence e a faxina pega de novo.
-- - erro_finalizacao: código técnico da última falha (sem dado pessoal), para o alerta ao admin.
-- A tentativa é contada ao reservar (regra 11.10): uma finalização que cai ou estoura o tempo
-- também conta, e na próxima reserva depois da última o admin é avisado.
-- ---------------------------------------------------------------------------------------------
alter table public.as_envelopes
  add column finalizacao_reserva uuid,
  add column finalizacao_reservada_em timestamptz,
  add column erro_finalizacao text check (erro_finalizacao is null or char_length(erro_finalizacao) <= 200);

-- ---------------------------------------------------------------------------------------------
-- as_tg_final_imutavel: o resultado da finalização não se reescreve (princípio 1). Depois de
-- preenchidos, hash_final, arquivo_final_path, selo e concluido_em não mudam.
-- ---------------------------------------------------------------------------------------------
create function public.as_fn_final_imutavel() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (old.hash_final is not null and new.hash_final is distinct from old.hash_final)
     or (old.arquivo_final_path is not null and new.arquivo_final_path is distinct from old.arquivo_final_path)
     or (old.selo is not null and new.selo is distinct from old.selo)
     or (old.concluido_em is not null and new.concluido_em is distinct from old.concluido_em)
  then
    raise exception 'envelope_congelado';
  end if;
  return new;
end;
$$;

create trigger as_tg_final_imutavel before update on public.as_envelopes
  for each row execute function public.as_fn_final_imutavel();

-- Enfileira o alerta ao admin (regra 11.10, tipo finalizacao_falhou_admin). Recebe: conta e
-- envelope (ids, não a linha: uma função que recebe as_envelopes vira "campo calculado" da tabela
-- nos tipos gerados). Devolve: true se o alerta é novo (quem chamou manda o e-mail).
create function public.as_fn_alerta_finalizacao(p_conta_id uuid, p_envelope_id uuid)
returns boolean
language plpgsql set search_path = '' as $$
begin
  insert into public.as_notificacoes (conta_id, envelope_id, tipo, chave)
  values (p_conta_id, p_envelope_id, 'finalizacao_falhou_admin', 'finalizacao_falhou_admin:' || p_envelope_id)
  on conflict (chave) do nothing;
  return found;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- as_fn_reserva_finalizacao: reserva o envelope para finalizar e conta a tentativa (regra 11.10).
-- - 'ok' + o id da reserva: está em 'finalizando', ninguém o reservou nos últimos 5 minutos e
--   ainda há tentativa (tentativas_finalizacao < máximo); a tentativa já fica contada.
-- - 'ocupado': outra reserva vale, ou não está em 'finalizando'.
-- - 'esgotado': sem tentativa sobrando. Se o alerta ao admin ainda não existia (a última
--   tentativa caiu sem registrar falha), ele é enfileirado agora e a resposta é 'esgotado_alerta'.
-- Recebe: envelope e máximo de tentativas. Devolve: resultado e reserva.
-- ---------------------------------------------------------------------------------------------
create function public.as_fn_reserva_finalizacao(p_envelope_id uuid, p_max_tentativas integer)
returns table (resultado text, reserva uuid)
language plpgsql set search_path = '' as $$
declare
  v_e public.as_envelopes;
  v_reserva uuid := gen_random_uuid();
begin
  select * into v_e from public.as_envelopes where id = p_envelope_id for update;
  if v_e.id is null or v_e.status <> 'finalizando'
     or (v_e.finalizacao_reservada_em is not null and v_e.finalizacao_reservada_em >= now() - interval '5 minutes') then
    return query select 'ocupado'::text, null::uuid;
    return;
  end if;
  if v_e.tentativas_finalizacao >= p_max_tentativas then
    update public.as_envelopes set finalizacao_reserva = null, finalizacao_reservada_em = null where id = p_envelope_id;
    return query select case when public.as_fn_alerta_finalizacao(v_e.conta_id, v_e.id) then 'esgotado_alerta' else 'esgotado' end::text, null::uuid;
    return;
  end if;
  update public.as_envelopes
     set finalizacao_reserva = v_reserva,
         finalizacao_reservada_em = now(),
         tentativas_finalizacao = tentativas_finalizacao + 1
   where id = p_envelope_id;
  return query select 'ok'::text, v_reserva;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- as_fn_conclui_envelope: conclui o envelope numa transação (critério 8.6, passos 6 a 9).
-- Confere: o envelope em 'finalizando' ('status_mudou'), a reserva de quem chama ('sem_reserva':
-- um finalizador atrasado, cuja reserva venceu e foi tomada, não conclui), o caminho do final
-- ({conta}/{id}/final-{reserva}.pdf, 'caminho_invalido') e a data ('data_invalida').
-- Grava: finalizando → concluido (seção 12), arquivo_final_path, hash_final, selo, concluido_em;
-- os eventos 'finalizado' ({hash_final, selo}) e 'concluido'; um 'concluido_destinatario' por
-- destinatário (assinantes e cópias) e o 'concluido_remetente'; a entrega 'envelope.concluido'
-- quando a conta tem webhook (regra 11.17).
-- Recebe: envelope, reserva, caminho e SHA-256 do final, tipo do selo e o momento da conclusão
-- (o mesmo impresso no manifesto, para os dois baterem). Devolve: nada.
-- ---------------------------------------------------------------------------------------------
create function public.as_fn_conclui_envelope(
  p_envelope_id uuid, p_reserva uuid, p_caminho text, p_hash_final text, p_selo text, p_concluido_em timestamptz
) returns void
language plpgsql set search_path = '' as $$
declare
  v_e public.as_envelopes;
  v_webhook text;
begin
  select * into v_e from public.as_envelopes where id = p_envelope_id for update;
  if v_e.id is null or v_e.status <> 'finalizando' then
    raise exception 'status_mudou';
  end if;
  if v_e.finalizacao_reserva is null or v_e.finalizacao_reserva is distinct from p_reserva then
    raise exception 'sem_reserva';
  end if;
  if p_caminho is distinct from v_e.conta_id || '/' || v_e.id || '/final-' || p_reserva || '.pdf' then
    raise exception 'caminho_invalido';
  end if;
  if p_concluido_em is null or p_concluido_em > now() or p_concluido_em < v_e.enviado_em then
    raise exception 'data_invalida';
  end if;

  if not public.as_fn_transicao_envelope(p_envelope_id, 'finalizando', 'concluido') then
    raise exception 'status_mudou';
  end if;
  update public.as_envelopes
     set arquivo_final_path = p_caminho,
         hash_final = p_hash_final,
         selo = p_selo,
         concluido_em = p_concluido_em,
         finalizacao_reserva = null,
         finalizacao_reservada_em = null,
         erro_finalizacao = null
   where id = p_envelope_id;

  perform public.as_fn_registra_evento(p_envelope_id, 'finalizado', 'sistema', null, null, null,
    jsonb_build_object('hash_final', p_hash_final, 'selo', p_selo));
  perform public.as_fn_registra_evento(p_envelope_id, 'concluido', 'sistema', null, null, null, '{}');

  insert into public.as_notificacoes (conta_id, envelope_id, signatario_id, tipo, chave)
  select v_e.conta_id, v_e.id, s.id, 'concluido_destinatario', 'concluido_destinatario:' || s.id
    from public.as_signatarios s
   where s.envelope_id = v_e.id
  on conflict (chave) do nothing;
  insert into public.as_notificacoes (conta_id, envelope_id, tipo, chave)
  values (v_e.conta_id, v_e.id, 'concluido_remetente', 'concluido_remetente:' || v_e.id)
  on conflict (chave) do nothing;

  select webhook_url into v_webhook from public.as_contas where id = v_e.conta_id;
  if v_webhook is not null then
    insert into public.as_entregas_webhook (conta_id, envelope_id, evento, corpo)
    values (v_e.conta_id, v_e.id, 'envelope.concluido', jsonb_build_object(
      'evento', 'envelope.concluido',
      'envelope', jsonb_build_object('id', v_e.id, 'status', 'concluido', 'titulo', v_e.titulo,
        'codigo_verificacao', v_e.codigo_verificacao, 'concluido_em', p_concluido_em, 'hash_final', p_hash_final),
      'ocorrido_em', now()
    ));
  end if;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- as_fn_falha_finalizacao: registra a falha da tentativa em curso (regra 11.10). Só vale para a
-- reserva de quem chama (um finalizador atrasado não mexe na reserva de outro: devolve sem
-- alerta e sem mudar nada). O envelope continua em 'finalizando'; a reserva é solta e o código do
-- erro fica guardado. Se essa era a última tentativa, ou se a falha é definitiva (como
-- 'integridade_violada', que leva as tentativas ao máximo), enfileira o alerta ao admin.
-- Recebe: envelope, reserva, código do erro, máximo de tentativas, se a falha é definitiva.
-- Devolve: as tentativas contadas e se o alerta é novo (quem chamou manda o e-mail).
-- ---------------------------------------------------------------------------------------------
create function public.as_fn_falha_finalizacao(
  p_envelope_id uuid, p_reserva uuid, p_erro text, p_max_tentativas integer, p_definitiva boolean default false
) returns table (tentativas integer, alerta boolean)
language plpgsql set search_path = '' as $$
declare
  v_e public.as_envelopes;
  v_tentativas integer;
begin
  select * into v_e from public.as_envelopes where id = p_envelope_id for update;
  if v_e.id is null or v_e.status <> 'finalizando' or v_e.finalizacao_reserva is distinct from p_reserva then
    return query select coalesce(v_e.tentativas_finalizacao, 0)::integer, false;
    return;
  end if;
  v_tentativas := case when p_definitiva then greatest(p_max_tentativas, v_e.tentativas_finalizacao)
                       else v_e.tentativas_finalizacao end;
  update public.as_envelopes
     set tentativas_finalizacao = v_tentativas,
         finalizacao_reserva = null,
         finalizacao_reservada_em = null,
         erro_finalizacao = left(p_erro, 200)
   where id = p_envelope_id;

  if v_tentativas >= p_max_tentativas then
    return query select v_tentativas, public.as_fn_alerta_finalizacao(v_e.conta_id, v_e.id);
  else
    return query select v_tentativas, false;
  end if;
end;
$$;

revoke execute on function
  public.as_fn_final_imutavel(),
  public.as_fn_alerta_finalizacao(uuid, uuid),
  public.as_fn_reserva_finalizacao(uuid, integer),
  public.as_fn_conclui_envelope(uuid, uuid, text, text, text, timestamptz),
  public.as_fn_falha_finalizacao(uuid, uuid, text, integer, boolean)
from public, anon, authenticated;

grant execute on function
  public.as_fn_reserva_finalizacao(uuid, integer),
  public.as_fn_conclui_envelope(uuid, uuid, text, text, text, timestamptz),
  public.as_fn_falha_finalizacao(uuid, uuid, text, integer, boolean)
to service_role;
