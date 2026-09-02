export type ParsedOperation={codigo:string;descricao:string};
export type ParsedOrder={numero_op:string;cliente:string;nf_entrada:string;data_op:string;codigo_artigo:string;artigo:string;pecas:number;metros:number;peso:number;operacoes:ParsedOperation[]};
type PositionedText={str:string;transform:ArrayLike<number>};
const clean=(value:string)=>value.replace(/\s+/g," ").trim();
const searchable=(value:string)=>clean(value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^A-Z0-9\s]/gi," ")).toUpperCase();
const numberBR=(value:string)=>Number(value.replace(/\./g,"").replace(",","."));
function visualLines(items:PositionedText[]){
  const rows:Array<{y:number;parts:Array<{x:number;text:string}>}>=[];
  for(const item of items){if(!item.str.trim())continue;const x=Number(item.transform[4]),y=Number(item.transform[5]);let row=rows.find(candidate=>Math.abs(candidate.y-y)<1.5);if(!row){row={y,parts:[]};rows.push(row)}row.parts.push({x,text:item.str})}
  return rows.sort((a,b)=>b.y-a.y).map(row=>clean(row.parts.sort((a,b)=>a.x-b.x).map(part=>part.text).join(" "))).filter(Boolean);
}
export async function parseProductionOrders(file:File):Promise<ParsedOrder[]>{
  const pdfjs=await import("pdfjs-dist/legacy/build/pdf.mjs");
  const bundledWorkerPath=new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs",import.meta.url).pathname;
  pdfjs.GlobalWorkerOptions.workerSrc=new URL(bundledWorkerPath,window.location.origin).href;
  const document=await pdfjs.getDocument({data:await file.arrayBuffer()}).promise;
  const found=new Map<string,ParsedOrder>();
  for(let pageNumber=1;pageNumber<=document.numPages;pageNumber++){
    const content=await (await document.getPage(pageNumber)).getTextContent();
    const lines=visualLines(content.items.filter((item):item is typeof item&PositionedText=>"str" in item&&"transform" in item));
    const opMatch=searchable(lines.join("\n")).match(/ORDEM DE PRODUCAO\s+(\d{5,})/i);if(!opMatch)continue;
    const numero=opMatch[1];let order=found.get(numero);
    if(!order){
      const clientHeader=lines.findIndex(line=>searchable(line).includes("CLIENTE TRIANGULAR")&&searchable(line).includes("NF ENTRADA"));
      const articleHeader=lines.findIndex(line=>searchable(line).includes("ARTIGO DO CLIENTE")&&searchable(line).includes("PECAS"));
      const headerRows=lines.slice(clientHeader+1,articleHeader>clientHeader?articleHeader:clientHeader+4);
      const client=headerRows.find(line=>!/^\d+\s+\d{2}\/\d{2}\/\d{4}$/.test(line))??"";
      const nfMatch=headerRows.find(line=>/^\d+\s+\d{2}\/\d{2}\/\d{4}$/.test(line))?.match(/^(\d+)\s+(\d{2})\/(\d{2})\/(\d{4})$/);
      const articleLine=articleHeader>=0?clean(`${lines[articleHeader+1]??""} ${lines[articleHeader+2]??""}`):"";
      const article=articleLine.match(/^(\d{6})\s+(.+?)\s+\d{3}\s+TINTO\s+(\d+)\s+([\d.]+,\d{2})\s+([\d.]+,\d{2})$/i);
      order={numero_op:numero,cliente:client,nf_entrada:nfMatch?.[1]??"",data_op:nfMatch?`${nfMatch[4]}-${nfMatch[3]}-${nfMatch[2]}`:"",codigo_artigo:article?.[1]??"",artigo:article?.[2]??"",pecas:Number(article?.[3]??0),metros:numberBR(article?.[4]??"0"),peso:numberBR(article?.[5]??"0"),operacoes:[]};found.set(numero,order);
    }
    const start=lines.findIndex(line=>searchable(line).includes("DATA INIC")&&searchable(line).includes("OPERADOR"));
    const end=lines.findIndex((line,index)=>index>start&&searchable(line).startsWith("PROCESSO "));
    if(start>=0)for(const line of lines.slice(start+1,end>start?end:undefined)){const operation=line.match(/^(\d{4})\s+(.+?)\s*:\s*:?$/);if(operation&&!order.operacoes.some(item=>item.codigo===operation[1]))order.operacoes.push({codigo:operation[1],descricao:clean(operation[2])})}
  }
  return [...found.values()];
}
