-- Portal de consulta PCP Matriz, isolado para o cliente IBIRAPUERA TEXTIL LTDA.
-- Execute uma vez no SQL Editor do Supabase.

create or replace function public.perfil_atual()
returns public.perfil_usuario language sql stable security definer set search_path=public as $$
 select perfil from public.perfis where id=auth.uid() and ativo;
$$;

create or replace function public.usuario_ativo()
returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.perfis where id=auth.uid() and ativo);
$$;

drop policy if exists "usuarios autenticados consultam perfis" on public.perfis;
create policy "usuarios ativos consultam perfis permitidos" on public.perfis for select to authenticated
 using(public.usuario_ativo() and (public.perfil_atual()<>'consulta' or id=auth.uid()));

drop policy if exists "usuarios autenticados consultam maquinas" on public.maquinas;
create policy "usuarios ativos consultam maquinas" on public.maquinas for select to authenticated using(public.usuario_ativo());

drop policy if exists "usuarios autenticados consultam ops" on public.ordens_producao;
create policy "usuarios consultam ops autorizadas" on public.ordens_producao for select to authenticated
 using(public.usuario_ativo() and (public.perfil_atual()<>'consulta' or upper(trim(cliente))='IBIRAPUERA TEXTIL LTDA'));

drop policy if exists "usuarios autenticados consultam operacoes" on public.operacoes;
create policy "usuarios consultam operacoes autorizadas" on public.operacoes for select to authenticated
 using(public.usuario_ativo() and exists(select 1 from public.ordens_producao op where op.id=ordem_producao_id));

drop policy if exists "usuarios autenticados consultam apontamentos" on public.apontamentos;
create policy "usuarios consultam apontamentos autorizados" on public.apontamentos for select to authenticated
 using(public.usuario_ativo() and exists(select 1 from public.operacoes o where o.id=operacao_id));

drop policy if exists "usuarios consultam grupos" on public.grupos_apontamento;
create policy "usuarios consultam grupos autorizados" on public.grupos_apontamento for select to authenticated
 using(public.usuario_ativo() and (public.perfil_atual()<>'consulta' or exists(
  select 1 from public.apontamentos a join public.operacoes o on o.id=a.operacao_id
  join public.ordens_producao op on op.id=o.ordem_producao_id
  where a.grupo_id=grupos_apontamento.id and upper(trim(op.cliente))='IBIRAPUERA TEXTIL LTDA'
 )));

create or replace function public.bloquear_escrita_pcp_matriz()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if public.perfil_atual()='consulta' then raise exception 'O acesso PCP Matriz é exclusivo para consulta.';end if;
 return case when tg_op='DELETE' then old else new end;
end;$$;
drop trigger if exists bloquear_escrita_pcp_matriz on public.apontamentos;
create trigger bloquear_escrita_pcp_matriz before insert or update or delete on public.apontamentos
 for each row execute function public.bloquear_escrita_pcp_matriz();

create or replace function public.admin_editar_usuario(p_id uuid,p_nome text,p_perfil text)
returns void language plpgsql security definer set search_path=public as $$
declare v_email text;
begin
 perform public.exigir_admin();
 if p_perfil not in ('admin','operador','consulta') then raise exception 'Nível de acesso inválido.';end if;
 select lower(email) into v_email from auth.users where id=p_id;
 if v_email='app.ibicolors@gmail.com' and p_perfil<>'admin' then raise exception 'A conta principal deve permanecer administradora.';end if;
 update public.perfis set nome=trim(p_nome),perfil=p_perfil::public.perfil_usuario where id=p_id;
 if not found then raise exception 'Usuário não encontrado.';end if;
end;$$;

revoke all on function public.perfil_atual(),public.usuario_ativo(),public.admin_editar_usuario(uuid,text,text) from public;
grant execute on function public.perfil_atual(),public.usuario_ativo(),public.admin_editar_usuario(uuid,text,text) to authenticated;
