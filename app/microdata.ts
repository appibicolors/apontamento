import type {ParsedOrder,ParsedOperation} from "./pdf-parser";

export type MicrodataPayload={
  contrato_versao:string;
  empresa:string;
  numero_op:string;
  cliente:string|null;
  nf_entrada:string|null;
  data_op:string|null;
  codigo_artigo:string|null;
  artigo:string|null;
  pecas:number|null;
  metros:number|null;
  peso:number|null;
  operacoes:Array<{sequencia:number;codigo:string;descricao:string}>;
  avisos:string[];
};

export type MicrodataOrder=ParsedOrder&{empresa_origem:string;contrato_versao:string};
export type MicrodataRegistration={status:"created"|"existing"|"existing_with_history"|"existing_closed";order_id:string;numero_op:string;message:string};

const text=(value:unknown)=>typeof value==="string"?value.trim():"";
const number=(value:unknown)=>typeof value==="number"&&Number.isFinite(value)?value:0;

export function microdataToParsedOrder(payload:MicrodataPayload):MicrodataOrder{
  const operations:ParsedOperation[]=[...(payload.operacoes??[])]
    .sort((a,b)=>a.sequencia-b.sequencia)
    .map(item=>({codigo:text(item.codigo).padStart(4,"0"),descricao:text(item.descricao)}));
  return{
    numero_op:text(payload.numero_op),
    cliente:text(payload.cliente),
    nf_entrada:text(payload.nf_entrada),
    data_op:text(payload.data_op),
    prazo_dias:null,
    codigo_artigo:text(payload.codigo_artigo).toUpperCase(),
    artigo:text(payload.artigo),
    pecas:number(payload.pecas),
    metros:number(payload.metros),
    peso:number(payload.peso),
    operacoes:operations,
    paginas_origem:[],
    avisos_extracao:Array.isArray(payload.avisos)?payload.avisos.map(text).filter(Boolean):[],
    empresa_origem:text(payload.empresa),
    contrato_versao:text(payload.contrato_versao)||"1"
  };
}

export function validateMicrodataOrder(order:MicrodataOrder){
  const blockers:string[]=[];
  if(!/^\d+$/.test(order.numero_op))blockers.push("Número da OP inválido.");
  if(!order.cliente)blockers.push("Cliente não informado pelo ERP.");
  if(!order.artigo)blockers.push("Artigo não informado pelo ERP.");
  if(!order.operacoes.length)blockers.push("O ERP não retornou o roteiro produtivo.");
  if(order.operacoes.some(item=>!/^\d{4}$/.test(item.codigo)||!item.descricao))blockers.push("O roteiro contém uma operação inválida.");
  if(order.prazo_dias!=null&&(!Number.isInteger(order.prazo_dias)||order.prazo_dias<0||order.prazo_dias>3650))blockers.push("Prazo deve ser um número inteiro entre 0 e 3650 dias.");
  return blockers;
}
