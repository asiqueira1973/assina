-- Gerado por `npm run db:schema` (supabase db dump --local --schema public). Não editar à mão.




SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."as_ator" AS ENUM (
    'remetente',
    'signatario',
    'sistema',
    'api',
    'mcp'
);


ALTER TYPE "public"."as_ator" OWNER TO "postgres";


CREATE TYPE "public"."as_metodo_assinatura" AS ENUM (
    'digitada',
    'desenhada'
);


ALTER TYPE "public"."as_metodo_assinatura" OWNER TO "postgres";


CREATE TYPE "public"."as_origem" AS ENUM (
    'painel',
    'api',
    'mcp'
);


ALTER TYPE "public"."as_origem" OWNER TO "postgres";


CREATE TYPE "public"."as_papel" AS ENUM (
    'assinar',
    'copia'
);


ALTER TYPE "public"."as_papel" OWNER TO "postgres";


CREATE TYPE "public"."as_status_entrega" AS ENUM (
    'pendente',
    'entregue',
    'falhou'
);


ALTER TYPE "public"."as_status_entrega" OWNER TO "postgres";


CREATE TYPE "public"."as_status_envelope" AS ENUM (
    'rascunho',
    'enviado',
    'finalizando',
    'concluido',
    'recusado',
    'cancelado',
    'expirado'
);


ALTER TYPE "public"."as_status_envelope" OWNER TO "postgres";


CREATE TYPE "public"."as_status_notificacao" AS ENUM (
    'pendente',
    'enviada',
    'falhou'
);


ALTER TYPE "public"."as_status_notificacao" OWNER TO "postgres";


CREATE TYPE "public"."as_status_signatario" AS ENUM (
    'pendente',
    'aguardando',
    'assinou',
    'recusou'
);


ALTER TYPE "public"."as_status_signatario" OWNER TO "postgres";


CREATE TYPE "public"."as_tipo_campo" AS ENUM (
    'assinatura',
    'rubrica',
    'data',
    'nome',
    'texto',
    'caixa'
);


ALTER TYPE "public"."as_tipo_campo" OWNER TO "postgres";


CREATE TYPE "public"."as_tipo_credencial" AS ENUM (
    'api',
    'mcp'
);


ALTER TYPE "public"."as_tipo_credencial" OWNER TO "postgres";


CREATE TYPE "public"."as_tipo_evento" AS ENUM (
    'criado',
    'enviado',
    'convite_enviado',
    'codigo_enviado',
    'codigo_validado',
    'codigo_recusado',
    'visualizou',
    'consentiu',
    'assinou',
    'recusou',
    'lembrete_enviado',
    'finalizado',
    'concluido',
    'cancelado',
    'expirado',
    'baixou_original',
    'baixou_final'
);


ALTER TYPE "public"."as_tipo_evento" OWNER TO "postgres";


CREATE TYPE "public"."as_tipo_notificacao" AS ENUM (
    'convite',
    'codigo',
    'lembrete',
    'concluido_destinatario',
    'concluido_remetente',
    'assinou_remetente',
    'recusado_remetente',
    'recusado_destinatario',
    'cancelado_destinatario',
    'expirado_remetente',
    'finalizacao_falhou_admin'
);


ALTER TYPE "public"."as_tipo_notificacao" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."as_fn_anexa_arquivo"("p_envelope_id" "uuid", "p_conta_id" "uuid", "p_caminho" "text", "p_nome" "text", "p_tamanho" integer, "p_paginas" smallint, "p_dimensoes" "jsonb") RETURNS TABLE("caminho_anterior" "text", "campos_removidos" boolean)
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  v_envelope public.as_envelopes;
  v_removidos integer;
begin
  select * into v_envelope from public.as_envelopes where id = p_envelope_id and conta_id = p_conta_id for update;
  if not found then
    raise exception 'nao_encontrado';
  end if;
  if v_envelope.status <> 'rascunho' then
    raise exception 'envelope_congelado';
  end if;

  delete from public.as_campos where envelope_id = p_envelope_id;
  get diagnostics v_removidos = row_count;

  update public.as_envelopes
     set arquivo_original_path = p_caminho,
         nome_arquivo = left(p_nome, 200),
         tamanho_bytes = p_tamanho,
         paginas = p_paginas,
         dimensoes_paginas = p_dimensoes
   where id = p_envelope_id;

  return query select v_envelope.arquivo_original_path, v_removidos > 0;
end;
$$;


ALTER FUNCTION "public"."as_fn_anexa_arquivo"("p_envelope_id" "uuid", "p_conta_id" "uuid", "p_caminho" "text", "p_nome" "text", "p_tamanho" integer, "p_paginas" smallint, "p_dimensoes" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."as_fn_atualizado_em"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;


ALTER FUNCTION "public"."as_fn_atualizado_em"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."as_envelopes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conta_id" "uuid" NOT NULL,
    "titulo" "text" NOT NULL,
    "mensagem" "text",
    "status" "public"."as_status_envelope" DEFAULT 'rascunho'::"public"."as_status_envelope" NOT NULL,
    "origem" "public"."as_origem" NOT NULL,
    "em_ordem" boolean DEFAULT false NOT NULL,
    "prazo_dias" smallint DEFAULT 30 NOT NULL,
    "prazo_em" timestamp with time zone,
    "lembrete_cada_dias" smallint DEFAULT 3,
    "nome_arquivo" "text",
    "arquivo_original_path" "text",
    "tamanho_bytes" integer,
    "paginas" smallint,
    "dimensoes_paginas" "jsonb",
    "hash_original" "text",
    "arquivo_final_path" "text",
    "hash_final" "text",
    "selo" "text",
    "codigo_verificacao" "text" NOT NULL,
    "chave_idempotencia" "text",
    "tentativas_finalizacao" smallint DEFAULT 0 NOT NULL,
    "motivo_cancelamento" "text",
    "enviado_em" timestamp with time zone,
    "concluido_em" timestamp with time zone,
    "encerrado_em" timestamp with time zone,
    "arquivos_expurgados_em" timestamp with time zone,
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "atualizado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "as_envelopes_chave_idempotencia_check" CHECK ((("chave_idempotencia" IS NULL) OR (("char_length"("chave_idempotencia") >= 1) AND ("char_length"("chave_idempotencia") <= 100)))),
    CONSTRAINT "as_envelopes_codigo_verificacao_check" CHECK (("codigo_verificacao" ~ '^[0-9A-HJKMNP-TV-Z]{12}$'::"text")),
    CONSTRAINT "as_envelopes_hash_final_check" CHECK ((("hash_final" IS NULL) OR ("hash_final" ~ '^[0-9a-f]{64}$'::"text"))),
    CONSTRAINT "as_envelopes_hash_original_check" CHECK ((("hash_original" IS NULL) OR ("hash_original" ~ '^[0-9a-f]{64}$'::"text"))),
    CONSTRAINT "as_envelopes_lembrete_cada_dias_check" CHECK ((("lembrete_cada_dias" IS NULL) OR ("lembrete_cada_dias" = ANY (ARRAY[2, 3, 7])))),
    CONSTRAINT "as_envelopes_mensagem_check" CHECK ((("mensagem" IS NULL) OR ("char_length"("mensagem") <= 1000))),
    CONSTRAINT "as_envelopes_motivo_cancelamento_check" CHECK ((("motivo_cancelamento" IS NULL) OR ("char_length"("motivo_cancelamento") <= 500))),
    CONSTRAINT "as_envelopes_nome_arquivo_check" CHECK ((("nome_arquivo" IS NULL) OR ("char_length"("nome_arquivo") <= 200))),
    CONSTRAINT "as_envelopes_paginas_check" CHECK ((("paginas" IS NULL) OR (("paginas" >= 1) AND ("paginas" <= 100)))),
    CONSTRAINT "as_envelopes_prazo_dias_check" CHECK ((("prazo_dias" >= 1) AND ("prazo_dias" <= 90))),
    CONSTRAINT "as_envelopes_selo_check" CHECK ((("selo" IS NULL) OR ("selo" = ANY (ARRAY['B-B'::"text", 'B-T'::"text"])))),
    CONSTRAINT "as_envelopes_tamanho_bytes_check" CHECK ((("tamanho_bytes" IS NULL) OR (("tamanho_bytes" >= 1) AND ("tamanho_bytes" <= 10485760)))),
    CONSTRAINT "as_envelopes_titulo_check" CHECK ((("char_length"("titulo") >= 1) AND ("char_length"("titulo") <= 120)))
);


