import {useEffect} from 'react';
export default function useSidebarShortcut(active,toggle){
 useEffect(()=>{if(!active)return;const key=event=>{if(event.defaultPrevented||event.altKey||!(event.ctrlKey||event.metaKey)||!event.shiftKey||event.key.toLowerCase()!=='s'||document.querySelector('[role=dialog]'))return;event.preventDefault();if(!event.repeat)toggle(value=>!value);};document.addEventListener('keydown',key);return()=>document.removeEventListener('keydown',key);},[active,toggle]);
}
