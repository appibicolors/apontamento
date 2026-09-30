-- Correção auditável de fluxos incompletos importados pelo leitor antigo.
-- Execute uma vez no SQL Editor do Supabase antes de usar "Adicionar etapas".

create table if not exists public.auditoria_fluxos_op(
 id uuid primary key default gen_random_uuid(),
 ordem_producao_id uuid not null references public.ordens_producao(id) on delete cascade,
 operacoes_adicionadas jsonb not null,
 motivo text not null,
 usuario_id uuid not null references public.perfis(id),
 criado_em timestamptz not null default now()
);
alter table public.auditoria_fluxos_op enable row level security;
drop policy if exists "admin consulta auditoria de fluxos" on public.auditoria_fluxos_op;
create policy "admin consulta auditoria de fluxos" on public.auditoria_fluxos_op for select to authenticated using(public.usuario_pode_administrar());

create or replace function public.admin_adicionar_operacoes_faltantes(p_ordem_id uuid,p_operacoes jsonb,p_motivo text)
returns integer language plpgsql security definer set search_path=public as $$
declare v_item jsonb;v_sequence integer;v_count integer=0;
begin
 perform public.exigir_admin();
 perform 1 from public.ordens_producao where id=p_ordem_id for update;
 if not found then raise exception 'OP não encontrada.';end if;
 if length(trim(coalesce(p_motivo,'')))<3 then raise exception 'Informe o motivo da correção.';end if;
 if p_operacoes is null or jsonb_typeof(p_operacoes)<>'array' or jsonb_array_length(p_operacoes)<1 then raise exception 'Informe ao menos uma operação.';end if;
 if exists(select 1 from public.apontamentos a join public.operacoes o on o.id=a.operacao_id where o.ordem_producao_id=p_ordem_id and a.termino_em is null) then raise exception 'Finalize ou pause os apontamentos abertos antes de corrigir o fluxo.';end if;
 select coalesce(max(sequencia),0) into v_sequence from public.operacoes where ordem_producao_id=p_ordem_id;
 for v_item in select * from jsonb_array_elements(p_operacoes) loop
  if (v_item->>'codigo')!~'^\d{4}$' or length(trim(coalesce(v_item->>'descricao','')))<2 then raise exception 'Cada linha deve possuir código de 4 dígitos e descrição.';end if;
  v_sequence=v_sequence+1;v_count=v_count+1;
  insert into public.operacoes(ordem_producao_id,sequencia,codigo,descricao,status)
  values(p_ordem_id,v_sequence,v_item->>'codigo',trim(v_item->>'descricao'),'aguardando');
 end loop;
 update public.ordens_producao set dados_extraidos=coalesce(dados_extraidos,'{}'::jsonb)||jsonb_build_object('fluxo_auditado',true,'fluxo_corrigido_em',now(),'fluxo_corrigido_por',auth.uid()),atualizado_em=now() where id=p_ordem_id;
 insert into public.auditoria_fluxos_op(ordem_producao_id,operacoes_adicionadas,motivo,usuario_id) values(p_ordem_id,p_operacoes,trim(p_motivo),auth.uid());
 return v_count;
end;$$;

revoke all on function public.admin_adicionar_operacoes_faltantes(uuid,jsonb,text) from public;
grant execute on function public.admin_adicionar_operacoes_faltantes(uuid,jsonb,text) to authenticated;
