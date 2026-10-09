import {useEffect,useState} from 'react';
import {estimateDocumentBytes,trimIdleDocuments} from './documentCache.js';
const cache=new Map(),pending=new Map(),active=new Map();
const noteKey=(note,mode)=>`${window.desktop.hostId||'desktop'}:${mode}:${note.id}:${note.updatedRevision||0}`;
function trim(){trimIdleDocuments(cache,{countLimit:24,protectedEntry:entry=>active.has(entry.key)||pending.has(entry.key)});}
export function getFullNote(note,mode){
  if(!note?._summary||['memo','pdf'].includes(note.kind))return Promise.resolve(note);
  const key=noteKey(note,mode);
  if(cache.has(key)){const entry=cache.get(key);entry.lastAccess=Date.now();return Promise.resolve(entry.value);}if(pending.has(key))return pending.get(key);
  const request=window.desktop.getNote(note.id,mode).then(data=>{cache.set(key,{key,value:data,cacheBytes:estimateDocumentBytes(data),lastAccess:Date.now()});trim();return data;}).finally(()=>{pending.delete(key);trim();});pending.set(key,request);return request;
}
export default function useFullNote(note,mode='work'){
  const [loaded,setLoaded]=useState(null),[attempt,setAttempt]=useState(0);
  useEffect(()=>{let mounted=true,key;if(note?._summary&&!['memo','pdf'].includes(note.kind)){key=noteKey(note,mode);active.set(key,(active.get(key)||0)+1);getFullNote(note,mode).then(value=>{if(mounted)setLoaded({value,id:note.id,revision:note.updatedRevision});}).catch(error=>{if(mounted)setLoaded({id:note.id,revision:note.updatedRevision,error:error.message});});}else setLoaded(null);return()=>{mounted=false;if(key){const count=active.get(key)||0;if(count<=1)active.delete(key);else active.set(key,count-1);trim();}};},[note?.id,note?.updatedRevision,note?._summary,note?.kind,mode,attempt]);
  if(!note||!note._summary||['memo','pdf'].includes(note.kind))return note;
  const current=loaded?.id===note.id&&loaded.revision===note.updatedRevision;
  return current&&loaded.value?{...note,...loaded.value,_summary:false}:{...note,_detailLoading:!current,_detailError:current?loaded.error:'',_retryDetail:()=>{setLoaded(null);setAttempt(v=>v+1);}};
}

