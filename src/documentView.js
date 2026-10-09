import {useEffect,useState} from 'react';
import './document.css';
// A focus view also works in iPhone Safari, which lacks element fullscreen.
export function useDocumentFullscreen(root){
 const [fullscreen,setFullscreen]=useState(false);
 useEffect(()=>{if(!fullscreen)return;document.body.classList.add('document-focus');const el=root?.current;if(el?.showPopover){el.setAttribute('popover','manual');try{el.showPopover();}catch{el.removeAttribute('popover');}}const exit=event=>{if(!event.defaultPrevented&&event.key==='Escape'&&!event.target.closest('input,textarea,[contenteditable=true],[role=menu],[role=dialog]')){setFullscreen(false);}};document.addEventListener('keydown',exit);return()=>{if(el?.hidePopover&&el.hasAttribute('popover')){if(el.isConnected)try{el.hidePopover();}catch{}el.removeAttribute('popover');}document.body.classList.remove('document-focus');document.removeEventListener('keydown',exit);};},[fullscreen]);
 return [fullscreen,()=>setFullscreen(value=>!value)];
}
