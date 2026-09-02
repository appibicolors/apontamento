"use client";
import {useMemo,useState} from "react";
import {finishOperation,Maquina,Ordem,Perfil,startOperation} from "./supabase";

type Props={orders:Ordem[];profiles:Perfil[];machines:Maquina[];token:string;userId:string;onRefresh:()=>Promise<void>;onClose:()=>void};
export function PointingScreen({orders,profiles,machines,token,userId,onRefresh,onClose}:Props){
  const [number,setNumber]=useState(orders[0]?.numero_op??"");
  const [operator,setOperator]=useState(profiles.find(item=>item.id===userId)?.id??profiles[0]?.id??"");
  const [machine,setMachine]=useState("");const [note,setNote]=useState("");const [busy,setBusy]=useState(false);const [message,setMessage]=useState("");
  const order=useMemo(()=>orders.find(item=>item.numero_op===number.trim()),[orders,number]);
  const operations=[...(order?.operacoes??[])].sort((a,b)=>a.sequencia-b.sequencia);
  const current=operations.find(item=>item.status==="em_andamento")??operations.find(item=>item.status==="liberada");
  const openPoint=current?.apontamentos?.find(item=>!item.termino_em);
  async function act(kind:"start"|"finish") {if(!current)return;setBusy(true);setMessage("");try{if(kind==="start"){if(!operator||!machine)throw new Error("Confirme o operador e a máquina.");await startOperation(token,current.id,operator,machine,note)}else await finishOperation(token,current.id,note);await onRefresh();setNote("");setMessage(kind==="start"?"Operação iniciada. Data e hora registradas automaticamente.":"Operação finalizada. A próxima etapa foi liberada.")}catch(error){setMessage(error instanceof Error?error.message:"Não foi possível registrar o apontamento.")}finally{setBusy(false)}}
  return <section className="pointing-screen">
    <div className="pointing-top"><div><p className="eyebrow">APONTAMENTO RÁPIDO</p><h2>Registrar produção</h2><p>Use o leitor de QR Code ou informe o número da OP.</p></div><button onClick={onClose} aria-label="Fechar">×</button></div>
    <label className="scan-input">OP / QR CODE<input autoFocus inputMode="numeric" value={number} onChange={event=>setNumber(event.target.value.replace(/\D/g,""))} placeholder="Escaneie ou digite a OP"/><span>⌗</span></label>
    {!order?<div className="pointing-empty">Informe uma OP cadastrada para continuar.</div>:<>
      <div className="pointing-order"><div><small>ORDEM DE PRODUÇÃO</small><strong>OP {order.numero_op}</strong><span>{order.artigo}</span></div><em>{operations.filter(item=>item.status==="finalizada").length}/{operations.length} etapas</em></div>
      <div className="flow-strip">{operations.map(item=><div key={item.id} className={item.id===current?.id?"current":item.status==="finalizada"?"done":""}><b>{item.codigo}</b><span>{item.descricao}</span><small>{item.status==="finalizada"?"Concluída":item.id===current?.id?(openPoint?"Em andamento":"Liberada"):"Aguardando"}</small></div>)}</div>
      {!current?<div className="pointing-empty success">✓ Todas as operações desta OP foram concluídas.</div>:<div className="pointing-form">
        <div className="current-operation"><small>OPERAÇÃO ATUAL</small><strong>{current.codigo} · {current.descricao}</strong>{openPoint&&<span>Iniciada em {new Date(openPoint.inicio_em).toLocaleString("pt-BR")}</span>}</div>
        <div className="pointing-fields"><label>OPERADOR<select value={operator} onChange={e=>setOperator(e.target.value)} disabled={!!openPoint}>{profiles.map(item=><option key={item.id} value={item.id}>{item.nome}</option>)}</select></label><label>MÁQUINA<select value={machine} onChange={e=>setMachine(e.target.value)} disabled={!!openPoint}><option value="">Selecione</option>{machines.map(item=><option key={item.id} value={item.id}>{item.codigo} · {item.nome}</option>)}</select></label><label className="note">OBSERVAÇÃO<textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="Opcional" rows={2}/></label></div>
        {message&&<p className="pointing-message" role="status">{message}</p>}
        <button className={openPoint?"finish-action":"start-action"} disabled={busy} onClick={()=>act(openPoint?"finish":"start")}>{busy?"Registrando…":openPoint?"■ FINALIZAR OPERAÇÃO":"▶ INICIAR OPERAÇÃO"}</button>
      </div>}
    </>}
  </section>
}
