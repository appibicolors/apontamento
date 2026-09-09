-- Níveis de acesso: administrador e produção. Execute uma vez no SQL Editor.
update public.perfis p set perfil='admin',ativo=true
from auth.users u where p.id=u.id and lower(u.email)=lower('app.ibicolors@gmail.com');

create or replace function public.usuario_pode_administrar()
returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.perfis where id=auth.uid() and ativo and perfil='admin');
$$;

create or replace function public.admin_editar_usuario(p_id uuid,p_nome text,p_perfil text)
returns void language plpgsql security definer set search_path=public as $$
declare v_email text;
begin
 perform public.exigir_admin();
 if p_perfil not in ('admin','operador') then raise exception 'Nível de acesso inválido.';end if;
 select lower(email) into v_email from auth.users where id=p_id;
 if v_email='app.ibicolors@gmail.com' and p_perfil<>'admin' then raise exception 'A conta principal deve permanecer administradora.';end if;
 update public.perfis set nome=trim(p_nome),perfil=p_perfil::public.perfil_usuario where id=p_id;
 if not found then raise exception 'Usuário não encontrado.';end if;
end;$$;

revoke all on function public.admin_editar_usuario(uuid,text,text) from public;
grant execute on function public.admin_editar_usuario(uuid,text,text) to authenticated;
