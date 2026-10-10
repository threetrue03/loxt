import {linkDocumentRequest} from './syncDiagnostics.js';
export function webTransport(session,dispatch){
 let socket,timer,heartbeat,attempt=0,stopped=false,ready=false,state='connecting',checking=null,generation=0;
 const pending=new Map(),waiters=new Set(),timings=[];
 const failure=()=>Object.assign(Error(state==='approval-required'?'이 기기의 승인이 필요합니다. 새 연결 주소로 다시 승인받아 주세요.':state==='server-changed'?'다른 PC에 연결되어 있습니다. 초안을 보관하고 새 주소를 확인해 주세요.':'PC에 연결하지 못했습니다. 같은 Wi-Fi와 PC의 연결 서버를 확인해 주세요.'),{code:state==='approval-required'?'APPROVAL_REQUIRED':'CONNECTION_UNAVAILABLE'});
 const status=value=>{state=value;document.documentElement.dataset.connection=value;dispatch('connection',{state:value,retries:attempt});};
 function send(value){if(ready&&socket?.readyState===1){socket.send(JSON.stringify(value));return true;}return false;}
 function rejectPending(){for(const item of pending.values()){clearTimeout(item.timer);item.reject(failure());}pending.clear();for(const item of waiters)item.reject(failure());waiters.clear();}
 function waitReady(){if(stopped)return Promise.reject(failure());if(ready)return Promise.resolve();return new Promise((resolve,reject)=>{const item={resolve:()=>{clearTimeout(timeout);resolve();},reject:error=>{clearTimeout(timeout);reject(error);}};const timeout=setTimeout(()=>{waiters.delete(item);reject(failure());},6000);waiters.add(item);});}
 function schedule(){clearTimeout(timer);if(!stopped&&!['approval-required','server-changed'].includes(state))timer=setTimeout(()=>verify(),Math.min(5000,500*2**Math.min(attempt++,4)));}
 async function verify(){
  if(stopped)return;if(checking)return checking;const epoch=generation;
  const request=(async()=>{
   const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),5000);
   try{
    const response=await fetch('/api/session',{signal:controller.signal,cache:'no-store'});
    if(stopped||epoch!==generation)return;
    if(response.status===401){status('approval-required');rejectPending();return;}
    if(!response.ok)throw Error('session');const next=await response.json();
    if(stopped||epoch!==generation)return;
    if(next.hostId!==session.hostId){status('server-changed');rejectPending();return;}
    Object.assign(session,next);connect();
   }catch{if(!stopped&&epoch===generation){status('server-unreachable');rejectPending();schedule();}}
   finally{clearTimeout(timeout);}
  })();checking=request;request.finally(()=>{if(checking===request)checking=null;});return request;
 }
 function connect(){
  if(stopped)return;clearTimeout(timer);clearInterval(heartbeat);ready=false;
  const previous=socket,current=new WebSocket(location.origin.replace(/^http/,'ws')+'/api/socket');socket=current;previous?.close();status(attempt?'reconnecting':'connecting');
  // Requests belong to the socket that sent them. Reapproval must not leave
  // old requests waiting until their normal timeout after replacing it.
  if(previous)rejectPending();
  const timeout=setTimeout(()=>current.close(),5000);
  current.onopen=()=>{if(socket===current)current.send(JSON.stringify({type:'hello',csrf:session.csrf}));};
  current.onmessage=event=>{
   if(socket!==current||stopped)return;let message;try{message=JSON.parse(event.data);}catch{return;}
   if(message.type==='ready'){clearTimeout(timeout);ready=true;attempt=0;status('online');for(const item of waiters)item.resolve();waiters.clear();heartbeat=setInterval(()=>send({type:'ping',at:performance.now()}),10000);return;}
   if(message.type==='pong'){send({type:'metrics',value:{rttMs:performance.now()-message.at,retries:attempt}});return;}
   if(message.type==='result'){const item=pending.get(message.requestId);if(!item)return;pending.delete(message.requestId);clearTimeout(item.timer);const elapsed=performance.now()-item.start;timings.push({requestId:message.requestId,method:item.method,rttMs:Math.round(elapsed),serverMs:message.serverMs,serverStages:message.stages,at:new Date().toISOString()});if(timings.length>100)timings.shift();send({type:'metrics',value:{rttMs:elapsed,retries:item.retry||0}});if(message.error){const error=Error(message.error);error.code=message.code;item.reject(error);}else item.resolve(message.value);return;}
   dispatch(message.type,message.value);
  };
  current.onerror=()=>{};
  current.onclose=()=>{clearTimeout(timeout);if(socket!==current||stopped)return;clearInterval(heartbeat);ready=false;status('reconnecting');rejectPending();schedule();};
 }
 async function rpc(metadata,retry=0){
  if(!ready)throw failure();if(metadata.payload?.id)linkDocumentRequest(metadata.payload.id,metadata.requestId);
  return new Promise((resolve,reject)=>{const timeout=metadata.method==='pdf.prepareIndex'?185000:45000;const item={resolve,reject,start:performance.now(),method:metadata.method,retry,timer:setTimeout(()=>{pending.delete(metadata.requestId);reject(Object.assign(Error('PC 응답 시간이 초과되었습니다. 저장 상태를 확인하고 다시 시도해 주세요.'),{code:'TRANSPORT'}));},timeout)};pending.set(metadata.requestId,item);if(!send({type:'rpc',...metadata})){clearTimeout(item.timer);pending.delete(metadata.requestId);reject(failure());}});
 }
 const retry=()=>{if(!ready){clearTimeout(timer);void verify();}};
 const hide=event=>{if(!event.persisted){stopped=true;ready=false;generation++;clearTimeout(timer);clearInterval(heartbeat);socket?.close();rejectPending();}};
 window.addEventListener('online',retry);window.addEventListener('pagehide',hide);connect();
 return {rpc,waitReady,dispose:()=>{hide({persisted:false});window.removeEventListener('online',retry);window.removeEventListener('pagehide',hide);},preview:value=>send({type:'preview',value}),reconnect:async next=>{if(stopped)throw failure();clearTimeout(timer);if(next){if(next.hostId!==session.hostId){generation++;checking=null;ready=false;clearInterval(heartbeat);const previous=socket;socket=null;previous?.close();status('server-changed');rejectPending();throw failure();}generation++;checking=null;Object.assign(session,next);connect();}else if(!ready)await verify();if(['approval-required','server-changed','server-unreachable'].includes(state))throw failure();await waitReady();},diagnostics:()=>({state,transport:'WebSocket',pending:pending.size,retries:attempt,recentRequests:timings.slice()})};
}
