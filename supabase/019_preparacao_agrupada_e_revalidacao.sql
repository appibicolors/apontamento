-- Preparação persistente de grupos e atualização segura de roteiros Microdata.
-- Não altera nem remove apontamentos, grupos produtivos ou históricos existentes.

create table if not exists public.grupos_preparacao(
 id uuid primary key default gen_random_uuid(),
 usuario_id uuid not null references public.perfis(id),
 codigo_operacao text,
 operador_id uuid references public.perfis(id),
 maquina_id uuid references public.maquinas(id),
 criterio_rateio text not null default 'metros' check(criterio_rateio in('metros','peso','pecas')),
 status text not null default 'rascunho' check(status in('rascunho','concluido','descartado')),
 grupo_apontamento_id uuid references public.grupos_apontamento(id),
 versao integer not null default 1,
 criado_em timestamptz not null default now(),
 atualizado_em timestamptz not null default now()
);
create table if not exists public.grupos_preparacao_ops(
 id uuid primary key default gen_random_uuid(),
 preparacao_id uuid not null references public.grupos_preparacao(id) on delete cascade,
 ordem_producao_id uuid not null references public.ordens_producao(id),
 ordem_leitura integer not null check(ordem_leitura>0),
 quantidade numeric not null default 0 check(quantidade>=0),
 compatibilidade text not null check(compatibilidade in('compativel','pendente','verificando')),
 motivo_pendencia text,
 unique(preparacao_id,ordem_producao_id),
 unique(preparacao_id,ordem_leitura)
);
create index if not exists grupos_preparacao_usuario_status_idx on public.grupos_preparacao(usuario_id,status,atualizado_em desc);
create index if not exists grupos_preparacao_ops_ordem_idx on public.grupos_preparacao_ops(ordem_producao_id);

create table if not exists public.auditoria_roteiros_microdata(
 id uuid primary key default gen_random_uuid(),
 ordem_producao_id uuid not null references public.ordens_producao(id),
 empresa text,
 usuario_id uuid not null references public.perfis(id),
 roteiro_anterior jsonb not null,
 roteiro_atualizado jsonb not null,
 alteracoes jsonb not null default '{}'::jsonb,
 resultado text not null check(resultado in('atualizado','identico','revisao_administrativa','bloqueado')),
 motivo text,
 criado_em timestamptz not null default now()
);

alter table public.grupos_preparacao enable row level security;
alter table public.grupos_preparacao_ops enable row level security;
alter table public.auditoria_roteiros_microdata enable row level security;

create policy "responsavel consulta preparacoes" on public.grupos_preparacao for select to authenticated
 using(usuario_id=(select auth.uid()) or public.usuario_pode_administrar());
create policy "responsavel consulta ops da preparacao" on public.grupos_preparacao_ops for select to authenticated
 using(exists(select 1 from public.grupos_preparacao g where g.id=preparacao_id and (g.usuario_id=(select auth.uid()) or public.usuario_pode_administrar())));
create policy "admin consulta auditoria microdata" on public.auditoria_roteiros_microdata for select to authenticated
 using(public.usuario_pode_administrar());

revoke all on public.grupos_preparacao,public.grupos_preparacao_ops,public.auditoria_roteiros_microdata from anon;
grant select on public.grupos_preparacao,public.grupos_preparacao_ops to authenticated;
grant select on public.auditoria_roteiros_microdata to authenticated;

create or replace function public.listar_preparacoes_agrupadas()
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',g.id,'usuario_id',g.usuario_id,'codigo_operacao',g.codigo_operacao,'operador_id',g.operador_id,
  'maquina_id',g.maquina_id,'criterio_rateio',g.criterio_rateio,'status',g.status,'versao',g.versao,
  'atualizado_em',g.atualizado_em,'itens',coalesce((select jsonb_agg(jsonb_build_object(
   'ordem_id',i.ordem_producao_id,'ordem_leitura',i.ordem_leitura,'quantidade',i.quantidade,
   'compatibilidade',i.compatibilidade,'motivo_pendencia',i.motivo_pendencia) order by i.ordem_leitura)
   from public.grupos_preparacao_ops i where i.preparacao_id=g.id),'[]'::jsonb)
 ) order by g.atualizado_em desc),'[]'::jsonb)
 from public.grupos_preparacao g
 where g.status='rascunho' and (g.usuario_id=(select auth.uid()) or public.usuario_pode_administrar())
$$;

