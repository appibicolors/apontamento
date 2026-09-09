-- Múltiplas execuções por operação e encerramento administrativo da OP.
-- Não apaga apontamentos existentes. Execute uma vez no SQL Editor.
alter table public.ordens_producao add column if not exists encerrada_em timestamptz;
alter table public.ordens_producao add column if not exists encerrada_por uuid references public.perfis(id);
alter table public.ordens_producao add column if not exists motivo_encerramento text;
alter table public.apontamentos add column if not exists motivo_finalizacao text not null default 'normal';

create table if not exists public.auditoria_ordens(
 id uuid primary key default gen_random_uuid(),ordem_producao_id uuid not null references public.ordens_producao(id) on delete cascade,
 acao text not null check(acao in('encerrada','reaberta')),motivo text not null,
 usuario_id uuid not null references public.perfis(id),criado_em timestamptz not null default now()
);
alter table public.auditoria_ordens enable row level security;
drop policy if exists "admin consulta auditoria de ops" on public.auditoria_ordens;
create policy "admin consulta auditoria de ops" on public.auditoria_ordens for select to authenticated using(public.usuario_pode_administrar());

-- Estados antigos eram concluídos automaticamente. Passam a ficar ativos para permitir novas execuções.
update public.ordens_producao op set status=case when exists(select 1 from public.apontamentos a join public.operacoes o on o.id=a.operacao_id where o.ordem_producao_id=op.id) then 'em_producao'::public.status_op else 'aguardando'::public.status_op end where encerrada_em is null and status='finalizada';

