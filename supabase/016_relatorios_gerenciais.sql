-- Relatórios gerenciais somente leitura, exclusivos para administrador ativo.
-- Aplicar manualmente no SQL Editor antes de publicar a interface correspondente.

create index if not exists apontamentos_maquina_inicio_idx on public.apontamentos(maquina_id,inicio_em desc);
create index if not exists apontamentos_operacao_inicio_idx on public.apontamentos(operacao_id,inicio_em desc);
create index if not exists apontamentos_grupo_idx on public.apontamentos(grupo_id) where grupo_id is not null;
create index if not exists ordens_data_op_idx on public.ordens_producao(data_op desc);

create or replace function public.relatorio_ops_admin(
 p_data_de date default null,p_data_ate date default null,p_pesquisa text default null,
 p_status text default null,p_pagina integer default 1,p_tamanho integer default 25
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_total bigint;v_items jsonb;
begin
 perform public.exigir_admin();
 if p_data_de is not null and p_data_ate is not null and p_data_de>p_data_ate then raise exception 'Data inicial não pode ser maior que a final.';end if;
 if p_pagina<1 or p_tamanho<1 or p_tamanho>100 then raise exception 'Paginação inválida. Use páginas de 1 a 100 registros.';end if;
 with filtradas as(
  select op.* from public.ordens_producao op where
   (p_data_de is null or op.data_op>=p_data_de) and (p_data_ate is null or op.data_op<=p_data_ate) and
   (p_status is null or p_status='' or p_status='todas' or op.status::text=p_status or (p_status='abertas' and op.encerrada_em is null and op.status<>'cancelada')) and
   (nullif(trim(p_pesquisa),'') is null or concat_ws(' ',op.numero_op,op.cliente,op.nf_entrada,op.codigo_artigo,op.artigo) ilike '%'||trim(p_pesquisa)||'%')
 ) select count(*) into v_total from filtradas;
 with filtradas as(
  select op.* from public.ordens_producao op where
   (p_data_de is null or op.data_op>=p_data_de) and (p_data_ate is null or op.data_op<=p_data_ate) and
   (p_status is null or p_status='' or p_status='todas' or op.status::text=p_status or (p_status='abertas' and op.encerrada_em is null and op.status<>'cancelada')) and
   (nullif(trim(p_pesquisa),'') is null or concat_ws(' ',op.numero_op,op.cliente,op.nf_entrada,op.codigo_artigo,op.artigo) ilike '%'||trim(p_pesquisa)||'%')
  order by op.data_op desc nulls last,op.numero_op desc limit p_tamanho offset (p_pagina-1)*p_tamanho
 ),resumo as(
  select f.*,
   (select count(*) from public.operacoes o where o.ordem_producao_id=f.id) operacoes_total,
   (select count(*) from public.operacoes o where o.ordem_producao_id=f.id and exists(select 1 from public.apontamentos a where a.operacao_id=o.id and a.termino_em is not null)) operacoes_com_apontamento,
   (select count(*) from public.apontamentos a join public.operacoes o on o.id=a.operacao_id where o.ordem_producao_id=f.id) execucoes_total,
   (select count(*) from public.apontamentos a join public.operacoes o on o.id=a.operacao_id where o.ordem_producao_id=f.id and a.termino_em is null) execucoes_abertas,
   (select min(a.inicio_em) from public.apontamentos a join public.operacoes o on o.id=a.operacao_id where o.ordem_producao_id=f.id) primeiro_inicio,
   (select max(coalesce(a.termino_em,a.inicio_em)) from public.apontamentos a join public.operacoes o on o.id=a.operacao_id where o.ordem_producao_id=f.id) ultima_movimentacao,
   (select coalesce(sum(case when a.termino_em is null then 0 when a.grupo_id is not null and a.duracao_rateada_segundos is not null then a.duracao_rateada_segundos else extract(epoch from a.termino_em-a.inicio_em) end),0) from public.apontamentos a join public.operacoes o on o.id=a.operacao_id where o.ordem_producao_id=f.id) segundos_fechados,
   (select count(distinct a.operador_id) from public.apontamentos a join public.operacoes o on o.id=a.operacao_id where o.ordem_producao_id=f.id) operadores_distintos,
   (select count(distinct a.maquina_id) from public.apontamentos a join public.operacoes o on o.id=a.operacao_id where o.ordem_producao_id=f.id) maquinas_distintas
  from filtradas f
 ) select coalesce(jsonb_agg(to_jsonb(resumo)),'[]'::jsonb) into v_items from resumo;
 return jsonb_build_object('total',v_total,'pagina',p_pagina,'tamanho',p_tamanho,'atualizado_em',now(),'items',v_items);
end;$$;

create or replace function public.relatorio_op_detalhe_admin(
 p_ordem_id uuid,p_inicio timestamptz default null,p_fim timestamptz default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_result jsonb;v_de timestamptz:=coalesce(p_inicio,'1900-01-01'::timestamptz);v_ate timestamptz:=coalesce(p_fim,now());
begin
 perform public.exigir_admin();
 if v_de>=v_ate then raise exception 'Período inválido.';end if;
 with base as(
  select a.*,o.id operacao_uuid,o.sequencia,o.codigo,o.descricao,o.status operacao_status,p.nome operador,m.codigo maquina_codigo,m.nome maquina_nome,g.grupo_origem_id,
   sum(coalesce(a.quantidade_rateio,0)) over(partition by a.grupo_id) peso_grupo
  from public.operacoes o left join public.apontamentos a on a.operacao_id=o.id and a.inicio_em<v_ate and coalesce(a.termino_em,now())>v_de
  left join public.perfis p on p.id=a.operador_id left join public.maquinas m on m.id=a.maquina_id
  left join public.grupos_apontamento g on g.id=a.grupo_id
  where o.ordem_producao_id=p_ordem_id
 ),calc as(
  select b.*,case when b.id is null then 0 when b.termino_em is not null and b.grupo_id is not null and b.duracao_rateada_segundos is not null then
   round(b.duracao_rateada_segundos*extract(epoch from least(b.termino_em,v_ate)-greatest(b.inicio_em,v_de))/greatest(1,extract(epoch from b.termino_em-b.inicio_em)))
   when b.termino_em is null and b.grupo_id is not null then round(extract(epoch from least(now(),v_ate)-greatest(b.inicio_em,v_de))*coalesce(b.quantidade_rateio,0)/greatest(1,b.peso_grupo))
   else round(extract(epoch from least(coalesce(b.termino_em,now()),v_ate)-greatest(b.inicio_em,v_de))) end segundos_periodo
  from base b
 ),ops as(
  select operacao_uuid,sequencia,codigo,descricao,operacao_status,
   count(id) execucoes_total,count(id) filter(where termino_em is null) execucoes_abertas,
   min(inicio_em) primeiro_inicio,max(termino_em) ultimo_termino,
   coalesce(sum(segundos_periodo) filter(where termino_em is not null),0) segundos_fechados,
   coalesce(sum(segundos_periodo) filter(where termino_em is null),0) segundos_abertos,
   coalesce(jsonb_agg(jsonb_build_object('id',id,'operador_id',operador_id,'operador',operador,'maquina_id',maquina_id,'maquina_codigo',maquina_codigo,'maquina_nome',maquina_nome,'inicio_em',inicio_em,'termino_em',termino_em,'segundos_periodo',segundos_periodo,'observacao',observacao,'motivo_finalizacao',motivo_finalizacao,'grupo_id',grupo_id,'grupo_origem_id',grupo_origem_id,'criterio_rateio',criterio_rateio,'quantidade_rateio',quantidade_rateio,'duracao_rateada_segundos',duracao_rateada_segundos) order by inicio_em) filter(where id is not null),'[]'::jsonb) apontamentos
  from calc group by operacao_uuid,sequencia,codigo,descricao,operacao_status order by sequencia
 ) select jsonb_build_object('ordem',to_jsonb(op),'operacoes',coalesce((select jsonb_agg(to_jsonb(ops) order by sequencia) from ops),'[]'::jsonb),'atualizado_em',now()) into v_result
 from public.ordens_producao op where op.id=p_ordem_id;
 if v_result is null then raise exception 'OP não encontrada.';end if;return v_result;
end;$$;

create or replace function public.relatorio_maquinas_admin(
 p_inicio timestamptz,p_fim timestamptz,p_pesquisa text default null,p_situacao text default null,
 p_pagina integer default 1,p_tamanho integer default 25
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_total bigint;v_items jsonb;
begin
 perform public.exigir_admin();
 if p_inicio>=p_fim then raise exception 'Período inválido.';end if;
 if p_pagina<1 or p_tamanho<1 or p_tamanho>100 then raise exception 'Paginação inválida.';end if;
 with intervalos as(
  select distinct on(a.maquina_id,coalesce(a.grupo_id,a.id)) a.maquina_id,coalesce(a.grupo_id,a.id) chave,a.inicio_em,coalesce(a.termino_em,now()) fim,a.termino_em is null aberto
  from public.apontamentos a where a.inicio_em<p_fim and coalesce(a.termino_em,now())>p_inicio
  order by a.maquina_id,coalesce(a.grupo_id,a.id),a.inicio_em
 ),agg as(
  select m.id,coalesce(sum(extract(epoch from least(i.fim,p_fim)-greatest(i.inicio_em,p_inicio))),0) segundos,
   count(*) filter(where i.chave is not null) execucoes,count(*) filter(where i.aberto) abertos,max(i.inicio_em) ultimo_inicio
  from public.maquinas m left join intervalos i on i.maquina_id=m.id group by m.id
 ),filtradas as(
  select m.*,a.segundos,a.execucoes,a.abertos,a.ultimo_inicio,
   (select max(x.termino_em) from public.apontamentos x where x.maquina_id=m.id) ultimo_termino,
   (select count(distinct o.ordem_producao_id) from public.apontamentos x join public.operacoes o on o.id=x.operacao_id where x.maquina_id=m.id and x.inicio_em<p_fim and coalesce(x.termino_em,now())>p_inicio) ops_distintas,
   (select count(distinct x.operador_id) from public.apontamentos x where x.maquina_id=m.id and x.inicio_em<p_fim and coalesce(x.termino_em,now())>p_inicio) operadores_distintos,
   case when exists(select 1 from public.apontamentos x where x.maquina_id=m.id and x.termino_em is null) then 'em_andamento'
    when (select x.motivo_finalizacao from public.apontamentos x where x.maquina_id=m.id order by coalesce(x.termino_em,x.inicio_em) desc limit 1) in('pausa','parada_maquina') then 'parada' else 'sem_apontamento' end situacao
  from public.maquinas m join agg a on a.id=m.id
  where (nullif(trim(p_pesquisa),'') is null or concat_ws(' ',m.codigo,m.nome,m.setor) ilike '%'||trim(p_pesquisa)||'%')
 ),filtro as(select * from filtradas where p_situacao is null or p_situacao='' or p_situacao='todas' or situacao=p_situacao)
 select count(*) into v_total from filtro;
 with intervalos as(
  select distinct on(a.maquina_id,coalesce(a.grupo_id,a.id)) a.maquina_id,coalesce(a.grupo_id,a.id) chave,a.inicio_em,coalesce(a.termino_em,now()) fim,a.termino_em is null aberto
  from public.apontamentos a where a.inicio_em<p_fim and coalesce(a.termino_em,now())>p_inicio order by a.maquina_id,coalesce(a.grupo_id,a.id),a.inicio_em
 ),agg as(select m.id,coalesce(sum(extract(epoch from least(i.fim,p_fim)-greatest(i.inicio_em,p_inicio))),0) segundos,count(i.chave) execucoes,count(i.chave) filter(where i.aberto) abertos,max(i.inicio_em) ultimo_inicio from public.maquinas m left join intervalos i on i.maquina_id=m.id group by m.id),filtradas as(
  select m.*,a.segundos,a.execucoes,a.abertos,a.ultimo_inicio,(select max(x.termino_em) from public.apontamentos x where x.maquina_id=m.id) ultimo_termino,
   (select count(distinct o.ordem_producao_id) from public.apontamentos x join public.operacoes o on o.id=x.operacao_id where x.maquina_id=m.id and x.inicio_em<p_fim and coalesce(x.termino_em,now())>p_inicio) ops_distintas,
   (select count(distinct x.operador_id) from public.apontamentos x where x.maquina_id=m.id and x.inicio_em<p_fim and coalesce(x.termino_em,now())>p_inicio) operadores_distintos,
   case when exists(select 1 from public.apontamentos x where x.maquina_id=m.id and x.termino_em is null) then 'em_andamento' when (select x.motivo_finalizacao from public.apontamentos x where x.maquina_id=m.id order by coalesce(x.termino_em,x.inicio_em) desc limit 1) in('pausa','parada_maquina') then 'parada' else 'sem_apontamento' end situacao
  from public.maquinas m join agg a on a.id=m.id where (nullif(trim(p_pesquisa),'') is null or concat_ws(' ',m.codigo,m.nome,m.setor) ilike '%'||trim(p_pesquisa)||'%')
 ),filtro as(select * from filtradas where p_situacao is null or p_situacao='' or p_situacao='todas' or situacao=p_situacao order by segundos desc,codigo limit p_tamanho offset (p_pagina-1)*p_tamanho)
 select coalesce(jsonb_agg(to_jsonb(filtro)),'[]'::jsonb) into v_items from filtro;
 return jsonb_build_object('total',v_total,'pagina',p_pagina,'tamanho',p_tamanho,'atualizado_em',now(),'items',v_items);
end;$$;

create or replace function public.relatorio_executivo_admin(p_inicio timestamptz,p_fim timestamptz,p_aberto_horas integer default 8,p_inativo_dias integer default 3)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_result jsonb;
begin
 perform public.exigir_admin();if p_inicio>=p_fim then raise exception 'Período inválido.';end if;
 with base as(
  select a.*,o.codigo operacao_codigo,o.descricao operacao_descricao,op.id ordem_id,op.numero_op,op.cliente,m.codigo maquina_codigo,
   sum(coalesce(a.quantidade_rateio,0)) over(partition by a.grupo_id) peso_grupo
  from public.apontamentos a join public.operacoes o on o.id=a.operacao_id join public.ordens_producao op on op.id=o.ordem_producao_id join public.maquinas m on m.id=a.maquina_id
  where a.inicio_em<p_fim and coalesce(a.termino_em,now())>p_inicio
 ),pontos as(
  select a.*,
   case when a.termino_em is not null and a.grupo_id is not null and a.duracao_rateada_segundos is not null then round(a.duracao_rateada_segundos*extract(epoch from least(a.termino_em,p_fim)-greatest(a.inicio_em,p_inicio))/greatest(1,extract(epoch from a.termino_em-a.inicio_em)))
   when a.termino_em is null and a.grupo_id is not null then round(extract(epoch from least(now(),p_fim)-greatest(a.inicio_em,p_inicio))*coalesce(a.quantidade_rateio,0)/greatest(1,a.peso_grupo))
   else round(extract(epoch from least(coalesce(a.termino_em,now()),p_fim)-greatest(a.inicio_em,p_inicio))) end segundos
  from base a
 ),rank_maquina as(select maquina_codigo nome,round(sum(segundos)) segundos from pontos group by maquina_codigo order by segundos desc limit 8),
 rank_operacao as(select operacao_codigo||' · '||operacao_descricao nome,round(sum(segundos)) segundos from pontos group by operacao_codigo,operacao_descricao order by segundos desc limit 8),
 rank_cliente as(select cliente nome,round(sum(segundos)) segundos from pontos group by cliente order by segundos desc limit 8),
 motivos as(select coalesce(motivo_finalizacao,'aberto') nome,count(*) quantidade from pontos group by motivo_finalizacao order by quantidade desc),
 dias as(select (inicio_em at time zone 'America/Sao_Paulo')::date dia,round(sum(segundos)) segundos from pontos group by 1 order by 1),
 grupos_maquina as(select distinct on(maquina_id,coalesce(grupo_id,id)) maquina_id,coalesce(grupo_id,id) chave,inicio_em,coalesce(termino_em,now()) fim from pontos order by maquina_id,coalesce(grupo_id,id),inicio_em),
 riscos as(select op.numero_op,op.cliente,op.codigo_artigo,op.artigo,op.prazo_estimado from public.ordens_producao op where op.encerrada_em is null and op.status<>'cancelada' and op.prazo_estimado is not null order by op.prazo_estimado limit 10)
 select jsonb_build_object('atualizado_em',now(),'kpis',jsonb_build_object(
  'ops_periodo',(select count(*) from public.ordens_producao op where op.data_op between (p_inicio at time zone 'America/Sao_Paulo')::date and ((p_fim-interval '1 microsecond') at time zone 'America/Sao_Paulo')::date),
  'ops_em_producao',(select count(*) from public.ordens_producao where status='em_producao' and encerrada_em is null),
  'ops_encerradas',(select count(*) from public.ordens_producao where encerrada_em>=p_inicio and encerrada_em<p_fim),
  'ops_atrasadas',(select count(*) from public.ordens_producao where encerrada_em is null and status<>'cancelada' and prazo_estimado<(now() at time zone 'America/Sao_Paulo')::date),
  'apontamentos_abertos',(select count(*) from public.apontamentos where termino_em is null),
  'abertos_longos',(select count(*) from public.apontamentos where termino_em is null and inicio_em<now()-make_interval(hours=>greatest(1,p_aberto_horas))),
  'segundos_fechados',(select coalesce(sum(segundos),0) from pontos where termino_em is not null),
  'segundos_abertos_estimados',(select coalesce(sum(segundos),0) from pontos where termino_em is null),
  'segundos_maquina',(select coalesce(sum(extract(epoch from least(fim,p_fim)-greatest(inicio_em,p_inicio))),0) from grupos_maquina),
  'maquinas_ativas_agora',(select count(distinct maquina_id) from public.apontamentos where termino_em is null),
  'maquinas_sem_movimento',(select count(*) from public.maquinas m where m.ativa and not exists(select 1 from public.apontamentos a where a.maquina_id=m.id and a.inicio_em>=now()-make_interval(days=>greatest(1,p_inativo_dias))))
 ),'horas_por_dia',(select coalesce(jsonb_agg(to_jsonb(dias)),'[]'::jsonb) from dias),'ranking_maquinas',(select coalesce(jsonb_agg(to_jsonb(rank_maquina)),'[]'::jsonb) from rank_maquina),'ranking_operacoes',(select coalesce(jsonb_agg(to_jsonb(rank_operacao)),'[]'::jsonb) from rank_operacao),'ranking_clientes',(select coalesce(jsonb_agg(to_jsonb(rank_cliente)),'[]'::jsonb) from rank_cliente),'motivos',(select coalesce(jsonb_agg(to_jsonb(motivos)),'[]'::jsonb) from motivos),'ops_risco',(select coalesce(jsonb_agg(to_jsonb(riscos)),'[]'::jsonb) from riscos)) into v_result;
 return v_result;
end;$$;

create or replace function public.relatorio_maquina_detalhe_admin(
 p_maquina_id uuid,p_inicio timestamptz,p_fim timestamptz,p_pagina integer default 1,p_tamanho integer default 50
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_total bigint;v_items jsonb;v_maquina jsonb;
begin
 perform public.exigir_admin();
 if p_inicio>=p_fim then raise exception 'Período inválido.';end if;
 if p_pagina<1 or p_tamanho<1 or p_tamanho>100 then raise exception 'Paginação inválida.';end if;
 select to_jsonb(m) into v_maquina from public.maquinas m where m.id=p_maquina_id;
 if v_maquina is null then raise exception 'Máquina não encontrada.';end if;
 select count(*) into v_total from public.apontamentos a where a.maquina_id=p_maquina_id and a.inicio_em<p_fim and coalesce(a.termino_em,now())>p_inicio;
 with dados as(
  select a.id,op.id ordem_id,op.numero_op,op.cliente,op.codigo_artigo,op.artigo,o.id operacao_id,o.sequencia,o.codigo operacao_codigo,o.descricao operacao_descricao,
   p.nome operador,a.inicio_em,a.termino_em,a.observacao,a.motivo_finalizacao,a.grupo_id,g.grupo_origem_id,a.criterio_rateio,a.quantidade_rateio,
   round(extract(epoch from least(coalesce(a.termino_em,now()),p_fim)-greatest(a.inicio_em,p_inicio))) segundos_periodo,
   case when a.grupo_id is null then 'individual' else 'agrupado' end tipo
  from public.apontamentos a join public.operacoes o on o.id=a.operacao_id join public.ordens_producao op on op.id=o.ordem_producao_id
  join public.perfis p on p.id=a.operador_id left join public.grupos_apontamento g on g.id=a.grupo_id
  where a.maquina_id=p_maquina_id and a.inicio_em<p_fim and coalesce(a.termino_em,now())>p_inicio
  order by a.inicio_em desc limit p_tamanho offset (p_pagina-1)*p_tamanho
 ) select coalesce(jsonb_agg(to_jsonb(dados)),'[]'::jsonb) into v_items from dados;
 return jsonb_build_object('maquina',v_maquina,'total',v_total,'pagina',p_pagina,'tamanho',p_tamanho,'atualizado_em',now(),'items',v_items);
end;$$;

revoke all on function public.relatorio_ops_admin(date,date,text,text,integer,integer) from public,anon;
revoke all on function public.relatorio_op_detalhe_admin(uuid,timestamptz,timestamptz) from public,anon;
revoke all on function public.relatorio_maquinas_admin(timestamptz,timestamptz,text,text,integer,integer) from public,anon;
revoke all on function public.relatorio_executivo_admin(timestamptz,timestamptz,integer,integer) from public,anon;
revoke all on function public.relatorio_maquina_detalhe_admin(uuid,timestamptz,timestamptz,integer,integer) from public,anon;
grant execute on function public.relatorio_ops_admin(date,date,text,text,integer,integer) to authenticated;
grant execute on function public.relatorio_op_detalhe_admin(uuid,timestamptz,timestamptz) to authenticated;
grant execute on function public.relatorio_maquinas_admin(timestamptz,timestamptz,text,text,integer,integer) to authenticated;
grant execute on function public.relatorio_executivo_admin(timestamptz,timestamptz,integer,integer) to authenticated;
grant execute on function public.relatorio_maquina_detalhe_admin(uuid,timestamptz,timestamptz,integer,integer) to authenticated;

