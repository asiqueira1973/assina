-- Assina — épico 8.9: API REST v1 e webhooks (spec.md, seções 6.3, 8.9, 13.2 e regras 11.8 e
-- 11.17). Lista paginada por cursor, troca da chave de API, webhook signatario.assinou e a
-- reserva das entregas (uma por vez, até 6 tentativas).

-- ---------------------------------------------------------------------------------------------
-- as_fn_api_lista_envelopes: GET /api/v1/envelopes (13.2). Mais recentes primeiro; o cursor é a
-- posição do último item já entregue (criado_em, id), para a página seguinte não repetir nem
-- pular item quando entram envelopes novos. Status opcional.
-- Recebe: conta, status (ou nulo), limite, cursor (ou nulos). Devolve: as linhas do envelope.
-- ---------------------------------------------------------------------------------------------
create function public.as_fn_api_lista_envelopes(
  p_conta_id uuid, p_status public.as_status_envelope, p_limite integer, p_cursor_criado timestamptz, p_cursor_id uuid
) returns setof public.as_envelopes
language sql stable set search_path = '' as $$
  select e.*
    from public.as_envelopes e
   where e.conta_id = p_conta_id
     and (p_status is null or e.status = p_status)
     and (p_cursor_criado is null or (e.criado_em, e.id) < (p_cursor_criado, p_cursor_id))
   order by e.criado_em desc, e.id desc
   limit greatest(least(p_limite, 101), 1);
$$;

-- ---------------------------------------------------------------------------------------------
-- as_fn_troca_chave_api: "Gerar nova chave" (regra 11.8): revoga a chave ativa e grava a nova na
-- mesma transação; a anterior para de funcionar na hora.
-- Recebe: conta, hash, prefixo e valor cifrado da chave nova. Devolve: nada.
-- ---------------------------------------------------------------------------------------------
create function public.as_fn_troca_chave_api(p_conta_id uuid, p_hash text, p_prefixo text, p_cifrado text)
returns void
language plpgsql set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('as_chave:' || p_conta_id::text, 0));
  update public.as_credenciais set revogada_em = now()
   where conta_id = p_conta_id and tipo = 'api' and revogada_em is null;
  insert into public.as_credenciais (conta_id, tipo, nome, prefixo, valor_hash, valor_cifrado)
  values (p_conta_id, 'api', 'Chave de API', p_prefixo, p_hash, p_cifrado);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- as_tg_webhook_assinou: quando um assinante passa a 'assinou', enfileira o webhook
-- signatario.assinou (regra 11.17) na mesma transação da assinatura, se a conta tem URL.
-- O corpo leva o envelope como estava na hora e o signatário {id, email, assinado_em}.
-- ---------------------------------------------------------------------------------------------
create function public.as_fn_webhook_assinou() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_e public.as_envelopes;
  v_webhook text;
begin
  if new.status = 'assinou' and old.status is distinct from 'assinou' then
    select webhook_url into v_webhook from public.as_contas where id = new.conta_id;
    if v_webhook is not null then
      select * into v_e from public.as_envelopes where id = new.envelope_id;
      insert into public.as_entregas_webhook (conta_id, envelope_id, evento, corpo)
      values (new.conta_id, new.envelope_id, 'signatario.assinou', jsonb_build_object(
        'evento', 'signatario.assinou',
        'envelope', jsonb_build_object('id', v_e.id, 'status', v_e.status, 'titulo', v_e.titulo,
          'codigo_verificacao', v_e.codigo_verificacao, 'concluido_em', v_e.concluido_em, 'hash_final', v_e.hash_final),
        'signatario', jsonb_build_object('id', new.id, 'email', new.email, 'assinado_em', new.assinado_em),
        'ocorrido_em', now()
      ));
    end if;
  end if;
  return new;
end;
$$;

create trigger as_tg_webhook_assinou after update of status on public.as_signatarios
  for each row execute function public.as_fn_webhook_assinou();

-- ---------------------------------------------------------------------------------------------
-- Entrega dos webhooks (regra 11.17): reserva de 2 minutos (um envio por vez, mesmo com a faxina
-- rodando junto) e a tentativa contada ao reservar. Até p_max tentativas (6).
-- ---------------------------------------------------------------------------------------------
alter table public.as_entregas_webhook add column reservada_em timestamptz;
create index as_entregas_webhook_pendentes_idx on public.as_entregas_webhook (status) where status <> 'entregue';

-- Recebe: a entrega e o máximo de tentativas. Devolve: true se reservou.
create function public.as_fn_reserva_entrega(p_id uuid, p_max integer)
returns boolean
language plpgsql set search_path = '' as $$
begin
  update public.as_entregas_webhook
     set reservada_em = now(), tentativas = tentativas + 1
   where id = p_id
     and status <> 'entregue'
     and tentativas < p_max
     and (reservada_em is null or reservada_em < now() - interval '2 minutes');
  return found;
end;
$$;

revoke execute on function
  public.as_fn_api_lista_envelopes(uuid, public.as_status_envelope, integer, timestamptz, uuid),
  public.as_fn_troca_chave_api(uuid, text, text, text),
  public.as_fn_webhook_assinou(),
  public.as_fn_reserva_entrega(uuid, integer)
from public, anon, authenticated;

grant execute on function
  public.as_fn_api_lista_envelopes(uuid, public.as_status_envelope, integer, timestamptz, uuid),
  public.as_fn_troca_chave_api(uuid, text, text, text),
  public.as_fn_reserva_entrega(uuid, integer)
to service_role;
