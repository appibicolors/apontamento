-- Prazo comercial da OP em dias corridos. Execute uma vez no SQL Editor do Supabase.
alter table public.ordens_producao add column if not exists prazo_dias integer;
alter table public.ordens_producao drop constraint if exists ordens_producao_prazo_dias_check;
alter table public.ordens_producao add constraint ordens_producao_prazo_dias_check check(prazo_dias is null or prazo_dias between 0 and 3650);
alter table public.ordens_producao add column if not exists prazo_estimado date generated always as(case when data_op is null or prazo_dias is null then null else data_op+prazo_dias end) stored;

create or replace function public.admin_editar_op_v2(p_id uuid,p_numero_op text,p_cliente text,p_artigo text,p_prazo_dias integer) returns void language plpgsql security definer set search_path=public as $$
begin
 perform public.exigir_admin();
 if p_prazo_dias is not null and (p_prazo_dias<0 or p_prazo_dias>3650) then raise exception 'Prazo deve estar entre 0 e 3650 dias.';end if;
 update public.ordens_producao set numero_op=trim(p_numero_op),cliente=trim(p_cliente),artigo=trim(p_artigo),prazo_dias=p_prazo_dias,atualizado_em=now() where id=p_id;
 if not found then raise exception 'OP não encontrada.';end if;
end;$$;
revoke all on function public.admin_editar_op_v2(uuid,text,text,text,integer) from public;
grant execute on function public.admin_editar_op_v2(uuid,text,text,text,integer) to authenticated;