ALTER TABLE "public"."as_envelopes" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."as_fn_cria_rascunho"("p_conta_id" "uuid", "p_titulo" "text", "p_origem" "public"."as_origem", "p_codigo_verificacao" "text", "p_ator" "public"."as_ator", "p_ip" "inet" DEFAULT NULL::"inet", "p_user_agent" "text" DEFAULT NULL::"text") RETURNS "public"."as_envelopes"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  v_envelope public.as_envelopes;
begin
  insert into public.as_envelopes (conta_id, titulo, origem, codigo_verificacao)
  values (p_conta_id, p_titulo, p_origem, p_codigo_verificacao)
  returning * into v_envelope;

  perform public.as_fn_registra_evento(v_envelope.id, 'criado', p_ator, null, p_ip, p_user_agent,
    jsonb_build_object('origem', p_origem));
  return v_envelope;
end;
$$;


ALTER FUNCTION "public"."as_fn_cria_rascunho"("p_conta_id" "uuid", "p_titulo" "text", "p_origem" "public"."as_origem", "p_codigo_verificacao" "text", "p_ator" "public"."as_ator", "p_ip" "inet", "p_user_agent" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."as_fn_entra_conta"("p_google_sub" "text", "p_email" "text", "p_nome" "text", "p_chave_hash" "text", "p_chave_prefixo" "text", "p_chave_cifrada" "text") RETURNS TABLE("conta_id" "uuid", "nova" boolean, "suspensa" boolean)
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  v_conta public.as_contas;
begin
  select * into v_conta from public.as_contas c where c.google_sub = p_google_sub;

  if not found then
    insert into public.as_contas (google_sub, email, nome)
    values (p_google_sub, lower(p_email), left(p_nome, 100))
    on conflict (google_sub) do nothing
    returning * into v_conta;

    if v_conta.id is not null then
      insert into public.as_credenciais (conta_id, tipo, nome, prefixo, valor_hash, valor_cifrado)
      values (v_conta.id, 'api', 'Chave de API', p_chave_prefixo, p_chave_hash, p_chave_cifrada);
      return query select v_conta.id, true, false;
      return;
    end if;
    -- Corrida: outro login criou a conta entre o select e o insert. Segue como existente.
    select * into v_conta from public.as_contas c where c.google_sub = p_google_sub;
  end if;

  if v_conta.suspensa_em is not null then
    return query select v_conta.id, false, true;
    return;
  end if;

  if v_conta.email <> lower(p_email) then
    update public.as_contas set email = lower(p_email) where id = v_conta.id;
  end if;
  return query select v_conta.id, false, false;
end;
$$;


ALTER FUNCTION "public"."as_fn_entra_conta"("p_google_sub" "text", "p_email" "text", "p_nome" "text", "p_chave_hash" "text", "p_chave_prefixo" "text", "p_chave_cifrada" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."as_fn_envelope_congelado"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  if new.status is distinct from old.status and not (
       (old.status = 'rascunho' and new.status = 'enviado')
    or (old.status = 'enviado' and new.status in ('finalizando', 'recusado', 'cancelado', 'expirado'))
    or (old.status = 'finalizando' and new.status = 'concluido')
  ) then
    raise exception 'status_mudou';
  end if;

  if old.status <> 'rascunho' then
    if new.titulo is distinct from old.titulo
       or new.mensagem is distinct from old.mensagem
       or new.em_ordem is distinct from old.em_ordem
       or new.prazo_dias is distinct from old.prazo_dias
       or new.nome_arquivo is distinct from old.nome_arquivo
       or new.tamanho_bytes is distinct from old.tamanho_bytes
       or new.paginas is distinct from old.paginas
       or new.dimensoes_paginas is distinct from old.dimensoes_paginas
       or new.conta_id is distinct from old.conta_id
       or new.codigo_verificacao is distinct from old.codigo_verificacao
       or (old.hash_original is not null and new.hash_original is distinct from old.hash_original)
    then
      raise exception 'envelope_congelado';
    end if;
    -- O caminho do original só pode sumir pelo expurgo (11.14), nunca trocar por outro.
    if new.arquivo_original_path is distinct from old.arquivo_original_path
       and not (
         new.arquivo_original_path is null
         and new.arquivos_expurgados_em is not null
         and new.status in ('recusado', 'cancelado', 'expirado')
       )
    then
      raise exception 'envelope_congelado';
    end if;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."as_fn_envelope_congelado"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."as_fn_envelope_exclusao"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  if old.status in ('enviado', 'finalizando') and pg_catalog.pg_trigger_depth() <= 1 then
    raise exception 'envelope_em_andamento';
  end if;
  return old;
end;
$$;


ALTER FUNCTION "public"."as_fn_envelope_exclusao"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."as_fn_envelope_nasce_rascunho"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  if new.status <> 'rascunho' or new.hash_original is not null or new.hash_final is not null
     or new.arquivo_final_path is not null or new.enviado_em is not null or new.concluido_em is not null
  then
    raise exception 'status_mudou';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."as_fn_envelope_nasce_rascunho"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."as_signatarios" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "envelope_id" "uuid" NOT NULL,
    "conta_id" "uuid" NOT NULL,
    "papel" "public"."as_papel" DEFAULT 'assinar'::"public"."as_papel" NOT NULL,
    "ordem" smallint DEFAULT 1 NOT NULL,
    "nome" "text" NOT NULL,
    "email" "text" NOT NULL,
    "exigir_cpf" boolean DEFAULT false NOT NULL,
    "cpf" "text",
    "status" "public"."as_status_signatario" DEFAULT 'pendente'::"public"."as_status_signatario" NOT NULL,
    "token_hash" "text" NOT NULL,
    "codigo_hash" "text",
    "codigo_expira_em" timestamp with time zone,
    "codigo_tentativas" smallint DEFAULT 0 NOT NULL,
    "codigos_enviados_hora" smallint DEFAULT 0 NOT NULL,
    "janela_codigos_desde" timestamp with time zone,
    "consentimento_versao" "text",
    "metodo_assinatura" "public"."as_metodo_assinatura",
    "assinatura_texto" "text",
    "assinatura_imagem_path" "text",
    "rubrica_texto" "text",
    "rubrica_imagem_path" "text",
    "ip_assinatura" "inet",
    "user_agent_assinatura" "text",
    "assinado_em" timestamp with time zone,
    "recusado_em" timestamp with time zone,
    "motivo_recusa" "text",
    "notificado_em" timestamp with time zone,
    "ultimo_lembrete_em" timestamp with time zone,
    "lembretes_enviados" smallint DEFAULT 0 NOT NULL,
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "as_signatarios_assinatura_texto_check" CHECK ((("assinatura_texto" IS NULL) OR ("char_length"("assinatura_texto") <= 100))),
    CONSTRAINT "as_signatarios_cpf_check" CHECK ((("cpf" IS NULL) OR ("cpf" ~ '^[0-9]{11}$'::"text"))),
    CONSTRAINT "as_signatarios_cpf_ck" CHECK (((NOT "exigir_cpf") OR ("papel" = 'assinar'::"public"."as_papel"))),
    CONSTRAINT "as_signatarios_email_check" CHECK (("email" = "lower"("email"))),
    CONSTRAINT "as_signatarios_lembretes_enviados_check" CHECK ((("lembretes_enviados" >= 0) AND ("lembretes_enviados" <= 10))),
    CONSTRAINT "as_signatarios_motivo_recusa_check" CHECK ((("motivo_recusa" IS NULL) OR (("char_length"("motivo_recusa") >= 1) AND ("char_length"("motivo_recusa") <= 500)))),
    CONSTRAINT "as_signatarios_nome_check" CHECK ((("char_length"("nome") >= 1) AND ("char_length"("nome") <= 100))),
    CONSTRAINT "as_signatarios_ordem_check" CHECK ((("ordem" >= 1) AND ("ordem" <= 10))),
    CONSTRAINT "as_signatarios_user_agent_assinatura_check" CHECK ((("user_agent_assinatura" IS NULL) OR ("char_length"("user_agent_assinatura") <= 500)))
);


ALTER TABLE "public"."as_signatarios" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."as_fn_envia_envelope"("p_envelope_id" "uuid", "p_conta_id" "uuid", "p_caminho" "text", "p_hash" "text", "p_tokens" "jsonb", "p_limite_diario" integer, "p_limites_nivel" integer[], "p_ator" "public"."as_ator", "p_ip" "inet" DEFAULT NULL::"inet", "p_user_agent" "text" DEFAULT NULL::"text") RETURNS SETOF "public"."as_signatarios"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."as_fn_envia_envelope"("p_envelope_id" "uuid", "p_conta_id" "uuid", "p_caminho" "text", "p_hash" "text", "p_tokens" "jsonb", "p_limite_diario" integer, "p_limites_nivel" integer[], "p_ator" "public"."as_ator", "p_ip" "inet", "p_user_agent" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."as_fn_evento_canonico"("p_envelope_id" "uuid", "p_seq" integer, "p_tipo" "public"."as_tipo_evento", "p_ator" "public"."as_ator", "p_signatario_id" "uuid", "p_ip" "inet", "p_user_agent" "text", "p_dados" "jsonb", "p_ocorrido_em" timestamp with time zone) RETURNS "text"
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  select concat_ws(
    e'\n',
    p_envelope_id::text,
    p_seq::text,
    p_tipo::text,
    p_ator::text,
    coalesce(p_signatario_id::text, ''),
    coalesce(pg_catalog.host(p_ip), ''),
    coalesce(p_user_agent, ''),
    p_dados::text,
    to_char(p_ocorrido_em at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
  );
$$;


ALTER FUNCTION "public"."as_fn_evento_canonico"("p_envelope_id" "uuid", "p_seq" integer, "p_tipo" "public"."as_tipo_evento", "p_ator" "public"."as_ator", "p_signatario_id" "uuid", "p_ip" "inet", "p_user_agent" "text", "p_dados" "jsonb", "p_ocorrido_em" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."as_fn_eventos_imutaveis"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  if tg_op = 'UPDATE' or pg_catalog.pg_trigger_depth() <= 1 then
    raise exception 'trilha_imutavel';
  end if;
  return old;
end;
$$;


ALTER FUNCTION "public"."as_fn_eventos_imutaveis"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."as_fn_filhos_congelados"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  v_envelope_id uuid;
  v_status public.as_status_envelope;
begin
  v_envelope_id := case when tg_op = 'DELETE' then old.envelope_id else new.envelope_id end;
  select status into v_status from public.as_envelopes where id = v_envelope_id;

  -- Envelope inexistente (cascata em andamento) ou ainda em rascunho: nada a conferir.
  if v_status is null or v_status = 'rascunho' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' then
    if pg_catalog.pg_trigger_depth() > 1 then
      return old;
    end if;
    raise exception 'envelope_congelado';
  end if;

  if tg_op = 'INSERT' then
    raise exception 'envelope_congelado';
  end if;

  if tg_table_name = 'as_signatarios' then
    if new.envelope_id is distinct from old.envelope_id
       or new.conta_id is distinct from old.conta_id
       or new.nome is distinct from old.nome
       or new.email is distinct from old.email
       or new.papel is distinct from old.papel
       or new.ordem is distinct from old.ordem
       or new.exigir_cpf is distinct from old.exigir_cpf
    then
      raise exception 'envelope_congelado';
    end if;
  else
    if new.envelope_id is distinct from old.envelope_id
       or new.signatario_id is distinct from old.signatario_id
       or new.tipo is distinct from old.tipo
       or new.pagina is distinct from old.pagina
       or new.x is distinct from old.x
       or new.y is distinct from old.y
       or new.largura is distinct from old.largura
       or new.altura is distinct from old.altura
       or new.obrigatorio is distinct from old.obrigatorio
       or new.rotulo is distinct from old.rotulo
    then
      raise exception 'envelope_congelado';
    end if;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."as_fn_filhos_congelados"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."as_eventos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "envelope_id" "uuid" NOT NULL,
    "seq" integer NOT NULL,
    "tipo" "public"."as_tipo_evento" NOT NULL,
    "ator" "public"."as_ator" NOT NULL,
    "signatario_id" "uuid",
    "ip" "inet",
    "user_agent" "text",
    "dados" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "ocorrido_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "hash_anterior" "text" NOT NULL,
    "hash" "text" NOT NULL,
    CONSTRAINT "as_eventos_hash_anterior_check" CHECK (("hash_anterior" ~ '^[0-9a-f]{64}$'::"text")),
    CONSTRAINT "as_eventos_hash_check" CHECK (("hash" ~ '^[0-9a-f]{64}$'::"text")),
    CONSTRAINT "as_eventos_seq_check" CHECK (("seq" >= 1)),
    CONSTRAINT "as_eventos_user_agent_check" CHECK ((("user_agent" IS NULL) OR ("char_length"("user_agent") <= 500)))
);


ALTER TABLE "public"."as_eventos" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."as_fn_registra_evento"("p_envelope_id" "uuid", "p_tipo" "public"."as_tipo_evento", "p_ator" "public"."as_ator", "p_signatario_id" "uuid" DEFAULT NULL::"uuid", "p_ip" "inet" DEFAULT NULL::"inet", "p_user_agent" "text" DEFAULT NULL::"text", "p_dados" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "public"."as_eventos"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  v_seq integer;
  v_anterior text;
  v_quando timestamptz := clock_timestamp();
  v_ua text := left(p_user_agent, 500);
  v_dados jsonb := coalesce(p_dados, '{}'::jsonb);
  v_linha public.as_eventos;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_envelope_id::text, 0));

  select e.seq, e.hash into v_seq, v_anterior
    from public.as_eventos e
   where e.envelope_id = p_envelope_id
   order by e.seq desc
   limit 1;

  v_seq := coalesce(v_seq, 0) + 1;
  v_anterior := coalesce(v_anterior, repeat('0', 64));

  insert into public.as_eventos (envelope_id, seq, tipo, ator, signatario_id, ip, user_agent, dados, ocorrido_em, hash_anterior, hash)
  values (
    p_envelope_id, v_seq, p_tipo, p_ator, p_signatario_id, p_ip, v_ua, v_dados, v_quando, v_anterior,
    encode(extensions.digest(
      v_anterior || e'\n' || public.as_fn_evento_canonico(p_envelope_id, v_seq, p_tipo, p_ator, p_signatario_id, p_ip, v_ua, v_dados, v_quando),
      'sha256'), 'hex')
  )
  returning * into v_linha;

  return v_linha;
end;
$$;


ALTER FUNCTION "public"."as_fn_registra_evento"("p_envelope_id" "uuid", "p_tipo" "public"."as_tipo_evento", "p_ator" "public"."as_ator", "p_signatario_id" "uuid", "p_ip" "inet", "p_user_agent" "text", "p_dados" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."as_fn_reserva_notificacao"("p_id" "uuid", "p_max_tentativas" integer) RETURNS boolean
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."as_fn_reserva_notificacao"("p_id" "uuid", "p_max_tentativas" integer) OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."as_campos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "envelope_id" "uuid" NOT NULL,
    "signatario_id" "uuid" NOT NULL,
    "tipo" "public"."as_tipo_campo" NOT NULL,
    "pagina" smallint NOT NULL,
    "x" numeric(6,5) NOT NULL,
    "y" numeric(6,5) NOT NULL,
    "largura" numeric(6,5) NOT NULL,
    "altura" numeric(6,5) NOT NULL,
    "obrigatorio" boolean DEFAULT true NOT NULL,
    "rotulo" "text",
    "valor" "text",
    CONSTRAINT "as_campos_altura_check" CHECK (("altura" > (0)::numeric)),
    CONSTRAINT "as_campos_dentro_ck" CHECK (((("x" + "largura") <= (1)::numeric) AND (("y" + "altura") <= (1)::numeric))),
    CONSTRAINT "as_campos_largura_check" CHECK (("largura" > (0)::numeric)),
    CONSTRAINT "as_campos_obrigatorio_ck" CHECK (("obrigatorio" OR ("tipo" = ANY (ARRAY['texto'::"public"."as_tipo_campo", 'caixa'::"public"."as_tipo_campo"])))),
    CONSTRAINT "as_campos_pagina_check" CHECK (("pagina" >= 1)),
    CONSTRAINT "as_campos_rotulo_check" CHECK ((("rotulo" IS NULL) OR ("char_length"("rotulo") <= 60))),
    CONSTRAINT "as_campos_valor_check" CHECK ((("valor" IS NULL) OR ("char_length"("valor") <= 200))),
    CONSTRAINT "as_campos_x_check" CHECK ((("x" >= (0)::numeric) AND ("x" <= (1)::numeric))),
    CONSTRAINT "as_campos_y_check" CHECK ((("y" >= (0)::numeric) AND ("y" <= (1)::numeric)))
);


ALTER TABLE "public"."as_campos" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."as_fn_substitui_campos"("p_envelope_id" "uuid", "p_conta_id" "uuid", "p_lista" "jsonb") RETURNS SETOF "public"."as_campos"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."as_fn_substitui_campos"("p_envelope_id" "uuid", "p_conta_id" "uuid", "p_lista" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."as_fn_substitui_signatarios"("p_envelope_id" "uuid", "p_conta_id" "uuid", "p_lista" "jsonb") RETURNS SETOF "public"."as_signatarios"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  v_status public.as_status_envelope;
  v_item jsonb;
  v_posicao integer := 0;
  v_ordem smallint;
  v_papel public.as_papel;
  v_email text;
  v_emails text[] := '{}';
  v_assinantes integer := 0;
  v_copias integer := 0;
begin
  select status into v_status from public.as_envelopes where id = p_envelope_id and conta_id = p_conta_id for update;
  if v_status is null then
    raise exception 'nao_encontrado';
  end if;
  if v_status <> 'rascunho' then
    raise exception 'envelope_congelado';
  end if;

  for v_item in select value from jsonb_array_elements(coalesce(p_lista, '[]'::jsonb)) loop
    v_papel := coalesce(v_item ->> 'papel', 'assinar')::public.as_papel;
    if v_papel = 'assinar' then v_assinantes := v_assinantes + 1; else v_copias := v_copias + 1; end if;
    v_emails := v_emails || lower(trim(v_item ->> 'email'));
  end loop;
  -- E-mail repetido na lista: sem esta checagem o ON CONFLICT abaixo juntaria as duas pessoas numa só.
  if cardinality(v_emails) <> (select count(distinct e) from unnest(v_emails) e) then
    raise exception 'email_repetido';
  end if;
  -- Limites da regra 11.2 (os mesmos de src/lib/limits.ts: MAX_ASSINANTES e MAX_COPIAS).
  if v_assinantes > 10 then raise exception 'assinantes_demais'; end if;
  if v_copias > 5 then raise exception 'copias_demais'; end if;

  -- Quem saiu da lista: apagado (campos em cascata).
  delete from public.as_signatarios
   where envelope_id = p_envelope_id and not (email = any (v_emails));

  v_assinantes := 0;
  for v_item in select value from jsonb_array_elements(coalesce(p_lista, '[]'::jsonb)) loop
    v_posicao := v_posicao + 1;
    v_papel := coalesce(v_item ->> 'papel', 'assinar')::public.as_papel;
    v_email := lower(trim(v_item ->> 'email'));
    if v_papel = 'assinar' then
      v_assinantes := v_assinantes + 1;
      v_ordem := v_assinantes;
    else
      v_ordem := 1;
    end if;

    insert into public.as_signatarios (envelope_id, conta_id, papel, ordem, nome, email, exigir_cpf, token_hash)
    values (
      p_envelope_id, p_conta_id, v_papel, v_ordem, trim(v_item ->> 'nome'), v_email,
      coalesce((v_item ->> 'exigir_cpf')::boolean, false) and v_papel = 'assinar',
      encode(extensions.digest(extensions.gen_random_bytes(32), 'sha256'), 'hex')
    )
    on conflict (envelope_id, email) do update
      set papel = excluded.papel,
          ordem = excluded.ordem,
          nome = excluded.nome,
          exigir_cpf = excluded.exigir_cpf;

    -- Quem deixou de assinar e virou cópia perde os campos (campo é só de assinante, 7.5).
    if v_papel = 'copia' then
      delete from public.as_campos c
       using public.as_signatarios s
       where s.envelope_id = p_envelope_id and s.email = v_email and c.signatario_id = s.id;
    end if;
  end loop;

  return query
    select s.* from public.as_signatarios s
     where s.envelope_id = p_envelope_id
     order by array_position(v_emails, s.email);
end;
$$;


ALTER FUNCTION "public"."as_fn_substitui_signatarios"("p_envelope_id" "uuid", "p_conta_id" "uuid", "p_lista" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."as_fn_transicao_envelope"("p_envelope_id" "uuid", "p_de" "public"."as_status_envelope", "p_para" "public"."as_status_envelope") RETURNS boolean
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  update public.as_envelopes set status = p_para where id = p_envelope_id and status = p_de;
  return found;
end;
$$;


ALTER FUNCTION "public"."as_fn_transicao_envelope"("p_envelope_id" "uuid", "p_de" "public"."as_status_envelope", "p_para" "public"."as_status_envelope") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."as_fn_valida_campo"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  v_paginas smallint;
  v_ok boolean;
begin
  select paginas into v_paginas from public.as_envelopes where id = new.envelope_id;
  if v_paginas is null or new.pagina > v_paginas then
    raise exception 'campo_invalido';
  end if;
  select exists (
    select 1 from public.as_signatarios s
     where s.id = new.signatario_id and s.envelope_id = new.envelope_id and s.papel = 'assinar'
  ) into v_ok;
  if not v_ok then
    raise exception 'campo_invalido';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."as_fn_valida_campo"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."as_fn_verifica_trilha"("p_envelope_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO ''
    AS $$
declare
  v_ev public.as_eventos;
  v_esperado_seq integer := 1;
  v_anterior text := repeat('0', 64);
begin
  for v_ev in
    select * from public.as_eventos where envelope_id = p_envelope_id order by seq
  loop
    if v_ev.seq <> v_esperado_seq
       or v_ev.hash_anterior <> v_anterior
       or v_ev.hash <> encode(extensions.digest(
            v_anterior || e'\n' || public.as_fn_evento_canonico(v_ev.envelope_id, v_ev.seq, v_ev.tipo, v_ev.ator,
              v_ev.signatario_id, v_ev.ip, v_ev.user_agent, v_ev.dados, v_ev.ocorrido_em),
            'sha256'), 'hex')
    then
      return v_ev.seq;
    end if;
    v_anterior := v_ev.hash;
    v_esperado_seq := v_esperado_seq + 1;
  end loop;
  return null;
end;
$$;


ALTER FUNCTION "public"."as_fn_verifica_trilha"("p_envelope_id" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."as_contas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "google_sub" "text" NOT NULL,
    "email" "text" NOT NULL,
    "nome" "text" NOT NULL,
    "termos_aceitos_em" timestamp with time zone,
    "suspensa_em" timestamp with time zone,
    "nivel" smallint DEFAULT 1 NOT NULL,
    "webhook_url" "text",
    "webhook_segredo_cifrado" "text",
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "atualizado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "as_contas_email_check" CHECK (("email" = "lower"("email"))),
    CONSTRAINT "as_contas_nivel_check" CHECK ((("nivel" >= 1) AND ("nivel" <= 3))),
    CONSTRAINT "as_contas_nome_check" CHECK ((("char_length"("nome") >= 1) AND ("char_length"("nome") <= 100))),
    CONSTRAINT "as_contas_webhook_ck" CHECK ((("webhook_url" IS NULL) = ("webhook_segredo_cifrado" IS NULL))),
    CONSTRAINT "as_contas_webhook_url_check" CHECK ((("webhook_url" IS NULL) OR (("webhook_url" ~~ 'https://%'::"text") AND ("char_length"("webhook_url") <= 500))))
);


ALTER TABLE "public"."as_contas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."as_credenciais" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conta_id" "uuid" NOT NULL,
    "tipo" "public"."as_tipo_credencial" NOT NULL,
    "nome" "text" NOT NULL,
    "prefixo" "text" NOT NULL,
    "valor_hash" "text" NOT NULL,
    "valor_cifrado" "text",
    "oauth_cliente_id" "uuid",
    "ultimo_uso_em" timestamp with time zone,
    "revogada_em" timestamp with time zone,
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "as_credenciais_cifrado_ck" CHECK ((("tipo" = 'api'::"public"."as_tipo_credencial") = ("valor_cifrado" IS NOT NULL)))
);


ALTER TABLE "public"."as_credenciais" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."as_entregas_webhook" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conta_id" "uuid" NOT NULL,
    "envelope_id" "uuid" NOT NULL,
    "evento" "text" NOT NULL,
    "corpo" "jsonb" NOT NULL,
    "status" "public"."as_status_entrega" DEFAULT 'pendente'::"public"."as_status_entrega" NOT NULL,
    "tentativas" smallint DEFAULT 0 NOT NULL,
    "ultimo_status_http" smallint,
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "entregue_em" timestamp with time zone,
    CONSTRAINT "as_entregas_webhook_evento_check" CHECK (("evento" = ANY (ARRAY['signatario.assinou'::"text", 'envelope.concluido'::"text", 'envelope.recusado'::"text", 'envelope.cancelado'::"text", 'envelope.expirado'::"text"]))),
    CONSTRAINT "as_entregas_webhook_tentativas_check" CHECK ((("tentativas" >= 0) AND ("tentativas" <= 6)))
);


ALTER TABLE "public"."as_entregas_webhook" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."as_envios" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conta_id" "uuid" NOT NULL,
    "enviado_em" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."as_envios" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."as_notificacoes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conta_id" "uuid" NOT NULL,
    "envelope_id" "uuid",
    "signatario_id" "uuid",
    "tipo" "public"."as_tipo_notificacao" NOT NULL,
    "chave" "text" NOT NULL,
    "status" "public"."as_status_notificacao" DEFAULT 'pendente'::"public"."as_status_notificacao" NOT NULL,
    "tentativas" smallint DEFAULT 0 NOT NULL,
    "resend_id" "text",
    "erro" "text",
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "enviada_em" timestamp with time zone,
    "reservada_em" timestamp with time zone,
    CONSTRAINT "as_notificacoes_envelope_ck" CHECK ((("envelope_id" IS NOT NULL) OR ("tipo" = 'finalizacao_falhou_admin'::"public"."as_tipo_notificacao"))),
    CONSTRAINT "as_notificacoes_tentativas_check" CHECK ((("tentativas" >= 0) AND ("tentativas" <= 5)))
);


ALTER TABLE "public"."as_notificacoes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."as_oauth_clientes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nome" "text" NOT NULL,
    "redirect_uris" "text"[] NOT NULL,
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "as_oauth_clientes_nome_check" CHECK ((("char_length"("nome") >= 1) AND ("char_length"("nome") <= 100))),
    CONSTRAINT "as_oauth_clientes_redirect_uris_check" CHECK ((("cardinality"("redirect_uris") >= 1) AND ("cardinality"("redirect_uris") <= 5)))
);


ALTER TABLE "public"."as_oauth_clientes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."as_oauth_codigos" (
    "codigo_hash" "text" NOT NULL,
    "cliente_id" "uuid" NOT NULL,
    "conta_id" "uuid" NOT NULL,
    "redirect_uri" "text" NOT NULL,
    "code_challenge" "text" NOT NULL,
    "expira_em" timestamp with time zone NOT NULL,
    "usado_em" timestamp with time zone
);


