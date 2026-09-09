export type DeadlineFilter="all"|"overdue"|"today"|"next3"|"next7"|"on_time"|"no_deadline";
type DeadlineOrder={data_op?:string|null;prazo_dias?:number|null;prazo_estimado?:string|null;encerrada_em?:string|null;status?:string};

const parseDate=(value:string)=>{const [year,month,day]=value.split("-").map(Number);return Date.UTC(year,month-1,day)};
export function addCalendarDays(date:string,days:number|null|undefined){if(!date||days==null||days<0)return"";const result=new Date(parseDate(date)+Math.trunc(days)*86400000);return result.toISOString().slice(0,10)}
export function factoryToday(now=new Date()){const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(now);const values=Object.fromEntries(parts.map(part=>[part.type,part.value]));return`${values.year}-${values.month}-${values.day}`}
export function formatDateOnly(value:string|null|undefined){if(!value)return"Não informado";const [year,month,day]=value.split("-");return year&&month&&day?`${day}/${month}/${year}`:"Não informado"}
export function deadlineStatus(order:DeadlineOrder,today=factoryToday()){
  if(order.encerrada_em)return{key:"closed",label:"Encerrada",days:null as number|null,due:order.prazo_estimado??addCalendarDays(order.data_op??"",order.prazo_dias)};
  if(order.status==="cancelada")return{key:"cancelled",label:"Cancelada",days:null as number|null,due:order.prazo_estimado??addCalendarDays(order.data_op??"",order.prazo_dias)};
  const due=order.prazo_estimado??addCalendarDays(order.data_op??"",order.prazo_dias);
  if(!due)return{key:"no_deadline",label:"Sem prazo",days:null as number|null,due:""};
  const days=Math.round((parseDate(due)-parseDate(today))/86400000);
  if(days<0)return{key:"overdue",label:`Atrasada ${Math.abs(days)} dia${days===-1?"":"s"}`,days,due};
  if(days===0)return{key:"today",label:"Vence hoje",days,due};
  if(days<=3)return{key:"near",label:`Vence em ${days} dias`,days,due};
  return{key:"on_time",label:"No prazo",days,due};
}
export function matchesDeadlineFilter(order:DeadlineOrder,filter:DeadlineFilter,today=factoryToday()){
  if(filter==="all")return true;const status=deadlineStatus(order,today);
  if(filter==="overdue")return status.key==="overdue";
  if(filter==="today")return status.days===0;
  if(filter==="next3")return status.days!=null&&status.days>=0&&status.days<=3;
  if(filter==="next7")return status.days!=null&&status.days>=0&&status.days<=7;
  if(filter==="on_time")return status.days!=null&&status.days>=0;
  return status.key==="no_deadline";
}
