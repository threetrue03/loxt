import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {sharedModelStore} from '../src/modelStoreSnapshot.js';
import {estimateDocumentBytes,trimIdleDocuments} from '../src/documentCache.js';
const require=createRequire(import.meta.url),{ModelStore,DAY}=require('../electron/model-store.cjs'),{validateBlocks,plainText,Memos}=require('../electron/memos.cjs'),{Library}=require('../electron/library.cjs');
const block=(id,text='본문')=>({id,type:'paragraph',props:{},content:[{type:'text',text,styles:{}}],children:[]});
const settle=()=>new Promise(resolve=>setTimeout(resolve,20));
async function directory(){await fs.mkdir('test-results',{recursive:true});return fs.mkdtemp(path.resolve('test-results/performance-2.7-'));}
test('memo preview stops after limit while preserving nested/table/empty text order',()=>{
 const b=block('one','가나다');b.content.push({text:''},{text:'라마바사'});b.children=[block('child','아자차')];
 assert.equal(plainText([b],8),'가나다  라마바');assert.equal(plainText([b],20),'가나다  라마바사 아자차');
 let reads=0;const tail={get text(){reads++;throw Error('unneeded tail visited');}};assert.equal(plainText([{text:'12345'},tail],5),'12345');assert.equal(reads,0);
 const table={type:'tableContent',rows:[[{cells:[{text:'첫칸'},{text:'둘째칸'}]}]]};assert.equal(plainText([table],5),'첫칸 둘째');
});
test('changed-block validation reuses frozen server blocks but rejects unsafe new data and aggregate limits',()=>{
 const existing=validateBlocks([block('a','safe'),block('b')]);assert.ok(Object.isFrozen(existing[0].content[0]));
 assert.throws(()=>{existing[0].content[0].text='mutated';},TypeError);
 assert.equal(validateBlocks([...existing,block('c')],{trusted:true}).length,3);
 assert.throws(()=>validateBlocks([...existing,{...block('evil'),props:{url:'https://evil.example'}}],{trusted:true}),/첨부/);
 assert.throws(()=>validateBlocks([...existing,{...block('evil'),content:[{href:'javascript:evil'}]}],{trusted:true}),/링크/);
 const many=validateBlocks(Array.from({length:10000},(_,i)=>block('n'+i,'')));assert.throws(()=>validateBlocks([...many,block('extra')],{trusted:true}),/블록/);
 assert.throws(()=>validateBlocks([...existing,block('huge','X'.repeat(5_000_001))],{trusted:true}),/최대 크기/);
});
test('durable memo patch survives restart; invalid patch never increments durable revision',async()=>{
 const root=await directory(),library=new Library(root);await library.ready;const memos=new Memos(library),{note}=await memos.create();
 await memos.save({id:note.id,revision:0,blocks:[block('a'),block('b')],ack:true});
 await memos.save({id:note.id,revision:1,patch:{upsert:[block('b','수정')],remove:[]},ack:true});
 await assert.rejects(memos.save({id:note.id,revision:2,patch:{upsert:[{...block('b'),props:{url:'https://evil.example'}}],remove:[]},ack:true}),/첨부/);
 await library.flushIndex();const restart=new Library(root);await restart.ready;const recovered=await new Memos(restart).read(note.id);assert.equal(recovered.revision,2);assert.equal(plainText(recovered.blocks),'본문 수정');
});
test('byte LRU preserves dirty, saving, loading and active documents even above budget',()=>{
 const entries=new Map([['old',{cacheBytes:60,lastAccess:1}],['dirty',{cacheBytes:90,lastAccess:2,dirty:true}],['active',{cacheBytes:90,lastAccess:3,active:true}],['fresh',{cacheBytes:30,lastAccess:4}]]);
 const status=trimIdleDocuments(entries,{bytesLimit:100,countLimit:2,protectedEntry:e=>e.dirty||e.active});assert.deepEqual([...entries.keys()],['dirty','active']);assert.equal(status.overBudget,true);
 entries.get('dirty').dirty=false;trimIdleDocuments(entries,{bytesLimit:100,protectedEntry:e=>e.active});assert.deepEqual([...entries.keys()],['active']);
 const small=estimateDocumentBytes([block('small','abc')]),large=estimateDocumentBytes([block('large','abcdef'.repeat(1000))]);assert.ok(large>small*5);
});
test('memo cache evicts oversized idle documents while preserving an edited active draft',async()=>{
 const savedWindow=globalThis.window,savedStorage=globalThis.localStorage,storage=new Map();
 globalThis.localStorage={getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)};
 globalThis.window={desktop:{remote:true,hostId:'cache-test',memos:{get:async()=>({revision:0,blocks:[block('large','X'.repeat(2_000_000))]}),save:async()=>{throw Error('offline');},pending(){},onFlush:()=>()=>{}},onLibraryChange:()=>()=>{}},addEventListener(){},dispatchEvent(){return true;}};
 const memo=await import('../src/memoStore.js?cache-protection-test');
 const edited=memo.memoEntry('edited');edited.listeners.add(()=>{});await memo.loadMemo('edited');memo.changeMemo('edited',[block('draft','내가 수정한 내용')]);
 for(let i=0;i<7;i++)await memo.loadMemo('idle-'+i);
 assert.equal(memo.memoEntry('edited'),edited);assert.equal(edited.state.dirty,true);assert.equal(edited.state.blocks[0].content[0].text,'내가 수정한 내용');assert.equal(memo.memoEntry('idle-0').state.loading,true);
 clearTimeout(edited.timer);clearTimeout(edited.backupTimer);globalThis.window=savedWindow;globalThis.localStorage=savedStorage;
});
test('shared model snapshot deduplicates subscribers/requests, ignores transcript-only events and cleans adapter listeners',async()=>{
 let subscriptions=0,cleanup=0,calls=0,envListener,notify;
 const env={stage:'idle',progress:null,models:[{id:'small',downloaded:true}]};
 const adapter={modelStore:{list:async()=>{calls++;await settle();return {models:env.models};},onChange:fn=>{notify=fn;subscriptions++;return()=>cleanup++;}},onTranscriptionState:fn=>{envListener=fn;subscriptions++;return()=>cleanup++;},getTranscriptionEnvironment:async()=>env};
 const store=sharedModelStore(adapter),off1=store.subscribe(()=>{}),off2=store.subscribe(()=>{});assert.equal(subscriptions,2);await settle();await settle();await settle();assert.equal(calls,2);
 const before=store.getSnapshot(),summary=store.getSummary();envListener({...env,task:{segments:[{text:'large transcript'}]}});assert.equal(store.getSnapshot(),before);
 envListener({...env,progress:42,stage:'downloading'});assert.notEqual(store.getSnapshot(),before);assert.equal(store.getSummary(),summary);
 const a=store.reload(false,true),b=store.reload(false,true);assert.equal(a,b);await a;assert.equal(calls,3);off1();assert.equal(cleanup,0);off2();assert.equal(cleanup,2);
 const other=sharedModelStore({...adapter});assert.notEqual(other,store);notify();await settle();assert.equal(store.getSnapshot().loading,false);
});
test('cache cleanup bounds search files and preserves stale featured and current query for offline fallback',async()=>{
 const root=await directory();let now=0;const store=new ModelStore(root,{clock:()=>now});await store.ready;
 await store.cached('featured',DAY,async()=>({models:[{id:'last-good'}]}));
 for(let i=0;i<85;i++){now++;await store.cached('search:'+i,900000,async()=>({models:[{id:String(i)}]}));}
 const cache=path.join(root,'store-cache');assert.ok((await fs.readdir(cache)).length<=80);
 now+=DAY*2;await store.cached('new-query',900000,async()=>({models:[]}));assert.equal((await fs.readdir(cache)).length,2);
 const fallback=await store.cached('featured',DAY,async()=>{throw Error('offline');});assert.equal(fallback.models[0].id,'last-good');assert.equal(fallback.stale,true);
});
test('model disk cache obeys byte cap even before its file count cap',async()=>{
 const root=await directory(),store=new ModelStore(root);await store.ready;
 for(let i=0;i<5;i++)await store.cached('bytes:'+i,DAY,async()=>({models:[],data:'X'.repeat(4*1024*1024)}));
 const dir=path.join(root,'store-cache'),files=await fs.readdir(dir);let bytes=0;for(const file of files)bytes+=(await fs.stat(path.join(dir,file))).size;
 assert.ok(bytes<=16*1024*1024);assert.ok(files.length<5);
});