ALTER TABLE "public"."as_oauth_codigos" OWNER TO "postgres";


ALTER TABLE ONLY "public"."as_campos"
    ADD CONSTRAINT "as_campos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."as_contas"
    ADD CONSTRAINT "as_contas_google_sub_key" UNIQUE ("google_sub");



ALTER TABLE ONLY "public"."as_contas"
    ADD CONSTRAINT "as_contas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."as_credenciais"
    ADD CONSTRAINT "as_credenciais_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."as_credenciais"
    ADD CONSTRAINT "as_credenciais_valor_hash_key" UNIQUE ("valor_hash");



ALTER TABLE ONLY "public"."as_entregas_webhook"
    ADD CONSTRAINT "as_entregas_webhook_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."as_envelopes"
    ADD CONSTRAINT "as_envelopes_codigo_verificacao_key" UNIQUE ("codigo_verificacao");



ALTER TABLE ONLY "public"."as_envelopes"
    ADD CONSTRAINT "as_envelopes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."as_envios"
    ADD CONSTRAINT "as_envios_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."as_eventos"
    ADD CONSTRAINT "as_eventos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."as_eventos"
    ADD CONSTRAINT "as_eventos_seq_uk" UNIQUE ("envelope_id", "seq");



ALTER TABLE ONLY "public"."as_notificacoes"
    ADD CONSTRAINT "as_notificacoes_chave_key" UNIQUE ("chave");



