import type {Ordem} from "./supabase";

export type ImportAuditSeverity="critical"|"warning"|"review"|"ok";
export type ImportAuditResult={order:Ordem;severity:ImportAuditSeverity;issues:string[]};

export function auditImportedOrder(order:Ordem):ImportAuditResult{
  const operations=[...(order.operacoes??[])].sort((a,b)=>a.sequencia-b.sequencia);
  const issues:string[]=[];
  let severity:ImportAuditSeverity="ok";
  const raise=(next:ImportAuditSeverity,message:string)=>{
    const rank:Record<ImportAuditSeverity,number>={ok:0,review:1,warning:2,critical:3};
    if(rank[next]>rank[severity])severity=next;
    issues.push(message);
  };
  if(!operations.length)raise("critical","Fluxo sem nenhuma operação cadastrada.");
  const sequences=operations.map(item=>item.sequencia);
  if(new Set(sequences).size!==sequences.length)raise("critical","Existem sequências de operação duplicadas.");
  if(sequences.some((value,index)=>value!==index+1))raise("warning","A sequência do fluxo possui lacunas ou começa fora da etapa 1.");
  if(operations.length>0&&operations.length<2)raise("warning","Fluxo com apenas uma operação; confira o PDF original.");
  if(operations.length&&!operations.some(item=>item.codigo==="0019"))raise("review","Fluxo sem a operação 0019 · REVISÃO; confirme se este processo realmente não exige revisão.");
  const meta=order.dados_extraidos;
  if(meta?.origem==="pdf"&&Number(meta.parser_versao??0)<2&&!meta.fluxo_auditado)raise("review","Importação feita pelo leitor anterior, sem validação multipágina.");
  for(const warning of meta?.avisos??[])raise("review",`Leitor do PDF: ${warning}`);
  if(!issues.length)issues.push("Nenhuma inconsistência estrutural encontrada.");
  return{order,severity,issues};
}

export const auditImportedOrders=(orders:Ordem[])=>orders.map(auditImportedOrder).sort((a,b)=>{
  const rank:Record<ImportAuditSeverity,number>={critical:3,warning:2,review:1,ok:0};
  return rank[b.severity]-rank[a.severity]||b.order.numero_op.localeCompare(a.order.numero_op,undefined,{numeric:true});
});