create or replace function public.salvar_preparacao_agrupada(
 p_id uuid,p_versao integer,p_codigo_operacao text,p_operador_id uuid,p_maquina_id uuid,
 p_criterio text,p_itens jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_atual integer;v_perfil public.perfil_usuario;v_item jsonb;v_ordem public.ordens_producao%rowtype;
 v_codigo text:=nullif(lpad(trim(coalesce(p_codigo_operacao,'')),4,'0'),'0000');v_compat text;v_motivo text;v_pos integer:=0;
begin
 select perfil into v_perfil from public.perfis where id=(select auth.uid()) and ativo;
 if v_perfil is null or v_perfil='consulta' then raise exception 'Usuário sem permissão para preparar grupos.';end if;
 if p_criterio not in('metros','peso','pecas') then raise exception 'Critério de rateio inválido.';end if;
 if jsonb_typeof(coalesce(p_itens,'[]'::jsonb))<>'array' then raise exception 'Itens inválidos.';end if;
 if p_id is null then
  insert into public.grupos_preparacao(usuario_id,codigo_operacao,operador_id,maquina_id,criterio_rateio)
  values((select auth.uid()),v_codigo,p_operador_id,p_maquina_id,p_criterio) returning id,versao into v_id,v_atual;
 else
  select id,versao into v_id,v_atual from public.grupos_preparacao where id=p_id and status='rascunho' for update;
  if v_id is null then raise exception 'Preparação não encontrada ou já concluída.';end if;
  if not exists(select 1 from public.grupos_preparacao where id=v_id and (usuario_id=(select auth.uid()) or public.usuario_pode_administrar())) then raise exception 'Preparação pertence a outro usuário.';end if;
  if v_atual<>p_versao then raise exception 'A preparação foi alterada em outro dispositivo. Recarregue antes de continuar.';end if;
  update public.grupos_preparacao set codigo_operacao=v_codigo,operador_id=p_operador_id,maquina_id=p_maquina_id,
   criterio_rateio=p_criterio,versao=versao+1,atualizado_em=now() where id=v_id returning versao into v_atual;
  delete from public.grupos_preparacao_ops where preparacao_id=v_id;
 end if;
 for v_item in select value from jsonb_array_elements(coalesce(p_itens,'[]'::jsonb)) loop
  v_pos:=v_pos+1;
  select * into v_ordem from public.ordens_producao where id=(v_item->>'ordem_id')::uuid;
  if v_ordem.id is null then raise exception 'Uma das OPs não foi encontrada.';end if;
  if v_ordem.encerrada_em is not null or v_ordem.status='cancelada' then v_compat='pendente';v_motivo='OP encerrada ou cancelada.';
  elsif v_codigo is null then v_compat='verificando';v_motivo='Selecione a operação pretendida.';
  elsif not exists(select 1 from public.operacoes o where o.ordem_producao_id=v_ordem.id and o.codigo=v_codigo) then v_compat='pendente';v_motivo='Operação '||v_codigo||' não encontrada no roteiro.';
  elsif exists(select 1 from public.operacoes o join public.apontamentos a on a.operacao_id=o.id where o.ordem_producao_id=v_ordem.id and o.codigo=v_codigo and a.termino_em is null) then v_compat='pendente';v_motivo='Operação já possui apontamento aberto.';
  else v_compat='compativel';v_motivo=null;end if;
  insert into public.grupos_preparacao_ops(preparacao_id,ordem_producao_id,ordem_leitura,quantidade,compatibilidade,motivo_pendencia)
  values(v_id,v_ordem.id,v_pos,coalesce((v_item->>'quantidade')::numeric,0),v_compat,v_motivo);
 end loop;
 return (select jsonb_build_object('id',id,'versao',versao,'atualizado_em',atualizado_em) from public.grupos_preparacao where id=v_id);
end;$$;

create or replace function public.descartar_preparacao_agrupada(p_id uuid,p_versao integer)
returns void language plpgsql security definer set search_path='' as $$
begin
 update public.grupos_preparacao set status='descartado',versao=versao+1,atualizado_em=now()
 where id=p_id and status='rascunho' and versao=p_versao and (usuario_id=(select auth.uid()) or public.usuario_pode_administrar());
 if not found then raise exception 'Preparação não encontrada, sem permissão ou alterada em outro dispositivo.';end if;
end;$$;

create or replace function public.iniciar_preparacao_agrupada(p_id uuid,p_versao integer,p_observacao text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare g public.grupos_preparacao%rowtype;i record;v_grupo uuid;v_operacao uuid;v_inicio timestamptz:=now();v_perfil public.perfil_usuario;
begin
 select * into g from public.grupos_preparacao where id=p_id and status='rascunho' for update;
 if g.id is null or g.versao<>p_versao then raise exception 'Preparação alterada ou indisponível. Recarregue.';end if;
 select perfil into v_perfil from public.perfis where id=(select auth.uid()) and ativo;
 if g.usuario_id<>(select auth.uid()) and v_perfil not in('pcp','lider','admin') then raise exception 'Preparação pertence a outro usuário.';end if;
 if g.codigo_operacao is null or g.operador_id is null or g.maquina_id is null then raise exception 'Informe operação, operador e máquina.';end if;
 if not exists(select 1 from public.perfis where id=g.operador_id and ativo) or not exists(select 1 from public.maquinas where id=g.maquina_id and ativa) then raise exception 'Operador ou máquina inválidos.';end if;
 if (select count(*) from public.grupos_preparacao_ops where preparacao_id=g.id)<2 then raise exception 'Leia pelo menos duas OPs.';end if;
 if exists(select 1 from public.grupos_preparacao_ops where preparacao_id=g.id and (compatibilidade<>'compativel' or quantidade<=0)) then raise exception 'Resolva todas as pendências e quantidades antes de iniciar.';end if;
 insert into public.grupos_apontamento(codigo_operacao,operador_id,maquina_id,criterio_rateio,inicio_em,observacao,criado_por)
 values(g.codigo_operacao,g.operador_id,g.maquina_id,g.criterio_rateio,v_inicio,nullif(trim(p_observacao),''),(select auth.uid())) returning id into v_grupo;
 for i in select * from public.grupos_preparacao_ops where preparacao_id=g.id order by ordem_leitura loop
  select id into v_operacao from public.operacoes where ordem_producao_id=i.ordem_producao_id and codigo=g.codigo_operacao order by sequencia limit 1 for update;
  if v_operacao is null then raise exception 'Uma das OPs deixou de possuir a operação pretendida.';end if;
  if exists(select 1 from public.apontamentos where operacao_id=v_operacao and termino_em is null) then raise exception 'Uma das operações recebeu outro apontamento aberto.';end if;
  insert into public.apontamentos(operacao_id,operador_id,maquina_id,inicio_em,observacao,grupo_id,quantidade_rateio,criterio_rateio)
  values(v_operacao,g.operador_id,g.maquina_id,v_inicio,nullif(trim(p_observacao),''),v_grupo,i.quantidade,g.criterio_rateio);
  update public.operacoes set status='em_andamento' where id=v_operacao;
  update public.ordens_producao set status='em_producao',atualizado_em=now() where id=i.ordem_producao_id;
 end loop;
 update public.grupos_preparacao set status='concluido',grupo_apontamento_id=v_grupo,versao=versao+1,atualizado_em=now() where id=g.id;
 return v_grupo;
end;$$;

create or replace function public.atualizar_roteiro_microdata_backend(p_usuario_id uuid,p_ordem_id uuid,p_empresa text,p_operacoes jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.ordens_producao%rowtype;v_perfil public.perfil_usuario;v_antigo jsonb;v_novo jsonb;v_item jsonb;v_seq integer:=0;v_existente uuid;v_result text;v_motivo text;v_hist boolean;
begin
 select perfil into v_perfil from public.perfis where id=p_usuario_id and ativo;
 if v_perfil is null or v_perfil='consulta' then raise exception 'Usuário sem permissão para revalidar roteiros.';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_ordem_id::text,0));
 select * into o from public.ordens_producao where id=p_ordem_id for update;
 if o.id is null then raise exception 'OP não encontrada.';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'sequencia',x.sequencia,'codigo',x.codigo,'descricao',x.descricao) order by x.sequencia),'[]'::jsonb) into v_antigo from public.operacoes x where x.ordem_producao_id=o.id;
 select coalesce(jsonb_agg(jsonb_build_object('sequencia',n.ord,'codigo',lpad(trim(n.value->>'codigo'),4,'0'),'descricao',trim(n.value->>'descricao')) order by n.ord),'[]'::jsonb)
 into v_novo from jsonb_array_elements(p_operacoes) with ordinality n(value,ord);
 if jsonb_array_length(v_novo)=0 then raise exception 'O Microdata não retornou roteiro válido.';end if;
 if o.encerrada_em is not null or o.status='cancelada' then v_result='bloqueado';v_motivo='OP encerrada ou cancelada.';
 elsif exists(select 1 from public.operacoes x join public.apontamentos a on a.operacao_id=x.id where x.ordem_producao_id=o.id and a.termino_em is null) then v_result='bloqueado';v_motivo='A OP possui apontamento aberto.';
 elsif (select jsonb_agg(jsonb_build_object('sequencia',x.sequencia,'codigo',x.codigo,'descricao',x.descricao) order by x.sequencia) from public.operacoes x where x.ordem_producao_id=o.id)=v_novo then v_result='identico';v_motivo='Roteiro já está atualizado.';
 else
  select exists(select 1 from public.operacoes x join public.apontamentos a on a.operacao_id=x.id where x.ordem_producao_id=o.id) into v_hist;
  if v_hist and exists(select 1 from public.operacoes x where x.ordem_producao_id=o.id and exists(select 1 from public.apontamentos a where a.operacao_id=x.id) and not exists(select 1 from jsonb_array_elements(v_novo) n where (n->>'sequencia')::integer=x.sequencia and n->>'codigo'=x.codigo and n->>'descricao'=x.descricao)) then
   v_result='revisao_administrativa';v_motivo='O novo roteiro altera uma operação com histórico produtivo.';
  else
   delete from public.operacoes x where x.ordem_producao_id=o.id and not exists(select 1 from public.apontamentos a where a.operacao_id=x.id);
   for v_item in select value from jsonb_array_elements(v_novo) loop
    v_seq=(v_item->>'sequencia')::integer;
    select x.id into v_existente from public.operacoes x where x.ordem_producao_id=o.id and x.sequencia=v_seq and x.codigo=v_item->>'codigo' limit 1;
    if v_existente is null then insert into public.operacoes(ordem_producao_id,sequencia,codigo,descricao,status) values(o.id,v_seq,v_item->>'codigo',v_item->>'descricao',case when v_seq=1 then 'liberada'::public.status_operacao else 'aguardando'::public.status_operacao end);
    else update public.operacoes set descricao=v_item->>'descricao' where id=v_existente;end if;
   end loop;
   update public.grupos_preparacao_ops i set compatibilidade=case when exists(select 1 from public.operacoes x join public.grupos_preparacao g on g.id=i.preparacao_id where x.ordem_producao_id=i.ordem_producao_id and x.codigo=g.codigo_operacao) then 'compativel' else 'pendente' end,
    motivo_pendencia=case when exists(select 1 from public.operacoes x join public.grupos_preparacao g on g.id=i.preparacao_id where x.ordem_producao_id=i.ordem_producao_id and x.codigo=g.codigo_operacao) then null else 'Operação pretendida não encontrada no roteiro atualizado.' end
   where i.ordem_producao_id=o.id and exists(select 1 from public.grupos_preparacao g where g.id=i.preparacao_id and g.status='rascunho');
   v_result='atualizado';v_motivo='Roteiro atualizado com segurança pelo Microdata.';
  end if;
 end if;
 insert into public.auditoria_roteiros_microdata(ordem_producao_id,empresa,usuario_id,roteiro_anterior,roteiro_atualizado,alteracoes,resultado,motivo)
 values(o.id,nullif(trim(p_empresa),''),p_usuario_id,v_antigo,v_novo,jsonb_build_object('possui_historico',v_hist),v_result,v_motivo);
 return jsonb_build_object('status',v_result,'message',v_motivo,'order_id',o.id);
end;$$;

revoke all on function public.listar_preparacoes_agrupadas() from public,anon;
revoke all on function public.salvar_preparacao_agrupada(uuid,integer,text,uuid,uuid,text,jsonb) from public,anon;
revoke all on function public.descartar_preparacao_agrupada(uuid,integer) from public,anon;
revoke all on function public.iniciar_preparacao_agrupada(uuid,integer,text) from public,anon;
revoke all on function public.atualizar_roteiro_microdata_backend(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.listar_preparacoes_agrupadas(),public.salvar_preparacao_agrupada(uuid,integer,text,uuid,uuid,text,jsonb),public.descartar_preparacao_agrupada(uuid,integer),public.iniciar_preparacao_agrupada(uuid,integer,text) to authenticated;
grant execute on function public.atualizar_roteiro_microdata_backend(uuid,uuid,text,jsonb) to service_role;