ALTER TABLE ONLY "public"."as_notificacoes"
    ADD CONSTRAINT "as_notificacoes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."as_oauth_clientes"
    ADD CONSTRAINT "as_oauth_clientes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."as_oauth_codigos"
    ADD CONSTRAINT "as_oauth_codigos_pkey" PRIMARY KEY ("codigo_hash");



ALTER TABLE ONLY "public"."as_signatarios"
    ADD CONSTRAINT "as_signatarios_ordem_ex" EXCLUDE USING "gist" ("envelope_id" WITH =, "ordem" WITH =) WHERE (("papel" = 'assinar'::"public"."as_papel")) DEFERRABLE INITIALLY DEFERRED;



ALTER TABLE ONLY "public"."as_signatarios"
    ADD CONSTRAINT "as_signatarios_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."as_signatarios"
    ADD CONSTRAINT "as_signatarios_token_hash_key" UNIQUE ("token_hash");



CREATE INDEX "as_campos_envelope_idx" ON "public"."as_campos" USING "btree" ("envelope_id");



CREATE INDEX "as_campos_signatario_idx" ON "public"."as_campos" USING "btree" ("signatario_id");



CREATE INDEX "as_contas_criado_em_idx" ON "public"."as_contas" USING "btree" ("criado_em");



CREATE UNIQUE INDEX "as_credenciais_api_uk" ON "public"."as_credenciais" USING "btree" ("conta_id") WHERE (("tipo" = 'api'::"public"."as_tipo_credencial") AND ("revogada_em" IS NULL));



