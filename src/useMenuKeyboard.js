import {useLayoutEffect} from 'react';
export function menuKey(event,popup,close,restore){
 const items=[...popup.querySelectorAll('[role^="menuitem"]')].filter(item=>!item.disabled&&item.getClientRects().length);
 if(event.key==='Escape'||event.key==='Tab'){if(event.key==='Escape'){event.preventDefault();event.stopPropagation();}close();restore?.();return;}
 if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key)||!items.length)return;
 event.preventDefault();event.stopPropagation();const index=items.indexOf(document.activeElement);
 items[event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowUp'?-1:1)+items.length)%items.length].focus();
}
export default function useMenuKeyboard(ref,open,onClose,trigger){
 useLayoutEffect(()=>{
  if(!open||!ref.current)return;const popup=ref.current,previous=trigger||document.activeElement;
  const restore=()=>previous?.isConnected&&previous.focus?.();
  const keys=event=>menuKey(event,popup,onClose,restore);
  const outside=event=>{if(!popup.contains(event.target))onClose();};
  popup.querySelector('[role^="menuitem"]:not(:disabled)')?.focus();
  document.addEventListener('keydown',keys);document.addEventListener('pointerdown',outside);
  return()=>{document.removeEventListener('keydown',keys);document.removeEventListener('pointerdown',outside);};
 },[open]);
}
