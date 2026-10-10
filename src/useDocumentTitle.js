import {useEffect,useRef,useState} from 'react';
import {cleanError} from './SettingsProvider.jsx';
export function mergeSaveStatus(body,title){
  if(title==='제목 저장 실패')return title;
  if(body&&/실패|초안/.test(body))return body;
  if(title==='PC에 저장 중…'||body&&/저장 중/.test(body))return 'PC에 저장 중…';
  if(title==='저장 대기')return title;
  return body||title||'저장됨';
}
export default function useDocumentTitle(note,onUpdate){
  const [title,setValue]=useState(note.title),[error,setError]=useState(''),[status,setStatus]=useState('저장됨');
  const dirty=useRef(false),base=useRef(note.title),latest=useRef(note.title),generation=useRef(0),saving=useRef(null),valueRef=useRef(note.title),edit=useRef(0);
  latest.current=note.title;
  useEffect(()=>{dirty.current=false;base.current=note.title;valueRef.current=note.title;setValue(note.title);setError('');setStatus('저장됨');generation.current++;saving.current=null;},[note.id]);
  useEffect(()=>{if(!dirty.current){base.current=note.title;valueRef.current=note.title;setValue(note.title);}},[note.title]);
  function setTitle(value){if(!dirty.current)base.current=latest.current;dirty.current=true;valueRef.current=value;edit.current++;setValue(value);setError('');setStatus('저장 대기');}
  async function saveTitle(){
    if(saving.current){const pending=saving.current,version=generation.current;const ok=await pending;if(!ok||version!==generation.current)return false;if(dirty.current)return saveTitle();return true;}
    if(!dirty.current)return true;
    const value=valueRef.current.trim()||base.current;
    if(value===base.current){dirty.current=false;valueRef.current=latest.current;setValue(latest.current);setStatus('저장됨');return true;}
    const version=generation.current,editVersion=edit.current;setStatus('PC에 저장 중…');
    let task;task=Promise.resolve().then(async()=>{try{const ok=await onUpdate?.({title:value,expected:{title:base.current}});if(ok===false)throw Error('제목을 저장하지 못했습니다. 다른 기기의 변경을 확인하고 다시 시도해 주세요.');if(version===generation.current){base.current=value;setError('');if(editVersion===edit.current){dirty.current=false;valueRef.current=value;setValue(value);setStatus('저장됨');}else setStatus('저장 대기');}return true;}catch(e){if(version===generation.current){setError(cleanError(e));setStatus('제목 저장 실패');}return false;}finally{if(saving.current===task)saving.current=null;}});
    saving.current=task;return task;
  }
  return {title,setTitle,saveTitle,error,setError,status};
}