CREATE INDEX "as_credenciais_cliente_idx" ON "public"."as_credenciais" USING "btree" ("oauth_cliente_id");



CREATE INDEX "as_credenciais_conta_idx" ON "public"."as_credenciais" USING "btree" ("conta_id");



CREATE INDEX "as_entregas_conta_idx" ON "public"."as_entregas_webhook" USING "btree" ("conta_id");



CREATE INDEX "as_entregas_envelope_idx" ON "public"."as_entregas_webhook" USING "btree" ("envelope_id");



CREATE INDEX "as_entregas_status_idx" ON "public"."as_entregas_webhook" USING "btree" ("status") WHERE ("status" = 'pendente'::"public"."as_status_entrega");



CREATE INDEX "as_envelopes_conta_criado_idx" ON "public"."as_envelopes" USING "btree" ("conta_id", "criado_em" DESC);



CREATE UNIQUE INDEX "as_envelopes_idem_uk" ON "public"."as_envelopes" USING "btree" ("conta_id", "chave_idempotencia") WHERE ("chave_idempotencia" IS NOT NULL);



CREATE INDEX "as_envelopes_status_prazo_idx" ON "public"."as_envelopes" USING "btree" ("status", "prazo_em");



CREATE INDEX "as_envios_conta_enviado_idx" ON "public"."as_envios" USING "btree" ("conta_id", "enviado_em" DESC);



