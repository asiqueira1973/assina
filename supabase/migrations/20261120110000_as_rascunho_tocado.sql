-- Assina — épico 8.13 (achado do verifier): mexer nos destinatários ou nos campos de um rascunho
-- passa a renovar o atualizado_em do envelope. Antes, só um UPDATE na linha do envelope renovava,
-- e a faxina (regra 11.14, "sem atualização há 30 dias") podia apagar um rascunho em uso.

-- ---------------------------------------------------------------------------------------------
-- as_fn_rascunho_tocado (trigger AFTER INSERT/UPDATE/DELETE em as_signatarios e as_campos):
-- se o envelope ainda é rascunho, grava now() em atualizado_em. Fora de rascunho (assinatura,
-- código, link novo) não muda nada; na cascata da exclusão o envelope já não existe.
-- ---------------------------------------------------------------------------------------------
create function public.as_fn_rascunho_tocado() returns trigger
language plpgsql set search_path = '' as $$
begin
  update public.as_envelopes set atualizado_em = now()
   where id = case when tg_op = 'DELETE' then old.envelope_id else new.envelope_id end
     and status = 'rascunho';
  return null;
end;
$$;

create trigger as_tg_rascunho_tocado after insert or update or delete on public.as_signatarios
  for each row execute function public.as_fn_rascunho_tocado();
create trigger as_tg_rascunho_tocado after insert or update or delete on public.as_campos
  for each row execute function public.as_fn_rascunho_tocado();

revoke execute on function public.as_fn_rascunho_tocado() from public, anon, authenticated;
