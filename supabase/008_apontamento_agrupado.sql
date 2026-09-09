-- Apontamento agrupado com rateio proporcional e trilha de auditoria.
create table if not exists public.grupos_apontamento(
 id uuid primary key default gen_random_uuid(),codigo_operacao text not null,
 operador_id uuid not null references public.perfis(id),maquina_id uuid not null references public.maquinas(id),
 criterio_rateio text not null check(criterio_rateio in('metros','peso','pecas')),
 inicio_em timestamptz not null default now(),termino_em timestamptz,observacao text,criado_por uuid not null references public.perfis(id)
);
alter table public.apontamentos add column if not exists grupo_id uuid references public.grupos_apontamento(id);
alter table public.apontamentos add column if not exists duracao_rateada_segundos bigint;
alter table public.apontamentos add column if not exists quantidade_rateio numeric(14,3);
alter table public.apontamentos add column if not exists criterio_rateio text;
alter table public.grupos_apontamento enable row level security;
drop policy if exists "usuarios consultam grupos" on public.grupos_apontamento;
create policy "usuarios consultam grupos" on public.grupos_apontamento for select to authenticated using(true);

create or replace function public.proteger_finalizacao_individual_de_grupo()
returns trigger language plpgsql set search_path=public as $$
begin
 if old.grupo_id is not null and old.termino_em is null and new.termino_em is not null
    and exists(select 1 from public.grupos_apontamento where id=old.grupo_id and termino_em is null) then
  raise exception 'Este apontamento pertence a um grupo. Finalize pelo modo OPs agrupadas.';
 end if;
 return new;
end;$$;
drop trigger if exists proteger_finalizacao_individual_de_grupo on public.apontamentos;
create trigger proteger_finalizacao_individual_de_grupo before update of termino_em on public.apontamentos for each row execute function public.proteger_finalizacao_individual_de_grupo();

create or replace function public.iniciar_apontamento_agrupado(p_codigo_operacao text,p_operador_id uuid,p_maquina_id uuid,p_criterio text,p_itens jsonb,p_observacao text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_grupo uuid;v_item jsonb;v_operacao uuid;v_ordem uuid;v_status public.status_operacao;v_perfil public.perfil_usuario;
begin
 select perfil into v_perfil from public.perfis where id=auth.uid() and ativo;
 if v_perfil is null then raise exception 'Usuário sem perfil ativo.';end if;
 if p_operador_id<>auth.uid() and v_perfil not in('pcp','lider','admin') then raise exception 'Operador não autorizado.';end if;
 if not exists(select 1 from public.perfis where id=p_operador_id and ativo) then raise exception 'Operador inválido ou inativo.';end if;
 if not exists(select 1 from public.maquinas where id=p_maquina_id and ativa) then raise exception 'Máquina inválida ou inativa.';end if;
 if p_criterio not in('metros','peso','pecas') then raise exception 'Critério de rateio inválido.';end if;
 if jsonb_array_length(p_itens)<2 then raise exception 'Informe ao menos duas OPs.';end if;
 if exists(select 1 from jsonb_array_elements(p_itens) x where coalesce((x->>'quantidade')::numeric,0)<=0) then raise exception 'Todas as quantidades devem ser maiores que zero.';end if;
 insert into public.grupos_apontamento(codigo_operacao,operador_id,maquina_id,criterio_rateio,observacao,criado_por) values(lpad(trim(p_codigo_operacao),4,'0'),p_operador_id,p_maquina_id,p_criterio,nullif(trim(p_observacao),''),auth.uid()) returning id into v_grupo;
 for v_item in select * from jsonb_array_elements(p_itens) loop
  v_operacao=(v_item->>'operacao_id')::uuid;
  select ordem_producao_id,status into v_ordem,v_status from public.operacoes where id=v_operacao and codigo=lpad(trim(p_codigo_operacao),4,'0') for update;
  if v_ordem is null or v_status not in('aguardando','liberada') then raise exception 'Uma das operações não está disponível.';end if;
  insert into public.apontamentos(operacao_id,operador_id,maquina_id,inicio_em,observacao,grupo_id,quantidade_rateio,criterio_rateio) values(v_operacao,p_operador_id,p_maquina_id,now(),nullif(trim(p_observacao),''),v_grupo,(v_item->>'quantidade')::numeric,p_criterio);
  update public.operacoes set status='em_andamento' where id=v_operacao;
  update public.ordens_producao set status='em_producao',atualizado_em=now() where id=v_ordem;
 end loop;
 return v_grupo;
end;$$;

create or replace function public.finalizar_apontamento_agrupado(p_grupo_id uuid,p_observacao text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_inicio timestamptz;v_operador uuid;v_perfil public.perfil_usuario;v_total bigint;v_soma numeric;v_usado bigint:=0;v_qtd integer;v_i integer:=0;v_reg record;
begin
 select inicio_em,operador_id into v_inicio,v_operador from public.grupos_apontamento where id=p_grupo_id and termino_em is null for update;
 if v_inicio is null then raise exception 'Grupo não encontrado ou já finalizado.';end if;
 select perfil into v_perfil from public.perfis where id=auth.uid() and ativo;
 if v_operador<>auth.uid() and v_perfil not in('pcp','lider','admin') then raise exception 'Somente o operador responsável pode finalizar.';end if;
 v_total=greatest(0,floor(extract(epoch from(now()-v_inicio))));
 select sum(quantidade_rateio),count(*) into v_soma,v_qtd from public.apontamentos where grupo_id=p_grupo_id and termino_em is null;
 update public.grupos_apontamento set termino_em=now(),observacao=coalesce(nullif(trim(p_observacao),''),observacao) where id=p_grupo_id;
 for v_reg in select id,operacao_id,quantidade_rateio from public.apontamentos where grupo_id=p_grupo_id and termino_em is null order by id loop
  v_i=v_i+1;
  update public.apontamentos set termino_em=now(),duracao_rateada_segundos=case when v_i=v_qtd then v_total-v_usado else floor(v_total*v_reg.quantidade_rateio/v_soma) end,observacao=coalesce(nullif(trim(p_observacao),''),observacao) where id=v_reg.id;
  if v_i<v_qtd then v_usado=v_usado+floor(v_total*v_reg.quantidade_rateio/v_soma);end if;
  update public.operacoes set status='finalizada' where id=v_reg.operacao_id;
 end loop;
 update public.ordens_producao op set status=case when not exists(select 1 from public.operacoes o where o.ordem_producao_id=op.id and o.status<>'finalizada') then 'finalizada'::public.status_op else 'em_producao'::public.status_op end,atualizado_em=now() where exists(select 1 from public.operacoes o join public.apontamentos a on a.operacao_id=o.id where o.ordem_producao_id=op.id and a.grupo_id=p_grupo_id);
 return p_grupo_id;
end;$$;
revoke all on function public.iniciar_apontamento_agrupado(text,uuid,uuid,text,jsonb,text),public.finalizar_apontamento_agrupado(uuid,text) from public;
grant execute on function public.iniciar_apontamento_agrupado(text,uuid,uuid,text,jsonb,text),public.finalizar_apontamento_agrupado(uuid,text) to authenticated;
