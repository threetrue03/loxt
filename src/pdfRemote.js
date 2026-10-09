import {pageViewport} from './pdfViewport.js';
// Large remote documents remain on the PC. Only bounded page images and current
// page text/links reach Safari; annotation coordinates stay in original PDF units.
export async function remotePDF(payload,info){
 const pages=new Map(),images=new Map();let destroyed=false;
 function release(key,entry){
  entry.users--;if(entry.done){for(const [oldKey,old]of images){if(images.size<=4)break;if(old.done&&old.users===0)images.delete(oldKey);}return;}if(entry.users>0)return;
  clearTimeout(entry.timer);images.delete(key);entry.canceled=true;
  if(entry.started)window.desktop.pdf.cancelPreview?.({...payload,renderKey:entry.renderKey}).catch(()=>{});
  entry.resolve?.(null);
 }
 const doc={numPages:info.numPages,remote:true,async getPage(number){
  if(pages.has(number))return pages.get(number);
  const pending=window.desktop.pdf.page({...payload,page:number}).then(data=>({
   pageNumber:number,getViewport:({scale})=>pageViewport({viewBox:data.view,scale,rotation:data.rotation}),
   streamTextContent:()=>({getReader:()=>{let sent=false;return {read:async()=>sent?{done:true}:(sent=true,{done:false,value:data.content}),releaseLock(){}};}}),
   getAnnotations:async()=>data.links,cleanup(){},
   render({canvasContext,viewport,transform}){
    let canceled=false;const scale=viewport.scale*(transform?.[0]||1),key=number+':'+scale.toFixed(3);let entry=images.get(key);
    if(!entry){entry={users:0,renderKey:crypto.randomUUID(),done:false,started:false,canceled:false};
     entry.promise=new Promise((resolve,reject)=>{entry.resolve=resolve;entry.timer=setTimeout(async()=>{
      if(entry.canceled||destroyed){resolve(null);return;}entry.started=true;
      try{const value=await window.desktop.pdf.preview({...payload,page:number,scale,renderKey:entry.renderKey});if(entry.canceled||destroyed){resolve(null);return;}
       const image=await new Promise((resolveImage,rejectImage)=>{const image=new Image();image.onload=()=>resolveImage(image);image.onerror=()=>rejectImage(Error('PC에서 PDF 페이지를 받지 못했습니다.'));image.src=value.download;});entry.done=true;resolve(image);
      }catch(error){images.delete(key);if(entry.canceled||destroyed||error.code==='CANCELED')resolve(null);else reject(error);}
     },40);});images.set(key,entry);
     for(const [oldKey,old]of images){if(images.size<=4)break;if(old.done&&old.users===0)images.delete(oldKey);}
    }else{images.delete(key);images.set(key,entry);}entry.users++;
    return {promise:entry.promise.then(image=>{if(canceled||destroyed||!image)return;canvasContext.drawImage(image,0,0,canvasContext.canvas.width,canvasContext.canvas.height);}).finally(()=>{if(!canceled)release(key,entry);}),cancel(){if(canceled)return;canceled=true;release(key,entry);}};
   }
  })).catch(error=>{pages.delete(number);throw error;});pages.set(number,pending);while(pages.size>6)pages.delete(pages.keys().next().value);return pending;
 },getOutline:async()=>(await window.desktop.pdf.outline(payload)).outline,getDestination:async dest=>[await window.desktop.pdf.destination({...payload,dest})-1],getPageIndex:async ref=>ref,destroy:async()=>{destroyed=true;pages.clear();for(const [key,entry]of images){entry.users=1;release(key,entry);}images.clear();}};
 return doc;
}
