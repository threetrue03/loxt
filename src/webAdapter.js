import { recordingJournal } from './webRecordingJournal.js';
export async function connectWeb(session){
 const journal=recordingJournal(session.hostId),activeRecordings=new Set();
 const listeners=new Map(),off=()=>()=>{},unsupported=()=>Promise.reject(new Error('이 기능은 PC 앱에서 사용해 주세요.'));
 const subscribe=(event,fn)=>{if(!listeners.has(event))listeners.set(event,new Set());listeners.get(event).add(fn);return()=>listeners.get(event).delete(fn);};
 const events=new EventSource('/api/events');for(const type of ['library','transcription','live','live-patch'])events.addEventListener(type,event=>{const value=JSON.parse(event.data);listeners.get(type)?.forEach(fn=>fn(value));});
 function resync(){rpc('liveState').then(value=>listeners.get('live')?.forEach(fn=>fn(value))).catch(()=>{document.documentElement.dataset.connection='offline';});listeners.get('library')?.forEach(fn=>{fn({workspace:'work',resync:true});fn({workspace:'live',resync:true});});}
 events.addEventListener('resync',resync);
 window.addEventListener('online',resync);
 window.addEventListener('pageshow',event=>{if(event.persisted)resync();});
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')resync();});
 events.onerror=()=>{document.documentElement.dataset.connection='offline';};events.onopen=()=>{document.documentElement.dataset.connection='online';listeners.get('library')?.forEach(fn=>{fn({workspace:'work'});fn({workspace:'live'});});};
 async function rpc(method,payload={}) {
  const requestId=crypto.randomUUID(),bytes=payload.bytes;
  const metadata={method,payload:bytes?{...payload,bytes:undefined}:payload,requestId};
  const headers={'Content-Type':bytes?'application/octet-stream':'application/json','X-LOXT-CSRF':session.csrf,...(bytes?{'X-LOXT-Meta':encodeURIComponent(JSON.stringify(metadata))}:{})};
  let result;
  for(let attempt=0;attempt<3;attempt++) {
   try {
    if(bytes) result=await new Promise((resolve,reject)=>{
     const xhr=new XMLHttpRequest();xhr.open('POST','/api/rpc');xhr.timeout=90000;for(const [key,value]of Object.entries(headers))xhr.setRequestHeader(key,value);
     const notify=(loaded,done=false)=>window.dispatchEvent(new CustomEvent('loxt:upload',{detail:{id:requestId,name:payload.name||'음성',loaded,total:bytes.byteLength,done}}));
     notify(0);xhr.upload.onprogress=e=>notify(e.loaded);xhr.onload=()=>{notify(bytes.byteLength,true);try{resolve({ok:xhr.status>=200&&xhr.status<300,status:xhr.status,value:JSON.parse(xhr.responseText)});}catch{reject(Error('PC 응답을 읽지 못했습니다.'));}};
     xhr.onerror=()=>{notify(0,true);reject(Error('PC 연결이 끊겼습니다.'));};xhr.onabort=xhr.onerror;xhr.ontimeout=()=>{notify(0,true);reject(Error('PC 응답 시간이 초과됐습니다. 연결을 확인하고 다시 시도해 주세요.'));};xhr.send(bytes);
    });
    else {const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),method==='pdf.prepareIndex'?185000:45000);try{const res=await fetch('/api/rpc',{method:'POST',headers,body:JSON.stringify(metadata),signal:controller.signal});result={ok:res.ok,status:res.status,value:await res.json()};}finally{clearTimeout(timer);}}
    break;
   } catch(error) {if(attempt===2)throw error.name==='AbortError'?new Error('PC 응답 시간이 초과됐습니다. 연결을 확인하고 다시 시도해 주세요.'):error;await new Promise(resolve=>setTimeout(resolve,500*(attempt+1)));}
  }
  if(!result.ok){const error=new Error(result.value.error||'연결 상태를 확인해 주세요.');error.code=result.value.code;throw error;}
  return result.value.value;
 }
 function download(value){if(value?.download){const a=document.createElement('a');a.href=value.download;a.download='';a.click();}return value;}
 function choose(accept){return new Promise(resolve=>{const input=document.createElement('input');input.type='file';input.accept=accept;input.onchange=()=>resolve(input.files[0]);input.oncancel=()=>resolve(null);input.click();});}
 const readPrefs=()=>{try{return JSON.parse(localStorage.getItem('loxt.web.preferences:'+session.hostId)||'null');}catch{return null;}};
 let prefs=readPrefs()||await rpc('preferences');if(!readPrefs())prefs={...prefs,work:{...prefs.work,microphone:''},live:{...prefs.live,microphone:''}};
 const localSubscribers=new Set(),themeSubscribers=new Set();
 const known=new Map();function remember(data){for(const n of (data?.notes||data?.library?.notes||[]))known.set(n.id,{title:n.title,folder:n.folder,deleted:n.deleted});return data;}
 function library(workspace){return {getLibrary:()=>rpc('library.list',{workspace}).then(remember),createFolder:(name,parent='')=>rpc('library.createFolder',{workspace,name,parent}),renameFolder:(folder,name)=>rpc('library.renameFolder',{workspace,folder,name}),deleteFolder:folder=>rpc('library.deleteFolder',{workspace,folder}),updateNote:(id,changes)=>rpc('library.update',{workspace,id,changes,expected:changes.expected||known.get(id)}).then(remember),moveNotes:(ids,folder)=>rpc('library.move',{workspace,ids,folder}),restoreTrash:ids=>rpc('library.restore',{workspace,ids}),deleteTrash:ids=>rpc('library.delete',{workspace,ids}),importAudio:async folder=>{const file=await choose('audio/*,video/mp4');if(!file)return {canceled:true};if(file.size>128*1024*1024)throw Error('128 MB 이하의 음성 파일을 선택해 주세요.');return rpc('audio.import',{workspace,folder,name:file.name,bytes:new Uint8Array(await file.arrayBuffer())});},copyTranscript:async id=>{const note=await rpc('library.detail',{workspace,id});await navigator.clipboard.writeText(note.segments.map(s=>s.text).join('\n'));},openLibrary:unsupported,convert:(id,model)=>rpc('convert',{workspace,id,model})};}
 const live={...library('live'),getState:()=>rpc('liveState'),onState:fn=>subscribe('live',fn),onPatch:fn=>subscribe('live-patch',fn),onMeter:off,prepare:unsupported,start:unsupported,append:unsupported,pause:unsupported,finish:unsupported};
 const adapter={...library('work'),remote:true,hostId:session.hostId,reportClientError:p=>rpc('client.error',p),capabilities:{desktop:false,pdf:true,microphone:true,liveCapture:false,browser:false},getAppInfo:()=>rpc('appInfo'),getNote:(id,workspace='work')=>rpc('library.detail',{id,workspace}),
  preferences:{get:async()=>prefs,migrate:async()=>prefs,set:async(mode,change)=>{prefs={...prefs,revision:(prefs.revision||0)+1,[mode]:{...prefs[mode],...change}};localStorage.setItem('loxt.web.preferences:'+session.hostId,JSON.stringify(prefs));localSubscribers.forEach(fn=>fn(prefs));return prefs;},onChange:fn=>{localSubscribers.add(fn);return()=>localSubscribers.delete(fn);}},
  appearance:{initial:localStorage.getItem('loxt.web.theme')||'dark',get:async()=>({theme:localStorage.getItem('loxt.web.theme')||'dark'}),set:async theme=>{localStorage.setItem('loxt.web.theme',theme);themeSubscribers.forEach(fn=>fn({theme}));return {theme};},onChange:fn=>{themeSubscribers.add(fn);return()=>themeSubscribers.delete(fn);}},
  settings:{get:async()=>({}),onChange:off},
  browser:{command:unsupported,onShortcut:off,onState:off,onCloseTab:off,onNewTab:off},
  live,manageLibrary:p=>rpc('manage',p),searchLibrary:p=>rpc('search',p),onLibraryChange:fn=>subscribe('library',fn),getTranscriptionEnvironment:()=>rpc('environment'),onTranscriptionState:fn=>subscribe('transcription',fn),startTranscription:(id,options={})=>rpc('convert',{id,workspace:'work',...options}),cancelTranscription:id=>rpc('cancel',{id}),retrySpeakers:unsupported,
  exportFolder:p=>rpc('folder.export',p).then(download),exportTranscript:p=>rpc('script.export',p).then(download),
  memos:{create:(folder,workspace='work')=>rpc('memo.create',{folder,workspace}),get:id=>rpc('memo.get',{id}),save:p=>rpc('memo.save',p),attach:p=>rpc('memo.attach',p),export:p=>rpc('memo.export',p).then(download),copy:text=>navigator.clipboard.writeText(text),openLink:async value=>{const url=typeof value==='string'?value:value.url;if(url.startsWith('loxt-asset:')){const [id,name]=new URL(url).pathname.slice(1).split('/');const mode=await modeFor(id);download({download:`/file/memo/${mode}/${id}/${name}`});}else if(/^(https?:|mailto:)/.test(url))window.open(url,'_blank','noopener');},pending:()=>{},onFlush:off},
  pdf:{create:p=>rpc('pdf.create',p),info:p=>rpc('pdf.info',p),page:p=>rpc('pdf.page',p),preview:p=>rpc('pdf.preview',p),outline:p=>rpc('pdf.outline',p),destination:p=>rpc('pdf.destination',p),prepareIndex:p=>rpc('pdf.prepareIndex',p),source:p=>`/file/pdf/${p.workspace}/${p.id}`,searchIndex:p=>rpc('pdf.searchIndex',p),index:p=>rpc('pdf.index',p),get:p=>rpc('pdf.get',p),save:p=>rpc('pdf.save',p),bytes:async p=>new Uint8Array(await (await fetch(`/file/pdf/${p.workspace}/${p.id}`)).arrayBuffer()),export:p=>rpc('pdf.export',p).then(download),import:async p=>{if(p.bytes)return rpc('pdf.import',p);const file=await choose('.pdf');if(!file)return {canceled:true};if(file.size>128*1024*1024)throw Error('128 MB 이하의 PDF를 선택해 주세요.');return rpc('pdf.import',{...p,name:file.name,bytes:new Uint8Array(await file.arrayBuffer())});}},
  recordingDrafts:{list:async()=>(await journal.list()).filter(d=>!activeRecordings.has(d.id)),remove:id=>journal.remove(id),recover:async draft=>{const file=new Blob(draft.chunks,{type:draft.mime}),ext=draft.mime==='audio/mp4'?'.m4a':draft.mime==='audio/ogg'?'.ogg':'.webm';await rpc('record.recover',{workspace:'work',previousId:draft.id,name:(draft.title||'녹음')+' 복구 사본'+ext,seconds:draft.seconds,bytes:new Uint8Array(await file.arrayBuffer())});}},
  beginRecording:async p=>{const result=await rpc('record.begin',p);try{await journal.begin(result.id,p);}catch(e){await rpc('record.abandon',{id:result.id}).catch(()=>{});throw e;}activeRecordings.add(result.id);return result;},
  appendRecording:async p=>{await journal.append(p);return rpc('record.append',p);},
  checkpointRecording:async p=>{await journal.checkpoint(p);return rpc('record.checkpoint',p);},
  finishRecording:async p=>{await journal.checkpoint(p);try{const result=await rpc('record.finish',p);activeRecordings.delete(p.id);await journal.remove(p.id);return result;}catch(e){activeRecordings.delete(p.id);journal.changed();throw e;}},
  abandonRecording:async id=>{await rpc('record.abandon',{id});activeRecordings.delete(id);await journal.remove(id);},discardRecording:async id=>{let result;try{result=await rpc('record.discard',{id});}catch{result=await rpc('record.discard-saved',{id});}activeRecordings.delete(id);await journal.remove(id);return result;},
  audioUrl:(host,id)=>`/file/audio/${host==='live'?'live':'work'}/${id}`,
  assetUrl:async url=>{if(!url.startsWith('loxt-asset:'))return url;const [id,name]=new URL(url).pathname.slice(1).split('/');return `/file/memo/${await modeFor(id)}/${id}/${name}`;}
 };
 const modes=new Map();async function modeFor(id){if(modes.has(id))return modes.get(id);for(const mode of ['work','live']){const library=await rpc('library.list',{workspace:mode});for(const n of library.notes)modes.set(n.id,mode);}return modes.get(id)||'work';}
 window.desktop=adapter;
 return adapter;
}
