const clean=(value:unknown)=>typeof value==="string"?value.trim():"";
const finite=(value:unknown)=>{const parsed=Number(value);return Number.isFinite(parsed)?parsed:null};
const record=(value:unknown):Record<string,unknown>=>value!==null&&typeof value==="object"?value as Record<string,unknown>:{};

export function normalizeOpIdentifier(value:unknown){
 const digits=clean(value).replace(/^0+(?=\d)/,"");
 return /^\d+$/.test(digits)?digits:"";
}

export function sameOpIdentifier(left:unknown,right:unknown){
 const a=normalizeOpIdentifier(left),b=normalizeOpIdentifier(right);
 return !!a&&a===b;
}

export function normalizeMicrodataPayload(rawValue:unknown){
 const raw=record(rawValue),envelope=record(raw.data??raw),body=record(envelope.op??raw.op??envelope);
 const externalWarnings=Array.isArray(envelope.avisos)?envelope.avisos:Array.isArray(raw.avisos)?raw.avisos:[];
 const internalWarnings=Array.isArray(body.avisos)?body.avisos:[];
 const operations=Array.isArray(body.operacoes)?body.operacoes.map((value,index)=>{const item=record(value);return{
  sequencia:Number.isFinite(Number(item.sequencia))?Number(item.sequencia):index+1,
  codigo:clean(item.codigo).padStart(4,"0"),descricao:clean(item.descricao)
 }}).sort((a,b)=>a.sequencia-b.sequencia):[];
 return{
  contrato_versao:clean(envelope.versao_contrato??envelope.contrato_versao??body.versao_contrato??body.contrato_versao??body.versao??"1"),
  gerado_em:clean(envelope.gerado_em??body.gerado_em)||null,
  empresa:clean(body.empresa),numero_op:clean(body.numero_op),cliente:clean(body.cliente)||null,
  nf_entrada:clean(body.nf_entrada)||null,data_op:clean(body.data_op)||null,
  codigo_artigo:clean(body.codigo_artigo)||null,artigo:clean(body.artigo)||null,
  pecas:finite(body.pecas),metros:finite(body.metros),peso:finite(body.peso),operacoes:operations,
  avisos:[...externalWarnings,...internalWarnings].map(clean).filter(Boolean)
 };
}
