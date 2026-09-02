import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

const clean=(value)=>value.replace(/\s+/g," ").trim();
const searchable=(value)=>clean(value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^A-Z0-9\s]/gi," ")).toUpperCase();
const numberBR=(value)=>Number(value.replace(/\./g,"").replace(",","."));
function visualLines(items){
  const rows=[];
  for(const item of items){if(!item.str.trim())continue;const x=Number(item.transform[4]),y=Number(item.transform[5]);let row=rows.find(candidate=>Math.abs(candidate.y-y)<1.5);if(!row){row={y,parts:[]};rows.push(row)}row.parts.push({x,text:item.str})}
  return rows.sort((a,b)=>b.y-a.y).map(row=>clean(row.parts.sort((a,b)=>a.x-b.x).map(part=>part.text).join(" "))).filter(Boolean);
}
function parseHeader(lines){
  const op=searchable(lines.join("\n")).match(/ORDEM DE PRODUCAO\s+(\d{5,})/i)?.[1]??"";
  const clientHeader=lines.findIndex(line=>searchable(line).includes("CLIENTE TRIANGULAR")&&searchable(line).includes("NF ENTRADA"));
  const articleHeader=lines.findIndex(line=>searchable(line).includes("ARTIGO DO CLIENTE")&&searchable(line).includes("PECAS"));
  const headerRows=lines.slice(clientHeader+1,articleHeader>clientHeader?articleHeader:clientHeader+4);
  const client=headerRows.find(line=>!/\d{2}\/\d{2}\/\d{4}/.test(line))??"";
  const nfMatch=headerRows.find(line=>/\d+\s+\d{2}\/\d{2}\/\d{4}/.test(line))?.match(/(\d+)\s+(\d{2})\/(\d{2})\/(\d{4})/);
  const articleLine=articleHeader>=0?clean(`${lines[articleHeader+1]??""} ${lines[articleHeader+2]??""}`):"";
  const article=articleLine.match(/^(\d{6})\s+(.+?)\s+\d{3}\s+TINTO\s+(\d+)\s+([\d.]+,\d{2})\s+([\d.]+,\d{2})$/i);
  return {op,client,nf:nfMatch?.[1]??"",date:nfMatch?`${nfMatch[4]}-${nfMatch[3]}-${nfMatch[2]}`:"",code:article?.[1]??"",article:article?.[2]??"",pieces:Number(article?.[3]??0),meters:numberBR(article?.[4]??"0"),weight:numberBR(article?.[5]??"0")};
}

test("extracts all OP header fields from the production PDF",async()=>{
  const data=await readFile(new URL("../../ORDEM DE PRODUÇÃO.pdf",import.meta.url));
  const document=await pdfjs.getDocument({data:new Uint8Array(data),disableWorker:true}).promise;
  const actual=[];
  for(let pageNumber=1;pageNumber<=document.numPages;pageNumber++){
    const content=await (await document.getPage(pageNumber)).getTextContent();
    const lines=visualLines(content.items.filter(item=>"str" in item&&"transform" in item));
    const header=parseHeader(lines);
    if(header.op&&!actual.some(item=>item.op===header.op))actual.push(header);
  }
  assert.deepEqual(actual,[
    {op:"267649",client:"IBIRAPUERA TEXTIL LTDA",nf:"000116345",date:"2026-08-06",code:"000510",article:"MAQUINETADO ALGODAO POSITANO",pieces:6,meters:890,weight:127.38},
    {op:"267650",client:"IBIRAPUERA TEXTIL LTDA",nf:"000116345",date:"2026-08-06",code:"000690",article:"SARJA FLANELADA 78 CM",pieces:14,meters:1163,weight:399.58},
    {op:"267653",client:"IBIRAPUERA TEXTIL LTDA",nf:"000116345",date:"2026-08-06",code:"006040",article:"COTTON SOFT LISTRADO 40/1",pieces:5,meters:742,weight:130.69},
  ]);
});
