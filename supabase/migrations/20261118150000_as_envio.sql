-- Assina — épico 8.4: envio do envelope (spec.md, seções 8.4, 12 e regras 11.12, 11.16 e 11.20).

-- ---------------------------------------------------------------------------------------------
-- as_envios: um registro por envio, para o limite de 30 em 24 h (regra 11.12). Fica fora do
-- envelope de propósito: cancelar e excluir um envelope não devolve a vaga do dia (achado do
-- verifier no 8.4). Só cai junto com a conta.
-- ---------------------------------------------------------------------------------------------
create table public.as_envios (
  id uuid primary key default gen_random_uuid(),
  conta_id uuid not null references public.as_contas (id) on delete cascade,
  enviado_em timestamptz not null default now()
);
create index as_envios_conta_enviado_idx on public.as_envios (conta_id, enviado_em desc);
alter table public.as_envios enable row level security;
revoke all on public.as_envios from anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Reserva de notificação (regra 11.16): quem vai mandar um e-mail reserva a linha por 2 minutos.
-- Um segundo pedido (outra aba, faxina) não passa enquanto a reserva vale; se o servidor cair no
-- meio, a reserva vence sozinha e a faxina pega de novo.
-- ---------------------------------------------------------------------------------------------
alter table public.as_notificacoes add column reservada_em timestamptz;

-- as_fn_reserva_notificacao: reserva a notificação para envio, se ainda não foi enviada, se há
-- tentativa sobrando e se ninguém a reservou nos últimos 2 minutos; conta a tentativa.
-- Recebe: id da notificação e o máximo de tentativas. Devolve: true se reservou.
create function public.as_fn_reserva_notificacao(p_id uuid, p_max_tentativas integer)
returns boolean
language plpgsql set search_path = '' as $$
begin
  update public.as_notificacoes
     set reservada_em = now(), tentativas = tentativas + 1
   where id = p_id
     and status <> 'enviada'
     and tentativas < p_max_tentativas
     and (reservada_em is null or reservada_em < now() - interval '2 minutes');
  return found;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- as_fn_envia_envelope: congela o rascunho e prepara os convites, numa transação (critério 8.4).
