create or replace function public.alterar_operador_apontamento(p_apontamento_id uuid,p_operador_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare v_perfil public.perfil_usuario;
begin
 select perfil into v_perfil from public.perfis where id=auth.uid() and ativo;
 if v_perfil not in ('pcp','lider','admin') then raise exception 'Somente PCP ou liderança pode alterar o operador.';end if;
 if not exists(select 1 from public.perfis where id=p_operador_id and ativo) then raise exception 'Operador inválido.';end if;
 update public.apontamentos set operador_id=p_operador_id where id=p_apontamento_id and termino_em is null;
 if not found then raise exception 'Apontamento aberto não encontrado.';end if;
end;$$;
revoke all on function public.alterar_operador_apontamento(uuid,uuid) from public;
grant execute on function public.alterar_operador_apontamento(uuid,uuid) to authenticated;
