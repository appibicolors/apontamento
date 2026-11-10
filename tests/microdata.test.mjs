import assert from "node:assert/strict";import test from "node:test";
import {microdataToParsedOrder,validateMicrodataOrder} from "../app/microdata.ts";

test("adapta contrato Microdata preservando a sequência ERP e repetições",()=>{
 const order=microdataToParsedOrder({contrato_versao:"1",empresa:"07",numero_op:"269999",cliente:"CLIENTE",nf_entrada:"123",data_op:"2026-11-10",codigo_artigo:"ab1234",artigo:"ARTIGO",pecas:2,metros:10.5,peso:3.2,avisos:["Conferir peso"],operacoes:[{sequencia:3,codigo:"19",descricao:"REVISÃO"},{sequencia:1,codigo:"2",descricao:"ENROLAR"},{sequencia:2,codigo:"2",descricao:"ENROLAR NOVAMENTE"}]});
 assert.equal(order.empresa_origem,"07");assert.equal(order.codigo_artigo,"AB1234");
 assert.deepEqual(order.operacoes,[{codigo:"0002",descricao:"ENROLAR"},{codigo:"0002",descricao:"ENROLAR NOVAMENTE"},{codigo:"0019",descricao:"REVISÃO"}]);
 assert.deepEqual(order.avisos_extracao,["Conferir peso"]);assert.deepEqual(validateMicrodataOrder(order),[]);
});

test("bloqueia contrato sem roteiro e campos essenciais",()=>{
 const order=microdataToParsedOrder({contrato_versao:"1",empresa:"07",numero_op:"x",cliente:null,nf_entrada:null,data_op:null,codigo_artigo:null,artigo:null,pecas:null,metros:null,peso:null,avisos:[],operacoes:[]});
 assert.deepEqual(validateMicrodataOrder(order),["Número da OP inválido.","Cliente não informado pelo ERP.","Artigo não informado pelo ERP.","O ERP não retornou o roteiro produtivo."]);
});
