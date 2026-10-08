import { useEffect, useState } from 'react';

export default function WebRecordingRecovery() {
  const [drafts,setDrafts]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
  useEffect(()=>{
    if(!window.desktop.remote) return;
    const refresh=()=>window.desktop.recordingDrafts.list().then(setDrafts).catch(e=>setError(e.message));
    refresh();window.addEventListener('loxt:recording-drafts',refresh);
    return()=>window.removeEventListener('loxt:recording-drafts',refresh);
  },[]);
  if(!window.desktop.remote||!drafts.length)return null;
  return <aside className="web-recording-recovery" role="status"><strong>저장 대기 중인 녹음</strong><p className="hint">이 기기에 남은 원본 조각입니다. PC의 원본도 보존됩니다.</p>{drafts.map(draft=><div key={draft.id}><span>{draft.title||'새 녹음'} · {(draft.bytes/1024/1024).toFixed(1)} MB</span><button className="secondary" disabled={busy} onClick={()=>{const url=URL.createObjectURL(new Blob(draft.chunks,{type:draft.mime})),a=document.createElement('a');a.href=url;a.download=(draft.title||'녹음')+(draft.mime==='audio/mp4'?'.m4a':'.webm');a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}}>원본 받기</button><button className="primary" disabled={busy||!draft.bytes} onClick={async()=>{setBusy(true);setError('');try{await window.desktop.recordingDrafts.recover(draft);await window.desktop.recordingDrafts.remove(draft.id);}catch(e){setError(e.message);}finally{setBusy(false);}}}>{busy?'복구 중…':'PC에 복구 사본 저장'}</button></div>)}{error?<p className="error-message">{error}</p>:null}</aside>;
}
