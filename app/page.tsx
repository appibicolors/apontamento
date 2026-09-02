"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { loadOrders, Ordem, savedSession, saveSession, Session, signIn } from "./supabase";

const ordens = [
  { numero: "267649", artigo: "MAQUINETADO ALGODÃO POSITANO", cliente: "IBIRAPUERA TÊXTIL LTDA", progresso: 50, status: "Em produção", etapa: "Jigger cores claras/médias", maquina: "JIGGER 02", operador: "João Silva", inicio: "08:42", tom: "blue" },
  { numero: "267650", artigo: "SARJA FLANELADA 78 CM", cliente: "IBIRAPUERA TÊXTIL LTDA", progresso: 0, status: "Aguardando", etapa: "Enrolar carrolão", maquina: "—", operador: "—", inicio: "—", tom: "amber" },
  { numero: "267653", artigo: "COTTON SOFT LISTRADO 40/1", cliente: "IBIRAPUERA TÊXTIL LTDA", progresso: 80, status: "Em produção", etapa: "Secagem + acabamento", maquina: "RAMA 01", operador: "Marcos Lima", inicio: "10:16", tom: "blue" },
];

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState("");
  const [modal, setModal] = useState<"import" | "scan" | null>(null);
  const [fileName, setFileName] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [liveOrders, setLiveOrders] = useState<Ordem[]>([]);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const current=savedSession(); setSession(current); setAuthReady(true);
    if(current) loadOrders(current.access_token).then(setLiveOrders).catch(()=>{saveSession(null);setSession(null)});
  },[]);
  async function handleLogin(event:FormEvent<HTMLFormElement>){
    event.preventDefault(); const data=new FormData(event.currentTarget); setLoading(true); setAuthError("");
    try{const next=await signIn(String(data.get("email")),String(data.get("password")));setSession(next);setLiveOrders(await loadOrders(next.access_token))}
    catch(error){setAuthError(error instanceof Error?error.message:"Falha no acesso.")}finally{setLoading(false)}
  }
  if(!authReady)return <main className="login-shell"><p>Conectando ao ambiente Ibicolors…</p></main>;
  if(!session)return <main className="login-shell"><section className="login-card"><div className="brand login-brand"><span className="brand-mark">IP</span><span><b>Ibirapuera</b><small>Produção</small></span></div><p className="eyebrow">AMBIENTE DE TESTES</p><h1>Entrar no apontamento</h1><p>Use o usuário criado no Supabase para acessar a produção.</p><form onSubmit={handleLogin}><label>E-mail<input name="email" type="email" required autoComplete="email"/></label><label>Senha<input name="password" type="password" required autoComplete="current-password"/></label>{authError&&<p className="login-error" role="alert">{authError}</p>}<button className="primary" disabled={loading}>{loading?"Entrando…":"Entrar"}</button></form><small className="connection-ok">● Supabase configurado</small></section></main>;
  const displayedOrders=liveOrders.length?liveOrders.map(op=>{const operations=[...(op.operacoes??[])].sort((a,b)=>a.sequencia-b.sequencia);const finished=operations.filter(x=>x.status==="finalizada").length;const current=operations.find(x=>x.status==="em_andamento")??operations.find(x=>x.status!=="finalizada");const progress=operations.length?Math.round(finished/operations.length*100):0;return{numero:op.numero_op,artigo:op.artigo,cliente:op.cliente,progresso:progress,status:op.status==="em_producao"?"Em produção":op.status==="finalizada"?"Finalizada":"Aguardando",etapa:current?.descricao??"Fluxo não cadastrado",maquina:"—",operador:"—",inicio:"—",tom:op.status==="em_producao"?"blue":"amber"};}):ordens;
  function chooseFile() { inputRef.current?.click(); }
  function fileSelected(file?: File) {
    if (file) { setFileName(file.name); setModal("import"); }
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">IP</span><span><b>Ibirapuera</b><small>Produção</small></span></div>
        <nav aria-label="Navegação principal">
          <a className="active" href="#painel"><span>▦</span>Painel</a>
          <a href="#ordens"><span>▤</span>Ordens de produção</a>
          <a href="#apontamento"><span>◎</span>Apontamento</a>
          <a href="#maquinas"><span>⚙</span>Máquinas</a>
          <a href="#operadores"><span>♙</span>Operadores</a>
        </nav>
        <div className="sidebar-bottom"><a href="#config"><span>⚙</span>Configurações</a><div className="user"><span className="avatar">PC</span><span><b>{session.user.email?.split("@")[0]}</b><small>Conectado</small></span><button aria-label="Sair" onClick={()=>{saveSession(null);setSession(null)}}>↪</button></div></div>
      </aside>

      <section className="workspace" id="painel">
        <header><div><p className="eyebrow">VISÃO GERAL</p><h1>Bom dia, André</h1><p>Acompanhe o andamento da produção em tempo real.</p></div><div className="header-actions"><button className="scan" onClick={() => setModal("scan")}>⌗ <span>Escanear QR Code</span></button><button className="primary" onClick={chooseFile}>＋ Nova OP</button><input ref={inputRef} type="file" accept="application/pdf" hidden onChange={(e) => fileSelected(e.target.files?.[0])}/></div></header>
        <div className="live-status"><span>●</span> Banco conectado · {liveOrders.length} OP{liveOrders.length===1?"":"s"} cadastrada{liveOrders.length===1?"":"s"}</div>
        {notice && <div className="notice" role="status"><span>✓</span>{notice}<button onClick={() => setNotice("")} aria-label="Fechar aviso">×</button></div>}

        <div className="metrics">
          <article><span className="metric-icon blue">▤</span><div><small>OPs em produção</small><strong>8</strong><em>↑ 2 hoje</em></div></article>
          <article><span className="metric-icon amber">◷</span><div><small>Aguardando início</small><strong>3</strong><em className="muted">Próxima: OP 267650</em></div></article>
          <article><span className="metric-icon green">✓</span><div><small>Finalizadas hoje</small><strong>12</strong><em>↑ 20% vs. ontem</em></div></article>
          <article><span className="metric-icon red">!</span><div><small>Com atenção</small><strong>2</strong><em className="alert">Verificar agora</em></div></article>
        </div>

        <section className="panel" id="ordens">
          <div className="panel-title"><div><h2>Ordens de produção ativas</h2><p>Acompanhamento das operações em andamento</p></div><a href="#todas">Ver todas as OPs →</a></div>
          <div className="table-wrap"><table><thead><tr><th>ORDEM / ARTIGO</th><th>PROGRESSO</th><th>OPERAÇÃO ATUAL</th><th>MÁQUINA</th><th>OPERADOR</th><th>INÍCIO</th><th></th></tr></thead><tbody>
            {displayedOrders.map((op) => <tr key={op.numero}><td><div className="op-number"><b>OP {op.numero}</b><span className={`badge ${op.tom}`}>{op.status}</span></div><strong className="article">{op.artigo}</strong><small>{op.cliente}</small></td><td><div className="progress-label"><b>{op.progresso}%</b><span>{op.progresso}% concluído</span></div><div className="progress"><i style={{width:`${op.progresso}%`}} /></div></td><td><span className={`step-dot ${op.progresso === 0 ? "pending" : ""}`}></span><b>{op.etapa}</b></td><td>{op.maquina}</td><td>{op.operador}</td><td>{op.inicio}</td><td><button className="more">⋮</button></td></tr>)}
          </tbody></table></div>
        </section>

        <div className="bottom-grid">
          <section className="upload-card"><div className="upload-icon">⇧</div><div><h2>Importar nova ordem de produção</h2><p>Envie o PDF da OP. Os dados e o fluxo serão identificados automaticamente.</p><button onClick={chooseFile}>Selecionar PDF</button><small>PDF de até 20 MB</small></div></section>
          <section className="activity"><div className="panel-title"><div><h2>Atividade recente</h2><p>Últimos apontamentos realizados</p></div><a href="#historico">Ver histórico</a></div><ul><li><span className="activity-icon green">✓</span><p><b>OP 267648 finalizada</b><small>Revisão concluída por Carlos Mendes</small></p><time>há 12 min</time></li><li><span className="activity-icon blue">▶</span><p><b>Operação iniciada</b><small>OP 267653 · Secagem + acabamento</small></p><time>há 35 min</time></li><li><span className="activity-icon amber">!</span><p><b>Parada registrada</b><small>RAMA 02 · Manutenção preventiva</small></p><time>há 1h</time></li></ul></section>
        </div>
      </section>
      {modal && <div className="modal-backdrop" role="presentation" onMouseDown={() => setModal(null)}><section className="modal" role="dialog" aria-modal="true" aria-label={modal === "import" ? "Importar ordem de produção" : "Apontamento rápido"} onMouseDown={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={() => setModal(null)} aria-label="Fechar">×</button>
        {modal === "import" ? <><span className="modal-symbol">✓</span><p className="eyebrow">LEITURA CONCLUÍDA</p><h2>3 ordens encontradas</h2><p className="modal-copy">{fileName} foi analisado. Confira as ordens antes de publicar.</p><div className="detected-list"><div><b>OP 267649</b><span>Maquinetado Algodão Positano</span><em>4 operações</em></div><div><b>OP 267650</b><span>Sarja Flanelada 78 cm</span><em>4 operações</em></div><div><b>OP 267653</b><span>Cotton Soft Listrado 40/1</span><em>5 operações</em></div></div><div className="modal-actions"><button onClick={() => setModal(null)}>Cancelar</button><button className="primary" onClick={() => {setModal(null);setNotice("3 ordens conferidas e prontas para publicação. Conecte o Supabase para gravá-las.")}}>Conferir e publicar</button></div></> : <><span className="qr-frame">⌗</span><p className="eyebrow">APONTAMENTO RÁPIDO</p><h2>Aponte a câmera para o QR Code</h2><p className="modal-copy">Escaneie primeiro o crachá do operador e depois a ordem de produção.</p><div className="scan-steps"><span className="done">1</span><b>Identificar operador</b><i></i><span>2</span><b>Ler ordem de produção</b><i></i><span>3</span><b>Iniciar operação</b></div><button className="full-button" onClick={() => setModal(null)}>Usar leitor USB</button></>}
      </section></div>}
    </main>
  );
}