CREATE INDEX "as_eventos_signatario_idx" ON "public"."as_eventos" USING "btree" ("signatario_id");



CREATE INDEX "as_notificacoes_conta_idx" ON "public"."as_notificacoes" USING "btree" ("conta_id");



CREATE INDEX "as_notificacoes_envelope_idx" ON "public"."as_notificacoes" USING "btree" ("envelope_id");



CREATE INDEX "as_notificacoes_signatario_idx" ON "public"."as_notificacoes" USING "btree" ("signatario_id");



CREATE INDEX "as_notificacoes_status_idx" ON "public"."as_notificacoes" USING "btree" ("status") WHERE ("status" <> 'enviada'::"public"."as_status_notificacao");



CREATE INDEX "as_oauth_codigos_cliente_idx" ON "public"."as_oauth_codigos" USING "btree" ("cliente_id");



CREATE INDEX "as_oauth_codigos_conta_idx" ON "public"."as_oauth_codigos" USING "btree" ("conta_id");



CREATE INDEX "as_oauth_codigos_expira_idx" ON "public"."as_oauth_codigos" USING "btree" ("expira_em");



CREATE INDEX "as_signatarios_conta_idx" ON "public"."as_signatarios" USING "btree" ("conta_id");



CREATE UNIQUE INDEX "as_signatarios_email_uk" ON "public"."as_signatarios" USING "btree" ("envelope_id", "email");