create or replace function public.iniciar_execucao(p_operacao_id uuid,p_operador_id uuid,p_maquina_id uuid,p_observacao text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;v_ordem uuid;v_perfil public.perfil_usuario;
begin
 select perfil into v_perfil from public.perfis where id=auth.uid() and ativo;
 if v_perfil is null then raise exception 'Usuário sem perfil ativo.';end if;
 if p_operador_id<>auth.uid() and v_perfil not in('pcp','lider','admin') then raise exception 'Operador não autorizado.';end if;
 if not exists(select 1 from public.perfis where id=p_operador_id and ativo) then raise exception 'Operador inválido ou inativo.';end if;
 if not exists(select 1 from public.maquinas where id=p_maquina_id and ativa) then raise exception 'Máquina inválida ou inativa.';end if;
 select ordem_producao_id into v_ordem from public.operacoes where id=p_operacao_id for update;
 if v_ordem is null then raise exception 'Operação não encontrada.';end if;
 if exists(select 1 from public.ordens_producao where id=v_ordem and encerrada_em is not null) then raise exception 'Esta OP está encerrada pelo administrador.';end if;
 if exists(select 1 from public.apontamentos where operacao_id=p_operacao_id and termino_em is null) then raise exception 'Já existe um apontamento aberto nesta operação.';end if;
 insert into public.apontamentos(operacao_id,operador_id,maquina_id,inicio_em,observacao) values(p_operacao_id,p_operador_id,p_maquina_id,now(),nullif(trim(p_observacao),'')) returning id into v_id;
 update public.operacoes set status='em_andamento' where id=p_operacao_id;
 update public.ordens_producao set status='em_producao',atualizado_em=now() where id=v_ordem;
 return v_id;
end;$$;

create or replace function public.finalizar_execucao(p_operacao_id uuid,p_observacao text default null,p_motivo text default 'normal')
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;v_ordem uuid;v_operador uuid;v_perfil public.perfil_usuario;
begin
 if p_motivo not in('normal','pausa','fim_turno','retrabalho','parada_maquina') then raise exception 'Motivo de finalização inválido.';end if;
 select perfil into v_perfil from public.perfis where id=auth.uid() and ativo;
 select a.id,a.operador_id,o.ordem_producao_id into v_id,v_operador,v_ordem from public.apontamentos a join public.operacoes o on o.id=a.operacao_id where a.operacao_id=p_operacao_id and a.termino_em is null for update of a;
 if v_id is null then raise exception 'Não há apontamento aberto para esta operação.';end if;
 if v_operador<>auth.uid() and v_perfil not in('pcp','lider','admin') then raise exception 'Somente o operador responsável pode finalizar.';end if;
 update public.apontamentos set termino_em=now(),motivo_finalizacao=p_motivo,observacao=coalesce(nullif(trim(p_observacao),''),observacao) where id=v_id;
 update public.operacoes set status='finalizada' where id=p_operacao_id;
 update public.ordens_producao set status='em_producao',atualizado_em=now() where id=v_ordem;
 return v_id;
end;$$;

create or replace function public.iniciar_apontamento_agrupado_v2(p_codigo_operacao text,p_operador_id uuid,p_maquina_id uuid,p_criterio text,p_itens jsonb,p_observacao text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_grupo uuid;v_item jsonb;v_operacao uuid;v_ordem uuid;v_perfil public.perfil_usuario;
begin
 select perfil into v_perfil from public.perfis where id=auth.uid() and ativo;
 if v_perfil is null then raise exception 'Usuário sem perfil ativo.';end if;
 if p_operador_id<>auth.uid() and v_perfil not in('pcp','lider','admin') then raise exception 'Operador não autorizado.';end if;
 if not exists(select 1 from public.perfis where id=p_operador_id and ativo) or not exists(select 1 from public.maquinas where id=p_maquina_id and ativa) then raise exception 'Operador ou máquina inválidos.';end if;
 if p_criterio not in('metros','peso','pecas') or jsonb_array_length(p_itens)<2 then raise exception 'Grupo ou critério inválido.';end if;
 if exists(select 1 from jsonb_array_elements(p_itens) x where coalesce((x->>'quantidade')::numeric,0)<=0) then raise exception 'Todas as quantidades devem ser maiores que zero.';end if;
 insert into public.grupos_apontamento(codigo_operacao,operador_id,maquina_id,criterio_rateio,observacao,criado_por) values(lpad(trim(p_codigo_operacao),4,'0'),p_operador_id,p_maquina_id,p_criterio,nullif(trim(p_observacao),''),auth.uid()) returning id into v_grupo;
 for v_item in select * from jsonb_array_elements(p_itens) loop
  v_operacao=(v_item->>'operacao_id')::uuid;
  select ordem_producao_id into v_ordem from public.operacoes where id=v_operacao and codigo=lpad(trim(p_codigo_operacao),4,'0') for update;
  if v_ordem is null then raise exception 'Operação incompatível no grupo.';end if;
  if exists(select 1 from public.ordens_producao where id=v_ordem and encerrada_em is not null) then raise exception 'Uma das OPs está encerrada.';end if;
  if exists(select 1 from public.apontamentos where operacao_id=v_operacao and termino_em is null) then raise exception 'Uma das operações já possui apontamento aberto.';end if;
  insert into public.apontamentos(operacao_id,operador_id,maquina_id,inicio_em,observacao,grupo_id,quantidade_rateio,criterio_rateio) values(v_operacao,p_operador_id,p_maquina_id,now(),nullif(trim(p_observacao),''),v_grupo,(v_item->>'quantidade')::numeric,p_criterio);
  update public.operacoes set status='em_andamento' where id=v_operacao;
  update public.ordens_producao set status='em_producao',atualizado_em=now() where id=v_ordem;
 end loop;
 return v_grupo;
end;$$;

create or replace function public.finalizar_apontamento_agrupado_v2(p_grupo_id uuid,p_observacao text default null,p_motivo text default 'normal')
returns uuid language plpgsql security definer set search_path=public as $$
declare v_inicio timestamptz;v_operador uuid;v_perfil public.perfil_usuario;v_total bigint;v_soma numeric;v_usado bigint:=0;v_qtd integer;v_i integer:=0;v_reg record;
begin
 if p_motivo not in('normal','pausa','fim_turno','retrabalho','parada_maquina') then raise exception 'Motivo de finalização inválido.';end if;
 select inicio_em,operador_id into v_inicio,v_operador from public.grupos_apontamento where id=p_grupo_id and termino_em is null for update;
 if v_inicio is null then raise exception 'Grupo não encontrado ou já finalizado.';end if;
 select perfil into v_perfil from public.perfis where id=auth.uid() and ativo;
 if v_operador<>auth.uid() and v_perfil not in('pcp','lider','admin') then raise exception 'Somente o operador responsável pode finalizar.';end if;
 v_total=greatest(0,floor(extract(epoch from(now()-v_inicio))));
 select sum(quantidade_rateio),count(*) into v_soma,v_qtd from public.apontamentos where grupo_id=p_grupo_id and termino_em is null;
 update public.grupos_apontamento set termino_em=now(),observacao=coalesce(nullif(trim(p_observacao),''),observacao) where id=p_grupo_id;
 for v_reg in select id,operacao_id,quantidade_rateio from public.apontamentos where grupo_id=p_grupo_id and termino_em is null order by id loop
  v_i=v_i+1;
  update public.apontamentos set termino_em=now(),motivo_finalizacao=p_motivo,duracao_rateada_segundos=case when v_i=v_qtd then v_total-v_usado else floor(v_total*v_reg.quantidade_rateio/v_soma) end,observacao=coalesce(nullif(trim(p_observacao),''),observacao) where id=v_reg.id;
  if v_i<v_qtd then v_usado=v_usado+floor(v_total*v_reg.quantidade_rateio/v_soma);end if;
  update public.operacoes set status='finalizada' where id=v_reg.operacao_id;
 end loop;
 update public.ordens_producao op set status='em_producao',atualizado_em=now() where exists(select 1 from public.operacoes o join public.apontamentos a on a.operacao_id=o.id where o.ordem_producao_id=op.id and a.grupo_id=p_grupo_id);
 return p_grupo_id;
end;$$;

create or replace function public.admin_alterar_encerramento_op(p_id uuid,p_encerrar boolean,p_motivo text)
returns void language plpgsql security definer set search_path=public as $$
begin
 perform public.exigir_admin();
 if length(trim(coalesce(p_motivo,'')))<3 then raise exception 'Informe o motivo da alteração.';end if;
 if p_encerrar and exists(select 1 from public.apontamentos a join public.operacoes o on o.id=a.operacao_id where o.ordem_producao_id=p_id and a.termino_em is null) then raise exception 'Finalize os apontamentos abertos antes de encerrar a OP.';end if;
 update public.ordens_producao set encerrada_em=case when p_encerrar then now() else null end,encerrada_por=case when p_encerrar then auth.uid() else null end,motivo_encerramento=case when p_encerrar then trim(p_motivo) else null end,status=case when p_encerrar then 'finalizada'::public.status_op else 'em_producao'::public.status_op end,atualizado_em=now() where id=p_id;
 if not found then raise exception 'OP não encontrada.';end if;
 insert into public.auditoria_ordens(ordem_producao_id,acao,motivo,usuario_id) values(p_id,case when p_encerrar then 'encerrada' else 'reaberta' end,trim(p_motivo),auth.uid());
end;$$;

revoke all on function public.iniciar_execucao(uuid,uuid,uuid,text),public.finalizar_execucao(uuid,text,text),public.iniciar_apontamento_agrupado_v2(text,uuid,uuid,text,jsonb,text),public.finalizar_apontamento_agrupado_v2(uuid,text,text),public.admin_alterar_encerramento_op(uuid,boolean,text) from public;
grant execute on function public.iniciar_execucao(uuid,uuid,uuid,text),public.finalizar_execucao(uuid,text,text),public.iniciar_apontamento_agrupado_v2(text,uuid,uuid,text,jsonb,text),public.finalizar_apontamento_agrupado_v2(uuid,text,text),public.admin_alterar_encerramento_op(uuid,boolean,text) to authenticated;

-- Toda gravação passa pelas funções acima, que validam OP encerrada, operador e máquina.
drop policy if exists "operador cria proprio apontamento" on public.apontamentos;
drop policy if exists "operador atualiza proprio apontamento" on public.apontamentos;
revoke execute on function public.iniciar_operacao(uuid,uuid,uuid,text),public.finalizar_operacao(uuid,text),public.iniciar_apontamento_agrupado(text,uuid,uuid,text,jsonb,text),public.finalizar_apontamento_agrupado(uuid,text) from authenticated;
