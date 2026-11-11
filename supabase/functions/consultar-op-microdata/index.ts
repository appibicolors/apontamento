import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {normalizeMicrodataPayload,sameOpIdentifier} from "./contract.ts";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});
const clean=(value:unknown)=>typeof value==="string"?value.trim():"";
const companiesFrom=(body:any)=>{const raw=body?.empresas??body?.companies??body?.detalhes?.empresas??[];return Array.isArray(raw)?raw.map((item:any)=>clean(typeof item==="object"?item.codigo??item.empresa:item)).filter(Boolean):[]};

async function microdataFetch(base:string,key:string,number:string,company:string){
 const url=new URL(`/v1/ops/${encodeURIComponent(number)}`,base);if(company)url.searchParams.set("empresa",company);
 let response:Response|null=null;
 for(let attempt=0;attempt<2;attempt++){
  response=await fetch(url,{headers:{Authorization:`Bearer ${key}`,Accept:"application/json"},signal:AbortSignal.timeout(15000)}).catch(()=>null);
  if(response&&![503,504].includes(response.status))break;
  if(attempt===0)await new Promise(resolve=>setTimeout(resolve,800));
 }
 if(!response)return{ok:false,status:504,body:{}};
 const body=await response.json().catch(()=>({}));return{ok:response.ok,status:response.status,body};
}

Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return json({code:"method_not_allowed",message:"Método não permitido."},405);
 const supabaseUrl=Deno.env.get("SUPABASE_URL")??"",serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??"",base=Deno.env.get("MICRODATA_OP_API_BASE_URL")??"",apiKey=Deno.env.get("MICRODATA_OP_API_KEY")??"";
 if(!supabaseUrl||!serviceKey||!base||!apiKey)return json({code:"integration_not_configured",message:"Integração Microdata não configurada. Contate o responsável pelo sistema."},503);
 const authorization=req.headers.get("Authorization")??"";
 if(!authorization.startsWith("Bearer "))return json({code:"unauthenticated",message:"Sessão inválida ou expirada."},401);
 const userResponse=await fetch(`${supabaseUrl}/auth/v1/user`,{headers:{Authorization:authorization,apikey:serviceKey}});
 if(!userResponse.ok)return json({code:"unauthenticated",message:"Sessão inválida ou expirada."},401);
 const user=await userResponse.json();
 const profileResponse=await fetch(`${supabaseUrl}/rest/v1/perfis?id=eq.${encodeURIComponent(user.id)}&ativo=eq.true&select=perfil`,{headers:{Authorization:`Bearer ${serviceKey}`,apikey:serviceKey,Accept:"application/json"}});
 const profiles=await profileResponse.json().catch(()=>[]);const profile=profiles?.[0]?.perfil;
 if(!profile||profile==="consulta")return json({code:"forbidden",message:"Seu perfil não possui permissão para consultar ou cadastrar OPs no Microdata."},403);
 const input=await req.json().catch(()=>({}));const action=input.action==="cadastrar"?"cadastrar":input.action==="atualizar_roteiro"?"atualizar_roteiro":"consultar";const number=clean(input.numero_op??input.numero);
 const company=clean(input.empresa);if(!/^\d{1,20}$/.test(number)||!/^[A-Za-z0-9_-]{0,20}$/.test(company))return json({code:"invalid_parameters",message:"Corrija o número da OP ou a empresa informada."},400);
 const upstream=await microdataFetch(base,apiKey,number,company);
 if(!upstream.ok){
  if(upstream.status===409)return json({code:"ambiguous_company",message:"A OP existe em mais de uma empresa. Selecione a empresa correta.",companies:companiesFrom(upstream.body)},409);
  const messages:Record<number,string>={400:"Corrija o número da OP ou a empresa informada.",401:"Falha de autenticação da integração. Contate o responsável pelo sistema.",404:"OP não localizada no Microdata. Confira o número ou solicite apoio ao PCP.",429:"Limite temporário de consultas atingido. Aguarde e tente novamente.",503:"Microdata temporariamente indisponível. Use a importação PDF de contingência.",504:"Tempo de consulta esgotado. Tente novamente ou use a importação PDF."};
  return json({code:`microdata_${upstream.status}`,message:messages[upstream.status]??"Não foi possível consultar o Microdata.",upstream_status:upstream.status},upstream.status>=400&&upstream.status<600?upstream.status:502);
 }
 const canonical=normalizeMicrodataPayload(upstream.body);
 if(!canonical.numero_op||!sameOpIdentifier(canonical.numero_op,number))return json({code:"invalid_contract",message:"O Microdata retornou uma OP diferente da solicitada."},502);
 if(!canonical.operacoes.length||canonical.operacoes.some(item=>!/^\d{4}$/.test(item.codigo)||!item.descricao))return json({code:"invalid_route",message:"O Microdata não retornou um roteiro produtivo válido."},422);
 if(action==="consultar")return json(canonical);
 if(action==="atualizar_roteiro"){
  const orderId=clean(input.ordem_id);if(!/^[0-9a-f-]{36}$/i.test(orderId))return json({code:"invalid_order",message:"OP cadastrada inválida."},400);
  const updated=await fetch(`${supabaseUrl}/rest/v1/rpc/atualizar_roteiro_microdata_backend`,{method:"POST",headers:{Authorization:`Bearer ${serviceKey}`,apikey:serviceKey,"Content-Type":"application/json"},body:JSON.stringify({p_usuario_id:user.id,p_ordem_id:orderId,p_empresa:canonical.empresa||company,p_operacoes:canonical.operacoes})});
  const body=await updated.json().catch(()=>({}));if(!updated.ok)return json({code:"route_update_failed",message:body.message??body.error??"Não foi possível revalidar o roteiro."},updated.status);return json(body);
 }
 const reviewed=input.ordem??{};const prazo=reviewed.prazo_dias==null?null:Number(reviewed.prazo_dias);
 if(prazo!=null&&(!Number.isInteger(prazo)||prazo<0||prazo>3650))return json({code:"invalid_deadline",message:"Prazo deve ser um número inteiro entre 0 e 3650 dias."},400);
 const numeric=(value:unknown,fallback:number|null)=>{if(value==null||value==="")return fallback;const parsed=Number(value);return Number.isFinite(parsed)?parsed:fallback};
 const missing=[!canonical.cliente&&"Cliente não informado pelo ERP.",!canonical.artigo&&"Artigo não informado pelo ERP.",canonical.pecas==null&&"Peças não informadas pelo ERP.",canonical.metros==null&&"Metros não informados pelo ERP.",canonical.peso==null&&"Peso não informado pelo ERP."].filter(Boolean) as string[];
 const order={...canonical,cliente:clean(reviewed.cliente)||canonical.cliente||"NÃO INFORMADO",nf_entrada:clean(reviewed.nf_entrada)||canonical.nf_entrada,data_op:clean(reviewed.data_op)||canonical.data_op,codigo_artigo:clean(reviewed.codigo_artigo)||canonical.codigo_artigo,artigo:clean(reviewed.artigo)||canonical.artigo||"NÃO INFORMADO",pecas:numeric(reviewed.pecas,canonical.pecas)??0,metros:numeric(reviewed.metros,canonical.metros)??0,peso:numeric(reviewed.peso,canonical.peso)??0,prazo_dias:prazo,dados_extraidos:{origem:"microdata_api",contrato_versao:canonical.contrato_versao,gerado_em:canonical.gerado_em,consultado_em:new Date().toISOString(),empresa:canonical.empresa,usuario_id:user.id,avisos:[...canonical.avisos,...missing],conferido:!!input.ordem}};
 if([order.pecas,order.metros,order.peso].some(value=>value!=null&&value<0))return json({code:"invalid_quantities",message:"Peças, metros e peso não podem ser negativos."},400);
 const saved=await fetch(`${supabaseUrl}/rest/v1/rpc/cadastrar_op_microdata_backend`,{method:"POST",headers:{Authorization:`Bearer ${serviceKey}`,apikey:serviceKey,"Content-Type":"application/json"},body:JSON.stringify({p_usuario_id:user.id,p_op:order})});
 const savedBody=await saved.json().catch(()=>({}));if(!saved.ok)return json({code:"registration_failed",message:savedBody.message??savedBody.error??"Não foi possível cadastrar a OP."},saved.status);
 return json(savedBody, savedBody.status==="created"?201:200);
});
