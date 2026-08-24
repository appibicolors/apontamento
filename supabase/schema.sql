create extension if not exists pgcrypto;

create type public.perfil_usuario as enum ('pcp', 'operador', 'lider', 'admin', 'consulta');
create type public.status_op as enum ('rascunho', 'aguardando', 'em_producao', 'finalizada', 'cancelada');
create type public.status_operacao as enum ('aguardando', 'liberada', 'em_andamento', 'finalizada', 'bloqueada');

create table public.perfis (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  perfil public.perfil_usuario not null default 'operador',
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table public.maquinas (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nome text not null,
  setor text,
  ativa boolean not null default true
);

create table public.ordens_producao (
  id uuid primary key default gen_random_uuid(), numero_op text not null unique,
  cliente text not null, nf_entrada text, data_op date, codigo_artigo text,
  artigo text not null, pecas integer not null check (pecas >= 0),
  metros numeric(12,2) not null check (metros >= 0),
  peso numeric(12,3) not null check (peso >= 0),
  status public.status_op not null default 'rascunho',
  drive_file_id text, drive_url text, arquivo_hash text unique,
  dados_extraidos jsonb not null default '{}'::jsonb, confianca_extracao numeric(5,2),
  criado_por uuid references public.perfis(id), criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table public.operacoes (
  id uuid primary key default gen_random_uuid(),
  ordem_producao_id uuid not null references public.ordens_producao(id) on delete cascade,
  sequencia integer not null, codigo text not null, descricao text not null,
  status public.status_operacao not null default 'aguardando',
  unique (ordem_producao_id, sequencia)
);

create table public.apontamentos (
  id uuid primary key default gen_random_uuid(), operacao_id uuid not null references public.operacoes(id),
  operador_id uuid not null references public.perfis(id), maquina_id uuid not null references public.maquinas(id),
  inicio_em timestamptz not null default now(), termino_em timestamptz, observacao text,
  dispositivo_id text, criado_em timestamptz not null default now(),
  check (termino_em is null or termino_em >= inicio_em)
);

create unique index apenas_um_apontamento_aberto_por_operacao on public.apontamentos (operacao_id) where termino_em is null;

alter table public.perfis enable row level security;
alter table public.maquinas enable row level security;
alter table public.ordens_producao enable row level security;
alter table public.operacoes enable row level security;
alter table public.apontamentos enable row level security;

create policy "usuarios autenticados consultam perfis" on public.perfis for select to authenticated using (true);
create policy "usuarios autenticados consultam maquinas" on public.maquinas for select to authenticated using (true);
create policy "usuarios autenticados consultam ops" on public.ordens_producao for select to authenticated using (true);
create policy "usuarios autenticados consultam operacoes" on public.operacoes for select to authenticated using (true);
create policy "usuarios autenticados consultam apontamentos" on public.apontamentos for select to authenticated using (true);
create policy "operador cria proprio apontamento" on public.apontamentos for insert to authenticated with check (operador_id = auth.uid());
create policy "operador atualiza proprio apontamento" on public.apontamentos for update to authenticated using (operador_id = auth.uid()) with check (operador_id = auth.uid());
