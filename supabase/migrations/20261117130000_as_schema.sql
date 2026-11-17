-- Assina — schema (spec.md, seções 7.2 e 7.3).
-- Projeto Supabase compartilhado: todo objeto leva o prefixo as_ (seção 4).
-- Acesso só pelo servidor com service role: RLS ligado e SEM política em todas as tabelas, e
-- nenhum privilégio para anon/authenticated (seção 6.5). Timestamps em UTC.

-- ---------------------------------------------------------------------------------------------
-- Enums (seção 7.2)
-- ---------------------------------------------------------------------------------------------
create type public.as_status_envelope as enum ('rascunho', 'enviado', 'finalizando', 'concluido', 'recusado', 'cancelado', 'expirado');
create type public.as_status_signatario as enum ('pendente', 'aguardando', 'assinou', 'recusou');
create type public.as_papel as enum ('assinar', 'copia');
create type public.as_tipo_campo as enum ('assinatura', 'rubrica', 'data', 'nome', 'texto', 'caixa');
create type public.as_metodo_assinatura as enum ('digitada', 'desenhada');
create type public.as_origem as enum ('painel', 'api', 'mcp');
create type public.as_tipo_credencial as enum ('api', 'mcp');
create type public.as_ator as enum ('remetente', 'signatario', 'sistema', 'api', 'mcp');
create type public.as_tipo_evento as enum (
  'criado', 'enviado', 'convite_enviado', 'codigo_enviado', 'codigo_validado', 'codigo_recusado',
  'visualizou', 'consentiu', 'assinou', 'recusou', 'lembrete_enviado', 'finalizado', 'concluido',
  'cancelado', 'expirado', 'baixou_original', 'baixou_final'
);
create type public.as_tipo_notificacao as enum (
  'convite', 'codigo', 'lembrete', 'concluido_destinatario', 'concluido_remetente', 'assinou_remetente',
  'recusado_remetente', 'recusado_destinatario', 'cancelado_destinatario', 'expirado_remetente',
  'finalizacao_falhou_admin'
);
create type public.as_status_notificacao as enum ('pendente', 'enviada', 'falhou');
create type public.as_status_entrega as enum ('pendente', 'entregue', 'falhou');

-- ---------------------------------------------------------------------------------------------
-- as_contas: uma por conta Google do remetente (7.3). nivel = regra 11.20.
-- ---------------------------------------------------------------------------------------------
create table public.as_contas (
  id uuid primary key default gen_random_uuid(),
  google_sub text not null unique,
  email text not null check (email = lower(email)),
  nome text not null check (char_length(nome) between 1 and 100),
  termos_aceitos_em timestamptz,
  suspensa_em timestamptz,
  nivel smallint not null default 1 check (nivel between 1 and 3),
  webhook_url text check (webhook_url is null or (webhook_url like 'https://%' and char_length(webhook_url) <= 500)),
  webhook_segredo_cifrado text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  -- O segredo do webhook existe se e só se existe a URL (7.3).
  constraint as_contas_webhook_ck check ((webhook_url is null) = (webhook_segredo_cifrado is null))
);
create index as_contas_criado_em_idx on public.as_contas (criado_em);

-- ---------------------------------------------------------------------------------------------
-- OAuth do MCP (seção 6.4)
-- ---------------------------------------------------------------------------------------------
create table public.as_oauth_clientes (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (char_length(nome) between 1 and 100),
  redirect_uris text[] not null check (cardinality(redirect_uris) between 1 and 5),
  criado_em timestamptz not null default now()
);

create table public.as_oauth_codigos (
  codigo_hash text primary key,
  cliente_id uuid not null references public.as_oauth_clientes (id) on delete cascade,
  conta_id uuid not null references public.as_contas (id) on delete cascade,
  redirect_uri text not null,
  code_challenge text not null,
  expira_em timestamptz not null,
  usado_em timestamptz
);
create index as_oauth_codigos_cliente_idx on public.as_oauth_codigos (cliente_id);
create index as_oauth_codigos_conta_idx on public.as_oauth_codigos (conta_id);
create index as_oauth_codigos_expira_idx on public.as_oauth_codigos (expira_em);