-- 1) Trava a conta (advisory lock: dois envios paralelos não passam juntos pelo limite do nível,
--    regra 11.20) e o envelope (FOR UPDATE).
-- 2) Confere: envelope da conta ('nao_encontrado'), em rascunho ('status_mudou'), com o mesmo
--    arquivo validado que o servidor leu e cujo hash calculou ('envelope_mudou'), ao menos um
--    assinante ('sem_assinante') e o conjunto de assinantes igual ao dos tokens ('envelope_mudou').
-- 3) Limites (números vindos do servidor, src/lib/limits.ts): envios nas últimas 24 h, contados
--    em as_envios ('limite_diario', regra 11.12) e documentos guardados do nível ('limite_do_nivel', 11.20).
-- 4) rascunho → enviado, com hash_original, enviado_em e prazo_em (regra 11.7).
-- 5) Grava o token_hash de cada assinante; os da vez (todos, ou só a ordem 1 em ordem) ficam
--    'aguardando'. Cópias não recebem convite (só a conclusão).
-- 6) Eventos: 'criado' (se faltar) e 'enviado' com o hash_original (princípio 1).
-- 7) Enfileira um 'convite' por destinatário da vez (chave convite:{signatario_id}).
-- Recebe: envelope, conta, caminho e hash do original, tokens [{signatario_id, token_hash}],
-- limites, ator, IP e user agent. Devolve: os destinatários da vez (a quem mandar o convite).
-- ---------------------------------------------------------------------------------------------
create function public.as_fn_envia_envelope(
  p_envelope_id uuid,
  p_conta_id uuid,
  p_caminho text,
  p_hash text,
  p_tokens jsonb,
  p_limite_diario integer,
  p_limites_nivel integer[],
  p_ator public.as_ator,
  p_ip inet default null,
  p_user_agent text default null
) returns setof public.as_signatarios
language plpgsql set search_path = '' as $$
declare
  v_envelope public.as_envelopes;
  v_nivel smallint;
  v_assinantes uuid[];
  v_tokens uuid[];
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('as_conta:' || p_conta_id::text, 0));

  select * into v_envelope from public.as_envelopes where id = p_envelope_id and conta_id = p_conta_id for update;
  if not found then
    raise exception 'nao_encontrado';
  end if;
  if v_envelope.status <> 'rascunho' then
    raise exception 'status_mudou';
  end if;
  if v_envelope.arquivo_original_path is null or v_envelope.paginas is null
     or v_envelope.arquivo_original_path <> p_caminho then
    raise exception 'envelope_mudou';
  end if;

  select coalesce(array_agg(id order by id), '{}') into v_assinantes
    from public.as_signatarios where envelope_id = p_envelope_id and papel = 'assinar';
  if cardinality(v_assinantes) = 0 then
    raise exception 'sem_assinante';
  end if;
  select coalesce(array_agg((t ->> 'signatario_id')::uuid order by (t ->> 'signatario_id')::uuid), '{}') into v_tokens
    from jsonb_array_elements(coalesce(p_tokens, '[]'::jsonb)) t;
  if v_tokens <> v_assinantes then
    raise exception 'envelope_mudou';
  end if;

  if (select count(*) from public.as_envios
       where conta_id = p_conta_id and enviado_em > now() - interval '24 hours') >= p_limite_diario then
    raise exception 'limite_diario';
  end if;
  select nivel into v_nivel from public.as_contas where id = p_conta_id;
  if (select count(*) from public.as_envelopes where conta_id = p_conta_id and status <> 'rascunho')
       >= p_limites_nivel[v_nivel] then
    raise exception 'limite_do_nivel';
  end if;

  -- Transição pela função da seção 12 (trava contra concorrência), depois os dados do envio.
  if not public.as_fn_transicao_envelope(p_envelope_id, 'rascunho', 'enviado') then
    raise exception 'status_mudou';
  end if;
  update public.as_envelopes
     set hash_original = p_hash,
         enviado_em = now(),
         prazo_em = now() + make_interval(days => v_envelope.prazo_dias)
   where id = p_envelope_id;
  insert into public.as_envios (conta_id) values (p_conta_id);

  update public.as_signatarios s
     set token_hash = t ->> 'token_hash',
         status = case when not v_envelope.em_ordem or s.ordem = 1 then 'aguardando'::public.as_status_signatario else s.status end
    from jsonb_array_elements(p_tokens) t
   where s.id = (t ->> 'signatario_id')::uuid and s.envelope_id = p_envelope_id;

  if not exists (select 1 from public.as_eventos where envelope_id = p_envelope_id and tipo = 'criado') then
    perform public.as_fn_registra_evento(p_envelope_id, 'criado', p_ator, null, p_ip, p_user_agent, '{}');
  end if;
  perform public.as_fn_registra_evento(p_envelope_id, 'enviado', p_ator, null, p_ip, p_user_agent,
    jsonb_build_object('hash_original', p_hash));

  insert into public.as_notificacoes (conta_id, envelope_id, signatario_id, tipo, chave)
  select p_conta_id, p_envelope_id, s.id, 'convite', 'convite:' || s.id
    from public.as_signatarios s
   where s.envelope_id = p_envelope_id and s.status = 'aguardando'
  on conflict (chave) do nothing;

  return query
    select * from public.as_signatarios
     where envelope_id = p_envelope_id and status = 'aguardando'
     order by ordem;
end;
$$;

revoke execute on function public.as_fn_reserva_notificacao(uuid, integer) from public, anon, authenticated;
grant execute on function public.as_fn_reserva_notificacao(uuid, integer) to service_role;

revoke execute on function public.as_fn_envia_envelope(uuid, uuid, text, text, jsonb, integer, integer[], public.as_ator, inet, text) from public, anon, authenticated;
grant execute on function public.as_fn_envia_envelope(uuid, uuid, text, text, jsonb, integer, integer[], public.as_ator, inet, text) to service_role;
