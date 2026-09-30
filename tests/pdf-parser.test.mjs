import assert from "node:assert/strict";
import test from "node:test";
import {parseArticleData,parseProductionOrderPages} from "../app/pdf-parser.ts";

const header="Artigo do Cliente Situação Peças Metros Peso";
const composition="Composição Cod. Cor Descrição da Cor Classificação Cor";

test("reads an ESTAMPADO article split across visual lines",()=>{
  assert.deepEqual(parseArticleData([
    header,
    "000305 TRICOLINE MILANO 002 ESTAMPADO",
    "11 1.844,10 295,06",
    composition,
  ],0),{codigo:"000305",artigo:"TRICOLINE MILANO",pecas:11,metros:1844.1,peso:295.06});
});

test("keeps numbers that belong to the article name",()=>{
  assert.deepEqual(parseArticleData([
    header,
    "000482 TRICOLINE BELLAGIO 180 FIOS 001 TINTO",
    "4 824,00 168,93",
    composition,
  ],0),{codigo:"000482",artigo:"TRICOLINE BELLAGIO 180 FIOS",pecas:4,metros:824,peso:168.93});
});

test("reads an alphanumeric article code without a gap before situation",()=>{
  assert.deepEqual(parseArticleData([
    header,
    "00482D TRICOLINE BELLAGIO ESTAMPADA DIGITAL001 TINTO",
    "6 1.070,00 219,36",
    composition,
  ],0),{codigo:"00482D",artigo:"TRICOLINE BELLAGIO ESTAMPADA DIGITAL",pecas:6,metros:1070,peso:219.36});
});

test("consolidates the six operations of OP 269246 split across two pages",()=>{
  const orders=parseProductionOrderPages([
    [
      "ORDEM DE PRODUÇÃO 269246",
      "Cliente Cliente Triangular NF Entrada Data OP",
      "ANTENOR PELLISSON INDUSTRIA E COM DE TECIDOS LTDA",
      "000021806 17/09/2026",
      "Artigo do Cliente Situação Peças Metros Peso",
      "AP0002 POLICOTTON 72%ALGODAO 28% POLIESTER 002 ESTAMPADO",
      "26 2.637,00 714,41",
      composition,
      "FLUXO: 0000000053 SUPER JIGGER / ESTAMPARIA / SEM CALANDRA",
      "Data Inic. H. Inicio Data Térm. H. Término Operador",
      "0002 ENROLAR CARROLÃO : :",
      "0004 SUPER JIGGER : :",
      "0023 SECAR RAMA : :",
      "Página 1 de 2",
    ],
    [
      "ORDEM DE PRODUÇÃO 269246",
      "RELAÇÃO DE PEÇAS DA OP",
      "Lote Nr. Peça Metros Inicial Peso Inicial METRAGEM REVISADA",
      "0017 ESTAMPARIA : :",
      "0003 ACABAR RAMA : :",
      "0019 REVISÃO : :",
      "PROCESSO PARÂMETRO ESPECIFICAÇÃO RESULTADO 1 RESULTADO 2 RESULTADO 3",
      "Página 2 de 2",
    ],
  ]);
  assert.equal(orders.length,1);
  assert.equal(orders[0].numero_op,"269246");
  assert.deepEqual(orders[0].paginas_origem,[1,2]);
  assert.deepEqual(orders[0].operacoes,[
    {codigo:"0002",descricao:"ENROLAR CARROLÃO"},
    {codigo:"0004",descricao:"SUPER JIGGER"},
    {codigo:"0023",descricao:"SECAR RAMA"},
    {codigo:"0017",descricao:"ESTAMPARIA"},
    {codigo:"0003",descricao:"ACABAR RAMA"},
    {codigo:"0019",descricao:"REVISÃO"},
  ]);
  assert.deepEqual(orders[0].avisos_extracao,["OP consolidada de 2 páginas."]);
});

test("preserves a legitimate repeated operation code on a continuation page",()=>{
  const orders=parseProductionOrderPages([
    ["ORDEM DE PRODUÇÃO 999001","Data Inic. H. Inicio Data Térm. H. Término Operador","0002 PRIMEIRA PASSAGEM : :"],
    ["ORDEM DE PRODUÇÃO 999001","0002 SEGUNDA PASSAGEM : :","PROCESSO PARÂMETRO ESPECIFICAÇÃO"],
  ]);
  assert.deepEqual(orders[0].operacoes.map(item=>item.codigo),["0002","0002"]);
});
