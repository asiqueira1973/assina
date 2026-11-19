-- Assina — épico 8.13: a conclusão não depende de o relógio do servidor e o do banco baterem ao
-- milissegundo (bug achado na faxina: concluido_em vinha do servidor e o banco o comparava com o
-- próprio now(); com o servidor atrasado, a data caía antes do envio; adiantado, no futuro).
-- O servidor passa a usar a maior data entre o próprio relógio e a última data da trilha
-- (src/server/envelopes/finalize.ts), e o banco aceita até 1 minuto à frente do now().
-- O resto de as_fn_conclui_envelope é igual ao 8.6 (20261119090000_as_finalizacao.sql).

create or replace function public.as_fn_conclui_envelope(
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
  -- Tolerância de 1 minuto no futuro: o servidor (Vercel) e o banco têm relógios diferentes.
  -- O piso continua: nunca antes do envio (o servidor já parte da última data da trilha).
  if p_concluido_em is null or p_concluido_em > now() + interval '1 minute' or p_concluido_em < v_e.enviado_em then
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
