import {useEffect,useState} from 'react';
const cache=new Map(),pending=new Map();
export function getFullNote(note,mode){
  if(!note?._summary||['memo','pdf'].includes(note.kind))return Promise.resolve(note);
  const key=`${window.desktop.hostId||'desktop'}:${mode}:${note.id}:${note.updatedRevision||0}`;
  if(cache.has(key))return Promise.resolve(cache.get(key));if(pending.has(key))return pending.get(key);
  const request=window.desktop.getNote(note.id,mode).then(data=>{cache.set(key,data);if(cache.size>24)cache.delete(cache.keys().next().value);return data;}).finally(()=>pending.delete(key));pending.set(key,request);return request;
}
export default function useFullNote(note,mode='work'){
  const [loaded,setLoaded]=useState(null),[attempt,setAttempt]=useState(0);
  useEffect(()=>{let active=true;if(note?._summary&&!['memo','pdf'].includes(note.kind))getFullNote(note,mode).then(value=>{if(active)setLoaded({value,id:note.id,revision:note.updatedRevision});}).catch(error=>{if(active)setLoaded({id:note.id,revision:note.updatedRevision,error:error.message});});return()=>{active=false;};},[note?.id,note?.updatedRevision,mode,attempt]);
  if(!note||!note._summary||['memo','pdf'].includes(note.kind))return note;
  const current=loaded?.id===note.id&&loaded.revision===note.updatedRevision;
  return current&&loaded.value?{...note,...loaded.value,_summary:false}:{...note,_detailLoading:!current,_detailError:current?loaded.error:'',_retryDetail:()=>{setLoaded(null);setAttempt(v=>v+1);}};
}

