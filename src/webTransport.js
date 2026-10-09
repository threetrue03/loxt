import {linkDocumentRequest} from './syncDiagnostics.js';
export function webTransport(session,dispatch){
 let socket,timer,heartbeat,attempt=0,stopped=false,ready=false,pingAt=0;
 const pending=new Map(),waiters=new Set(),timings=[];
 const status=(value)=>{document.documentElement.dataset.connection=value;dispatch('connection',{state:value,retries:attempt});};
 function send(value){if(ready&&socket?.readyState===1){socket.send(JSON.stringify(value));return true;}return false;}
 function connect(){
  if(stopped)return;status(attempt?'reconnecting':'connecting');socket=new WebSocket(location.origin.replace(/^http/,'ws')+'/api/socket');
  const timeout=setTimeout(()=>socket.close(),5000);
  socket.onopen=()=>socket.send(JSON.stringify({type:'hello',csrf:session.csrf}));
  socket.onmessage=event=>{let message;try{message=JSON.parse(event.data);}catch{return;}
   if(message.type==='ready'){clearTimeout(timeout);ready=true;attempt=0;status('online');for(const resolve of waiters)resolve();waiters.clear();heartbeat=setInterval(()=>{pingAt=performance.now();send({type:'ping',at:pingAt});},10000);return;}
   if(message.type==='pong'){const rttMs=performance.now()-message.at;send({type:'metrics',value:{rttMs,retries:attempt}});return;}
   if(message.type==='result'){const item=pending.get(message.requestId);if(!item)return;pending.delete(message.requestId);clearTimeout(item.timer);const elapsed=performance.now()-item.start;timings.push({requestId:message.requestId,method:item.method,rttMs:Math.round(elapsed),serverMs:message.serverMs,serverStages:message.stages,at:new Date().toISOString()});if(timings.length>100)timings.shift();send({type:'metrics',value:{rttMs:elapsed,retries:item.retry||0}});if(message.error){const error=Error(message.error);error.code=message.code;item.reject(error);}else item.resolve(message.value);return;}
   dispatch(message.type,message.value);
  };
  socket.onerror=()=>{};
  socket.onclose=()=>{clearTimeout(timeout);clearInterval(heartbeat);ready=false;status(stopped?'offline':'reconnecting');for(const item of pending.values()){clearTimeout(item.timer);const error=Error('PC 연결이 끊겼습니다.');error.code='TRANSPORT';item.reject(error);}pending.clear();if(!stopped){attempt++;timer=setTimeout(connect,Math.min(5000,500*2**Math.min(attempt-1,4)));}};
 }
 function available(){if(ready)return Promise.resolve();return new Promise((resolve,reject)=>{const callback=()=>{clearTimeout(timeout);resolve();};const timeout=setTimeout(()=>{waiters.delete(callback);const error=Error('PC에 다시 연결하는 중입니다. 잠시 후 다시 시도해 주세요.');error.code='TRANSPORT';reject(error);},8000);waiters.add(callback);});}
 async function rpc(metadata,retry=0){if(metadata.payload?.id)linkDocumentRequest(metadata.payload.id,metadata.requestId);await available();return new Promise((resolve,reject)=>{const timeout=metadata.method==='pdf.prepareIndex'?185000:45000;const item={resolve,reject,start:performance.now(),method:metadata.method,retry,timer:setTimeout(()=>{pending.delete(metadata.requestId);const error=Error('PC 응답 시간이 초과되었습니다.');error.code='TRANSPORT';reject(error);},timeout)};pending.set(metadata.requestId,item);if(!send({type:'rpc',...metadata})){clearTimeout(item.timer);pending.delete(metadata.requestId);const error=Error('PC 연결이 끊겼습니다.');error.code='TRANSPORT';reject(error);}});}
 window.addEventListener('online',()=>{if(!ready&&socket?.readyState===3){clearTimeout(timer);connect();}});
 window.addEventListener('pagehide',event=>{if(!event.persisted){stopped=true;clearTimeout(timer);socket?.close();}});
 connect();
 return {rpc,preview:value=>send({type:'preview',value}),diagnostics:()=>({state:ready?'online':'reconnecting',transport:'WebSocket',pending:pending.size,retries:attempt,recentRequests:timings.slice()})};
}
