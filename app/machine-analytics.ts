import type {Apontamento,Maquina,Ordem,Operacao} from "./supabase";
import {factoryInputToIso} from "./factory-time.ts";

export type MachineExecution={order:Ordem;operation:Operacao;point:Apontamento};
export type MachineState="running"|"stopped"|"idle";

export function flattenExecutions(orders:Ordem[]):MachineExecution[]{
 return orders.flatMap(order=>(order.operacoes??[]).flatMap(operation=>(operation.apontamentos??[]).map(point=>({order,operation,point}))));
}

export function dateRange(dateFrom:string,dateTo:string){
 return {start:new Date(factoryInputToIso(`${dateFrom}T00:00`)).getTime(),end:new Date(factoryInputToIso(`${dateTo}T23:59:59`)).getTime()+999};
}

function overlapSeconds(start:number,end:number,rangeStart:number,rangeEnd:number){return Math.max(0,Math.min(end,rangeEnd)-Math.max(start,rangeStart))/1000}

export function machineSeconds(executions:MachineExecution[],machineId:string,rangeStart:number,rangeEnd:number,now=Date.now()){
 const points=executions.filter(item=>item.point.maquina_id===machineId);const openGroups=new Set<string>();let total=0;
 for(const {point} of points){
  const start=new Date(point.inicio_em).getTime(),end=point.termino_em?new Date(point.termino_em).getTime():now;
  if(!Number.isFinite(start)||end<=rangeStart||start>rangeEnd)continue;
  if(!point.termino_em&&point.grupo_id){if(openGroups.has(point.grupo_id))continue;openGroups.add(point.grupo_id)}
  const overlap=overlapSeconds(start,end,rangeStart,rangeEnd);
  if(point.termino_em&&point.grupo_id&&point.duracao_rateada_segundos!=null){const full=Math.max(1,(end-start)/1000);total+=Number(point.duracao_rateada_segundos)*(overlap/full)}else total+=overlap;
 }
 return Math.round(total);
}

export function machineState(executions:MachineExecution[],machine:Maquina):{state:MachineState;open:MachineExecution[];latest?:MachineExecution}{
 const points=executions.filter(item=>item.point.maquina_id===machine.id).sort((a,b)=>b.point.inicio_em.localeCompare(a.point.inicio_em));
 const open=points.filter(item=>!item.point.termino_em);
 if(open.length)return{state:"running",open,latest:points[0]};
 const latest=points[0];const stopped=latest&&["pausa","parada_maquina"].includes(latest.point.motivo_finalizacao??"");
 return{state:stopped?"stopped":"idle",open,latest};
}
