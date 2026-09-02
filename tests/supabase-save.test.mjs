import assert from "node:assert/strict";
import test from "node:test";

test("grava a OP por upsert e cria uma operação para cada etapa do fluxo",async()=>{
  const requests=[];
  globalThis.fetch=async(url,init={})=>{
    requests.push({url:String(url),init});
    if(String(url).includes("ordens_producao"))return new Response(JSON.stringify([{id:"op-id"}]),{status:201,headers:{"content-type":"application/json"}});
    return new Response("",{status:201});
  };
  const {saveOrders}=await import("../app/supabase.ts");
  await saveOrders([{numero_op:"267649",cliente:"IBIRAPUERA TEXTIL LTDA",nf_entrada:"000116345",data_op:"2026-08-06",codigo_artigo:"000510",artigo:"MAQUINETADO ALGODAO POSITANO",pecas:6,metros:890,peso:127.38,operacoes:[{codigo:"0002",descricao:"ENROLAR CARROLÃO"},{codigo:"0019",descricao:"REVISÃO"}]}],{access_token:"token",refresh_token:"refresh",user:{id:"user-id"}});
  assert.equal(requests.length,2);
  assert.match(requests[0].url,/on_conflict=numero_op/);
  assert.equal(requests[0].init.headers.Prefer,"resolution=merge-duplicates,return=representation");
  assert.match(requests[1].url,/on_conflict=ordem_producao_id,sequencia/);
  const operationRows=JSON.parse(requests[1].init.body);
  assert.deepEqual(operationRows.map(({sequencia,codigo,status})=>({sequencia,codigo,status})),[{sequencia:1,codigo:"0002",status:"liberada"},{sequencia:2,codigo:"0019",status:"aguardando"}]);
});
