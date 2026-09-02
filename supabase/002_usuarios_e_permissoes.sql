-- Execute este arquivo uma única vez no SQL Editor depois do schema.sql.
create or replace function public.criar_perfil_novo_usuario() returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.perfis(id,nome,perfil) values(new.id,coalesce(new.raw_user_meta_data->>'nome',split_part(new.email,'@',1)),coalesce((new.raw_user_meta_data->>'perfil')::public.perfil_usuario,'operador')) on conflict(id) do nothing;
  return new;
end; $$;
drop trigger if exists criar_perfil_apos_cadastro on auth.users;
create trigger criar_perfil_apos_cadastro after insert on auth.users for each row execute function public.criar_perfil_novo_usuario();
create or replace function public.usuario_pode_administrar() returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.perfis where id=auth.uid() and ativo and perfil in ('pcp','admin'));
$$;
create policy "pcp cadastra maquinas" on public.maquinas for insert to authenticated with check(public.usuario_pode_administrar());
create policy "pcp atualiza maquinas" on public.maquinas for update to authenticated using(public.usuario_pode_administrar()) with check(public.usuario_pode_administrar());
create policy "pcp cadastra ops" on public.ordens_producao for insert to authenticated with check(public.usuario_pode_administrar());
create policy "pcp atualiza ops" on public.ordens_producao for update to authenticated using(public.usuario_pode_administrar()) with check(public.usuario_pode_administrar());
create policy "pcp cadastra operacoes" on public.operacoes for insert to authenticated with check(public.usuario_pode_administrar());
create policy "pcp atualiza operacoes" on public.operacoes for update to authenticated using(public.usuario_pode_administrar()) with check(public.usuario_pode_administrar());
insert into public.perfis(id,nome,perfil) select id,coalesce(raw_user_meta_data->>'nome',split_part(email,'@',1)),'operador' from auth.users on conflict(id) do nothing;
