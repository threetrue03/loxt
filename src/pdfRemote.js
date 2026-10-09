import {pageViewport} from './pdfViewport.js';
// Large remote documents remain on the PC. Only bounded page images and current
// page text/links reach Safari; annotation coordinates stay in original PDF units.
export async function remotePDF(payload,info){
 const pages=new Map(),images=new Map();let destroyed=false;
 const doc={numPages:info.numPages,remote:true,async getPage(number){
  if(pages.has(number))return pages.get(number);
  const pending=window.desktop.pdf.page({...payload,page:number}).then(data=>({
   pageNumber:number,getViewport:({scale})=>pageViewport({viewBox:data.view,scale,rotation:data.rotation}),
   streamTextContent:()=>({getReader:()=>{let sent=false;return {read:async()=>sent?{done:true}:(sent=true,{done:false,value:data.content}),releaseLock(){}};}}),
   getAnnotations:async()=>data.links,cleanup(){},
   render({canvasContext,viewport,transform}){let canceled=false;const scale=viewport.scale*(transform?.[0]||1),key=number+':'+scale.toFixed(3);let request=images.get(key);if(!request){request=window.desktop.pdf.preview({...payload,page:number,scale}).then(value=>new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(Error('PC에서 PDF 페이지를 받지 못했습니다.'));image.src=value.download;})).catch(error=>{images.delete(key);throw error;});images.set(key,request);while(images.size>4)images.delete(images.keys().next().value);}
    return {promise:request.then(image=>{if(canceled||destroyed)return;canvasContext.drawImage(image,0,0,canvasContext.canvas.width,canvasContext.canvas.height);}),cancel(){canceled=true;}};
   }
  })).catch(error=>{pages.delete(number);throw error;});pages.set(number,pending);while(pages.size>6)pages.delete(pages.keys().next().value);return pending;
 },getOutline:async()=>(await window.desktop.pdf.outline(payload)).outline,getDestination:async dest=>[await window.desktop.pdf.destination({...payload,dest})-1],getPageIndex:async ref=>ref,destroy:async()=>{destroyed=true;pages.clear();images.clear();}};
 return doc;
}
