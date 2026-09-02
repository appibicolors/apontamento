export type ParsedOperation={codigo:string;descricao:string};
export type ParsedOrder={numero_op:string;cliente:string;nf_entrada:string;data_op:string;codigo_artigo:string;artigo:string;pecas:number;metros:number;peso:number;operacoes:ParsedOperation[]};
const numberBR=(value:string)=>Number(value.replace(/\./g,"").replace(",","."));
const clean=(value:string)=>value.replace(/\s+/g," ").trim();

export async function parseProductionOrders(file:File):Promise<ParsedOrder[]>{
  const pdfjs=await import("pdfjs-dist/legacy/build/pdf.mjs");
  const bundledWorkerPath=new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs",import.meta.url).pathname;
  pdfjs.GlobalWorkerOptions.workerSrc=new URL(bundledWorkerPath,window.location.origin).href;
  const document=await pdfjs.getDocument({data:await file.arrayBuffer()}).promise;
  const found=new Map<string,ParsedOrder>();
  for(let pageNumber=1;pageNumber<=document.numPages;pageNumber++){
    const page=await document.getPage(pageNumber);const content=await page.getTextContent();
    let text="";for(const item of content.items){if("str" in item)text+=item.str+(item.hasEOL?"\n":" ")}
    const lines=text.split(/\r?\n/).map(clean).filter(Boolean);
    const opMatch=text.match(/ORDEM DE PRODU(?:Ç|��|C)ÃO\s+(\d+)/i);if(!opMatch)continue;
    const numero=opMatch[1];let order=found.get(numero);
    if(!order){
      const articleLine=lines.find(line=>/^\d{6}\s+.+\s+001\s+TINTO\s+\d+\s+[\d.]+,\d{2}\s+[\d.]+,\d{2}/i.test(line))??"";
      const article=articleLine.match(/^(\d{6})\s+(.+?)\s+001\s+TINTO\s+(\d+)\s+([\d.]+,\d{2})\s+([\d.]+,\d{2})/i);
      const clientHeader=lines.findIndex(line=>line.includes("Cliente Triangular"));
      const nfDate=lines.slice(Math.max(0,clientHeader+1),clientHeader+5).find(line=>/^\d+\s+\d{2}\/\d{2}\/\d{4}$/.test(line));
      const nfMatch=nfDate?.match(/^(\d+)\s+(\d{2})\/(\d{2})\/(\d{4})$/);
      order={numero_op:numero,cliente:clientHeader>=0?(lines[clientHeader+1]??""):"",nf_entrada:nfMatch?.[1]??"",data_op:nfMatch?`${nfMatch[4]}-${nfMatch[3]}-${nfMatch[2]}`:"",codigo_artigo:article?.[1]??"",artigo:article?.[2]??"",pecas:Number(article?.[3]??0),metros:numberBR(article?.[4]??"0"),peso:numberBR(article?.[5]??"0"),operacoes:[]};found.set(numero,order);
    }
    const start=lines.findIndex(line=>line.includes("Data Inic."));const end=lines.findIndex((line,index)=>index>start&&line.startsWith("PROCESSO"));
    if(start>=0)for(const line of lines.slice(start+1,end>start?end:undefined)){const operation=line.match(/^(\d{4})\s+(.+?)\s*:\s*:?$/);if(operation&&!order.operacoes.some(x=>x.codigo===operation[1]))order.operacoes.push({codigo:operation[1],descricao:clean(operation[2])})}
  }
  return [...found.values()];
}
