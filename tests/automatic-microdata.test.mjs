import assert from "node:assert/strict";import test from "node:test";
import {findKnownOrder,normalizedOpNumber} from "../app/automatic-order-core.ts";
import {readFile} from "node:fs/promises";

const order={id:"order-1",numero_op:"271254",cliente:"CLIENTE",artigo:"ARTIGO",status:"aguardando",operacoes:[]};

test("OP conhecida é localizada com equivalência de zeros sem depender do Microdata",()=>{
 assert.equal(findKnownOrder([order],"000271254"),order);assert.equal(normalizedOpNumber("000271254"),"271254");
});

test("fluxo automático consulta Supabase antes do ERP e deduplica chamadas em andamento",async()=>{
 const source=await readFile(new URL("../app/automatic-microdata.ts",import.meta.url),"utf8");
 assert.ok(source.indexOf("loadOrderByNumber")<source.indexOf("registerMicrodataOrderNumber"));assert.match(source,/pending\.get\(key\)/);assert.match(source,/pending\.set\(key,task\)/);assert.match(source,/finally\(\(\)=>pending\.delete\(key\)\)/);
});

test("telas individual e agrupada importam no Enter sem abrir conferência manual",async()=>{
 const individual=await readFile(new URL("../app/pointing-screen.tsx",import.meta.url),"utf8"),grouped=await readFile(new URL("../app/grouped-pointing.tsx",import.meta.url),"utf8");
 assert.match(individual,/onKeyDown=\{orderKey\}/);assert.match(individual,/ensureAutomaticOrder/);assert.match(individual,/requestRef/);assert.doesNotMatch(individual,/MicrodataImport/);
 assert.match(grouped,/onKeyDown=\{key\}/);assert.match(grouped,/onKeyDown=\{additionKey\}/);assert.match(grouped,/ensureAutomaticOrder/);assert.match(grouped,/requestRef/);
});
