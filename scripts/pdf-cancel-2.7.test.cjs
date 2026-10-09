const {test}=require('node:test'),assert=require('node:assert/strict');
const {PDFQueue}=require('../electron/pdf-queue.cjs');
test('cancel removes queued raster work without stopping another device job',async()=>{
 let release;const seen=[],q=new PDFQueue(async p=>{seen.push(p);if(p===1)await new Promise(r=>release=r);return p;});
 const first=q.enqueue(1);await new Promise(r=>setImmediate(r));const c=new AbortController();const old=q.enqueue(2,{signal:c.signal});const rejection=assert.rejects(old,e=>e.code==='CANCELED');const other=q.enqueue(3);c.abort();await rejection;assert.equal(q.queue.length,1);release();assert.equal(await first,1);assert.equal(await other,3);assert.deepEqual(seen,[1,3]);
});
test('immediately canceled remote renders issue zero RPCs; same scale shares one active request',async()=>{
 const saved={window:global.window,Image:global.Image};let previews=0,cancels=0;
 global.window={desktop:{pdf:{page:async()=>({view:[0,0,400,600],rotation:0,content:{items:[]},links:[]}),preview:async()=>{previews++;return {download:'sample'};},cancelPreview:async()=>{cancels++;}}}};
 global.Image=class{set src(value){queueMicrotask(()=>this.onload());}};
 try{const {remotePDF}=await import('../src/pdfRemote.js'),doc=await remotePDF({workspace:'work',id:'x'},{numPages:1}),p=await doc.getPage(1),context={canvas:{width:400,height:600},drawImage(){}};
  const pending=[];for(let i=0;i<30;i++){const task=p.render({canvasContext:context,viewport:p.getViewport({scale:1+i/10})});task.cancel();pending.push(task.promise);}await Promise.all(pending);assert.equal(previews,0);
  const a=p.render({canvasContext:context,viewport:p.getViewport({scale:1})}),b=p.render({canvasContext:context,viewport:p.getViewport({scale:1})});a.cancel();await Promise.all([a.promise,b.promise]);assert.equal(previews,1);assert.equal(cancels,0);await doc.destroy();
 }finally{global.window=saved.window;global.Image=saved.Image;}
});
test('remote preview cancellation is scoped to the approved device',async()=>{
 const {PDFs}=require('../electron/pdfs.cjs'),{webServices}=require('../electron/web-services.cjs');
 const original=PDFs.prototype.preview,controllers=[];
 PDFs.prototype.preview=function(id,page,scale,{signal}){return new Promise((resolve,reject)=>{controllers.push({signal,resolve});signal.addEventListener('abort',()=>reject(require('../electron/pdf-queue.cjs').abortError()));});};
 const fs=require('node:fs/promises'),path=require('node:path'),root=await fs.mkdtemp(path.resolve('test-results/pdf-device-'));
 try{const service=webServices({libraries:{get:()=>({})},root,dist:root}),payload={workspace:'work',id:'example',page:1,scale:1,renderKey:'same-key'};
  const first=service.rpc('pdf.preview',payload,{device:'A'}),second=service.rpc('pdf.preview',payload,{device:'B'});const rejected=assert.rejects(first,e=>e.code==='CANCELED');await service.rpc('pdf.cancelPreview',payload,{device:'A'});await rejected;
  assert.equal(controllers[0].signal.aborted,true);assert.equal(controllers[1].signal.aborted,false);controllers[1].resolve({format:'png',bytes:Buffer.from('example'),width:1,height:1});assert.ok((await second).download.startsWith('/file/export/'));
 }finally{PDFs.prototype.preview=original;await fs.rm(root,{recursive:true,force:true});}
});
