-- Assina — épico 8.3: campos posicionados (spec.md, seções 7.5, 8.3 e regra 11.3).

-- ---------------------------------------------------------------------------------------------
-- as_fn_substitui_campos: troca todos os campos de um rascunho numa transação (critério 8.3).
-- - Envelope da conta ('nao_encontrado') e em rascunho ('envelope_congelado'), travado.
-- - Até 50 campos por assinante ('campos_demais', regra 11.3; o mesmo número de
--   src/lib/limits.ts: MAX_CAMPOS_POR_ASSINANTE).
-- - Assinatura, rubrica, data e nome são sempre obrigatórios e sem rótulo; texto e caixa seguem
--   a lista.
-- - Página e assinante são conferidos pelo trigger as_tg_valida_campo ('campo_invalido'), e a
--   posição dentro da página pelos checks da tabela.
-- Recebe: envelope, conta e a lista em jsonb [{signatario_id, tipo, pagina, x, y, largura,
-- altura, obrigatorio, rotulo}]. Devolve: os campos gravados.
-- ---------------------------------------------------------------------------------------------
create function public.as_fn_substitui_campos(p_envelope_id uuid, p_conta_id uuid, p_lista jsonb)
returns setof public.as_campos
language plpgsql set search_path = '' as $$
declare
  v_status public.as_status_envelope;
begin
  select status into v_status from public.as_envelopes where id = p_envelope_id and conta_id = p_conta_id for update;
  if v_status is null then
    raise exception 'nao_encontrado';
  end if;
  if v_status <> 'rascunho' then
    raise exception 'envelope_congelado';
  end if;

  if exists (
    select 1 from jsonb_array_elements(coalesce(p_lista, '[]'::jsonb)) c
     group by c ->> 'signatario_id' having count(*) > 50
  ) then
    raise exception 'campos_demais';
  end if;

  delete from public.as_campos where envelope_id = p_envelope_id;

  insert into public.as_campos (envelope_id, signatario_id, tipo, pagina, x, y, largura, altura, obrigatorio, rotulo)
  select
    p_envelope_id,
    (c ->> 'signatario_id')::uuid,
    (c ->> 'tipo')::public.as_tipo_campo,
    (c ->> 'pagina')::smallint,
    (c ->> 'x')::numeric(6,5),
    (c ->> 'y')::numeric(6,5),
    (c ->> 'largura')::numeric(6,5),
    (c ->> 'altura')::numeric(6,5),
    case when c ->> 'tipo' in ('texto', 'caixa') then coalesce((c ->> 'obrigatorio')::boolean, true) else true end,
    -- Rótulo (dica) só existe em texto e caixa (7.3).
    case when c ->> 'tipo' in ('texto', 'caixa') then nullif(trim(c ->> 'rotulo'), '') end
  from jsonb_array_elements(coalesce(p_lista, '[]'::jsonb)) c;

  return query select * from public.as_campos where envelope_id = p_envelope_id order by pagina, y, x;
end;
$$;

revoke execute on function public.as_fn_substitui_campos(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.as_fn_substitui_campos(uuid, uuid, jsonb) to service_role;
