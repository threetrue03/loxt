import {useEffect,useRef,useState} from 'react';
export default function useDocumentTitle(note,onUpdate){
  const [title,setValue]=useState(note.title),[error,setError]=useState('');
  const dirty=useRef(false),base=useRef(note.title),latest=useRef(note.title),generation=useRef(0),saving=useRef(null);
  latest.current=note.title;
  useEffect(()=>{dirty.current=false;base.current=note.title;setValue(note.title);setError('');generation.current++;},[note.id]);
  useEffect(()=>{if(!dirty.current){base.current=note.title;setValue(note.title);}},[note.title]);
  function setTitle(value){if(!dirty.current)base.current=latest.current;dirty.current=true;setValue(value);setError('');}
  async function saveTitle(){if(saving.current)return saving.current;if(!dirty.current)return;const value=title.trim()||base.current;
    if(value===base.current){dirty.current=false;setValue(latest.current);return;}
    const version=generation.current;
    saving.current=(async()=>{try{const ok=await onUpdate?.({title:value,expected:{title:base.current}});if(ok===false)throw Error('제목을 저장하지 못했습니다. 다른 기기의 변경을 확인하고 다시 시도해 주세요.');if(version===generation.current){dirty.current=false;base.current=value;setValue(value);setError('');}}catch(e){if(version===generation.current)setError(e.message);}finally{saving.current=null;}})();return saving.current;
  }
  return {title,setTitle,saveTitle,error,setError};
}
