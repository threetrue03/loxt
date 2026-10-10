// Screen coordinates only: annotation coordinates never enter these bounds.
export function visibleViewport(win=window){
 const v=win.visualViewport,left=v?.offsetLeft||0,top=v?.offsetTop||0;
 return {left,top,width:v?.width||win.innerWidth,height:v?.height||win.innerHeight};
}
export function clampOverlay(anchor,size,bounds,gap=8){
 const width=Math.max(1,Math.min(size.width,bounds.width-gap*2)),height=Math.max(1,Math.min(size.height,bounds.height-gap*2));
 return {left:Math.max(bounds.left+gap,Math.min(anchor.left,bounds.left+bounds.width-width-gap)),top:Math.max(bounds.top+gap,Math.min(anchor.top,bounds.top+bounds.height-height-gap)),width,height};
}
export function watchPlacement(anchor,panel,place){
 let frame=null;
 const schedule=()=>{if(frame===null)frame=requestAnimationFrame(()=>{frame=null;place();});};
 const observer=new ResizeObserver(schedule);for(const el of [anchor,panel,anchor?.parentElement])if(el)observer.observe(el);
 window.addEventListener('resize',schedule);document.addEventListener('scroll',schedule,true);
 const visual=window.visualViewport;visual?.addEventListener('resize',schedule);visual?.addEventListener('scroll',schedule);
 place();
 return()=>{if(frame!==null)cancelAnimationFrame(frame);observer.disconnect();window.removeEventListener('resize',schedule);document.removeEventListener('scroll',schedule,true);visual?.removeEventListener('resize',schedule);visual?.removeEventListener('scroll',schedule);};
}
