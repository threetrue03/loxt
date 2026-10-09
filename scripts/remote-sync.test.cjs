const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),{randomUUID,randomBytes,createHash}=require('node:crypto');
const {Library}=require('../electron/library.cjs'),{Memos}=require('../electron/memos.cjs'),{PDFs}=require('../electron/pdfs.cjs'),sync=require('../electron/document-sync.cjs');
async function setup(t){const parent=path.resolve('test-results/sync-unit');await fs.mkdir(parent,{recursive:true});const root=await fs.mkdtemp(path.join(parent,'profile-')),library=new Library(path.join(root,'work'));await library.ready;t.after(()=>library.flushIndex());return {root,library};}
test('memo patches: compact ACK/feed, durable restart, ordering, conflicts and fallback',async t=>{
 const {library}=await setup(t),m=new Memos(library),note=(await m.create()).note,current=await m.read(note.id),block={...current.blocks[0],content:[{type:'text',text:'모바일 변경',styles:{}}]};
 const ack=await m.save({id:note.id,revision:0,patch:{upsert:[block],remove:[]},ack:true});assert.equal(ack.revision,1);assert.equal('blocks' in ack,false);
 const changes=await m.changes({id:note.id,since:0});assert.equal(changes.patches.length,1);assert.equal(changes.patches[0].patch.upsert[0].content[0].text,'모바일 변경');
 const disk=JSON.parse(await fs.readFile(path.join(m.directory(note.id),'memo.json')));assert.equal(disk.revision,0);const next=new Library(library.root);await next.ready;assert.equal((await new Memos(next).read(note.id)).blocks[0].content[0].text,'모바일 변경');assert.ok((await new Memos(next).changes({id:note.id,since:0})).snapshot);
 await assert.rejects(m.save({id:note.id,revision:0,patch:{upsert:[],remove:[]}}),e=>e.code==='CONFLICT');
 const second={...block,id:randomUUID()};await m.save({id:note.id,revision:1,patch:{upsert:[second],remove:[],order:[second.id,block.id]},ack:true});assert.equal((await m.read(note.id)).blocks[0].id,second.id);
 await assert.rejects(m.save({id:note.id,revision:2,patch:{upsert:[],remove:[],order:['missing',block.id]}}));assert.equal((await m.read(note.id)).revision,2);
});
test('first recording-attached memo has a stable base and a durable journal snapshot',async t=>{
 const {library}=await setup(t),m=new Memos(library),{id}=await library.beginRecording({title:'녹음 메모 검증',mime:'audio/webm'}),first=await m.read(id),again=await m.read(id);assert.equal(first.blocks[0].id,again.blocks[0].id);
 const block={...first.blocks[0],content:[{type:'text',text:'녹음 중 작성한 메모',styles:{}}]};await m.save({id,revision:0,ack:true,patch:{upsert:[block],remove:[]}});assert.equal((await m.read(id)).blocks.length,1);assert.equal((await m.read(id)).blocks[0].content[0].text,'녹음 중 작성한 메모');
 await library.appendRecording({id,sequence:0,bytes:new Uint8Array([1,2,3])});await library.finishRecording({id,seconds:3});const next=new Library(library.root);await next.ready;assert.equal((await new Memos(next).read(id)).blocks[0].content[0].text,'녹음 중 작성한 메모');
});
test('PDF checkpoints/replay preserve all saved strokes and export journal annotations',async t=>{
 const {library,root}=await setup(t),p=new PDFs(library),note=(await p.create()).note;for(let i=0;i<70;i++){const o={id:randomUUID(),type:'pen',page:1,color:'#387a97',width:2,points:[[i,i],[i+1,i+1]]};await p.save({id:note.id,revision:i,ack:true,patch:{upsert:[o],remove:[]}});}
 const disk=JSON.parse(await fs.readFile(path.join(library.recordings,note.id,'annotations.json')));assert.equal(disk.revision,64);
 const next=new Library(library.root);await next.ready;assert.equal((await new PDFs(next).read(note.id)).objects.length,70);assert.ok((await p.export(note.id,true)).length>500);
 const zip=path.join(root,'folder.zip');await require('../electron/folder-export.cjs').exportFolder({folder:''},{library,dialog:{showSaveDialog:async()=>({filePath:zip})}});const files=await require('unzipper').Open.file(zip),entry=files.files.find(item=>item.path.endsWith('필기.json'));assert.equal(JSON.parse(await entry.buffer()).objects.length,70);
 const feed=await p.changes({id:note.id,since:69});assert.equal(feed.patches.length,1);assert.ok((await p.changes({id:note.id,since:0})).snapshot);
});
test('journal corruption is detected; confirmed contents never silently reset',async t=>{
 const {library}=await setup(t),m=new Memos(library),note=(await m.create()).note,doc=await m.read(note.id);await m.save({id:note.id,revision:0,patch:{upsert:doc.blocks,remove:[]},ack:true});const file=path.join(m.directory(note.id),'memo.json');await fs.appendFile(file+'.journal','{"broken":true}\n');sync.forget(library,file);await assert.rejects(m.read(note.id),/읽지 못|저장 기록/);assert.ok((await fs.readFile(file+'.journal','utf8')).includes('broken'));
});
test('an interrupted, unacknowledged journal tail is archived on next save without losing confirmed edits',async t=>{
 const {library}=await setup(t),m=new Memos(library),note=(await m.create()).note,doc=await m.read(note.id),block={...doc.blocks[0],content:[{type:'text',text:'확정된 메모',styles:{}}]};
 await m.save({id:note.id,revision:0,patch:{upsert:[block],remove:[]},ack:true});const file=path.join(m.directory(note.id),'memo.json');await fs.appendFile(file+'.journal','{"unfinished":');sync.forget(library,file);
 assert.equal((await m.read(note.id)).blocks[0].content[0].text,'확정된 메모');assert.equal((await m.read(note.id)).revision,1);
 await m.save({id:note.id,revision:1,patch:{upsert:[{...block,content:[{type:'text',text:'다음 수정',styles:{}}]}],remove:[]},ack:true});const next=new Library(library.root);await next.ready;assert.equal((await new Memos(next).read(note.id)).revision,2);assert.ok((await fs.readdir(m.directory(note.id))).some(name=>name.startsWith('memo.json.journal.damaged-')));
});
test('receiver remembers skipped notifications and applies deltas without replacing unchanged items',async()=>{
 const {requestDocumentRefresh}=await import('../src/documentRefresh.js');const untouched={id:'a'},changed={id:'b',text:'old'},entry={id:'test',documentPayload:{id:'test'},state:{revision:1,blocks:[untouched,changed],dirty:true},targetRevision:0};let calls=0;
 const api={changes:async()=>{calls++;return {revision:2,patches:[{base:1,revision:2,patch:{upsert:[{id:'b',text:'new'}],remove:[]}}]};}},publish=(e,change)=>{e.state={...e.state,...change};};
 requestDocumentRefresh(entry,api,'blocks',publish,2);assert.equal(calls,0);assert.equal(entry.targetRevision,2);entry.state.dirty=false;entry.listeners=new Set();requestDocumentRefresh(entry,api,'blocks',publish,entry.targetRevision);assert.equal(calls,0);entry.listeners.add(()=>{});await requestDocumentRefresh(entry,api,'blocks',publish,entry.targetRevision);assert.equal(entry.state.blocks[0],untouched);assert.equal(entry.state.blocks[1].text,'new');assert.equal(entry.targetRevision,0);
});
test('WebSocket approval, Origin, CSRF, deduplicated writes, preview and revoke',async t=>{
 const {root}=await setup(t),{DeviceServer}=require('../electron/device-server.cjs'),{WebSocket}=require('ws');let calls=0,previews=[];
 const server=new DeviceServer({root:path.join(root,'server'),dist:path.resolve('dist'),rpc:async()=>{calls++;return {ok:true};},previewCheck:()=>{},previewLocal:value=>previews.push(value)});await server.initialize();await server.configure(true);t.after(()=>server.configure(false));
 const token=randomBytes(32).toString('hex'),device={id:randomUUID(),token:createHash('sha256').update(token).digest('hex'),csrf:randomBytes(24).toString('hex'),expires:Date.now()+60000,name:'private test'};server.configuration.devices.push(device);
 const url=`wss://127.0.0.1:${server.port}/api/socket`,options={ca:server.caPem,origin:`https://127.0.0.1:${server.port}`,headers:{Cookie:'loxt='+token}};
 const unauthorized=new WebSocket(url,{...options,origin:'https://evil.example'});await new Promise(resolve=>unauthorized.on('error',resolve));
 const ws=new WebSocket(url,options);t.after(()=>ws.terminate());const received=[],wait=type=>new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('socket timeout '+type)),3000);const listener=data=>{const value=JSON.parse(data);received.push(value);if(value.type===type){clearTimeout(timeout);ws.off('message',listener);resolve(value);}};ws.on('message',listener);});await new Promise((r,j)=>{ws.on('open',r);ws.on('error',j);});const ready=wait('ready');ws.send(JSON.stringify({type:'hello',csrf:device.csrf}));await ready;
 const request={type:'rpc',requestId:randomUUID(),method:'memo.save',payload:{}};let result=wait('result');ws.send(JSON.stringify(request));assert.equal((await result).value.ok,true);result=wait('result');ws.send(JSON.stringify(request));await result;assert.equal(calls,1);
 const preview={id:randomUUID(),workspace:'work',session:randomUUID(),object:{id:randomUUID(),type:'pen',page:1,color:'#387a97',width:2,points:[[1,2]]}};const drawing=wait('pdf-preview');ws.send(JSON.stringify({type:'preview',value:preview}));await drawing;assert.equal(previews.length,1);assert.equal(server.diagnostics().recentRequests.length,2);
 const closed=new Promise(resolve=>ws.on('close',resolve));await server.revoke(device.id);await closed;assert.equal(server.configuration.devices.length,0);
});
