export type ParsedOperation={codigo:string;descricao:string};
export type ParsedOrder={numero_op:string;cliente:string;nf_entrada:string;data_op:string;codigo_artigo:string;artigo:string;pecas:number;metros:number;peso:number;operacoes:ParsedOperation[]};
type PositionedText={str:string;transform:ArrayLike<number>};
const clean=(value:string)=>value.replace(/\s+/g," ").trim();
const searchable=(value:string)=>clean(value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^A-Z0-9\s]/gi," ")).toUpperCase();
const numberBR=(value:string)=>{const result=Number(value.replace(/\./g,"").replace(",","."));return Number.isFinite(result)?result:0};
export function parseArticleData(lines:string[],header:number){
  if(header<0)return null;
  const end=lines.findIndex((line,index)=>index>header&&searchable(line).startsWith("COMPOSICAO"));
  const block=clean(lines.slice(header+1,end>header?end:header+4).join(" "));
  const quantities=block.match(/\s+(\d+)\s+([\d.]+,\d{2,3})\s+([\d.]+,\d{2,3})$/);
  if(!quantities)return null;
  const identity=clean(block.slice(0,quantities.index));
  const code=identity.match(/^([A-Z0-9]{6})\s+(.+)$/i);
  if(!code)return null;
  // The situation code is the last three-digit group before its description.
  // Greedy matching is intentional: article names may themselves contain numbers (for example "180 FIOS").
  const articleAndSituation=code[2].match(/^(.+)(\d{3})\s+(.+)$/);
  if(!articleAndSituation)return null;
  return{codigo:code[1].toUpperCase(),artigo:clean(articleAndSituation[1]),pecas:Number(quantities[1]),metros:numberBR(quantities[2]),peso:numberBR(quantities[3])};
}
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
      const article=parseArticleData(lines,articleHeader);
      order={numero_op:numero,cliente:client,nf_entrada:nfMatch?.[1]??"",data_op:nfMatch?`${nfMatch[4]}-${nfMatch[3]}-${nfMatch[2]}`:"",codigo_artigo:article?.codigo??"",artigo:article?.artigo??"",pecas:article?.pecas??0,metros:article?.metros??0,peso:article?.peso??0,operacoes:[]};found.set(numero,order);
    }
    const start=lines.findIndex(line=>searchable(line).includes("DATA INIC")&&searchable(line).includes("OPERADOR"));
    const end=lines.findIndex((line,index)=>index>start&&searchable(line).startsWith("PROCESSO "));
    if(start>=0)for(const line of lines.slice(start+1,end>start?end:undefined)){const operation=line.match(/^(\d{4})\s+(.+?)\s*:\s*:?$/);if(operation&&!order.operacoes.some(item=>item.codigo===operation[1]))order.operacoes.push({codigo:operation[1],descricao:clean(operation[2])})}
  }
  return [...found.values()];
}
