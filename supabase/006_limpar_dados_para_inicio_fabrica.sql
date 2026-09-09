-- ATENÇÃO: remove definitivamente os testes de produção.
-- PRESERVA usuários/perfis e máquinas cadastradas.
begin;
delete from public.apontamentos;
delete from public.operacoes;
delete from public.ordens_producao;
commit;

-- O resultado esperado é zero nas três colunas.
select
 (select count(*) from public.ordens_producao) as ordens,
 (select count(*) from public.operacoes) as operacoes,
 (select count(*) from public.apontamentos) as apontamentos;
