-- Assina — advisor de performance no remoto (19/11/2026): a chave estrangeira
-- as_oauth_codigos.credencial_id (8.10) não tinha índice. Ela é usada quando a credencial é
-- apagada (on delete set null), na exclusão da conta e na revogação.
create index as_oauth_codigos_credencial_idx on public.as_oauth_codigos (credencial_id);
