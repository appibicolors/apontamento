import {factoryInputToIso} from "./factory-time.ts";

export type ReportTab="executive"|"orders"|"machines";
export const localDate=(date:Date)=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
export function defaultReportPeriod(now=new Date()){return{from:localDate(new Date(now.getFullYear(),now.getMonth(),1)),to:localDate(now)}}
export type PeriodPreset="today"|"7d"|"30d"|"month"|"previous_month"|"year";
export function presetPeriod(preset:PeriodPreset,now=new Date()){
 const end=new Date(now.getFullYear(),now.getMonth(),now.getDate());let start=new Date(end);
 if(preset==="7d")start.setDate(start.getDate()-6);
 if(preset==="30d")start.setDate(start.getDate()-29);
 if(preset==="month")start=new Date(now.getFullYear(),now.getMonth(),1);
 if(preset==="previous_month"){start=new Date(now.getFullYear(),now.getMonth()-1,1);end.setTime(new Date(now.getFullYear(),now.getMonth(),0).getTime())}
 if(preset==="year")start=new Date(now.getFullYear(),0,1);
 return{from:localDate(start),to:localDate(end)};
}
export function reportInstants(from:string,to:string){return{start:factoryInputToIso(`${from}T00:00:00`),end:factoryInputToIso(`${to}T23:59:59`)}}
export function activeFilterCount(values:Array<string|number>,defaults:Array<string|number>){return values.reduce<number>((total,value,index)=>total+(value!==defaults[index]?1:0),0)}
export function csvCell(value:unknown){const text=String(value??"");return /[;"\n]/.test(text)?`"${text.replaceAll('"','""')}"`:text}
export function downloadCsv(name:string,headers:string[],rows:unknown[][]){const content="\ufeff"+[headers,...rows].map(row=>row.map(csvCell).join(";")).join("\r\n");const url=URL.createObjectURL(new Blob([content],{type:"text/csv;charset=utf-8"}));const link=document.createElement("a");link.href=url;link.download=name;link.click();URL.revokeObjectURL(url)}
