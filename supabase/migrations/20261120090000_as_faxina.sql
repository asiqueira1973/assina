-- Assina — épico 8.13: faxina diária (spec.md, critério 8.13 e regras 11.5, 11.7 e 11.14).
-- O servidor (src/server/cron.ts) chama estas funções em ordem; cada uma é idempotente.

-- ---------------------------------------------------------------------------------------------
-- as_fn_expira_envelope: regra 11.7. Numa transação, com o envelope travado: se ainda está
-- 'enviado' e o prazo passou, muda para 'expirado' (encerrado_em = agora), registra 'expirado'
-- na trilha (ator sistema), enfileira o aviso ao remetente ('expirado_remetente:{id}') e, se a
-- conta tem webhook, a entrega 'envelope.expirado'.
-- Recebe: o envelope. Devolve: true se expirou agora; false se não havia o que fazer (já mudou de
-- situação, ainda no prazo ou outra execução chegou antes).
-- ---------------------------------------------------------------------------------------------
create function public.as_fn_expira_envelope(p_envelope_id uuid) returns boolean
language plpgsql set search_path = '' as $$
declare
  v_e public.as_envelopes;
  v_webhook text;
begin
  select * into v_e from public.as_envelopes where id = p_envelope_id for update;
  if v_e.id is null or v_e.status <> 'enviado' or v_e.prazo_em is null or v_e.prazo_em > now() then
    return false;
  end if;
  if not public.as_fn_transicao_envelope(p_envelope_id, 'enviado', 'expirado') then
    return false;
  end if;
  update public.as_envelopes set encerrado_em = now() where id = p_envelope_id;
  perform public.as_fn_registra_evento(p_envelope_id, 'expirado', 'sistema', null, null, null, '{}');

  insert into public.as_notificacoes (conta_id, envelope_id, tipo, chave)
  values (v_e.conta_id, p_envelope_id, 'expirado_remetente', 'expirado_remetente:' || p_envelope_id)
  on conflict (chave) do nothing;

  select webhook_url into v_webhook from public.as_contas where id = v_e.conta_id;
  if v_webhook is not null then
    insert into public.as_entregas_webhook (conta_id, envelope_id, evento, corpo)
    values (v_e.conta_id, p_envelope_id, 'envelope.expirado', jsonb_build_object(
      'evento', 'envelope.expirado',
      'envelope', jsonb_build_object('id', v_e.id, 'status', 'expirado', 'titulo', v_e.titulo, 'codigo_verificacao', v_e.codigo_verificacao,
        'concluido_em', null, 'hash_final', null),
      'ocorrido_em', now()
    ));
  end if;
  return true;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- as_fn_lembretes_devidos: regra 11.5 (lembrete automático). Assinantes 'aguardando' de envelopes
-- 'enviado', ainda no prazo, com lembrete_cada_dias = N, cujo último contato (convite ou
-- lembrete) tem N dias ou mais, abaixo do limite de lembretes. A folga (minutos) evita que a
-- faxina, que roda no mesmo horário todo dia, perca um dia por segundos de diferença.
-- Recebe: o limite, a folga em minutos e as contas a limitar (null = todas; os testes limitam).
-- Devolve: conta, envelope, signatário e N, para o servidor mandar cada lembrete.
-- ---------------------------------------------------------------------------------------------
create function public.as_fn_lembretes_devidos(p_max integer, p_folga_min integer, p_contas uuid[] default null)
returns table (conta_id uuid, envelope_id uuid, signatario_id uuid, cada_dias smallint)
language sql stable set search_path = '' as $$
  select e.conta_id, e.id, s.id, e.lembrete_cada_dias
    from public.as_envelopes e
    join public.as_signatarios s on s.envelope_id = e.id
    join public.as_contas c on c.id = e.conta_id
   where e.status = 'enviado'
     and e.lembrete_cada_dias is not null
     and e.prazo_em > now()
     and c.suspensa_em is null
     and s.papel = 'assinar'
     and s.status = 'aguardando'
     and s.lembretes_enviados < p_max
     and greatest(s.notificado_em, s.ultimo_lembrete_em) is not null
     and greatest(s.notificado_em, s.ultimo_lembrete_em)
         <= now() - make_interval(days => e.lembrete_cada_dias) + make_interval(mins => p_folga_min)
     and (p_contas is null or e.conta_id = any (p_contas))
   order by e.id, s.ordem;
$$;

-- ---------------------------------------------------------------------------------------------
-- as_fn_expurga_envelope: regra 11.14. Depois que o servidor apagou os arquivos do envelope,
-- marca o expurgo: arquivos_expurgados_em = agora, sem caminho do original e sem caminhos das
-- imagens de assinatura e rubrica. Só para recusado, cancelado ou expirado, encerrado há pelo
-- menos p_dias e ainda não expurgado. A linha e a trilha ficam.
-- Recebe: o envelope e os dias. Devolve: true se marcou.
-- ---------------------------------------------------------------------------------------------
create function public.as_fn_expurga_envelope(p_envelope_id uuid, p_dias integer) returns boolean
language plpgsql set search_path = '' as $$
begin
  update public.as_envelopes
     set arquivos_expurgados_em = now(), arquivo_original_path = null
   where id = p_envelope_id
     and status in ('recusado', 'cancelado', 'expirado')
     and encerrado_em <= now() - make_interval(days => p_dias)
     and arquivos_expurgados_em is null;
  if not found then
    return false;
  end if;
  update public.as_signatarios
     set assinatura_imagem_path = null, rubrica_imagem_path = null
   where envelope_id = p_envelope_id
     and (assinatura_imagem_path is not null or rubrica_imagem_path is not null);
  return true;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- as_fn_confirma_lembrete (redefinida): o canal na trilha passa a dizer de onde veio o lembrete —
-- 'automatico' quando o ator é a faxina ('sistema'), 'manual' nos outros casos (painel, API, MCP).
-- O resto é igual ao 8.7 (20261119120000_as_painel.sql).
-- ---------------------------------------------------------------------------------------------
create or replace function public.as_fn_confirma_lembrete(
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
    jsonb_build_object('canal', case when p_ator = 'sistema' then 'automatico' else 'manual' end));
  return v_trocou;
end;
$$;

revoke execute on function
  public.as_fn_expira_envelope(uuid),
  public.as_fn_lembretes_devidos(integer, integer, uuid[]),
  public.as_fn_expurga_envelope(uuid, integer)
from public, anon, authenticated;

grant execute on function
  public.as_fn_expira_envelope(uuid),
  public.as_fn_lembretes_devidos(integer, integer, uuid[]),
  public.as_fn_expurga_envelope(uuid, integer)
to service_role;
