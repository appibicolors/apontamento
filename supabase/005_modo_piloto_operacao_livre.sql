-- MODO PILOTO: permite apontar qualquer operação ainda não concluída da OP.
-- Execute uma vez no SQL Editor antes de liberar os postos de trabalho.
create or replace function public.iniciar_operacao(p_operacao_id uuid,p_operador_id uuid,p_maquina_id uuid,p_observacao text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;v_ordem uuid;v_status public.status_operacao;v_perfil public.perfil_usuario;
begin
 select perfil into v_perfil from public.perfis where id=auth.uid() and ativo;
 if v_perfil is null then raise exception 'Usuário sem perfil ativo.';end if;
 if p_operador_id<>auth.uid() and v_perfil not in ('pcp','lider','admin') then raise exception 'Operador não autorizado.';end if;
 if not exists(select 1 from public.perfis where id=p_operador_id and ativo) then raise exception 'Operador inativo ou inexistente.';end if;
 if not exists(select 1 from public.maquinas where id=p_maquina_id and ativa) then raise exception 'Máquina inativa ou inexistente.';end if;
 select ordem_producao_id,status into v_ordem,v_status from public.operacoes where id=p_operacao_id for update;
 if v_status not in ('liberada','aguardando') then raise exception 'Esta operação já foi iniciada ou concluída.';end if;
 insert into public.apontamentos(operacao_id,operador_id,maquina_id,inicio_em,observacao) values(p_operacao_id,p_operador_id,p_maquina_id,now(),nullif(trim(p_observacao),'')) returning id into v_id;
 update public.operacoes set status='em_andamento' where id=p_operacao_id;
 update public.ordens_producao set status='em_producao',atualizado_em=now() where id=v_ordem;
 return v_id;
end;$$;

create or replace function public.finalizar_operacao(p_operacao_id uuid,p_observacao text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;v_ordem uuid;v_operador uuid;v_perfil public.perfil_usuario;
begin
 select perfil into v_perfil from public.perfis where id=auth.uid() and ativo;
 select a.id,a.operador_id,o.ordem_producao_id into v_id,v_operador,v_ordem from public.apontamentos a join public.operacoes o on o.id=a.operacao_id where a.operacao_id=p_operacao_id and a.termino_em is null for update of a;
 if v_id is null then raise exception 'Não há apontamento aberto para esta operação.';end if;
 if v_operador<>auth.uid() and v_perfil not in ('pcp','lider','admin') then raise exception 'Somente o operador responsável pode finalizar.';end if;
 update public.apontamentos set termino_em=now(),observacao=coalesce(nullif(trim(p_observacao),''),observacao) where id=v_id;
 update public.operacoes set status='finalizada' where id=p_operacao_id;
 if exists(select 1 from public.operacoes where ordem_producao_id=v_ordem and status<>'finalizada') then
   update public.ordens_producao set status='em_producao',atualizado_em=now() where id=v_ordem;
 else
   update public.ordens_producao set status='finalizada',atualizado_em=now() where id=v_ordem;
 end if;
 return v_id;
end;$$;

revoke all on function public.iniciar_operacao(uuid,uuid,uuid,text) from public;
revoke all on function public.finalizar_operacao(uuid,text) from public;
grant execute on function public.iniciar_operacao(uuid,uuid,uuid,text) to authenticated;
grant execute on function public.finalizar_operacao(uuid,text) to authenticated;
