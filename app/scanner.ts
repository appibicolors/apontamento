export function parseOpScan(value:string){
  const explicit=value.match(/(?:^|[|;\s])OP\s*[:=#-]?\s*(\d+)/i);
  if(explicit)return explicit[1];
  return value.trim().match(/^\d+$/)?.[0]??"";
}

export function parseOperationScan(value:string){
  const explicit=value.match(/(?:OPERA(?:C|Ç)(?:AO|ÃO)|OPERACAO|OPERACÃO)\s*[:=#-]?\s*(\d+)/i);
  if(explicit)return explicit[1].padStart(4,"0");
  const plain=value.trim().match(/^\d{1,4}$/)?.[0];
  return plain?plain.padStart(4,"0"):"";
}
