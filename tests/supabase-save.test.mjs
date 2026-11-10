import assert from "node:assert/strict";
import test from "node:test";

test("grava PDF por RPC atômica sem upsert destrutivo",async()=>{
  const requests=[];
  globalThis.fetch=async(url,init={})=>{
    requests.push({url:String(url),init});
    return new Response(JSON.stringify({status:"created",order_id:"op-id",numero_op:"267649",message:"ok"}),{status:200,headers:{"content-type":"application/json"}});
  };
  const {saveOrders}=await import("../app/supabase.ts");
  await saveOrders([{numero_op:"267649",cliente:"IBIRAPUERA TEXTIL LTDA",nf_entrada:"000116345",data_op:"2026-08-06",codigo_artigo:"000510",artigo:"MAQUINETADO ALGODAO POSITANO",pecas:6,metros:890,peso:127.38,operacoes:[{codigo:"0002",descricao:"ENROLAR CARROLÃO"},{codigo:"0019",descricao:"REVISÃO"}]}],{access_token:"token",refresh_token:"refresh",user:{id:"user-id"}});
  assert.equal(requests.length,1);
  assert.match(requests[0].url,/rpc\/cadastrar_op_pdf_seguro/);
  const payload=JSON.parse(requests[0].init.body).p_op;
  assert.equal(payload.dados_extraidos.origem,"pdf");
  assert.deepEqual(payload.operacoes.map(({codigo})=>codigo),["0002","0019"]);
});
