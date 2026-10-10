const {WebSocketServer}=require('ws');
const {performance}=require('node:perf_hooks');
function attachSockets(server,privateAddress){
 const wss=new WebSocketServer({noServer:true,maxPayload:20*1024*1024,perMessageDeflate:false});
 server.sockets=new Set();server.timings=[];
 const approved=client=>server.configuration.devices.some(d=>d.id===client.device.id&&d.expires>Date.now());
 const send=(client,message)=>{if(client.ws.readyState!==1)return false;if(client.ws.bufferedAmount>2*1024*1024){client.ws.close(1013,'resync');return false;}client.ws.send(JSON.stringify(message));return true;};
 server.sendSockets=(type,value)=>{for(const client of server.sockets){if(!approved(client)){client.ws.close(1008);continue;}if(client.ready)send(client,{type,value});}};
 server.preview=(payload,actor)=>{
  if(!payload||!['work','live'].includes(payload.workspace)||!/^[-a-f0-9]{36}$/.test(payload.id||'')||!/^[-a-f0-9]{36}$/.test(payload.session||''))throw Error('필기 미리보기 형식을 확인해 주세요.');
  if(payload.object){const object=payload.object;require('./pdfs.cjs').validateObjects([object]);if(object.points.length>2000||Buffer.byteLength(JSON.stringify(object))>32000)throw Error('필기 미리보기가 너무 큽니다.');}
  // Ownership/note existence is checked by the same service as durable writes.
  server.previewCheck?.(payload);
  const value={...payload,actor,expires:Date.now()+3000};server.previewLocal?.(value);server.sendSockets('pdf-preview',value);return true;
 };
 server.server.on('upgrade',(req,socket,head)=>{
  const device=server.session(req);
  if(req.url!=='/api/socket'||!privateAddress(req.socket.remoteAddress)||!server.validHost(req,server.port)||req.headers.origin!==`https://${req.headers.host}`||!device||server.sockets.size>=64){socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');return;}
  wss.handleUpgrade(req,socket,head,ws=>{
   const client={ws,device,ready:false,inflight:0,alive:true,previews:new Map()};server.sockets.add(client);
   const timeout=setTimeout(()=>ws.close(1008),5000);timeout.unref();
   ws.on('error',()=>{});ws.on('pong',()=>{client.alive=true;});
   ws.on('close',()=>{clearTimeout(timeout);server.sockets.delete(client);server.notify();for(const value of client.previews.values())server.sendSockets('pdf-preview',{...value,object:null,actor:device.id,expires:0});server.previewLocal?.({actor:device.id,clear:true});});
   ws.on('message',async data=>{
    let message;try{message=JSON.parse(data);if(!approved(client))throw Error('기기 연결 승인이 만료되었습니다.');
     if(!client.ready){if(message.type!=='hello'||message.csrf!==device.csrf)throw Error('허용되지 않은 연결입니다.');client.ready=true;server.notify();clearTimeout(timeout);send(client,{type:'ready'});send(client,{type:'resync',value:{}});return;}
     if(message.type==='ping'){send(client,{type:'pong',at:message.at});return;}
     if(message.type==='metrics'){const value=message.value;if(value&&Number.isFinite(value.rttMs)&&value.rttMs>=0&&value.rttMs<300000){client.metrics={rttMs:Math.round(value.rttMs),retries:Math.min(1000,Math.max(0,Number(value.retries)||0)),at:new Date().toISOString()};}return;}
     if(message.type==='preview'){const now=Date.now();if(now-(client.previewAt||0)<35&&message.value?.object)return;client.previewAt=now;server.preview(message.value,device.id);const key=message.value.id+':'+message.value.session;if(message.value.object){client.previews.set(key,message.value);if(client.previews.size>4)client.previews.delete(client.previews.keys().next().value);}else client.previews.delete(key);return;}
     if(message.type!=='rpc'||!/^[-a-zA-Z0-9.]+$/.test(message.method||'')||!/^[-a-f0-9]{36}$/.test(message.requestId||''))throw Error('요청 형식을 확인해 주세요.');
     if(client.inflight>=32)throw Error('대기 중인 요청이 많습니다. 잠시 후 다시 시도해 주세요.');
     client.inflight++;const start=performance.now();
     try{const {value,trace}=await require('./sync-trace.cjs').run(message.requestId,message.method,()=>server.results.run(device.id+':'+message.requestId,message.method,()=>server.rpc(message.method,message.payload,{device:device.id,hostId:server.configuration.hostId})));const elapsed=performance.now()-start;server.timings.push({requestId:message.requestId,method:message.method,serverMs:Math.round(elapsed*10)/10,stages:trace.stages,at:new Date().toISOString()});server.timings=server.timings.slice(-100);send(client,{type:'result',requestId:message.requestId,value,serverMs:elapsed,stages:trace.stages});}
     catch(error){send(client,{type:'result',requestId:message.requestId,error:error.message,code:error.code});}finally{client.inflight--;}
    }catch(error){if(!client.ready)ws.close(1008);else if(message?.requestId)send(client,{type:'result',requestId:message.requestId,error:error.message});}
   });
  });
 });
 const heartbeat=setInterval(()=>{for(const client of server.sockets){if(!client.alive||!approved(client)){client.ws.terminate();continue;}client.alive=false;client.ws.ping();}},15000);heartbeat.unref();
 server.closeSockets=()=>{clearInterval(heartbeat);for(const client of server.sockets)client.ws.terminate();server.sockets.clear();wss.close();};
 server.diagnostics=()=>({transport:'WebSocket',connections:[...server.sockets].map(client=>({name:client.device.name,ready:client.ready,pending:client.inflight,...client.metrics})),recentRequests:server.timings});
}
module.exports={attachSockets};
