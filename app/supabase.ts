export const SUPABASE_URL = "https://qwmgcyfxxgfiffdpidlc.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_pkEIuTOS4gUzbAzN7T4OZg_DiGM7C5V";
export type Session = { access_token:string; refresh_token:string; expires_at?:number; user:{id:string;email?:string} };
export type Apontamento={id:string;operador_id:string;maquina_id:string;inicio_em:string;termino_em:string|null;observacao:string|null;grupo_id?:string|null;duracao_rateada_segundos?:number|null;quantidade_rateio?:number|null;criterio_rateio?:string|null};
export type Operacao={id:string;codigo:string;descricao:string;status:string;sequencia:number;apontamentos?:Apontamento[]};
export type Ordem = { id:string; numero_op:string; cliente:string; nf_entrada?:string|null; data_op?:string|null; codigo_artigo?:string|null; artigo:string; pecas?:number; metros?:number; peso?:number; status:"rascunho"|"aguardando"|"em_producao"|"finalizada"|"cancelada"; operacoes?:Operacao[] };
export type Perfil={id:string;nome:string;perfil:string};
export type Maquina={id:string;codigo:string;nome:string;setor:string|null};
import type { ParsedOrder } from "./pdf-parser";
const SESSION_KEY="ibicolors_supabase_session";
export function savedSession():Session|null{if(typeof window==="undefined")return null;try{const value=localStorage.getItem(SESSION_KEY);return value?JSON.parse(value):null}catch{return null}}
export function saveSession(session:Session|null){if(session)localStorage.setItem(SESSION_KEY,JSON.stringify(session));else localStorage.removeItem(SESSION_KEY)}
let refreshInFlight:Promise<Session>|null=null;
async function refreshAccessToken(){if(refreshInFlight)return refreshInFlight;refreshInFlight=(async()=>{const current=savedSession();if(!current?.refresh_token)throw new Error("Sessão expirada. Entre novamente.");const response=await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,{method:"POST",headers:{apikey:SUPABASE_PUBLISHABLE_KEY,"Content-Type":"application/json"},body:JSON.stringify({refresh_token:current.refresh_token})});if(!response.ok){saveSession(null);throw new Error("Sua sessão terminou. Entre novamente.")}const renewed=await response.json() as Session;saveSession(renewed);return renewed})().finally(()=>{refreshInFlight=null});return refreshInFlight}
async function supabaseFetch(path:string,init:RequestInit={},token?:string){const send=async(access?:string)=>fetch(`${SUPABASE_URL}${path}`,{...init,headers:{apikey:SUPABASE_PUBLISHABLE_KEY,Authorization:`Bearer ${access??SUPABASE_PUBLISHABLE_KEY}`,"Content-Type":"application/json",...init.headers}});const stored=token?savedSession():null;let response=await send(token?(stored?.access_token??token):undefined);if(response.status===401&&token){const body=await response.clone().json().catch(()=>({}));const message=String(body.message||body.msg||"");if(/jwt.*expired/i.test(message)){const renewed=await refreshAccessToken();response=await send(renewed.access_token)}}if(!response.ok){const body=await response.json().catch(()=>({}));throw new Error(body.msg||body.message||body.error_description||"Não foi possível acessar o Supabase.")}return response}
export async function signIn(email:string,password:string):Promise<Session>{const response=await supabaseFetch("/auth/v1/token?grant_type=password",{method:"POST",body:JSON.stringify({email,password})});const session=await response.json() as Session;saveSession(session);return session}
export async function loadOrders(token:string):Promise<Ordem[]>{const response=await supabaseFetch("/rest/v1/ordens_producao?select=id,numero_op,cliente,nf_entrada,data_op,codigo_artigo,artigo,pecas,metros,peso,status,operacoes(id,codigo,descricao,status,sequencia,apontamentos(id,operador_id,maquina_id,inicio_em,termino_em,observacao,grupo_id,duracao_rateada_segundos,quantidade_rateio,criterio_rateio))&order=criado_em.desc",{},token);return response.json()}
export async function loadProfiles(token:string):Promise<Perfil[]>{const response=await supabaseFetch("/rest/v1/perfis?select=id,nome,perfil&ativo=eq.true&order=nome",{},token);return response.json()}
export async function loadMachines(token:string):Promise<Maquina[]>{const response=await supabaseFetch("/rest/v1/maquinas?select=id,codigo,nome,setor&ativa=eq.true&order=codigo",{},token);return response.json()}
export async function startOperation(token:string,operacaoId:string,operadorId:string,maquinaId:string,observacao:string){await supabaseFetch("/rest/v1/rpc/iniciar_operacao",{method:"POST",body:JSON.stringify({p_operacao_id:operacaoId,p_operador_id:operadorId,p_maquina_id:maquinaId,p_observacao:observacao||null})},token)}
export async function finishOperation(token:string,operacaoId:string,observacao:string){await supabaseFetch("/rest/v1/rpc/finalizar_operacao",{method:"POST",body:JSON.stringify({p_operacao_id:operacaoId,p_observacao:observacao||null})},token)}
export async function changePointOperator(token:string,apontamentoId:string,operadorId:string){await supabaseFetch("/rest/v1/rpc/alterar_operador_apontamento",{method:"POST",body:JSON.stringify({p_apontamento_id:apontamentoId,p_operador_id:operadorId})},token)}
export async function startGroupedOperation(token:string,data:{code:string;operatorId:string;machineId:string;criterion:string;items:Array<{operacao_id:string;quantidade:number}>;note:string}){const response=await supabaseFetch("/rest/v1/rpc/iniciar_apontamento_agrupado",{method:"POST",body:JSON.stringify({p_codigo_operacao:data.code,p_operador_id:data.operatorId,p_maquina_id:data.machineId,p_criterio:data.criterion,p_itens:data.items,p_observacao:data.note||null})},token);return response.json() as Promise<string>}
export async function finishGroupedOperation(token:string,groupId:string,note:string){await supabaseFetch("/rest/v1/rpc/finalizar_apontamento_agrupado",{method:"POST",body:JSON.stringify({p_grupo_id:groupId,p_observacao:note||null})},token)}
export async function createMachine(token:string,data:{codigo:string;nome:string;setor:string}){await supabaseFetch("/rest/v1/maquinas",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({...data,codigo:data.codigo.trim().toUpperCase(),nome:data.nome.trim(),setor:data.setor.trim()||null})},token)}
export async function updateMachine(token:string,id:string,data:{codigo:string;nome:string;setor:string}){await supabaseFetch(`/rest/v1/maquinas?id=eq.${encodeURIComponent(id)}`,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({...data,codigo:data.codigo.trim().toUpperCase(),nome:data.nome.trim(),setor:data.setor.trim()||null})},token)}
async function adminRpc(token:string,name:string,data:Record<string,unknown>){await supabaseFetch(`/rest/v1/rpc/${name}`,{method:"POST",body:JSON.stringify(data)},token)}
export const adminUpdateOrder=(token:string,data:{id:string;numero:string;cliente:string;artigo:string})=>adminRpc(token,"admin_editar_op",{p_id:data.id,p_numero_op:data.numero,p_cliente:data.cliente,p_artigo:data.artigo});
export const adminDeleteOrder=(token:string,id:string)=>adminRpc(token,"admin_excluir_op",{p_id:id});
export const adminUpdatePoint=(token:string,data:{id:string;operatorId:string;machineId:string;start:string;end:string|null;note:string})=>adminRpc(token,"admin_editar_apontamento",{p_id:data.id,p_operador_id:data.operatorId,p_maquina_id:data.machineId,p_inicio_em:data.start,p_termino_em:data.end,p_observacao:data.note||null});
export const adminDeletePoint=(token:string,id:string)=>adminRpc(token,"admin_excluir_apontamento",{p_id:id});
export const adminUpdateOperator=(token:string,id:string,name:string)=>adminRpc(token,"admin_editar_operador",{p_id:id,p_nome:name});
export const adminDeactivateOperator=(token:string,id:string)=>adminRpc(token,"admin_desativar_operador",{p_id:id});
export const adminDeactivateMachine=(token:string,id:string)=>adminRpc(token,"admin_desativar_maquina",{p_id:id});
export async function createOperator(data:{nome:string;email:string;password:string}){const response=await supabaseFetch("/auth/v1/signup",{method:"POST",body:JSON.stringify({email:data.email.trim().toLowerCase(),password:data.password,data:{nome:data.nome.trim(),perfil:"operador"}})});const result=await response.json();if(result.user&&Array.isArray(result.user.identities)&&result.user.identities.length===0)throw new Error("Este e-mail já possui cadastro. Use outro endereço para o operador.")}
export async function saveOrders(orders:ParsedOrder[],session:Session){
  for(const order of orders){
    const {operacoes,...record}=order;
    const response=await supabaseFetch("/rest/v1/ordens_producao?on_conflict=numero_op",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=representation"},body:JSON.stringify({...record,status:"aguardando",criado_por:session.user.id,dados_extraidos:{origem:"pdf",conferido:true}})},session.access_token);
    const [created]=await response.json();
    if(!created?.id)throw new Error(`O Supabase não retornou o cadastro da OP ${order.numero_op}.`);
    if(operacoes.length)await supabaseFetch("/rest/v1/operacoes?on_conflict=ordem_producao_id,sequencia",{
      method:"POST",headers:{Prefer:"resolution=merge-duplicates"},
      body:JSON.stringify(operacoes.map((item,index)=>({
        ordem_producao_id:created.id,sequencia:index+1,codigo:item.codigo,
        descricao:item.descricao,status:index===0?"liberada":"aguardando"
      })))
    },session.access_token);
  }
}
