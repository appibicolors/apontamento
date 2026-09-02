import test from "node:test";
import assert from "node:assert/strict";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const searchable=(value)=>value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^A-Z0-9\s]/gi," ");
test("reconhece as três OPs do PDF de referência",async()=>{
  const document=await getDocument({url:"../ORDEM DE PRODUÇÃO.pdf"}).promise;
  const found=new Set();
  for(let pageNumber=1;pageNumber<=document.numPages;pageNumber++){
    const content=await (await document.getPage(pageNumber)).getTextContent();
    let text="";for(const item of content.items)if("str" in item)text+=item.str+(item.hasEOL?"\n":" ");
    const match=searchable(text).match(/ORDEM\s+DE\s+PRODUCAO\s+(\d{5,})/i);
    if(match)found.add(match[1]);
  }
  assert.deepEqual([...found],["267649","267650","267653"]);
});