CREATE OR REPLACE TRIGGER "as_tg_atualizado_em" BEFORE UPDATE ON "public"."as_contas" FOR EACH ROW EXECUTE FUNCTION "public"."as_fn_atualizado_em"();



CREATE OR REPLACE TRIGGER "as_tg_atualizado_em" BEFORE UPDATE ON "public"."as_envelopes" FOR EACH ROW EXECUTE FUNCTION "public"."as_fn_atualizado_em"();



CREATE OR REPLACE TRIGGER "as_tg_envelope_congelado" BEFORE UPDATE ON "public"."as_envelopes" FOR EACH ROW EXECUTE FUNCTION "public"."as_fn_envelope_congelado"();



CREATE OR REPLACE TRIGGER "as_tg_envelope_exclusao" BEFORE DELETE ON "public"."as_envelopes" FOR EACH ROW EXECUTE FUNCTION "public"."as_fn_envelope_exclusao"();



CREATE OR REPLACE TRIGGER "as_tg_envelope_nasce_rascunho" BEFORE INSERT ON "public"."as_envelopes" FOR EACH ROW EXECUTE FUNCTION "public"."as_fn_envelope_nasce_rascunho"();



CREATE OR REPLACE TRIGGER "as_tg_eventos_imutaveis" BEFORE DELETE OR UPDATE ON "public"."as_eventos" FOR EACH ROW EXECUTE FUNCTION "public"."as_fn_eventos_imutaveis"();



CREATE OR REPLACE TRIGGER "as_tg_filhos_congelados" BEFORE INSERT OR DELETE OR UPDATE ON "public"."as_campos" FOR EACH ROW EXECUTE FUNCTION "public"."as_fn_filhos_congelados"();



CREATE OR REPLACE TRIGGER "as_tg_filhos_congelados" BEFORE INSERT OR DELETE OR UPDATE ON "public"."as_signatarios" FOR EACH ROW EXECUTE FUNCTION "public"."as_fn_filhos_congelados"();



CREATE OR REPLACE TRIGGER "as_tg_valida_campo" BEFORE INSERT OR UPDATE ON "public"."as_campos" FOR EACH ROW EXECUTE FUNCTION "public"."as_fn_valida_campo"();



ALTER TABLE ONLY "public"."as_campos"
    ADD CONSTRAINT "as_campos_envelope_id_fkey" FOREIGN KEY ("envelope_id") REFERENCES "public"."as_envelopes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."as_campos"
    ADD CONSTRAINT "as_campos_signatario_id_fkey" FOREIGN KEY ("signatario_id") REFERENCES "public"."as_signatarios"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."as_credenciais"
    ADD CONSTRAINT "as_credenciais_conta_id_fkey" FOREIGN KEY ("conta_id") REFERENCES "public"."as_contas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."as_credenciais"
    ADD CONSTRAINT "as_credenciais_oauth_cliente_id_fkey" FOREIGN KEY ("oauth_cliente_id") REFERENCES "public"."as_oauth_clientes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."as_entregas_webhook"
    ADD CONSTRAINT "as_entregas_webhook_conta_id_fkey" FOREIGN KEY ("conta_id") REFERENCES "public"."as_contas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."as_entregas_webhook"
    ADD CONSTRAINT "as_entregas_webhook_envelope_id_fkey" FOREIGN KEY ("envelope_id") REFERENCES "public"."as_envelopes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."as_envelopes"
    ADD CONSTRAINT "as_envelopes_conta_id_fkey" FOREIGN KEY ("conta_id") REFERENCES "public"."as_contas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."as_envios"
    ADD CONSTRAINT "as_envios_conta_id_fkey" FOREIGN KEY ("conta_id") REFERENCES "public"."as_contas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."as_eventos"
    ADD CONSTRAINT "as_eventos_envelope_id_fkey" FOREIGN KEY ("envelope_id") REFERENCES "public"."as_envelopes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."as_eventos"
    ADD CONSTRAINT "as_eventos_signatario_id_fkey" FOREIGN KEY ("signatario_id") REFERENCES "public"."as_signatarios"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."as_notificacoes"
    ADD CONSTRAINT "as_notificacoes_conta_id_fkey" FOREIGN KEY ("conta_id") REFERENCES "public"."as_contas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."as_notificacoes"
    ADD CONSTRAINT "as_notificacoes_envelope_id_fkey" FOREIGN KEY ("envelope_id") REFERENCES "public"."as_envelopes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."as_notificacoes"
    ADD CONSTRAINT "as_notificacoes_signatario_id_fkey" FOREIGN KEY ("signatario_id") REFERENCES "public"."as_signatarios"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."as_oauth_codigos"
    ADD CONSTRAINT "as_oauth_codigos_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."as_oauth_clientes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."as_oauth_codigos"
    ADD CONSTRAINT "as_oauth_codigos_conta_id_fkey" FOREIGN KEY ("conta_id") REFERENCES "public"."as_contas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."as_signatarios"
    ADD CONSTRAINT "as_signatarios_conta_id_fkey" FOREIGN KEY ("conta_id") REFERENCES "public"."as_contas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."as_signatarios"
    ADD CONSTRAINT "as_signatarios_envelope_id_fkey" FOREIGN KEY ("envelope_id") REFERENCES "public"."as_envelopes"("id") ON DELETE CASCADE;



