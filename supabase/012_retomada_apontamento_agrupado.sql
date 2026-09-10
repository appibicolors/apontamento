-- Retomada segura de grupos pausados, mantendo períodos separados e auditáveis.
-- Execute uma vez no SQL Editor do Supabase antes de usar o botão "Retomar grupo".
alter table public.grupos_apontamento add column if not exists motivo_finalizacao text;
alter table public.grupos_apontamento add column if not exists grupo_origem_id uuid references public.grupos_apontamento(id);
create unique index if not exists grupos_apontamento_uma_retomada_por_origem
 on public.grupos_apontamento(grupo_origem_id) where grupo_origem_id is not null;

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
 update public.grupos_apontamento set termino_em=now(),motivo_finalizacao=p_motivo,observacao=coalesce(nullif(trim(p_observacao),''),observacao) where id=p_grupo_id;
 for v_reg in select id,operacao_id,quantidade_rateio from public.apontamentos where grupo_id=p_grupo_id and termino_em is null order by id loop
  v_i=v_i+1;
  update public.apontamentos set termino_em=now(),motivo_finalizacao=p_motivo,duracao_rateada_segundos=case when v_i=v_qtd then v_total-v_usado else floor(v_total*v_reg.quantidade_rateio/v_soma) end,observacao=coalesce(nullif(trim(p_observacao),''),observacao) where id=v_reg.id;
  if v_i<v_qtd then v_usado=v_usado+floor(v_total*v_reg.quantidade_rateio/v_soma);end if;
  update public.operacoes set status='finalizada' where id=v_reg.operacao_id;
 end loop;
 update public.ordens_producao op set status='em_producao',atualizado_em=now() where exists(select 1 from public.operacoes o join public.apontamentos a on a.operacao_id=o.id where o.ordem_producao_id=op.id and a.grupo_id=p_grupo_id);
 return p_grupo_id;
end;$$;

create or replace function public.retomar_apontamento_agrupado(p_grupo_origem_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_origem public.grupos_apontamento%rowtype;v_novo uuid;v_perfil public.perfil_usuario;v_item record;v_qtd integer;
begin
 select perfil into v_perfil from public.perfis where id=auth.uid() and ativo;
 if v_perfil is null then raise exception 'Usuário sem perfil ativo.';end if;
 select * into v_origem from public.grupos_apontamento where id=p_grupo_origem_id for update;
 if v_origem.id is null or v_origem.termino_em is null then raise exception 'Grupo não encontrado ou ainda está em andamento.';end if;
 if coalesce(v_origem.motivo_finalizacao,(select min(a.motivo_finalizacao) from public.apontamentos a where a.grupo_id=v_origem.id)) not in('pausa','fim_turno','parada_maquina') then raise exception 'Este encerramento não permite retomada.';end if;
 if exists(select 1 from public.grupos_apontamento where grupo_origem_id=v_origem.id) then raise exception 'Este grupo já foi retomado.';end if;
 if not exists(select 1 from public.maquinas where id=v_origem.maquina_id and ativa) then raise exception 'A máquina original está inativa.';end if;
 select count(*) into v_qtd from public.apontamentos where grupo_id=v_origem.id;
 if v_qtd<2 then raise exception 'O grupo original não possui OPs suficientes.';end if;
 if exists(select 1 from public.apontamentos fonte join public.operacoes o on o.id=fonte.operacao_id join public.ordens_producao op on op.id=o.ordem_producao_id where fonte.grupo_id=v_origem.id and (op.encerrada_em is not null or exists(select 1 from public.apontamentos aberto where aberto.operacao_id=fonte.operacao_id and aberto.termino_em is null))) then raise exception 'Uma das OPs foi encerrada ou já possui apontamento aberto.';end if;
 insert into public.grupos_apontamento(codigo_operacao,operador_id,maquina_id,criterio_rateio,observacao,criado_por,grupo_origem_id)
 values(v_origem.codigo_operacao,auth.uid(),v_origem.maquina_id,v_origem.criterio_rateio,'Retomada do grupo '||v_origem.id,auth.uid(),v_origem.id) returning id into v_novo;
 for v_item in select operacao_id,quantidade_rateio,criterio_rateio from public.apontamentos where grupo_id=v_origem.id order by id loop
  insert into public.apontamentos(operacao_id,operador_id,maquina_id,inicio_em,observacao,grupo_id,quantidade_rateio,criterio_rateio)
  values(v_item.operacao_id,auth.uid(),v_origem.maquina_id,now(),'Retomada de apontamento agrupado',v_novo,v_item.quantidade_rateio,v_item.criterio_rateio);
  update public.operacoes set status='em_andamento' where id=v_item.operacao_id;
  update public.ordens_producao op set status='em_producao',atualizado_em=now() where exists(select 1 from public.operacoes o where o.id=v_item.operacao_id and o.ordem_producao_id=op.id);
 end loop;
 return v_novo;
exception when unique_violation then raise exception 'Este grupo já foi retomado.';
end;$$;

revoke all on function public.retomar_apontamento_agrupado(uuid) from public;
grant execute on function public.retomar_apontamento_agrupado(uuid) to authenticated;
