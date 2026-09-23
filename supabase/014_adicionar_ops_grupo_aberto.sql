-- Inclusão retroativa e auditável de OPs esquecidas em grupo ainda aberto.
-- Execute uma vez no SQL Editor do Supabase.

create table if not exists public.auditoria_grupos_apontamento(
 id uuid primary key default gen_random_uuid(),
 grupo_id uuid not null references public.grupos_apontamento(id) on delete cascade,
 acao text not null check(acao in('adicionar_ops')),
 itens jsonb not null,
 motivo text not null,
 usuario_id uuid not null references public.perfis(id),
 criado_em timestamptz not null default now()
);
alter table public.auditoria_grupos_apontamento enable row level security;
drop policy if exists "admin consulta auditoria de grupos" on public.auditoria_grupos_apontamento;
create policy "admin consulta auditoria de grupos" on public.auditoria_grupos_apontamento for select to authenticated using(public.usuario_pode_administrar());

create or replace function public.adicionar_ops_apontamento_agrupado(p_grupo_id uuid,p_itens jsonb,p_motivo text)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_grupo public.grupos_apontamento%rowtype;v_perfil public.perfil_usuario;v_item jsonb;v_operacao uuid;v_ordem uuid;v_quantidade numeric;
begin
 select perfil into v_perfil from public.perfis where id=auth.uid() and ativo;
 if v_perfil is null then raise exception 'Usuário sem perfil ativo.';end if;
 select * into v_grupo from public.grupos_apontamento where id=p_grupo_id and termino_em is null for update;
 if v_grupo.id is null then raise exception 'Grupo não encontrado ou já finalizado.';end if;
 if v_grupo.operador_id<>auth.uid() and v_perfil not in('pcp','lider','admin') then raise exception 'Somente o operador responsável ou a liderança pode incluir OPs.';end if;
 if length(trim(coalesce(p_motivo,'')))<3 then raise exception 'Informe o motivo da inclusão.';end if;
 if p_itens is null or jsonb_typeof(p_itens)<>'array' or jsonb_array_length(p_itens)<1 then raise exception 'Informe ao menos uma OP.';end if;
 if exists(select 1 from jsonb_array_elements(p_itens) x where coalesce((x->>'quantidade')::numeric,0)<=0) then raise exception 'Todas as quantidades devem ser maiores que zero.';end if;
 for v_item in select * from jsonb_array_elements(p_itens) loop
  v_operacao=(v_item->>'operacao_id')::uuid;v_quantidade=(v_item->>'quantidade')::numeric;
  select ordem_producao_id into v_ordem from public.operacoes where id=v_operacao and codigo=v_grupo.codigo_operacao for update;
  if v_ordem is null then raise exception 'Uma das OPs não possui a operação do grupo.';end if;
  if exists(select 1 from public.ordens_producao where id=v_ordem and (encerrada_em is not null or status='cancelada')) then raise exception 'Uma das OPs está encerrada ou cancelada.';end if;
  if exists(select 1 from public.apontamentos where operacao_id=v_operacao and grupo_id=p_grupo_id) then raise exception 'Uma das OPs já pertence a este grupo.';end if;
  if exists(select 1 from public.apontamentos where operacao_id=v_operacao and termino_em is null) then raise exception 'Uma das operações já possui apontamento aberto.';end if;
  insert into public.apontamentos(operacao_id,operador_id,maquina_id,inicio_em,observacao,grupo_id,quantidade_rateio,criterio_rateio)
  values(v_operacao,v_grupo.operador_id,v_grupo.maquina_id,v_grupo.inicio_em,'Incluída após o início do grupo: '||trim(p_motivo),p_grupo_id,v_quantidade,v_grupo.criterio_rateio);
  update public.operacoes set status='em_andamento' where id=v_operacao;
  update public.ordens_producao set status='em_producao',atualizado_em=now() where id=v_ordem;
 end loop;
 insert into public.auditoria_grupos_apontamento(grupo_id,acao,itens,motivo,usuario_id)
 values(p_grupo_id,'adicionar_ops',p_itens,trim(p_motivo),auth.uid());
 return p_grupo_id;
end;$$;

revoke all on function public.adicionar_ops_apontamento_agrupado(uuid,jsonb,text) from public;
grant execute on function public.adicionar_ops_apontamento_agrupado(uuid,jsonb,text) to authenticated;
