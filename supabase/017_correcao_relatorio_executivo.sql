-- Corrige aliases duplicados na CTE da visão executiva instalada pela migração 016.
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

revoke all on function public.relatorio_executivo_admin(timestamptz,timestamptz,integer,integer) from public,anon;
grant execute on function public.relatorio_executivo_admin(timestamptz,timestamptz,integer,integer) to authenticated;