ALTER TABLE "public"."as_campos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."as_contas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."as_credenciais" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."as_entregas_webhook" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."as_envelopes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."as_envios" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."as_eventos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."as_notificacoes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."as_oauth_clientes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."as_oauth_codigos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."as_signatarios" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "public"."as_fn_anexa_arquivo"("p_envelope_id" "uuid", "p_conta_id" "uuid", "p_caminho" "text", "p_nome" "text", "p_tamanho" integer, "p_paginas" smallint, "p_dimensoes" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."as_fn_anexa_arquivo"("p_envelope_id" "uuid", "p_conta_id" "uuid", "p_caminho" "text", "p_nome" "text", "p_tamanho" integer, "p_paginas" smallint, "p_dimensoes" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."as_fn_atualizado_em"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."as_fn_atualizado_em"() TO "service_role";



GRANT ALL ON TABLE "public"."as_envelopes" TO "service_role";



REVOKE ALL ON FUNCTION "public"."as_fn_cria_rascunho"("p_conta_id" "uuid", "p_titulo" "text", "p_origem" "public"."as_origem", "p_codigo_verificacao" "text", "p_ator" "public"."as_ator", "p_ip" "inet", "p_user_agent" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."as_fn_cria_rascunho"("p_conta_id" "uuid", "p_titulo" "text", "p_origem" "public"."as_origem", "p_codigo_verificacao" "text", "p_ator" "public"."as_ator", "p_ip" "inet", "p_user_agent" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."as_fn_entra_conta"("p_google_sub" "text", "p_email" "text", "p_nome" "text", "p_chave_hash" "text", "p_chave_prefixo" "text", "p_chave_cifrada" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."as_fn_entra_conta"("p_google_sub" "text", "p_email" "text", "p_nome" "text", "p_chave_hash" "text", "p_chave_prefixo" "text", "p_chave_cifrada" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."as_fn_envelope_congelado"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."as_fn_envelope_congelado"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."as_fn_envelope_exclusao"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."as_fn_envelope_exclusao"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."as_fn_envelope_nasce_rascunho"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."as_fn_envelope_nasce_rascunho"() TO "service_role";



GRANT ALL ON TABLE "public"."as_signatarios" TO "service_role";



REVOKE ALL ON FUNCTION "public"."as_fn_envia_envelope"("p_envelope_id" "uuid", "p_conta_id" "uuid", "p_caminho" "text", "p_hash" "text", "p_tokens" "jsonb", "p_limite_diario" integer, "p_limites_nivel" integer[], "p_ator" "public"."as_ator", "p_ip" "inet", "p_user_agent" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."as_fn_envia_envelope"("p_envelope_id" "uuid", "p_conta_id" "uuid", "p_caminho" "text", "p_hash" "text", "p_tokens" "jsonb", "p_limite_diario" integer, "p_limites_nivel" integer[], "p_ator" "public"."as_ator", "p_ip" "inet", "p_user_agent" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."as_fn_evento_canonico"("p_envelope_id" "uuid", "p_seq" integer, "p_tipo" "public"."as_tipo_evento", "p_ator" "public"."as_ator", "p_signatario_id" "uuid", "p_ip" "inet", "p_user_agent" "text", "p_dados" "jsonb", "p_ocorrido_em" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."as_fn_evento_canonico"("p_envelope_id" "uuid", "p_seq" integer, "p_tipo" "public"."as_tipo_evento", "p_ator" "public"."as_ator", "p_signatario_id" "uuid", "p_ip" "inet", "p_user_agent" "text", "p_dados" "jsonb", "p_ocorrido_em" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."as_fn_eventos_imutaveis"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."as_fn_eventos_imutaveis"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."as_fn_filhos_congelados"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."as_fn_filhos_congelados"() TO "service_role";



GRANT ALL ON TABLE "public"."as_eventos" TO "service_role";



REVOKE ALL ON FUNCTION "public"."as_fn_registra_evento"("p_envelope_id" "uuid", "p_tipo" "public"."as_tipo_evento", "p_ator" "public"."as_ator", "p_signatario_id" "uuid", "p_ip" "inet", "p_user_agent" "text", "p_dados" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."as_fn_registra_evento"("p_envelope_id" "uuid", "p_tipo" "public"."as_tipo_evento", "p_ator" "public"."as_ator", "p_signatario_id" "uuid", "p_ip" "inet", "p_user_agent" "text", "p_dados" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."as_fn_reserva_notificacao"("p_id" "uuid", "p_max_tentativas" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."as_fn_reserva_notificacao"("p_id" "uuid", "p_max_tentativas" integer) TO "service_role";



GRANT ALL ON TABLE "public"."as_campos" TO "service_role";



REVOKE ALL ON FUNCTION "public"."as_fn_substitui_campos"("p_envelope_id" "uuid", "p_conta_id" "uuid", "p_lista" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."as_fn_substitui_campos"("p_envelope_id" "uuid", "p_conta_id" "uuid", "p_lista" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."as_fn_substitui_signatarios"("p_envelope_id" "uuid", "p_conta_id" "uuid", "p_lista" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."as_fn_substitui_signatarios"("p_envelope_id" "uuid", "p_conta_id" "uuid", "p_lista" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."as_fn_transicao_envelope"("p_envelope_id" "uuid", "p_de" "public"."as_status_envelope", "p_para" "public"."as_status_envelope") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."as_fn_transicao_envelope"("p_envelope_id" "uuid", "p_de" "public"."as_status_envelope", "p_para" "public"."as_status_envelope") TO "service_role";



REVOKE ALL ON FUNCTION "public"."as_fn_valida_campo"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."as_fn_valida_campo"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."as_fn_verifica_trilha"("p_envelope_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."as_fn_verifica_trilha"("p_envelope_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."as_contas" TO "service_role";



GRANT ALL ON TABLE "public"."as_credenciais" TO "service_role";



GRANT ALL ON TABLE "public"."as_entregas_webhook" TO "service_role";



GRANT ALL ON TABLE "public"."as_envios" TO "service_role";



GRANT ALL ON TABLE "public"."as_notificacoes" TO "service_role";



GRANT ALL ON TABLE "public"."as_oauth_clientes" TO "service_role";



GRANT ALL ON TABLE "public"."as_oauth_codigos" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







