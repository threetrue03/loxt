import {documentPending,registerDocumentFlusher} from './documentPending.js';
const entries=new Map();let subscribed=false;
export function publish(e,changes){e.state={...e.state,...changes};e.listeners.forEach(fn=>fn());documentPending('pdf',[...entries.values()].filter(e=>e.state.dirty||e.state.saving).map(e=>e.id));if(entries.size>20){for(const [key,item] of entries){if(entries.size<=20)break;if(!item.listeners.size&&!item.state.dirty&&!item.state.saving&&!item.state.loading)entries.delete(key);}}}
export function backup(e){clearTimeout(e.backupTimer);try{localStorage.setItem('loxt.pdf.draft:'+e.key,JSON.stringify({revision:e.state.revision,objects:e.state.objects}));}catch{publish(e,{error:'임시 저장 공간이 부족합니다. 필기 사본을 저장해 주세요.'});}}
function journal(e){clearTimeout(e.backupTimer);e.backupTimer=setTimeout(()=>backup(e),150);}
export function pdfEntry(id,mode){
 const key=`${window.desktop.hostId||'desktop'}:${mode}:${id}`;
 if(!entries.has(key))entries.set(key,{id,mode,key,state:{loading:true,objects:[],revision:0,error:'',dirty:false,saving:false},listeners:new Set(),history:[],redo:[],savedObjects:[],lastSavedAt:Date.now(),timer:null,request:null});
 if(!subscribed){subscribed=true;registerDocumentFlusher('pdf',async()=>{await Promise.all([...entries.values()].map(persist));if([...entries.values()].some(e=>e.state.dirty))throw Error('필기 저장을 마치지 못했습니다. 초안을 보존했습니다.');});window.desktop.onLibraryChange(event=>{if(event.kind&&event.kind!=='pdf'&&!event.resync)return;for(const e of entries.values())if(e.listeners.size&&e.mode===event.workspace&&(!event.id||event.id===e.id)&&!e.state.dirty&&!e.state.saving&&!e.state.loading)window.desktop.pdf.get({workspace:e.mode,id:e.id}).then(doc=>{if(!e.state.dirty&&!e.state.saving&&doc.revision>e.state.revision){e.savedObjects=doc.objects;publish(e,doc);}}).catch(error=>publish(e,{error:error.message}));});window.addEventListener('beforeunload',event=>{for(const e of entries.values())if(e.state.dirty){backup(e);event.preventDefault();event.returnValue='';}});}
 return entries.get(key);
}
export async function loadAnnotations(e){const doc=await window.desktop.pdf.get({workspace:e.mode,id:e.id});if(!e.state.loading&&(e.state.dirty||e.state.saving))return;let pending;try{pending=JSON.parse(localStorage.getItem('loxt.pdf.draft:'+e.key));}catch{}e.savedObjects=doc.objects;publish(e,{...doc,loading:false,dirty:Boolean(pending),objects:pending?.objects||doc.objects,revision:pending?.revision??doc.revision,error:pending?'저장 대기 중인 필기를 복구했습니다. 저장을 다시 시도해 주세요.':''});}
export async function persist(e){
 if(e.request){await e.request;if(e.state.dirty&&!e.state.error)return persist(e);return;}
 if(!e.state.dirty||e.state.loading)return;clearTimeout(e.timer);backup(e);const objects=e.state.objects;
 const saved=new Map(e.savedObjects.map(o=>[o.id,o])),present=new Set(objects.map(o=>o.id));
 const upsert=objects.filter(o=>saved.get(o.id)!==o),remove=e.savedObjects.filter(o=>!present.has(o.id)).map(o=>o.id);
 publish(e,{saving:true,error:''});e.request=window.desktop.pdf.save({workspace:e.mode,id:e.id,revision:e.state.revision,patch:{upsert,remove}}).then(doc=>{e.savedObjects=objects;e.lastSavedAt=Date.now();publish(e,{revision:doc.revision,saving:false,dirty:e.state.objects!==objects,error:doc.metadataWarning||''});if(!e.state.dirty){clearTimeout(e.backupTimer);localStorage.removeItem('loxt.pdf.draft:'+e.key);}else journal(e);}).catch(error=>{backup(e);publish(e,{saving:false,error:error.message});}).finally(()=>{e.request=null;if(e.state.dirty&&!e.state.error)e.timer=setTimeout(()=>persist(e),100);});return e.request;
}
export function modify(e,objects,{history=true}={}){if(history){e.history.push(e.state.objects);e.history=e.history.slice(-60);e.redo=[];}publish(e,{objects,dirty:true,error:''});journal(e);clearTimeout(e.timer);e.timer=setTimeout(()=>persist(e),Math.min(250,Math.max(0,1000-(Date.now()-e.lastSavedAt))));}
export function undoPdf(e,redo=false){const from=redo?e.redo:e.history,to=redo?e.history:e.redo;if(!from.length)return;to.push(e.state.objects);modify(e,from.pop(),{history:false});}
