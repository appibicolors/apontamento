export const SUPABASE_URL = "https://qwmgcyfxxgfiffdpidlc.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_pkEIuTOS4gUzbAzN7T4OZg_DiGM7C5V";
export type Session = { access_token:string; refresh_token:string; expires_at?:number; user:{id:string;email?:string} };
export type Ordem = { id:string; numero_op:string; cliente:string; artigo:string; status:"rascunho"|"aguardando"|"em_producao"|"finalizada"|"cancelada"; operacoes?:Array<{id:string;descricao:string;status:string;sequencia:number}> };
const SESSION_KEY="ibicolors_supabase_session";
export function savedSession():Session|null{if(typeof window==="undefined")return null;try{const value=localStorage.getItem(SESSION_KEY);return value?JSON.parse(value):null}catch{return null}}
export function saveSession(session:Session|null){if(session)localStorage.setItem(SESSION_KEY,JSON.stringify(session));else localStorage.removeItem(SESSION_KEY)}
async function supabaseFetch(path:string,init:RequestInit={},token?:string){const response=await fetch(`${SUPABASE_URL}${path}`,{...init,headers:{apikey:SUPABASE_PUBLISHABLE_KEY,Authorization:`Bearer ${token??SUPABASE_PUBLISHABLE_KEY}`,"Content-Type":"application/json",...init.headers}});if(!response.ok){const body=await response.json().catch(()=>({}));throw new Error(body.msg||body.message||body.error_description||"Não foi possível acessar o Supabase.")}return response}
export async function signIn(email:string,password:string):Promise<Session>{const response=await supabaseFetch("/auth/v1/token?grant_type=password",{method:"POST",body:JSON.stringify({email,password})});const session=await response.json() as Session;saveSession(session);return session}
export async function loadOrders(token:string):Promise<Ordem[]>{const response=await supabaseFetch("/rest/v1/ordens_producao?select=id,numero_op,cliente,artigo,status,operacoes(id,descricao,status,sequencia)&order=criado_em.desc",{},token);return response.json()}
