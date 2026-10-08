import { createContext, useContext, useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import LibraryView from './LibraryView.jsx';
export const PanelContext = createContext(null);
export function NewTabButton() { const panel = useContext(PanelContext); return <button className="new-tab-button" aria-label="패널 열기" title="패널 열기" onClick={() => panel?.show()}><Icon name="panel"/></button>; }
export function PanelProvider({ children, workspace, onWorkspaceChange }) {
  const [tabs, setTabs] = useState(() => { try { const saved = JSON.parse(localStorage.getItem('loxt.panel.tabs.v1')); return Array.isArray(saved) ? saved.filter(t => typeof t.id === 'string' && ['new','browser','folder'].includes(t.type) && ['work','live'].includes(t.mode)).slice(0,100) : []; } catch { return []; } });
  const [selected, setSelected] = useState(() => tabs[0]?.id), [open, setOpen] = useState(false), [width, setWidth] = useState(() => Number(localStorage.getItem('loxt.panel.width')) || 480);
  const current = useRef(tabs); current.current = tabs; const selection = useRef(); selection.current = { selected, open };
  function add(type = 'new', url = '') { const tab = { id: crypto.randomUUID(), type, mode: workspace, title: type === 'browser' ? '브라우저' : '새 탭', url }; setTabs(previous => [...previous,tab]); setSelected(tab.id); setOpen(true); }
  function update(id, value) { setTabs(previous => previous.map(t => t.id === id ? { ...t, ...value } : t)); }
  function selectIndex(index) { const tab = current.current[index-1]; if (tab) { setSelected(tab.id); setOpen(true); } }
  function show() { if (!current.current.length) add(); else setOpen(true); }
  function closeSelected() { if (selection.current.open && selection.current.selected) close(selection.current.selected); }
  function close(id) { window.desktop.browser.command({id,action:'close'}).catch(()=>{}); const remaining = current.current.filter(t=>t.id!==id); setTabs(remaining); if(selection.current.selected===id)setSelected(remaining.at(-1)?.id);if(!remaining.length)setOpen(false); }
  useEffect(() => {
    try { localStorage.setItem('loxt.panel.tabs.v1',JSON.stringify(tabs.map(({id,type,mode,title,url,state,history,historyIndex,scroll})=>({id,type,mode,title,url,state,history,historyIndex,scroll})))); } catch {}
  }, [tabs]);
  useEffect(() => { const keys = e => { if(!(e.ctrlKey||e.metaKey) || document.querySelector('[role=dialog]'))return; if(!e.altKey && !e.shiftKey && e.key.toLowerCase()==='t') { e.preventDefault();if(!e.repeat)add(); } else if (!e.altKey && !e.shiftKey && e.key.toLowerCase()==='w') { e.preventDefault(); if(!e.repeat)closeSelected(); } else if(/^[1-9]$/.test(e.key)) { e.preventDefault(); selectIndex(Number(e.key)); } }; document.addEventListener('keydown',keys); const off=window.desktop.browser.onShortcut(selectIndex), closeTab=window.desktop.browser.onCloseTab(closeSelected), newTab=window.desktop.browser.onNewTab(value=>value.url ? add('browser',value.url) : add()); return()=>{document.removeEventListener('keydown',keys);off();newTab();closeTab();}; }, [workspace]);
  useEffect(() => window.desktop.browser.onState(value => setTabs(previous => previous.map(t => t.id === value.id ? {...t,...value,title:value.title || '브라우저'} : t))), []);
  const record = (mode, folder) => { onWorkspaceChange(mode); setTimeout(() => window.dispatchEvent(new CustomEvent('loxt:open-recording',{detail:{mode,folder}})), 50); };
  const [dragging,setDragging]=useState(false), frame=useRef(null);
  function resize(e) { e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);setDragging(true); }
  function move(e) { if(!dragging)return;const b=frame.current.getBoundingClientRect();const next=Math.max(320,Math.min(b.width-360,b.right-e.clientX));setWidth(next); }
  function stop(){setDragging(false);localStorage.setItem('loxt.panel.width',String(width));}
  return <PanelContext.Provider value={{add,show}}><div ref={frame} className={`workspace-shell ${open?'panel-open':''} ${dragging?'is-resizing':''}`} style={{'--dock-width':`${width}px`}}><div className="workspace-main">{children}</div><div className="dock-resizer" role="separator" aria-label="새 탭 패널 너비" aria-orientation="vertical" tabIndex={open?0:-1} onPointerDown={resize} onPointerMove={move} onPointerUp={stop} onPointerCancel={stop} onKeyDown={e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();setWidth(w=>Math.max(320,Math.min(innerWidth-360,w+(e.key==='ArrowLeft'?20:-20))));}}}/><aside className="side-dock" aria-label="새 탭 패널" inert={!open || undefined}><div className="dock-tabs" role="tablist" aria-label="열린 탭">{tabs.map(t=><div key={t.id} className={`dock-tab ${t.id===selected?'selected':''}`}><button role="tab" aria-selected={t.id===selected} title={t.title} onClick={()=>setSelected(t.id)}><Icon name={t.type==='folder'?'folder':t.type==='browser'?'search':'plus'}/><span>{t.title}</span></button><button aria-label={`${t.title} 탭 닫기`} onClick={()=>close(t.id)}><Icon name="close"/></button></div>)}<button className="icon-button" aria-label="패널 새 탭" onClick={()=>add()}><Icon name="plus"/></button><button className="icon-button" aria-label="패널 접기" onClick={()=>setOpen(false)}><Icon name="sidebar"/></button></div><div className="dock-content">{tabs.map(t=><div className="dock-tab-content" key={t.id} hidden={selected!==t.id} role="tabpanel">{t.type==='new'?<div className="new-tab-page"><h2>무엇을 열까요?</h2><button className="secondary" onClick={()=>update(t.id,{type:'browser',title:'브라우저'})}><Icon name="search"/>브라우저</button><button className="secondary" onClick={()=>update(t.id,{type:'folder',title:`${t.mode==='live'?'Live':'Work'} 보관함`,state:{folder:''}})}><Icon name="folder"/>LOXT 폴더</button></div>:t.type==='folder'?<LibraryView mode={t.mode} state={t.state} onState={state=>update(t.id,{state,title:state.id?(state.title || '기록'):state.folder?.split('/').at(-1)||`${t.mode==='live'?'Live':'Work'} 보관함`})} active={open&&selected===t.id} onRecord={record}/>:<BrowserTab tab={t} active={open&&selected===t.id&&!dragging} onNavigate={url=>update(t.id,{url})}/>}</div>)}</div></aside></div></PanelContext.Provider>;
}
function BrowserTab({tab,active,onNavigate}) {
  const [address,setAddress]=useState(tab.url||''), slot=useRef(null), started=useRef(false), activeRef=useRef(active); activeRef.current=active;
  const command = (action,extra={}) => window.desktop.browser.command({id:tab.id,action,...extra}).catch(()=>{});
  useEffect(()=>{if(tab.url)setAddress(tab.url);},[tab.url]);
  useEffect(()=>{if(active && !started.current && tab.url){started.current=true;command('restore',{url:tab.url,history:tab.history,historyIndex:tab.historyIndex,scroll:tab.scroll});}},[active,tab.url]);
  useEffect(()=>{
    let ready=false,frame;
    const sync=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{
      const overlay=[...document.querySelectorAll('[role=dialog],[role=menu],[role=listbox],.selection-area,.selection-drag,.toast,.memo-save-notice')].some(element=>element.getClientRects().length);
      if(!ready || !activeRef.current || overlay) { if(activeRef.current)command('hide'); return; }
      if (!slot.current) return;
      const b=slot.current.getBoundingClientRect();if(b.width>0&&b.height>0&&tab.url&&!tab.error)command('show',{bounds:{x:b.x,y:b.y,width:b.width,height:b.height}});else command('hide');
    });};
    if(!active){command('hide');return;}
    command('hide');const timer=setTimeout(()=>{ready=true;sync();},260);
    const observer=new ResizeObserver(sync);observer.observe(slot.current);
    const overlays=new MutationObserver(sync);overlays.observe(document.body,{childList:true,subtree:true});window.addEventListener('resize',sync);
    return()=>{clearTimeout(timer);cancelAnimationFrame(frame);observer.disconnect();overlays.disconnect();window.removeEventListener('resize',sync);command('hide');};
  },[active,tab.url,tab.error]);
  function navigate(e){e.preventDefault();started.current=true;command('navigate',{url:address});}
  return <div className="browser-tab"><form className="browser-toolbar" onSubmit={navigate}><button type="button" aria-label="뒤로" disabled={!tab.back} onClick={()=>command('back')}>←</button><button type="button" aria-label="앞으로" disabled={!tab.forward} onClick={()=>command('forward')}>→</button><button type="button" aria-label="새로고침" disabled={!tab.url} onClick={()=>command('reload')}>↻</button><input aria-label="웹 주소 또는 검색어" placeholder="주소 또는 검색어 입력" value={address} onChange={e=>setAddress(e.target.value)}/></form>{tab.loading?<progress className="browser-loading" aria-label="웹페이지 로딩"/>:null}<div ref={slot} className="browser-slot">{tab.error?<div className="empty" role="alert">{tab.error}<button className="secondary" onClick={()=>command('reload')}>다시 시도</button></div>:!tab.url?<div className="empty">주소나 검색어를 입력하세요.</div>:null}</div></div>;
}
