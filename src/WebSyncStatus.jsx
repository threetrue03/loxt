import {useEffect,useState} from 'react';
import {documentTimings} from './syncDiagnostics.js';
export default function WebSyncStatus(){
 const [state,setState]=useState(document.documentElement.dataset.connection||'connecting'),[open,setOpen]=useState(false),[diagnostics,setDiagnostics]=useState(null),[copied,setCopied]=useState(false);
 useEffect(()=>window.desktop.onConnection(set=>setState(set.state)),[]);
 return <details className="web-sync-status" open={open} onToggle={event=>{setOpen(event.currentTarget.open);if(event.currentTarget.open)setDiagnostics(window.desktop.syncDiagnostics());}}><summary>{state==='online'?'PC 연결됨':'PC에 다시 연결 중…'}</summary><p>최근 왕복 {diagnostics?.recentRequests.at(-1)?.rttMs??'—'} ms · 대기 {diagnostics?.pending??0}개 · 재연결 {diagnostics?.retries??0}회</p><button className="secondary" onClick={()=>setDiagnostics(window.desktop.syncDiagnostics())}>새로 확인</button><button className="secondary" onClick={async()=>{try{await navigator.clipboard.writeText(JSON.stringify({...window.desktop.syncDiagnostics(),documents:documentTimings()},null,2));setCopied(true);}catch{setCopied(false);}}}>{copied?'복사됨':'진단 복사'}</button></details>;
}
