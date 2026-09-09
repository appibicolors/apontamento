"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { loadMachines, loadOrders, loadProfiles, Maquina, Ordem, Perfil, savedSession, saveOrders, saveSession, Session, signIn } from "./supabase";
import { parseProductionOrders, ParsedOrder } from "./pdf-parser";
import { PointingScreen } from "./pointing-screen";
import { ManagementScreen } from "./management-screen";
import { HistoryScreen } from "./history-screen";
import { downloadOrderQr } from "./qr-label";
import { AdminScreen } from "./admin-screen";
import { ArticleLabel } from "./article-label";
import { OrdersScreen } from "./orders-screen";
import {addCalendarDays,deadlineStatus,formatDateOnly} from "./deadline";

const ordens: Array<{numero:string;artigo:string;cliente:string;progresso:number;status:string;deadline:ReturnType<typeof deadlineStatus>;etapa:string;maquina:string;operador:string;inicio:string;tom:string}>=[];

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState("");
  const [modal, setModal] = useState<"import" | "pointing" | "machines" | "operators" | "history" | "admin" | null>(null);
  const [ordersOpen,setOrdersOpen]=useState(false);
  const [fileName, setFileName] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [liveOrders, setLiveOrders] = useState<Ordem[]>([]);
  const [profiles,setProfiles]=useState<Perfil[]>([]);
  const [machines,setMachines]=useState<Maquina[]>([]);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState("");
  const [loading, setLoading] = useState(false);
  const [parsedOrders,setParsedOrders]=useState<ParsedOrder[]>([]);
  const [importing,setImporting]=useState(false);
  const [parseError,setParseError]=useState("");
  useEffect(() => {
    const current=savedSession(); setSession(current); setAuthReady(true);
    if(current) Promise.all([loadOrders(current.access_token),loadProfiles(current.access_token),loadMachines(current.access_token)]).then(([orders,people,equipment])=>{setLiveOrders(orders);setProfiles(people);setMachines(equipment)}).catch(()=>{saveSession(null);setSession(null)});
  },[]);
  async function handleLogin(event:FormEvent<HTMLFormElement>){
    event.preventDefault(); const data=new FormData(event.currentTarget); setLoading(true); setAuthError("");
    try{const next=await signIn(String(data.get("email")),String(data.get("password")));setSession(next);const [orders,people,equipment]=await Promise.all([loadOrders(next.access_token),loadProfiles(next.access_token),loadMachines(next.access_token)]);setLiveOrders(orders);setProfiles(people);setMachines(equipment)}
    catch(error){setAuthError(error instanceof Error?error.message:"Falha no acesso.")}finally{setLoading(false)}
  }
  if(!authReady)return <main className="login-shell"><p>Conectando ao ambiente Ibicolors…</p></main>;
  if(!session)return <main className="login-shell"><section className="login-card"><div className="brand login-brand"><span className="brand-mark">IP</span><span><b>Ibirapuera</b><small>Produção</small></span></div><p className="eyebrow">AMBIENTE DE TESTES</p><h1>Entrar no apontamento</h1><p>Use o usuário criado no Supabase para acessar a produção.</p><form onSubmit={handleLogin}><label>E-mail<input name="email" type="email" required autoComplete="email"/></label><label>Senha<input name="password" type="password" required autoComplete="current-password"/></label>{authError&&<p className="login-error" role="alert">{authError}</p>}<button className="primary" disabled={loading}>{loading?"Entrando…":"Entrar"}</button></form><small className="connection-ok">● Supabase configurado</small></section></main>;
  const activeSession=session;
  const displayedOrders=liveOrders.length?liveOrders.map(op=>{const operations=[...(op.operacoes??[])].sort((a,b)=>a.sequencia-b.sequencia);const covered=operations.filter(x=>x.apontamentos?.some(point=>point.termino_em)).length;const current=operations.find(x=>x.status==="em_andamento")??operations.find(x=>!x.apontamentos?.some(point=>point.termino_em))??operations.at(-1);const progress=operations.length?Math.round(covered/operations.length*100):0;const deadline=deadlineStatus(op);return{numero:op.numero_op,artigo:op.artigo,cliente:op.cliente,progresso:progress,status:op.encerrada_em?"Encerrada":op.status==="em_producao"?"Em produção":"Aguardando",deadline,etapa:current?.descricao??"Fluxo não cadastrado",maquina:"—",operador:"—",inicio:"—",tom:op.encerrada_em?"green":op.status==="em_producao"?"blue":"amber"};}):ordens;
  const userName=profiles.find(profile=>profile.id===session.user.id)?.nome??session.user.email?.split("@")[0]??"Usuário";
  const isAdmin=profiles.find(profile=>profile.id===session.user.id)?.perfil==="admin";
  const producingCount=liveOrders.filter(order=>order.status==="em_producao").length;
  const waitingCount=liveOrders.filter(order=>order.status==="aguardando").length;
  const finishedCount=liveOrders.filter(order=>order.status==="finalizada").length;
  function chooseFile() { inputRef.current?.click(); }
  async function fileSelected(file?:File){if(!file)return;setFileName(file.name);setImporting(true);setModal("import");setParsedOrders([]);setParseError("");try{const parsed=await parseProductionOrders(file);setParsedOrders(parsed);if(!parsed.length)setParseError("O texto do documento foi lido, mas nenhuma OP foi reconhecida.")}catch(error){setParseError(error instanceof Error?error.message:"Falha desconhecida durante a leitura do PDF.")}finally{setImporting(false);if(inputRef.current)inputRef.current.value=""}}
  function updateOrder(index:number,field:keyof ParsedOrder,value:string|number|null){setParsedOrders(current=>current.map((order,i)=>i===index?{...order,[field]:value}:order))}
  async function publishOrders(){if(!parsedOrders.length)return;setImporting(true);try{await saveOrders(parsedOrders,activeSession);setLiveOrders(await loadOrders(activeSession.access_token));setModal(null);const totalOperations=parsedOrders.reduce((total,order)=>total+order.operacoes.length,0);setParsedOrders([]);setNotice(`${parsedOrders.length} OP${parsedOrders.length===1?"":"s"} e ${totalOperations} operaç${totalOperations===1?"ão":"ões"} gravadas no Supabase e liberadas para apontamento.`)}catch(error){setNotice(error instanceof Error?`Erro ao gravar: ${error.message}`:"Não foi possível gravar as OPs.")}finally{setImporting(false)}}

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">IP</span><span><b>Ibirapuera</b><small>Produção</small></span></div>
        <nav aria-label="Navegação principal">
          <a className="active" href="#painel"><span>▦</span>Painel</a>
          <a href="#ordens" onClick={event=>{event.preventDefault();setOrdersOpen(true)}}><span>▤</span>Ordens de produção</a>
          <a href="#apontamento" onClick={event=>{event.preventDefault();setModal("pointing")}}><span>◎</span>Apontamento</a>
          {isAdmin&&<a href="#maquinas" onClick={event=>{event.preventDefault();setModal("machines")}}><span>⚙</span>Máquinas</a>}
          {isAdmin&&<a href="#operadores" onClick={event=>{event.preventDefault();setModal("operators")}}><span>♙</span>Operadores</a>}
          <a href="#historico" onClick={event=>{event.preventDefault();setModal("history")}}><span>◷</span>Histórico</a>
          {isAdmin&&<a href="#admin" onClick={event=>{event.preventDefault();setModal("admin")}}><span>⌘</span>Administração</a>}
        </nav>
        <div className="sidebar-bottom">{isAdmin&&<a href="#config"><span>⚙</span>Configurações</a>}<div className="user"><span className="avatar">PC</span><span><b>{session.user.email?.split("@")[0]}</b><small>{isAdmin?"Administrador":"Produção"}</small></span><button aria-label="Sair" onClick={()=>{saveSession(null);setSession(null)}}>↪</button></div></div>
      </aside>

      <section className="workspace" id="painel">
        <header><div><p className="eyebrow">VISÃO GERAL</p><h1>Bom dia, {userName}</h1><p>Acompanhe o andamento da produção em tempo real.</p></div><div className="header-actions"><button className="scan" onClick={() => setModal("pointing")}>⌗ <span>Escanear QR Code</span></button><button className="primary" onClick={chooseFile}>＋ Nova OP</button><input ref={inputRef} type="file" accept="application/pdf" hidden onChange={(e) => fileSelected(e.target.files?.[0])}/></div></header>
        <div className="live-status"><span>●</span> Banco conectado · {liveOrders.length} OP{liveOrders.length===1?"":"s"} cadastrada{liveOrders.length===1?"":"s"}</div>
        {notice && <div className="notice" role="status"><span>✓</span>{notice}<button onClick={() => setNotice("")} aria-label="Fechar aviso">×</button></div>}

        <div className="metrics">
          <article><span className="metric-icon blue">▤</span><div><small>OPs em produção</small><strong>{producingCount}</strong><em>Dados em tempo real</em></div></article>
          <article><span className="metric-icon amber">◷</span><div><small>Aguardando início</small><strong>{waitingCount}</strong><em className="muted">Prontas para apontar</em></div></article>
          <article><span className="metric-icon green">✓</span><div><small>OPs finalizadas</small><strong>{finishedCount}</strong><em>Histórico preservado</em></div></article>
          <article><span className="metric-icon red">!</span><div><small>Com atenção</small><strong>0</strong><em className="muted">Sem alertas</em></div></article>
        </div>

        <section className="panel" id="ordens">
          <div className="panel-title"><div><h2>Ordens de produção ativas</h2><p>Acompanhamento das operações em andamento</p></div><a href="#todas" onClick={event=>{event.preventDefault();setOrdersOpen(true)}}>Ver todas as OPs →</a></div>
          <div className="table-wrap"><table><thead><tr><th>ORDEM / ARTIGO</th><th>PROGRESSO</th><th>OPERAÇÃO ATUAL</th><th>MÁQUINA</th><th>OPERADOR</th><th>INÍCIO</th><th></th></tr></thead><tbody>
            {displayedOrders.map((op) => <tr key={op.numero}><td><div className="op-number"><b>OP {op.numero}</b><span className={`badge ${op.tom}`}>{op.status}</span>{op.deadline.key!=="closed"&&op.deadline.key!=="cancelled"&&<span className={`deadline-badge ${op.deadline.key}`}>{op.deadline.label}</span>}</div><ArticleLabel className="article" code={liveOrders.find(order=>order.numero_op===op.numero)?.codigo_artigo} name={op.artigo}/><small>{op.cliente}</small></td><td><div className="progress-label"><b>{op.progresso}%</b><span>{op.progresso}% concluído</span></div><div className="progress"><i style={{width:`${op.progresso}%`}} /></div></td><td><span className={`step-dot ${op.progresso === 0 ? "pending" : ""}`}></span><b>{op.etapa}</b></td><td>{op.maquina}</td><td>{op.operador}</td><td>{op.inicio}</td><td><button className="more">⋮</button></td></tr>)}
          </tbody></table></div>
        </section>

        <div className="bottom-grid">
          <section className="upload-card"><div className="upload-icon">⇧</div><div><h2>Importar nova ordem de produção</h2><p>Envie o PDF da OP. Os dados e o fluxo serão identificados automaticamente.</p><button onClick={chooseFile}>Selecionar PDF</button><small>PDF de até 20 MB</small></div></section>
          <section className="activity"><div className="panel-title"><div><h2>Atividade recente</h2><p>Consulte os apontamentos realizados</p></div><button className="more" onClick={()=>setModal("history")}>Abrir histórico →</button></div><div className="pointing-empty compact">Os registros reais aparecerão no Histórico.</div></section>
        </div>
      </section>
      {ordersOpen&&<div className="modal-backdrop" role="presentation" onMouseDown={()=>setOrdersOpen(false)}><div role="dialog" aria-modal="true" aria-label="Ordens de produção" onMouseDown={event=>event.stopPropagation()}><OrdersScreen orders={liveOrders} profiles={profiles} machines={machines} onClose={()=>setOrdersOpen(false)} onRefresh={async()=>setLiveOrders(await loadOrders(session.access_token))}/></div></div>}
      {modal && <div className="modal-backdrop" role="presentation" onMouseDown={() => setModal(null)}>{modal==="admin"&&isAdmin?<div role="dialog" aria-modal="true" aria-label="Administração" onMouseDown={e=>e.stopPropagation()}><AdminScreen orders={liveOrders} profiles={profiles} machines={machines} token={session.access_token} onClose={()=>setModal(null)} onRefresh={async()=>{const [orders,people,equipment]=await Promise.all([loadOrders(session.access_token),loadProfiles(session.access_token),loadMachines(session.access_token)]);setLiveOrders(orders);setProfiles(people);setMachines(equipment)}}/></div>:modal==="history"?<div role="dialog" onMouseDown={e=>e.stopPropagation()}><HistoryScreen orders={liveOrders} profiles={profiles} machines={machines} onClose={()=>setModal(null)}/></div>:modal==="pointing"?<div role="dialog" aria-modal="true" aria-label="Apontamento de produção" onMouseDown={e=>e.stopPropagation()}><PointingScreen orders={liveOrders} profiles={profiles} machines={machines} token={session.access_token} userId={session.user.id} onClose={()=>setModal(null)} onRefresh={async()=>setLiveOrders(await loadOrders(session.access_token))}/></div>:modal==="machines"||modal==="operators"?<div role="dialog" aria-modal="true" onMouseDown={e=>e.stopPropagation()}><ManagementScreen kind={modal} machines={machines} profiles={profiles} token={session.access_token} onClose={()=>setModal(null)} onRefresh={async()=>{const [people,equipment]=await Promise.all([loadProfiles(session.access_token),loadMachines(session.access_token)]);setProfiles(people);setMachines(equipment)}}/></div>:<section className="modal" role="dialog" aria-modal="true" aria-label="Importar ordem de produção" onMouseDown={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={() => setModal(null)} aria-label="Fechar">×</button>
        <>
          {importing&&!parsedOrders.length?<div className="reading-state"><span></span><h2>Lendo ordem de produção…</h2><p>Extraindo dados e fluxo do documento.</p></div>:<>
            <span className={`modal-symbol ${parseError?"warning":""}`}>{parseError?"!":"✓"}</span>
            <p className="eyebrow">{parseError?"FALHA NA LEITURA":"CONFIRA ANTES DE GRAVAR"}</p>
            <h2>{parseError?"Não foi possível processar o PDF":`${parsedOrders.length} ${parsedOrders.length===1?"ordem encontrada":"ordens encontradas"}`}</h2>
            <p className="modal-copy">{parseError||`${fileName} foi lido no dispositivo. Corrija qualquer informação, se necessário.`}</p>
            <div className="article-preview">{parsedOrders.map(order=><div key={order.numero_op}><small>OP {order.numero_op}</small><ArticleLabel code={order.codigo_artigo} name={order.artigo}/></div>)}</div>
            <div className="order-review">{parsedOrders.map((order,index)=>{const estimated=addCalendarDays(order.data_op,order.prazo_dias);return <article key={order.numero_op}><div className="review-head"><b>OP {order.numero_op}</b><em>{order.operacoes.length} operações</em></div><div className="review-grid"><label>Cliente<input value={order.cliente} onChange={e=>updateOrder(index,"cliente",e.target.value)}/></label><label>NF entrada<input value={order.nf_entrada} onChange={e=>updateOrder(index,"nf_entrada",e.target.value)}/></label><label>Data OP<input type="date" value={order.data_op} onChange={e=>updateOrder(index,"data_op",e.target.value)}/></label><label>Prazo em dias corridos<input type="number" min="0" max="3650" placeholder="Ex.: 7" value={order.prazo_dias??""} onChange={e=>updateOrder(index,"prazo_dias",e.target.value===""?null:Number(e.target.value))}/></label><label>Prazo estimado<input readOnly value={estimated?formatDateOnly(estimated):"Informe o prazo"}/></label><span className="deadline-help">Data OP + prazo informado</span><label>Código do artigo<input value={order.codigo_artigo} maxLength={6} onChange={e=>updateOrder(index,"codigo_artigo",e.target.value.toUpperCase())}/></label><label className="wide">Artigo<input value={order.artigo} onChange={e=>updateOrder(index,"artigo",e.target.value)}/></label><label>Peças<input type="number" value={order.pecas} onChange={e=>updateOrder(index,"pecas",Number(e.target.value))}/></label><label>Metros<input type="number" step="0.01" value={order.metros} onChange={e=>updateOrder(index,"metros",Number(e.target.value))}/></label><label>Peso<input type="number" step="0.001" value={order.peso} onChange={e=>updateOrder(index,"peso",Number(e.target.value))}/></label></div><ol>{order.operacoes.map(operation=><li key={operation.codigo}><code>{operation.codigo}</code>{operation.descricao}</li>)}</ol></article>})}</div>
            <div className="modal-actions"><button onClick={()=>setModal(null)}>Cancelar</button>{parsedOrders.map(order=><button key={order.numero_op} className="qr-download" onClick={()=>downloadOrderQr(order.numero_op,userName).catch(error=>setParseError(error instanceof Error?error.message:"Falha ao gerar QR."))}>⌗ QR OP {order.numero_op}</button>)}<button className="primary" disabled={importing||!parsedOrders.length} onClick={publishOrders}>{importing?"Gravando…":"Confirmar e gravar"}</button></div>
          </>}
        </>
      </section>}</div>}
    </main>
  );
}
