import assert from "node:assert/strict";
import test from "node:test";
import {parseArticleData} from "../app/pdf-parser.ts";

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
