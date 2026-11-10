import {loadOrderByNumber,Ordem,registerMicrodataOrderNumber} from "./supabase";
import {findKnownOrder,normalizedOpNumber} from "./automatic-order-core";
export {findKnownOrder,normalizedOpNumber} from "./automatic-order-core";

export type AutomaticOrderResult={order:Ordem;created:boolean;message:string};
type MicrodataError=Error&{companies?:string[];status?:number;code?:string};
const pending=new Map<string,Promise<AutomaticOrderResult>>();

export async function ensureAutomaticOrder(token:string,number:string,knownOrders:Ordem[],company?:string):Promise<AutomaticOrderResult>{
 const known=findKnownOrder(knownOrders,number);
 if(known)return{order:known,created:false,message:`OP ${known.numero_op} localizada.`};
 const key=`${normalizedOpNumber(number)}|${company??""}`;
 const running=pending.get(key);if(running)return running;
 const task=(async()=>{
  const existing=await loadOrderByNumber(token,number);
  if(existing)return{order:existing,created:false,message:`OP ${existing.numero_op} localizada.`};
  const registration=await registerMicrodataOrderNumber(token,number,company);
  const order=await loadOrderByNumber(token,registration.numero_op)??await loadOrderByNumber(token,number);
  if(!order)throw new Error("A OP foi cadastrada, mas ainda não pôde ser carregada. Tente novamente.");
  return{order,created:registration.status==="created",message:registration.status==="created"?`OP ${order.numero_op} cadastrada automaticamente. Selecione a operação.`:registration.message};
 })().finally(()=>pending.delete(key));
 pending.set(key,task);return task;
}

export function microdataError(error:unknown){return error as MicrodataError}
