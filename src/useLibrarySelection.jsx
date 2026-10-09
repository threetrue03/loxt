import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {selectionDescription} from '../shared/file-type.js';

// Pointer input is painted at most once per frame. Bounds are reused until layout changes.
export default function useLibrarySelection({ visible, enabled, onMove, scope }) {
  const container=useRef(null),gesture=useRef(null),suppress=useRef(false),reset=useRef(null),canceledPointer=useRef(null);
  const [ids,setIds]=useState([]),[overlay,setOverlay]=useState(null);
  const selection=useRef(ids);selection.current=ids;
  const selectedIds=useMemo(()=>new Set(ids),[ids]);
  const visibleById=useMemo(()=>new Map(visible.map(note=>[note.id,note])),[visible]);
  const visibleRef=useRef(visibleById);visibleRef.current=visibleById;
  const move=useRef(onMove);move.current=onMove;
  const signature=visible.map(note=>note.id).join('|');
  useEffect(()=>{cancel();select([]);},[scope]);
  useEffect(()=>{if(!enabled)cancel();},[enabled]);
  useEffect(()=>{const current=new Set(visible.map(note=>note.id));setIds(previous=>previous.filter(id=>current.has(id)));if(gesture.current)cancel();},[signature]);
  useEffect(()=>{
    const released=event=>{if(canceledPointer.current!==event.pointerId)return;canceledPointer.current=null;clearTimeout(reset.current);suppress.current=true;reset.current=setTimeout(()=>{suppress.current=false;},0);};
    const aborted=event=>{if(canceledPointer.current!==event.pointerId)return;canceledPointer.current=null;clearTimeout(reset.current);suppress.current=false;};
    document.addEventListener('pointerup',released,true);document.addEventListener('pointercancel',aborted,true);
    return()=>{document.removeEventListener('pointerup',released,true);document.removeEventListener('pointercancel',aborted,true);dispose(gesture.current);clearTimeout(reset.current);canceledPointer.current=null;suppress.current=false;};
  },[]);
  function select(next){selection.current=next;setIds(previous=>previous.length===next.length&&previous.every((id,index)=>id===next[index])?previous:next);}
  function dispose(item){clearTimeout(item?.timer);cancelAnimationFrame(item?.frame);item?.observer?.disconnect();item?.target?.classList.remove('drop-target');try{if(item?.capture?.hasPointerCapture(item.pointer))item.capture.releasePointerCapture(item.pointer);}catch{}}
  function cancel(keepClick=false,reason='cancel'){
    const item=gesture.current;
    if(reason==='cancel'&&item){canceledPointer.current=item.pointer;suppress.current=true;}
    else if(reason==='pointercancel')canceledPointer.current=null;
    dispose(item);gesture.current=null;setOverlay(null);
    if(!keepClick&&canceledPointer.current===null){clearTimeout(reset.current);suppress.current=false;}
  }
  function down(event){
    if(!enabled||event.button!==0||event.target.closest('input,.inline-name,.note-preview,.more,.table-head,label'))return;
    const card=event.target.closest('[data-note-id]');if(!card&&event.target.closest('button'))return;
    const host=container.current?.closest('.main');if(!host)return;
    clearTimeout(reset.current);canceledPointer.current=null;suppress.current=false;
    const item={x:event.clientX,y:event.clientY,px:event.clientX,py:event.clientY,id:card?.dataset.noteId,mode:card?'pending':'area',base:event.ctrlKey||event.metaKey?selection.current:[],target:null,pointer:event.pointerId,host,scrollStart:host.scrollTop,dirty:true};
    gesture.current=item;item.capture=card?event.target.closest('.note-open')||card:event.currentTarget;item.capture.setPointerCapture(event.pointerId);
    item.observer=new ResizeObserver(()=>{item.bounds=null;item.dirty=true;});item.observer.observe(host);item.observer.observe(container.current);
    if(card)item.timer=setTimeout(()=>{if(gesture.current!==item)return;item.mode='drag';item.ids=selection.current.includes(item.id)?[...selection.current]:[item.id];select(item.ids);suppress.current=true;item.dirty=true;},280);
    else {event.preventDefault();event.currentTarget.focus({preventScroll:true});select(item.base);}
    function frame(){
      if(gesture.current!==item)return;
      const box=host.getBoundingClientRect();
      if(['area','drag'].includes(item.mode)&&item.px>=box.left&&item.px<=box.right&&item.py>=box.top&&item.py<=box.bottom){const step=item.py<box.top+32?-10:item.py>box.bottom-32?10:0;const previous=host.scrollTop;host.scrollTop+=step;if(host.scrollTop!==previous)item.dirty=true;}
      if(item.dirty){item.dirty=false;paint(item);}
      item.frame=requestAnimationFrame(frame);
    }
    item.frame=requestAnimationFrame(frame);
  }
  function update(x,y){const item=gesture.current;if(!item)return;item.px=x;item.py=y;item.dirty=true;if(item.mode==='pending'&&Math.hypot(x-item.x,y-item.y)>8){clearTimeout(item.timer);item.mode='idle';}}
  function targetAt(x,y){let target=document.elementFromPoint(x,y)?.closest('[data-folder-drop]');if(target&&target.closest('[data-library-workspace]')&&target.closest('[data-library-workspace]').dataset.libraryWorkspace!==container.current?.closest('[data-library-workspace]')?.dataset.libraryWorkspace)target=null;return target;}
  function paint(item){
    if(!container.current)return;
    if(item.mode==='area'){
      if(!item.bounds){item.bounds={container:container.current.getBoundingClientRect(),scroll:item.host.scrollTop,cards:[...container.current.querySelectorAll('[data-note-id]')].map(card=>({id:card.dataset.noteId,box:card.getBoundingClientRect()}))};}
      const shift=item.host.scrollTop-item.bounds.scroll,bounds=item.bounds.container,anchorY=item.y-(item.host.scrollTop-item.scrollStart);
      const left=Math.max(bounds.left,Math.min(item.x,item.px)),top=Math.max(bounds.top-shift,Math.min(anchorY,item.py)),right=Math.min(bounds.right,Math.max(item.x,item.px)),bottom=Math.min(bounds.bottom-shift,Math.max(anchorY,item.py));
      const hit=item.bounds.cards.filter(({box})=>box.left<right&&box.right>left&&box.top-shift<bottom&&box.bottom-shift>top).map(card=>card.id);
      select([...new Set([...item.base,...hit])]);
      const clippedTop=Math.max(top,item.host.getBoundingClientRect().top);setOverlay({mode:'area',left,top:clippedTop,width:Math.max(0,right-left),height:Math.max(0,Math.min(innerHeight,bottom)-clippedTop)});
      if(Math.hypot(item.px-item.x,item.py-item.y)>4)suppress.current=true;
    }else if(item.mode==='drag'){
      const target=targetAt(item.px,item.py);if(item.target!==target){item.target?.classList.remove('drop-target');target?.classList.add('drop-target');item.target=target;}
      const description=selectionDescription(item.ids.map(id=>visibleRef.current.get(id)).filter(Boolean));setOverlay({mode:'drag',left:item.px+14,top:item.py+14,...description});
    }
  }
  function up(event){
    const item=gesture.current;if(!item)return;update(event.clientX,event.clientY);paint(item);
    if(item.mode==='drag'){const target=targetAt(event.clientX,event.clientY);if(target&&Math.hypot(event.clientX-item.x,event.clientY-item.y)>5)move.current(item.ids,target.getAttribute('data-folder-drop'));}
    const keepClick=suppress.current;cancel(keepClick,'finish');
    // Keep normal release's synthesized click suppressed, but never keep cancellation sticky.
    if(keepClick)reset.current=setTimeout(()=>{suppress.current=false;},0);
  }
  function open(event,note,callback){
    if(event.ctrlKey||event.metaKey||event.shiftKey){event.preventDefault();const previous=selection.current;if(event.shiftKey&&previous.length){const keys=[...visibleRef.current.keys()],start=keys.indexOf(previous.at(-1)),end=keys.indexOf(note.id);select([...new Set([...previous,...keys.slice(Math.min(start,end),Math.max(start,end)+1)])]);}else select(previous.includes(note.id)?previous.filter(id=>id!==note.id):[...previous,note.id]);}
    else{select([]);callback();}
  }
  const handlers={ref:container,tabIndex:0,onPointerDown:down,onPointerMove:event=>update(event.clientX,event.clientY),onPointerUp:up,onPointerCancel:()=>cancel(false,'pointercancel'),onClickCapture:event=>{if(suppress.current){event.preventDefault();event.stopPropagation();}},onKeyDown:event=>{if(!enabled||event.target.closest('input,textarea'))return;if(event.key==='Escape'){cancel();select([]);}if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='a'){event.preventDefault();select([...visibleRef.current.keys()]);}}};
  const visual=overlay?createPortal(overlay.mode==='area'?<div className="selection-area" style={overlay} aria-hidden="true"/>:<div className="selection-drag" style={{left:overlay.left,top:overlay.top}} aria-hidden="true"><span>{overlay.label}</span>{overlay.detail?<small>{overlay.detail}</small>:null}</div>,document.body):null;
  return {ids,selectedIds,handlers,visual,open,clear:()=>select([]),selectAll:()=>select([...visibleRef.current.keys()]),toggle:(id,checked)=>select(checked?[...new Set([...selection.current,id])]:selection.current.filter(value=>value!==id))};
}
