"use client";
import {useEffect,useState} from "react";
import {Maquina,Ordem,Perfil} from "./supabase";
import {formatDuration} from "./duration";
import {ArticleLabel} from "./article-label";
export function HistoryScreen({orders,profiles,machines,onClose}:{orders:Ordem[];profiles:Perfil[];machines:Maquina[];onClose:()=>void}){
 const [now,setNow]=useState(Date.now());useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer)},[]);
 const rows=orders.flatMap(order=>(order.operacoes??[]).flatMap(operation=>(operation.apontamentos??[]).map(point=>({order,operation,point})))).sort((a,b)=>b.point.inicio_em.localeCompare(a.point.inicio_em));const fmt=(v:string|null)=>v?new Date(v).toLocaleString("pt-BR"):"Em andamento";
 return <section className="manage-screen history-screen"><header><div><p className="eyebrow">PRODUÇÃO</p><h2>Histórico de apontamentos</h2></div><button onClick={onClose}>×</button></header><div className="table-wrap"><table><thead><tr><th>OP / ARTIGO / OPERAÇÃO</th><th>OPERADOR</th><th>MÁQUINA</th><th>INÍCIO</th><th>TÉRMINO</th><th>TEMPO</th><th>OBSERVAÇÃO</th></tr></thead><tbody>{rows.map(({order,operation,point})=><tr key={point.id}><td><b>OP {order.numero_op}</b><br/><ArticleLabel code={order.codigo_artigo} name={order.artigo}/><br/>{operation.codigo} · {operation.descricao}</td><td>{profiles.find(p=>p.id===point.operador_id)?.nome??"—"}</td><td>{machines.find(m=>m.id===point.maquina_id)?.codigo??"—"}</td><td>{fmt(point.inicio_em)}</td><td>{fmt(point.termino_em)}</td><td><b className={point.termino_em?"duration":"duration running"}>{formatDuration(point.inicio_em,point.termino_em,now)}</b></td><td>{point.observacao||"—"}</td></tr>)}</tbody></table>{!rows.length&&<p className="pointing-empty">Nenhum apontamento realizado.</p>}</div></section>
}
