import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const read=path=>readFile(new URL(path,import.meta.url),"utf8");

test("rascunhos ficam separados dos apontamentos e usam versão otimista",async()=>{
 const sql=await read("../supabase/019_preparacao_agrupada_e_revalidacao.sql");
 assert.match(sql,/create table if not exists public\.grupos_preparacao\(/);
 assert.match(sql,/create table if not exists public\.grupos_preparacao_ops\(/);
 assert.match(sql,/versao integer not null default 1/);
 assert.match(sql,/v_atual<>p_versao/);
 assert.match(sql,/status='rascunho' for update/);
 assert.match(sql,/unique\(preparacao_id,ordem_producao_id\)/);
 assert.match(sql,/alter table public\.grupos_preparacao enable row level security/);
});

test("início produtivo revalida e conclui rascunho atomicamente",async()=>{
 const sql=await read("../supabase/019_preparacao_agrupada_e_revalidacao.sql");
 assert.match(sql,/create or replace function public\.iniciar_preparacao_agrupada/);
 assert.match(sql,/compatibilidade<>'compativel' or quantidade<=0/);
 assert.match(sql,/insert into public\.grupos_apontamento/);
 assert.match(sql,/insert into public\.apontamentos/);
 assert.match(sql,/status='concluido',grupo_apontamento_id=v_grupo/);
});

test("revalidação protege operações com histórico e audita resultados",async()=>{
 const [sql,edge]=await Promise.all([read("../supabase/019_preparacao_agrupada_e_revalidacao.sql"),read("../supabase/functions/consultar-op-microdata/index.ts")]);
 assert.match(sql,/auditoria_roteiros_microdata/);
 assert.match(sql,/revisao_administrativa/);
 assert.match(sql,/a\.termino_em is null/);
 assert.match(sql,/pg_advisory_xact_lock/);
 assert.match(edge,/action==="atualizar_roteiro"/);
 assert.match(edge,/atualizar_roteiro_microdata_backend/);
});

test("câmera contínua mantém um decodificador e grupo mostra compatibilidade",async()=>{
 const [scanner,grouped]=await Promise.all([read("../app/qr-camera-scanner.tsx"),read("../app/grouped-pointing.tsx")]);
 assert.match(scanner,/type ScanMode="single"\|"continuous"/);
 assert.match(scanner,/lastAcceptedRef\.current===number/);
 assert.match(scanner,/await onDetectedRef\.current\(number\)/);
 assert.match(grouped,/Ler várias OPs pela câmera/);
 assert.match(grouped,/Revalidar todas as pendentes/);
 assert.match(grouped,/Preparação salva/);
});
