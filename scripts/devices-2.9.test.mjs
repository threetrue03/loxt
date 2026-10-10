import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import https from 'node:https';
import {createRequire} from 'node:module';
import {browserIdentity} from '../shared/browser-identity.js';
import {requestApproval} from '../src/webApproval.js';
import {memoLanguage,memoSyntaxLanguage,filterMemoLanguages} from '../src/memoCode.js';
const require=createRequire(import.meta.url),{DeviceServer}=require('../electron/device-server.cjs');
test('Mac desktop and iPad desktop-mode names differ; browser labels are descriptive only',()=>{
 assert.deepEqual(browserIdentity({userAgent:'Macintosh Safari/1',maxTouchPoints:0}),{name:'Mac',browser:'Safari'});
 assert.deepEqual(browserIdentity({userAgent:'Macintosh Safari/1',maxTouchPoints:5}),{name:'아이패드',browser:'Safari'});
 assert.deepEqual(browserIdentity({userAgent:'Windows Chrome/1 Edg/1'}),{name:'Windows PC',browser:'Edge'});
});
test('ROS2 classifications retain their display IDs and map to their actual grammar',()=>{
 assert.equal(filterMemoLanguages('ros2').length,8);
 for(const id of ['python','cpp','yaml','xml','shell','msg','srv','action'])assert.equal(memoLanguage('ros2-'+id),'ros2-'+id);
 assert.equal(memoLanguage('ROS2'), 'text');assert.equal(memoSyntaxLanguage('ros2-python'),'python');assert.equal(memoSyntaxLanguage('ros2-cpp'),'cpp');assert.equal(memoSyntaxLanguage('ros2-msg'),'ros2-interface');assert.equal(memoSyntaxLanguage('ros2-shell'),'shellscript');assert.equal(memoLanguage('python'),'python');
});
test('valid current session resumes without submitting another approval',async()=>{
 const oldFetch=globalThis.fetch,oldLocation=globalThis.location;let calls=0;
 try{globalThis.location={origin:'https://127.0.0.1:8844'};globalThis.fetch=async route=>{calls++;assert.equal(route,'/api/session');return {ok:true,json:async()=>({hostId:'same',csrf:'same'})};};assert.deepEqual(await requestApproval(location.origin+'/web.html#pair='+'a'.repeat(48)),{hostId:'same',csrf:'same'});assert.equal(calls,1);}finally{globalThis.fetch=oldFetch;globalThis.location=oldLocation;}
});
test('HTTPS pairing reuses only valid same-browser approval; other browsers, nonce, revoke and expiry stay separate',async()=>{
 const base=path.resolve('test-results/devices-2.9');await fs.mkdir(base,{recursive:true});const root=await fs.mkdtemp(path.join(base,'profile-')),dist=path.join(root,'dist');await fs.mkdir(dist);await fs.writeFile(path.join(dist,'web.html'),'private example');
 const server=new DeviceServer({root:path.join(root,'server'),dist,rpc:async()=>null});await server.initialize();await server.configure(true);let socket;
 const request=(route,{cookie,token,name='same name',browser='Safari'}={})=>new Promise((resolve,reject)=>{const req=https.request({hostname:'127.0.0.1',port:server.port,path:route,ca:server.caPem,method:token?'POST':'GET',headers:{...(cookie?{Cookie:cookie}:{})}},res=>{let s='';res.on('data',v=>s+=v);res.on('end',()=>resolve({status:res.statusCode,value:JSON.parse(s),cookie:res.headers['set-cookie']?.[0].split(';')[0]}));});req.on('error',reject);req.end(token?JSON.stringify({token,name,browser}):undefined);});
 try{
  const token=server.pairToken,first=await request('/api/pair',{token});assert.equal((await request('/api/pair',{token})).status,403);
  await Promise.all([server.approve(token,true),server.approve(token,true)]);const approved=await request('/api/pair',{token,cookie:first.cookie}),device=server.configuration.devices[0],original={id:device.id,token:device.token,csrf:device.csrf,expires:device.expires};
  await server.newQR();const next=server.pairToken,reused=await request('/api/pair',{token:next,cookie:approved.cookie});assert.equal(reused.value.reused,true);assert.equal(server.configuration.devices.length,1);assert.equal(server.pending.get(next).requested,undefined);
  const other=await request('/api/pair',{token:next});assert.equal(other.value.pending,true);await server.approve(next,true);const second=await request('/api/pair',{token:next,cookie:other.cookie});assert.equal(server.configuration.devices.length,2);assert.notEqual(server.configuration.devices[1].id,device.id);
  await server.rename(device.id,'내 iPad');assert.equal(server.snapshot().devices[0].name,'내 iPad');assert.deepEqual({id:device.id,token:device.token,csrf:device.csrf,expires:device.expires},original);await assert.rejects(server.rename(device.id,''));await assert.rejects(server.rename(device.id,'bad\nname'));
  const session=(await request('/api/session',{cookie:approved.cookie})).value,WS=require('ws');socket=new WS(`wss://127.0.0.1:${server.port}/api/socket`,{ca:server.caPem,headers:{Cookie:approved.cookie,Origin:`https://127.0.0.1:${server.port}`}});await new Promise((resolve,reject)=>{socket.once('error',reject);socket.once('open',()=>socket.send(JSON.stringify({type:'hello',csrf:session.csrf})));socket.on('message',data=>{if(JSON.parse(data).type==='ready')resolve();});});assert.equal(server.snapshot().devices[0].connected,true);
  const closed=new Promise(resolve=>socket.once('close',resolve));socket.close();await closed;await new Promise(resolve=>setTimeout(resolve,10));assert.equal(server.snapshot().devices[0].connected,false);
  await server.revoke(device.id);assert.equal((await request('/api/session',{cookie:approved.cookie})).status,401);assert.equal((await request('/api/session',{cookie:second.cookie})).status,200);
  await server.newQR();assert.equal((await request('/api/pair',{token:server.pairToken,cookie:approved.cookie})).value.pending,true);server.configuration.devices[0].expires=Date.now()-1;await server.newQR();assert.equal((await request('/api/pair',{token:server.pairToken,cookie:second.cookie})).value.pending,true);
 }finally{socket?.terminate();await server.configure(false);}
});
