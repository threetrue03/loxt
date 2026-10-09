// Keep application chrome fixed; the PDF/drawing surface owns its own pinch zoom.
export function preventPageZoom(){
 const stop=event=>event.preventDefault();
 document.addEventListener('gesturestart',stop,{passive:false});
 document.addEventListener('gesturechange',stop,{passive:false});
 document.addEventListener('touchmove',event=>{if(event.touches.length>1)event.preventDefault();},{passive:false});
 document.addEventListener('wheel',event=>{if((event.ctrlKey||event.metaKey)&&!event.target.closest('.pdf-scroll'))event.preventDefault();},{passive:false});
 document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&['+','-','=','0'].includes(event.key))event.preventDefault();});
}
