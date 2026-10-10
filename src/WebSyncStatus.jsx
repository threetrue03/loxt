import {useEffect,useRef,useState} from 'react';
import Modal from './Modal.jsx';
import {documentTimings} from './syncDiagnostics.js';
import {pendingDocumentCount} from './documentPending.js';
import {connectionURL} from '../shared/connection-url.js';
import {downloadDrafts,recordingDrafts,downloadRecording} from '../public/recovery-drafts.js';
import {restoreDraftCopies} from './webDraftRecovery.js';

const labels={connecting:'PC에 연결 중…',reconnecting:'PC에 다시 연결 중…','approval-required':'PC의 재승인이 필요합니다','server-unreachable':'PC에 연결하지 못했습니다','server-changed':'연결한 PC가 바뀌었습니다'};
export default function WebSyncStatus(){
 const [state,setState]=useState(document.documentElement.dataset.connection||'connecting'),[pending,setPending]=useState(pendingDocumentCount()),[open,setOpen]=useState(false),[address,setAddress]=useState(''),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[copied,setCopied]=useState(false),[diagnostics,setDiagnostics]=useState(null),[recordings,setRecordings]=useState([]),[next,setNext]=useState(''),[backedUp,setBackedUp]=useState(false);
 const controller=useRef(null),file=useRef(null);
 function close(){controller.current?.abort();setBusy(false);setOpen(false);setNext('');}
 useEffect(()=>{
  const unsubscribe=window.desktop.onConnection(value=>setState(value.state));
  const dirty=event=>setPending(event.detail.count),newAddress=event=>{setAddress(event.detail);setOpen(true);};
  window.addEventListener('loxt:document-pending',dirty);window.addEventListener('loxt:connection-address',newAddress);
  return()=>{unsubscribe();window.removeEventListener('loxt:document-pending',dirty);window.removeEventListener('loxt:connection-address',newAddress);controller.current?.abort();};
 },[]);
 useEffect(()=>{if(open){setDiagnostics(window.desktop.syncDiagnostics());recordingDrafts().then(setRecordings).catch(e=>setError(e.message));}},[open]);
 async function retry(){setBusy(true);setError('');try{await window.desktop.connection.check();setMessage('PC에 다시 연결했습니다. 저장 대기 초안을 확인하고 있습니다.');}catch(e){setError(e.message);}finally{setBusy(false);}}
 async function approve(event){
  event.preventDefault();setError('');setMessage('');
  try{
   const {first}=connectionURL(address,{requirePair:true});
   if(new URL(first).origin!==location.origin){setNext(first);setBackedUp(false);return;}
   setBusy(true);controller.current=new AbortController();
   await window.desktop.connection.approve(first,{signal:controller.current.signal,onStatus:setMessage});
   history.replaceState(null,'',location.pathname);setMessage('PC 승인이 완료되었습니다. 열린 문서와 초안을 유지합니다.');setAddress('');
  }catch(e){if(e.name!=='AbortError')setError(e.message);}finally{setBusy(false);}
 }
 const label=state==='online'?(pending?`PC 연결됨 · ${pending}개 저장 대기`:'PC 연결됨'):labels[state]||'연결 상태 확인 필요';
 return <>
  <aside className="web-sync-status" aria-label="PC 연결 상태"><span role="status">{label}</span><button className="secondary" onClick={()=>setOpen(true)}>연결 관리</button></aside>
  {open&&<Modal title="내 PC에 다시 연결" onClose={close}>
   <div className="web-connection-recovery">
    <p role="status">{label}{message&&<><br/>{message}</>}</p>
    <p className="hint">열린 문서와 이 브라우저의 저장 대기 초안을 유지합니다. PC가 켜져 있고 같은 Wi-Fi인지 확인하세요. 승인이 해제되거나 만료되었다면 PC 설정 → 내 기기 연결에서 새 연결 주소를 받아 다시 승인받으세요.</p>
    <button className="secondary" disabled={busy} onClick={retry}>다시 연결</button>
    <form onSubmit={approve} className="web-connect-form"><label htmlFor="reapproval-address">새 연결 주소</label><input id="reapproval-address" value={address} onChange={event=>{setAddress(event.target.value);setNext('');setError('');}} disabled={busy} inputMode="url" autoComplete="off" spellCheck={false} placeholder="PC에서 복사한 처음 연결 주소"/><button className="primary" disabled={busy||!address.trim()}>{busy?'PC 승인 기다리는 중…':'이 주소로 연결 요청'}</button></form>
    {next&&<div className="web-draft-warning"><p>주소가 바뀌면 이 브라우저의 초안이 새 주소에 자동으로 전달되지 않습니다. 메모·필기 사본과 아래 녹음 원본을 먼저 내려받으세요. 연결 후 ‘초안 사본 가져오기’로 복구 사본을 만들 수 있습니다.</p><label><input type="checkbox" checked={backedUp} onChange={event=>setBackedUp(event.target.checked)}/> 필요한 초안과 녹음 사본을 보관했습니다</label><button className="secondary" disabled={!backedUp} onClick={()=>location.assign(next)}>새 주소 열기</button></div>}
    <div className="web-recovery-actions"><button className="secondary" onClick={()=>setMessage(`${downloadDrafts()}개 메모·필기 초안 사본을 다운로드했습니다. 첨부파일과 원본 PDF는 원래 PC에서 복구합니다.`)}>메모·필기 초안 사본 받기</button><button className="secondary" disabled={state!=='online'||busy} onClick={()=>file.current.click()}>초안 사본 가져오기</button><input ref={file} type="file" accept=".json" hidden onChange={async event=>{const selected=event.target.files[0];event.target.value='';if(!selected)return;setBusy(true);setError('');try{const result=await restoreDraftCopies(selected);setMessage(`${result.saved}개 복구 사본을 내 보관함에 만들었습니다. 원본과 내려받은 사본은 유지합니다.`);if(result.failed.length)setError(result.failed.map(item=>item.error).join('\n'));}catch(e){setError(e.message);}finally{setBusy(false);}}}/></div>
    {recordings.map(record=><div className="web-recovery-record" key={record.key}><span>{record.title||'녹음 초안'}</span><button className="secondary" onClick={()=>downloadRecording(record.key).catch(e=>setError(e.message))}>녹음 원본 받기</button></div>)}
    {error&&<p role="alert" className="error-message">{error}</p>}
    <details><summary>연결 진단</summary><p>최근 왕복 {diagnostics?.recentRequests.at(-1)?.rttMs??'—'} ms · 요청 대기 {diagnostics?.pending??0}개 · 재연결 {diagnostics?.retries??0}회</p><button className="secondary" onClick={async()=>{try{await navigator.clipboard.writeText(JSON.stringify({...window.desktop.syncDiagnostics(),documents:documentTimings()},null,2));setCopied(true);}catch{setError('진단을 복사하지 못했습니다. 브라우저 권한을 확인해 주세요.');}}}>{copied?'복사됨':'진단 복사'}</button></details>
   </div>
  </Modal>}
 </>;
}
