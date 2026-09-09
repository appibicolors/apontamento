-- Administração segura. Execute uma vez no SQL Editor do Supabase.
-- Garante que a conta principal seja administradora.
update public.perfis p set perfil='admin',ativo=true
from auth.users u where p.id=u.id and lower(u.email)=lower('app.ibicolors@gmail.com');

create or replace function public.exigir_admin() returns void language plpgsql security definer set search_path=public as $$
begin
 if not exists(select 1 from public.perfis where id=auth.uid() and perfil='admin' and ativo) then raise exception 'Acesso exclusivo do administrador.';end if;
end;$$;

create or replace function public.admin_editar_op(p_id uuid,p_numero_op text,p_cliente text,p_artigo text) returns void language plpgsql security definer set search_path=public as $$
begin perform public.exigir_admin();update public.ordens_producao set numero_op=trim(p_numero_op),cliente=trim(p_cliente),artigo=trim(p_artigo),atualizado_em=now() where id=p_id;if not found then raise exception 'OP não encontrada.';end if;end;$$;
create or replace function public.admin_excluir_op(p_id uuid) returns void language plpgsql security definer set search_path=public as $$
begin perform public.exigir_admin();delete from public.apontamentos where operacao_id in(select id from public.operacoes where ordem_producao_id=p_id);delete from public.ordens_producao where id=p_id;if not found then raise exception 'OP não encontrada.';end if;end;$$;
create or replace function public.admin_editar_apontamento(p_id uuid,p_operador_id uuid,p_maquina_id uuid,p_inicio_em timestamptz,p_termino_em timestamptz,p_observacao text) returns void language plpgsql security definer set search_path=public as $$
begin perform public.exigir_admin();if p_termino_em is not null and p_termino_em<p_inicio_em then raise exception 'Término não pode ser anterior ao início.';end if;update public.apontamentos set operador_id=p_operador_id,maquina_id=p_maquina_id,inicio_em=p_inicio_em,termino_em=p_termino_em,observacao=nullif(trim(p_observacao),'') where id=p_id;if not found then raise exception 'Apontamento não encontrado.';end if;end;$$;
create or replace function public.admin_excluir_apontamento(p_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare v_operacao uuid;v_ordem uuid;
begin perform public.exigir_admin();select operacao_id into v_operacao from public.apontamentos where id=p_id;delete from public.apontamentos where id=p_id;if not found then raise exception 'Apontamento não encontrado.';end if;select ordem_producao_id into v_ordem from public.operacoes where id=v_operacao;update public.operacoes set status=case when exists(select 1 from public.apontamentos where operacao_id=v_operacao and termino_em is null) then 'em_andamento'::public.status_operacao when exists(select 1 from public.apontamentos where operacao_id=v_operacao and termino_em is not null) then 'finalizada'::public.status_operacao else 'liberada'::public.status_operacao end where id=v_operacao;update public.ordens_producao set status=case when not exists(select 1 from public.operacoes where ordem_producao_id=v_ordem and status<>'finalizada') then 'finalizada'::public.status_op when exists(select 1 from public.operacoes where ordem_producao_id=v_ordem and status='em_andamento') then 'em_producao'::public.status_op else 'aguardando'::public.status_op end,atualizado_em=now() where id=v_ordem;end;$$;
create or replace function public.admin_editar_operador(p_id uuid,p_nome text) returns void language plpgsql security definer set search_path=public as $$ begin perform public.exigir_admin();update public.perfis set nome=trim(p_nome) where id=p_id;if not found then raise exception 'Operador não encontrado.';end if;end;$$;
create or replace function public.admin_desativar_operador(p_id uuid) returns void language plpgsql security definer set search_path=public as $$ begin perform public.exigir_admin();if p_id=auth.uid() then raise exception 'O administrador não pode desativar a própria conta.';end if;update public.perfis set ativo=false where id=p_id and perfil<>'admin';if not found then raise exception 'Operador não encontrado ou protegido.';end if;end;$$;
create or replace function public.admin_desativar_maquina(p_id uuid) returns void language plpgsql security definer set search_path=public as $$ begin perform public.exigir_admin();update public.maquinas set ativa=false where id=p_id;if not found then raise exception 'Máquina não encontrada.';end if;end;$$;

revoke all on function public.exigir_admin() from public;
grant execute on function public.admin_editar_op(uuid,text,text,text),public.admin_excluir_op(uuid),public.admin_editar_apontamento(uuid,uuid,uuid,timestamptz,timestamptz,text),public.admin_excluir_apontamento(uuid),public.admin_editar_operador(uuid,text),public.admin_desativar_operador(uuid),public.admin_desativar_maquina(uuid) to authenticated;
