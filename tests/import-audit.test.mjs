import assert from "node:assert/strict";
import test from "node:test";
import {auditImportedOrder} from "../app/import-audit.ts";

const base={id:"op",numero_op:"269246",cliente:"PELLISSON",nf_entrada:"000021806",artigo:"POLICOTTON",status:"aguardando"};

test("flags legacy PDF imports for manual review",()=>{
  const result=auditImportedOrder({...base,dados_extraidos:{origem:"pdf",conferido:true},operacoes:[
    {id:"1",codigo:"0002",descricao:"ENROLAR",status:"finalizada",sequencia:1},
    {id:"2",codigo:"0004",descricao:"JIGGER",status:"aguardando",sequencia:2},
    {id:"3",codigo:"0023",descricao:"RAMA",status:"aguardando",sequencia:3},
  ]});
  assert.equal(result.severity,"review");
  assert.ok(result.issues.some(issue=>issue.includes("leitor anterior")));
  assert.ok(result.issues.some(issue=>issue.includes("0019")));
});

test("accepts a structurally complete import from parser version 2",()=>{
  const result=auditImportedOrder({...base,dados_extraidos:{origem:"pdf",parser_versao:2,paginas:[1,2],avisos:[]},operacoes:[
    {id:"1",codigo:"0002",descricao:"ENROLAR",status:"aguardando",sequencia:1},
    {id:"2",codigo:"0019",descricao:"REVISÃO",status:"aguardando",sequencia:2},
  ]});
  assert.equal(result.severity,"ok");
});

test("does not keep the legacy warning after an administrator audits the flow",()=>{
  const result=auditImportedOrder({...base,dados_extraidos:{origem:"pdf",fluxo_auditado:true},operacoes:[
    {id:"1",codigo:"0002",descricao:"ENROLAR",status:"aguardando",sequencia:1},
    {id:"2",codigo:"0019",descricao:"REVISÃO",status:"aguardando",sequencia:2},
  ]});
  assert.equal(result.severity,"ok");
});
