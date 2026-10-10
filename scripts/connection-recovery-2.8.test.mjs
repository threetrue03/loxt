import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {webTransport} from '../src/webTransport.js';
import {requestApproval} from '../src/webApproval.js';
import {collectDrafts,validateDrafts} from '../public/recovery-drafts.js';
import {connectWeb} from '../src/webAdapter.js';

// Only the browser transport boundary is mocked; no microphone/inference claims.
function browser(){
 class TrackedEvents extends EventTarget{
  handlers=new Map();
  addEventListener(type,callback,options){if(!this.handlers.has(type))this.handlers.set(type,new Set());this.handlers.get(type).add(callback);super.addEventListener(type,callback,options);}
  removeEventListener(type,callback,options){this.handlers.get(type)?.delete(callback);super.removeEventListener(type,callback,options);}
  count(type){return this.handlers.get(type)?.size||0;}
 }
 const saved=new Map(),sockets=[],events=new TrackedEvents(),documentEvents=new TrackedEvents(),states=[];
 for(const key of ['window','document','location','WebSocket','fetch','navigator','localStorage'])saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));
 class Socket{
  constructor(url){this.url=url;this.readyState=0;this.sent=[];sockets.push(this);}
  send(data){this.sent.push(JSON.parse(data));}
  open(){this.readyState=1;this.onopen?.();}
  message(value){this.onmessage?.({data:JSON.stringify(value)});}
  close(){if(this.readyState===3)return;this.readyState=3;this.onclose?.();}
 }
 const set=(key,value)=>Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
 set('window',events);documentEvents.documentElement={dataset:{}};set('document',documentEvents);set('location',{origin:'https://127.0.0.1:8844'});set('navigator',{userAgent:'iPad'});set('WebSocket',Socket);set('localStorage',{getItem:()=>null});
 set('fetch',async()=>({status:401,ok:false,json:async()=>({})}));
 const session={hostId:randomUUID(),csrf:'old-csrf'},transport=webTransport(session,(type,value)=>{if(type==='connection')states.push(value.state);});
 const ready=(socket=sockets.at(-1))=>{socket.open();socket.message({type:'ready'});return socket;};
 return {transport,session,sockets,states,ready,set,restore(){transport.dispose();for(const [key,descriptor]of saved){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}}};
}
const metadata=()=>({method:'memo.get',requestId:randomUUID(),payload:{id:randomUUID()}});
test('RPC fails immediately while connecting and after disposal, without accumulating pending requests',async()=>{
 const b=browser();try{await assert.rejects(b.transport.rpc(metadata()),{code:'CONNECTION_UNAVAILABLE'});assert.equal(b.transport.diagnostics().pending,0);b.ready();b.transport.dispose();await assert.rejects(b.transport.rpc(metadata()),{code:'CONNECTION_UNAVAILABLE'});await assert.rejects(b.transport.reconnect(),{code:'CONNECTION_UNAVAILABLE'});await assert.rejects(b.transport.waitReady(),{code:'CONNECTION_UNAVAILABLE'});}finally{b.restore();}
});
test('revoked socket rejects an in-flight RPC, verifies 401 and resumes with newly approved CSRF',async()=>{
 const b=browser();try{const first=b.ready(),pending=b.transport.rpc(metadata()),rejected=assert.rejects(pending,{code:'CONNECTION_UNAVAILABLE'});first.close();await rejected;await assert.rejects(b.transport.reconnect(),{code:'APPROVAL_REQUIRED'});assert.equal(b.transport.diagnostics().state,'approval-required');
  const resumed=b.transport.reconnect({hostId:b.session.hostId,csrf:'fresh-csrf'}),second=b.ready();await resumed;assert.equal(second.sent[0].csrf,'fresh-csrf');assert.equal(b.session.csrf,'fresh-csrf');
  const meta=metadata(),rpc=b.transport.rpc(meta);second.message({type:'result',requestId:meta.requestId,value:'saved'});assert.equal(await rpc,'saved');assert.equal(b.transport.diagnostics().pending,0);
 }finally{b.restore();}
});
test('online reapproval rejects old socket RPCs immediately and ignores delayed old responses',async()=>{
 const b=browser();try{const first=b.ready(),meta=metadata(),pending=b.transport.rpc(meta),rejected=assert.rejects(pending,{code:'CONNECTION_UNAVAILABLE'});const reconnect=b.transport.reconnect({hostId:b.session.hostId,csrf:'replacement'});await rejected;first.message({type:'result',requestId:meta.requestId,value:'stale'});b.ready();await reconnect;assert.equal(b.transport.diagnostics().pending,0);}finally{b.restore();}
});
test('different host stops the old socket and forbids RPC/preview even if it had been online',async()=>{
 const b=browser();try{const first=b.ready(),pending=b.transport.rpc(metadata()),rejected=assert.rejects(pending,{code:'CONNECTION_UNAVAILABLE'});await assert.rejects(b.transport.reconnect({hostId:randomUUID(),csrf:'other'}),/다른 PC/);await rejected;assert.equal(first.readyState,3);assert.equal(b.transport.preview({id:randomUUID()}),false);await assert.rejects(b.transport.rpc(metadata()),/다른 PC/);assert.equal(b.transport.diagnostics().state,'server-changed');}finally{b.restore();}
});
test('late session verification cannot overwrite the freshly reapproved session',async()=>{
 const b=browser();try{b.ready().close();let resolveFetch;b.set('fetch',()=>new Promise(resolve=>resolveFetch=resolve));const verifying=b.transport.reconnect();const approved=b.transport.reconnect({hostId:b.session.hostId,csrf:'newest'});b.ready();await approved;resolveFetch({ok:true,status:200,json:async()=>({hostId:b.session.hostId,csrf:'stale'})});await verifying;assert.equal(b.session.csrf,'newest');assert.equal(b.sockets.length,2);}finally{b.restore();}
});
test('approval refuses another origin, preserves PC denial, and accepts a real session response',async()=>{
 const b=browser();try{const address=location.origin+'/web.html#pair='+'a'.repeat(48);await assert.rejects(requestApproval(address.replace(':8844',':8845')),/초안 사본/);b.set('fetch',async route=>route==='/api/session'?{status:401,ok:false}:{ok:false,json:async()=>({error:'PC에서 연결 요청을 거절했습니다.',code:'PAIR_DENIED'})});await assert.rejects(requestApproval(address),/거절/);let count=0;b.set('fetch',async()=>++count===1?{status:401,ok:false}:count===2?{ok:true,json:async()=>({approved:true})}:{ok:true,json:async()=>({hostId:b.session.hostId,csrf:'approved'})});assert.equal((await requestApproval(address)).csrf,'approved');assert.equal(count,3);}finally{b.restore();}
});
test('approval polling aborts immediately and does not leave a retry timer',async()=>{
 const b=browser();try{const controller=new AbortController();b.set('fetch',async route=>route==='/api/session'?{status:401,ok:false}:{ok:true,json:async()=>({pending:true})});const request=requestApproval(location.origin+'/web.html#pair='+'a'.repeat(48),{signal:controller.signal});await Promise.resolve();controller.abort();await assert.rejects(request,{name:'AbortError'});}finally{b.restore();}
});
test('draft backup collects only LOXT drafts; validation rejects foreign host, invalid revision and oversized bundle',()=>{
 const b=browser();try{const id=randomUUID(),data={revision:3,blocks:[{id:'p',type:'paragraph'}]},entries=[['unrelated','{}'],[`loxt.memo.draft:${b.session.hostId}:${id}`,JSON.stringify(data)],[`loxt.pdf.draft:${b.session.hostId}:work:${randomUUID()}`,JSON.stringify({revision:2,objects:[]})],['loxt.memo.draft:broken','not JSON']];const storage={length:entries.length,key:i=>entries[i][0],getItem:key=>entries.find(x=>x[0]===key)[1]},bundle=collectDrafts(storage);assert.equal(bundle.documents.length,2);assert.deepEqual(bundle.documents[0].data,data);assert.equal(validateDrafts(bundle,b.session.hostId).length,2);assert.throws(()=>validateDrafts(bundle,randomUUID()),/다른 PC/);assert.throws(()=>validateDrafts({...bundle,documents:[{...bundle.documents[0],data:{revision:-1,blocks:[]}}]},b.session.hostId),/내용/);assert.throws(()=>validateDrafts({...bundle,documents:Array(201).fill(bundle.documents[0])},b.session.hostId),/사본/);}finally{b.restore();}
});
test('failure after initial socket readiness disposes the whole adapter initialization before a second attempt',async()=>{
 const b=browser();b.transport.dispose();try{
  for(let i=0;i<2;i++){
   const connecting=connectWeb({...b.session}),rejected=assert.rejects(connecting,{code:'APPROVAL_REQUIRED'}),socket=b.ready();assert.doesNotThrow(()=>socket.message({type:'resync',value:{}}));
   await new Promise(resolve=>setImmediate(resolve));
   assert.equal(window.count('pageshow'),1);assert.equal(document.count('visibilitychange'),1);
   assert.doesNotThrow(()=>socket.message({type:'resync',value:{}}));const liveRequest=socket.sent.find(message=>message.type==='rpc'&&message.method==='liveState');assert.ok(liveRequest);socket.message({type:'result',requestId:liveRequest.requestId,value:{state:'idle'}});
   const request=socket.sent.find(message=>message.type==='rpc'&&message.method==='preferences');assert.ok(request);
   socket.message({type:'result',requestId:request.requestId,error:'approval removed during initialization',code:'APPROVAL_REQUIRED'});await rejected;
   assert.equal(socket.readyState,3);for(const event of ['online','pagehide','pageshow'])assert.equal(window.count(event),0);assert.equal(document.count('visibilitychange'),0);
  }
 }finally{b.restore();}
});
