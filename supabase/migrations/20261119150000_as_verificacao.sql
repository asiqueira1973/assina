-- Assina — épico 8.8: verificação pública (spec.md, seção 8.8 e regra 11.11).
-- A consulta é pública (sem conta), por hash do PDF ou pelo código do manifesto, e devolve só o
-- resumo da regra 11.11: status, título, enviado em, concluído em, tipo do selo e os nomes dos
-- assinantes com a data e hora da assinatura. Nunca e-mail, CPF, IP nem link de download.
-- Rascunhos e envelopes de conta suspensa (regra 11.12) não aparecem.

-- Índices da consulta por hash (o código já tem índice único).
create index as_envelopes_hash_final_idx on public.as_envelopes (hash_final) where hash_final is not null;
create index as_envelopes_hash_original_idx on public.as_envelopes (hash_original) where hash_original is not null;

-- Resumo público de um envelope (regra 11.11). Recebe: o envelope. Devolve: jsonb.
create function public.as_fn_resumo_publico(p_envelope_id uuid)
returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'status', e.status,
    'titulo', e.titulo,
    'enviado_em', e.enviado_em,
    'concluido_em', e.concluido_em,
    'selo', e.selo,
    'assinantes', coalesce((
      select jsonb_agg(jsonb_build_object('nome', s.nome, 'assinado_em', s.assinado_em) order by s.ordem, s.criado_em)
        from public.as_signatarios s
       where s.envelope_id = e.id and s.papel = 'assinar'
    ), '[]'::jsonb)
  )
  from public.as_envelopes e
  where e.id = p_envelope_id
$$;

-- ---------------------------------------------------------------------------------------------
-- as_fn_verifica_documento: a consulta pública (critério 8.8).
-- - Por hash (64 hex): primeiro o hash final de um envelope concluído ('final'); senão o hash
--   original. O hash final é único na prática; o original, não: um modelo público (formulário
--   baixado da internet) pode ter sido enviado por várias contas, e quem tem o modelo veria os
--   envelopes de terceiros (achado do verifier no 8.8). Então: um envelope só → 'original' com o
--   resumo; mais de um → 'original_multiplo' sem resumo (a tela pede o código do manifesto).
-- - Por código (12 caracteres já normalizados pelo servidor): o envelope ('codigo').
-- Sem resultado: nenhuma linha. Recebe: hash ou código (o outro nulo). Devolve: (resultado, resumo).
-- ---------------------------------------------------------------------------------------------
create function public.as_fn_verifica_documento(p_hash text, p_codigo text)
returns table (resultado text, envelope jsonb)
language plpgsql stable set search_path = '' as $$
declare
  v_total bigint;
  v_id uuid;
begin
  if p_hash is not null then
    if p_hash !~ '^[0-9a-f]{64}$' then
      return;
    end if;
    return query
      select 'final'::text, public.as_fn_resumo_publico(e.id)
        from public.as_envelopes e join public.as_contas c on c.id = e.conta_id
       where e.hash_final = p_hash and e.status = 'concluido' and c.suspensa_em is null
       limit 1;
    if found then
      return;
    end if;
    select count(*), min(e.id::text)::uuid into v_total, v_id
      from public.as_envelopes e join public.as_contas c on c.id = e.conta_id
     where e.hash_original = p_hash and e.status <> 'rascunho' and c.suspensa_em is null;
    if v_total = 1 then
      return query select 'original'::text, public.as_fn_resumo_publico(v_id);
    elsif v_total > 1 then
      return query select 'original_multiplo'::text, null::jsonb;
    end if;
    return;
  end if;
  if p_codigo is not null and p_codigo ~ '^[0-9A-HJKMNP-TV-Z]{12}$' then
    return query
      select 'codigo'::text, public.as_fn_resumo_publico(e.id)
        from public.as_envelopes e join public.as_contas c on c.id = e.conta_id
       where e.codigo_verificacao = p_codigo and e.status <> 'rascunho' and c.suspensa_em is null;
  end if;
end;
$$;

revoke execute on function public.as_fn_resumo_publico(uuid), public.as_fn_verifica_documento(text, text) from public, anon, authenticated;
grant execute on function public.as_fn_verifica_documento(text, text) to service_role;