-- ---------------------------------------------------------------------------------------------
-- as_credenciais: chave de API (uma ativa por conta, 11.8) e tokens do MCP (6.3)
-- ---------------------------------------------------------------------------------------------
create table public.as_credenciais (
  id uuid primary key default gen_random_uuid(),
  conta_id uuid not null references public.as_contas (id) on delete cascade,
  tipo public.as_tipo_credencial not null,
  nome text not null,
  prefixo text not null,
  valor_hash text not null unique,
  valor_cifrado text,
  oauth_cliente_id uuid references public.as_oauth_clientes (id) on delete set null,
  ultimo_uso_em timestamptz,
  revogada_em timestamptz,
  criado_em timestamptz not null default now(),
  -- Só a chave de API guarda o valor cifrado; o token MCP só existe como hash (6.3).
  constraint as_credenciais_cifrado_ck check ((tipo = 'api') = (valor_cifrado is not null))
);
create index as_credenciais_conta_idx on public.as_credenciais (conta_id);
create index as_credenciais_cliente_idx on public.as_credenciais (oauth_cliente_id);
create unique index as_credenciais_api_uk on public.as_credenciais (conta_id) where tipo = 'api' and revogada_em is null;

-- ---------------------------------------------------------------------------------------------
-- as_envelopes (7.3)
-- ---------------------------------------------------------------------------------------------
create table public.as_envelopes (
  id uuid primary key default gen_random_uuid(),
  conta_id uuid not null references public.as_contas (id) on delete cascade,
  titulo text not null check (char_length(titulo) between 1 and 120),
  mensagem text check (mensagem is null or char_length(mensagem) <= 1000),
  status public.as_status_envelope not null default 'rascunho',
  origem public.as_origem not null,
  em_ordem boolean not null default false,
  prazo_dias smallint not null default 30 check (prazo_dias between 1 and 90),
  prazo_em timestamptz,
  lembrete_cada_dias smallint default 3 check (lembrete_cada_dias is null or lembrete_cada_dias in (2, 3, 7)),
  nome_arquivo text check (nome_arquivo is null or char_length(nome_arquivo) <= 200),
  arquivo_original_path text,
  tamanho_bytes integer check (tamanho_bytes is null or tamanho_bytes between 1 and 10485760),
  paginas smallint check (paginas is null or paginas between 1 and 100),
  dimensoes_paginas jsonb,
  hash_original text check (hash_original is null or hash_original ~ '^[0-9a-f]{64}$'),
  arquivo_final_path text,
  hash_final text check (hash_final is null or hash_final ~ '^[0-9a-f]{64}$'),
  selo text check (selo is null or selo in ('B-B', 'B-T')),
  codigo_verificacao text not null unique check (codigo_verificacao ~ '^[0-9A-HJKMNP-TV-Z]{12}$'),
  chave_idempotencia text check (chave_idempotencia is null or char_length(chave_idempotencia) between 1 and 100),
  tentativas_finalizacao smallint not null default 0,
  motivo_cancelamento text check (motivo_cancelamento is null or char_length(motivo_cancelamento) <= 500),
  enviado_em timestamptz,
  concluido_em timestamptz,
  encerrado_em timestamptz,
  arquivos_expurgados_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index as_envelopes_conta_criado_idx on public.as_envelopes (conta_id, criado_em desc);
create index as_envelopes_status_prazo_idx on public.as_envelopes (status, prazo_em);
create unique index as_envelopes_idem_uk on public.as_envelopes (conta_id, chave_idempotencia) where chave_idempotencia is not null;

-- ---------------------------------------------------------------------------------------------
-- as_signatarios: assinantes e cópias (7.3)
-- ---------------------------------------------------------------------------------------------
create table public.as_signatarios (
  id uuid primary key default gen_random_uuid(),
  envelope_id uuid not null references public.as_envelopes (id) on delete cascade,
  conta_id uuid not null references public.as_contas (id) on delete cascade,
  papel public.as_papel not null default 'assinar',
  ordem smallint not null default 1 check (ordem between 1 and 10),
  nome text not null check (char_length(nome) between 1 and 100),
  email text not null check (email = lower(email)),
  exigir_cpf boolean not null default false,
  cpf text check (cpf is null or cpf ~ '^[0-9]{11}$'),
  status public.as_status_signatario not null default 'pendente',
  token_hash text not null unique,
  codigo_hash text,
  codigo_expira_em timestamptz,
  codigo_tentativas smallint not null default 0,
  codigos_enviados_hora smallint not null default 0,
  janela_codigos_desde timestamptz,
  consentimento_versao text,
  metodo_assinatura public.as_metodo_assinatura,
  assinatura_texto text check (assinatura_texto is null or char_length(assinatura_texto) <= 100),
  assinatura_imagem_path text,
  rubrica_texto text,
  rubrica_imagem_path text,
  ip_assinatura inet,
  user_agent_assinatura text check (user_agent_assinatura is null or char_length(user_agent_assinatura) <= 500),
  assinado_em timestamptz,
  recusado_em timestamptz,
  motivo_recusa text check (motivo_recusa is null or char_length(motivo_recusa) between 1 and 500),
  notificado_em timestamptz,
  ultimo_lembrete_em timestamptz,
  lembretes_enviados smallint not null default 0 check (lembretes_enviados between 0 and 10),
  criado_em timestamptz not null default now(),
  -- CPF só pode ser exigido de quem assina (7.3).
  constraint as_signatarios_cpf_ck check (not exigir_cpf or papel = 'assinar')
);
create unique index as_signatarios_email_uk on public.as_signatarios (envelope_id, email);
create unique index as_signatarios_ordem_uk on public.as_signatarios (envelope_id, ordem) where papel = 'assinar';
create index as_signatarios_conta_idx on public.as_signatarios (conta_id);

-- ---------------------------------------------------------------------------------------------
-- as_campos: campos posicionados em fração da página (7.3, regra 11.3)
-- ---------------------------------------------------------------------------------------------
create table public.as_campos (
  id uuid primary key default gen_random_uuid(),
  envelope_id uuid not null references public.as_envelopes (id) on delete cascade,
  signatario_id uuid not null references public.as_signatarios (id) on delete cascade,
  tipo public.as_tipo_campo not null,
  pagina smallint not null check (pagina >= 1),
  x numeric(6,5) not null check (x >= 0 and x <= 1),
  y numeric(6,5) not null check (y >= 0 and y <= 1),
  largura numeric(6,5) not null check (largura > 0),
  altura numeric(6,5) not null check (altura > 0),
  obrigatorio boolean not null default true,
  rotulo text check (rotulo is null or char_length(rotulo) <= 60),
  valor text check (valor is null or char_length(valor) <= 200),
  constraint as_campos_dentro_ck check (x + largura <= 1 and y + altura <= 1),
  -- Assinatura, rubrica, data e nome são sempre obrigatórios (7.3).
  constraint as_campos_obrigatorio_ck check (obrigatorio or tipo in ('texto', 'caixa'))
);
create index as_campos_envelope_idx on public.as_campos (envelope_id);
create index as_campos_signatario_idx on public.as_campos (signatario_id);

-- ---------------------------------------------------------------------------------------------
-- as_eventos: trilha de auditoria encadeada, só inserção (7.3, regra 11.6)
-- ---------------------------------------------------------------------------------------------
create table public.as_eventos (
  id uuid primary key default gen_random_uuid(),
  envelope_id uuid not null references public.as_envelopes (id) on delete cascade,
  seq integer not null check (seq >= 1),
  tipo public.as_tipo_evento not null,
  ator public.as_ator not null,
  signatario_id uuid references public.as_signatarios (id) on delete cascade,
  ip inet,
  user_agent text check (user_agent is null or char_length(user_agent) <= 500),
  dados jsonb not null default '{}',
  ocorrido_em timestamptz not null default now(),
  hash_anterior text not null check (hash_anterior ~ '^[0-9a-f]{64}$'),
  hash text not null check (hash ~ '^[0-9a-f]{64}$'),
  constraint as_eventos_seq_uk unique (envelope_id, seq)
);
create index as_eventos_signatario_idx on public.as_eventos (signatario_id);

-- ---------------------------------------------------------------------------------------------
-- as_notificacoes: cada e-mail, para idempotência e retentativa (7.3, regra 11.16)
-- ---------------------------------------------------------------------------------------------
create table public.as_notificacoes (
  id uuid primary key default gen_random_uuid(),
  conta_id uuid not null references public.as_contas (id) on delete cascade,
  envelope_id uuid references public.as_envelopes (id) on delete cascade,
  signatario_id uuid references public.as_signatarios (id) on delete cascade,
  tipo public.as_tipo_notificacao not null,
  chave text not null unique,
  status public.as_status_notificacao not null default 'pendente',
  tentativas smallint not null default 0 check (tentativas between 0 and 5),
  resend_id text,
  erro text,
  criado_em timestamptz not null default now(),
  enviada_em timestamptz,
  -- Só o alerta ao admin existe sem envelope (7.3).
  constraint as_notificacoes_envelope_ck check (envelope_id is not null or tipo = 'finalizacao_falhou_admin')
);
create index as_notificacoes_conta_idx on public.as_notificacoes (conta_id);
create index as_notificacoes_envelope_idx on public.as_notificacoes (envelope_id);
create index as_notificacoes_signatario_idx on public.as_notificacoes (signatario_id);
create index as_notificacoes_status_idx on public.as_notificacoes (status) where status <> 'enviada';

-- ---------------------------------------------------------------------------------------------
-- as_entregas_webhook (7.3, regra 11.17)
-- ---------------------------------------------------------------------------------------------
create table public.as_entregas_webhook (
  id uuid primary key default gen_random_uuid(),
  conta_id uuid not null references public.as_contas (id) on delete cascade,
  envelope_id uuid not null references public.as_envelopes (id) on delete cascade,
  evento text not null check (evento in ('signatario.assinou', 'envelope.concluido', 'envelope.recusado', 'envelope.cancelado', 'envelope.expirado')),
  corpo jsonb not null,
  status public.as_status_entrega not null default 'pendente',
  tentativas smallint not null default 0 check (tentativas between 0 and 6),
  ultimo_status_http smallint,
  criado_em timestamptz not null default now(),
  entregue_em timestamptz
);
create index as_entregas_conta_idx on public.as_entregas_webhook (conta_id);
create index as_entregas_envelope_idx on public.as_entregas_webhook (envelope_id);
create index as_entregas_status_idx on public.as_entregas_webhook (status) where status = 'pendente';

-- ---------------------------------------------------------------------------------------------
-- Autorização (seção 6.5): RLS ligado, nenhuma política, nenhum privilégio para anon/authenticated.
-- ---------------------------------------------------------------------------------------------
alter table public.as_contas enable row level security;
alter table public.as_oauth_clientes enable row level security;
alter table public.as_oauth_codigos enable row level security;
alter table public.as_credenciais enable row level security;
alter table public.as_envelopes enable row level security;
alter table public.as_signatarios enable row level security;
alter table public.as_campos enable row level security;
alter table public.as_eventos enable row level security;
alter table public.as_notificacoes enable row level security;
alter table public.as_entregas_webhook enable row level security;

revoke all on public.as_contas, public.as_oauth_clientes, public.as_oauth_codigos, public.as_credenciais,
  public.as_envelopes, public.as_signatarios, public.as_campos, public.as_eventos, public.as_notificacoes,
  public.as_entregas_webhook
  from anon, authenticated;
