export type ParsedOperation={codigo:string;descricao:string};
export type ParsedOrder={numero_op:string;cliente:string;nf_entrada:string;data_op:string;codigo_artigo:string;artigo:string;pecas:number;metros:number;peso:number;operacoes:ParsedOperation[]};
const numberBR=(value:string)=>Number(value.replace(/\./g,"").replace(",","."));
const clean=(value:string)=>value.replace(/\s+/g," ").trim();
const searchable=(value:string)=>value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^A-Z0-9\s]/gi," ");

export async function parseProductionOrders(file:File):Promise<ParsedOrder[]>{
  const pdfjs=await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc=new URL("pdfjs-dist/build/pdf.worker.min.mjs",import.meta.url).toString();
  const document=await pdfjs.getDocument({data:await file.arrayBuffer()}).promise;
  const found=new Map<string,ParsedOrder>();
  for(let pageNumber=1;pageNumber<=document.numPages;pageNumber++){
    const page=await document.getPage(pageNumber);const content=await page.getTextContent();
    let text="";for(const item of content.items){if("str" in item)text+=item.str+(item.hasEOL?"\n":" ")}
    const lines=text.split(/\r?\n/).map(clean).filter(Boolean);
    const opMatch=searchable(text).match(/ORDEM\s+DE\s+PRODUCAO\s+(\d{5,})/i);if(!opMatch)continue;
    const numero=opMatch[1];let order=found.get(numero);
    if(!order){
      const opIndex=lines.findIndex(line=>searchable(line).includes(`ORDEM DE PRODUCAO ${numero}`));
      const afterOp=lines.slice(opIndex+1);
      const nfIndex=afterOp.findIndex(line=>/^\d{7,}$/.test(line));
      const nf=afterOp[nfIndex]??"";
      const articleName=afterOp[nfIndex+1]??"";
      const clientDate=afterOp.find(line=>/\d{2}\/\d{2}\/\d{4}$/.test(line))??"";
      const dateMatch=clientDate.match(/^(.*?)\s+(\d{2})\/(\d{2})\/(\d{4})$/);
      const measures=afterOp.find(line=>/^[\d.]+,\d{2}\s+[\d.]+,\d{2}\s+\d{6}$/.test(line))?.match(/^([\d.]+,\d{2})\s+([\d.]+,\d{2})\s+(\d{6})$/);
      const conditioning=lines.findIndex(line=>searchable(line).includes("ACONDICIONAMENTO"));
      const packing=lines.findIndex((line,index)=>index>conditioning&&searchable(line).includes("ESTAMPARIA"));
      const piecesLine=lines.slice(conditioning+1,packing>conditioning?packing:conditioning+8).find(line=>/^\d+$/.test(line));
      order={numero_op:numero,cliente:dateMatch?.[1]??"",nf_entrada:nf,data_op:dateMatch?`${dateMatch[4]}-${dateMatch[3]}-${dateMatch[2]}`:"",codigo_artigo:measures?.[3]??"",artigo:articleName,pecas:Number(piecesLine??0),metros:numberBR(measures?.[2]??"0"),peso:numberBR(measures?.[1]??"0"),operacoes:[]};found.set(numero,order);
    }
    const start=lines.findIndex(line=>line.includes("Data Inic."));const end=lines.findIndex((line,index)=>index>start&&line.startsWith("PROCESSO"));
    if(start>=0)for(const line of lines.slice(start+1,end>start?end:undefined)){const operation=line.match(/^(\d{4})\s+(.+?)\s*:\s*:?$/);if(operation&&!order.operacoes.some(x=>x.codigo===operation[1]))order.operacoes.push({codigo:operation[1],descricao:clean(operation[2])})}
  }
  return [...found.values()];
}
