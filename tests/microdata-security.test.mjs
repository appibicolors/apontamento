import assert from "node:assert/strict";import test from "node:test";import {readFile} from "node:fs/promises";

test("Edge Function mantém chave Microdata somente em secret e valida perfil",async()=>{
 const source=await readFile(new URL("../supabase/functions/consultar-op-microdata/index.ts",import.meta.url),"utf8");
 assert.match(source,/Deno\.env\.get\("MICRODATA_OP_API_KEY"\)/);assert.match(source,/Deno\.env\.get\("MICRODATA_OP_API_BASE_URL"\)/);
 assert.match(source,/profile==="consulta"/);assert.match(source,/\/auth\/v1\/user/);assert.doesNotMatch(source,/Bearer\s+(?!\$\{key\})[A-Za-z0-9_-]{20,}/);
 assert.match(source,/invalid_quantities/);assert.match(source,/sameOpIdentifier/);assert.match(source,/normalizeMicrodataPayload/);for(const status of [400,401,404,409,429,503,504])assert.match(source,new RegExp(String(status)));
});

test("migração garante cadastro atômico, duplicidade e RPC privada",async()=>{
 const sql=await readFile(new URL("../supabase/018_integracao_microdata.sql",import.meta.url),"utf8");
 assert.match(sql,/pg_advisory_xact_lock/);assert.match(sql,/existing_with_history/);assert.match(sql,/grant execute on function public\.cadastrar_op_microdata_backend\(uuid,jsonb\) to service_role/i);
 assert.match(sql,/revoke all on function public\.cadastrar_op_microdata_backend\(uuid,jsonb\) from public,anon,authenticated/i);assert.doesNotMatch(sql,/\b(?:truncate|delete\s+from)\b/i);
});
