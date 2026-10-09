// PDF decoding/rasterization stays off Electron's main thread and mobile Safari.
const {parentPort}=require('node:worker_threads'),fs=require('node:fs/promises'),path=require('node:path');
const {createCanvas,DOMMatrix,ImageData,Path2D}=require('@napi-rs/canvas');
Object.assign(globalThis,{DOMMatrix,ImageData,Path2D});
let document=null,filename='',stamp='',pdfjs;
const textCache=new Map(),rasterCache=new Map();
function remember(cache,key,value,limit){cache.delete(key);cache.set(key,value);while(cache.size>limit)cache.delete(cache.keys().next().value);return value;}
async function text(page){if(textCache.has(page.pageNumber))return textCache.get(page.pageNumber);const value=await page.getTextContent();return remember(textCache,page.pageNumber,value,4);}
async function run(p){
 pdfjs ||= await import('pdfjs-dist/legacy/build/pdf.mjs');
 const stat=await fs.stat(p.file),key=stat.size+':'+stat.mtimeMs;
 if(filename!==p.file||stamp!==key){await document?.destroy();document=null;textCache.clear();rasterCache.clear();filename=p.file;stamp=key;const assets=path.resolve(__dirname,'../dist/pdf-assets');document=await pdfjs.getDocument({data:new Uint8Array(await fs.readFile(p.file)),isEvalSupported:false,cMapUrl:assets+'/cmaps/',cMapPacked:true,standardFontDataUrl:assets+'/standard_fonts/',wasmUrl:assets+'/wasm/'}).promise;}
 if(p.action==='index'){
  const pages=[];let length=0,truncated=false;
  for(let n=1;n<=document.numPages;n++){
   if(length>=2_000_000){pages.push('');truncated=true;continue;}
   const page=await document.getPage(n),content=await text(page),value=content.items.map(i=>i.str||'').join(' ').slice(0,2_000_000-length);pages.push(value);length+=value.length;page.cleanup();textCache.delete(n);
  }
  return {version:1,text:pages.join('\n').slice(0,2_000_000),pages,truncated};
 }
 if(p.action==='info')return {numPages:document.numPages,outline:await document.getOutline()||[]};
 const number=Math.max(1,Math.min(document.numPages,Math.trunc(p.page)||1)),page=await document.getPage(number);
 if(p.action==='page')return {view:page.view,rotation:page.rotate,content:await text(page),links:(await page.getAnnotations({intent:'display'})).filter(a=>a.subtype==='Link').map(a=>({rect:a.rect,url:a.url,dest:a.dest}))};
 if(p.action==='destination'){const dest=typeof p.dest==='string'?await document.getDestination(p.dest):p.dest;return Array.isArray(dest)?(typeof dest[0]==='number'?dest[0]:await document.getPageIndex(dest[0]))+1:null;}
 if(p.action!=='raster')throw Error('PDF 작업을 확인해 주세요.');
 const base=page.getViewport({scale:1}),requested=Math.max(.05,Math.min(8,Number(p.scale)||1)),scale=Math.min(requested,Math.sqrt(5_242_880/(base.width*base.height))),cacheKey=number+':'+scale.toFixed(3);
 if(rasterCache.has(cacheKey))return rasterCache.get(cacheKey);
 const viewport=page.getViewport({scale}),canvas=createCanvas(Math.max(1,Math.floor(viewport.width)),Math.max(1,Math.floor(viewport.height)));
 try{await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;const ops=await page.getOperatorList(),imageOps=new Set([pdfjs.OPS.paintImageXObject,pdfjs.OPS.paintInlineImageXObject,pdfjs.OPS.paintImageXObjectRepeat,pdfjs.OPS.paintImageMaskXObject]),format=ops.fnArray.some(op=>imageOps.has(op))?'jpg':'png',bytes=await canvas.encode(format==='jpg'?'jpeg':'png',92);return remember(rasterCache,cacheKey,{bytes,format,width:canvas.width,height:canvas.height},3);}
 finally{canvas.width=1;canvas.height=1;page.cleanup();}
}
parentPort.on('message',async({id,payload})=>{try{parentPort.postMessage({id,result:await run(payload)});}catch(error){parentPort.postMessage({id,error:error.message});}});
