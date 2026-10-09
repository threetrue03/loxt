const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises'), path = require('node:path');
const {ModelStore,entry,installationPlan,modelId,DAY,SEARCH_TTL,hardwareKey} = require('../electron/model-store.cjs');
const {Transcriber} = require('../electron/transcriber.cjs');
const sha='a'.repeat(40), hash='b'.repeat(64);
const metadata=(repo='owner/faster-whisper-test')=>({id:repo,sha,library_name:'ctranslate2',tags:['automatic-speech-recognition','ctranslate2'],cardData:{license:'mit',language:['ko','en']},siblings:[{rfilename:'model.bin',size:100,lfs:{size:100,sha256:hash}},{rfilename:'config.json',size:35,blobId:'c'.repeat(40)},{rfilename:'tokenizer.json',size:10,blobId:'d'.repeat(40)},{rfilename:'danger.py',size:10,blobId:'e'.repeat(40)}]});
async function fixture(){await fs.mkdir('test-results',{recursive:true});const root=await fs.mkdtemp(path.resolve('test-results/store-'));let prefs={work:{model:'small'},live:{model:'large-v3-turbo'}};
 const state={hardwareChecked:true,device:'cuda',computeType:'int8_float16',gpu:{name:'Test GPU',memory:6144},ram:16*1024**3,recommended:{model:'large-v3-turbo'}};
 const models=[{id:'small',label:'저성능',downloaded:true},{id:'medium',label:'medium',downloaded:true},{id:'large-v3-turbo',label:'표준',downloaded:true},{id:'large-v3',label:'고성능',downloaded:false}];
 const engine={modelList:async()=>models,snapshot:()=>state,update:()=>{}};
 const preferences={set:async(mode,change)=>{prefs[mode]={...prefs[mode],...change};return prefs;}};
 const store=new ModelStore(root,{engine,preferences,fetcher:async()=>new Response(JSON.stringify(metadata()))});await store.ready;return {root,engine,models,state,store,preferences,prefs};}
test('only compatible public CT2 Whisper data yields a pinned install plan; repository code excluded',()=>{
 const info=metadata();const plan=installationPlan(info);assert.equal(plan.revision,sha);assert.equal(plan.model.engine,'faster-whisper');assert.equal(plan.files.some(f=>f.name==='danger.py'),false);
 assert.equal(entry({...info,library_name:'transformers',tags:[]}).compatibility,'unsupported');assert.equal(entry({...info,gated:'auto'}).compatibility,'unsupported');assert.equal(entry({...info,id:'owner/zipformer'}).compatibility,'unsupported');
 assert.throws(()=>installationPlan({...info,sha:'main'}),/설치/);assert.throws(()=>entry({...info,id:'../escape'}),/이름/);
 assert.throws(()=>installationPlan({...info,siblings:info.siblings.map(f=>f.rfilename==='model.bin'?{...f,lfs:{size:0,sha256:'bad'},size:0}:f)}),/크기/);
 assert.equal(modelId('Systran/faster-whisper-small'),'small');assert.equal(modelId(info.id),modelId(info.id));
 assert.equal(modelId('dropbox-dash/faster-whisper-large-v3-turbo'),'large-v3-turbo');assert.equal(installationPlan(metadata('dropbox-dash/faster-whisper-large-v3-turbo')).model.id,'large-v3-turbo');
});
test('Work/Live roles and defaults independent, aliases/tags persist, unavailable roles rejected and failed preferences roll back',async()=>{
 const f=await fixture();await f.store.assign({mode:'work',id:'medium',role:'standard',alias:'한국어 회의',tags:['회의','회의',' 한국어 '],use:true});
 assert.equal(f.prefs.work.model,'medium');assert.equal(f.prefs.live.model,'large-v3-turbo');assert.equal(f.store.snapshot().roles.live.standard,'large-v3-turbo');
 assert.equal(f.store.decorate(f.models).find(m=>m.id==='large-v3-turbo').roles.work,'other');
 const again=new ModelStore(f.root,{engine:f.engine,preferences:f.preferences});await again.ready;assert.deepEqual(again.snapshot().annotations.medium.tags,['회의','한국어']);
 await assert.rejects(f.store.assign({mode:'live',id:'large-v3',role:'standard'}),/설치/);
 const before=f.store.snapshot();f.preferences.set=async()=>{throw Error('disk failure');};await assert.rejects(f.store.assign({mode:'work',id:'small',role:'standard',use:true}),/disk/);assert.deepEqual(f.store.snapshot(),before);
});
test('24h/15min caches, request deduplication, explicit refresh and stale offline fallback',async()=>{
 const f=await fixture();let now=0,count=0,fail=false;f.store.clock=()=>now;
 const work=async()=>{count++;await new Promise(resolve=>setTimeout(resolve,20));if(fail)throw Error('offline');return {models:[{id:'one'}]};};
 await Promise.all([f.store.cached('catalog',DAY,work),f.store.cached('catalog',DAY,work)]);assert.equal(count,1);
 now=DAY-1;assert.equal((await f.store.cached('catalog',DAY,work)).cached,true);assert.equal(count,1);
 await f.store.cached('catalog',DAY,work,true);assert.equal(count,2);now+=DAY;fail=true;
 const stale=await f.store.cached('catalog',DAY,work);assert.equal(stale.stale,true);assert.equal(stale.error,'offline');assert.equal(SEARCH_TTL,15*60000);
});
test('search validates pagination, exposes unsupported models without claiming installation support',async()=>{
 const f=await fixture();let seen;f.store.fetcher=async url=>{seen=String(url);return new Response(JSON.stringify([metadata(),{...metadata('owner/other-model'),library_name:'transformers'}]));};
 const result=await f.store.search({query:'korean'});assert.equal(result.models.length,2);assert.equal(result.models[1].compatibility,'unsupported');assert.match(seen,/automatic-speech-recognition/);
 await assert.rejects(f.store.search({cursor:999}),/검색어/);await assert.rejects(f.store.detail('https://evil.test/'),/이름/);
});
test('real timing results tied to model revision and hardware; no invented accuracy rating',async()=>{
 const f=await fixture();await assert.rejects(f.store.saveBenchmark('small',{rtf:NaN,loadSeconds:1,audioSeconds:10}),/결과/);
 await f.store.saveBenchmark('small',{rtf:.3,loadSeconds:2,audioSeconds:10,accuracyMeasured:false,liveEndToEndMeasured:false});
 assert.equal(f.store.recommend(f.models[0],f.state).kind,'measured');assert.equal(f.store.snapshot().benchmarks[hardwareKey(f.state)+':small'].model,'small');
 assert.equal(f.store.recommend(f.models[0],{...f.state,gpu:{name:'Another GPU',memory:4096}}).kind,'estimated');
});
test('corrupt management file preserved and never silently overwritten',async()=>{
 const f=await fixture();const file=path.join(f.root,'model-store.json');await fs.writeFile(file,'broken');const store=new ModelStore(f.root,{engine:f.engine,preferences:f.preferences});await store.ready;
 await assert.rejects(store.assign({mode:'work',id:'small',role:'low'}),/읽지/);assert.equal(await fs.readFile(file,'utf8'),'broken');
});
test('failed or canceled store update preserves existing model; successful update uses stable id and registry',async()=>{
 const f=await fixture();const info=metadata('Systran/faster-whisper-small'),plan=installationPlan(info);
 const engine=new Transcriber({root:f.root,resources:path.resolve('python')});engine.state.device='cpu';engine.state.computeType='int8';engine.basePython=async()=>process.execPath;engine.releaseWorkWorker=async()=>{};engine.detect=async()=>engine.snapshot();engine.python=process.execPath;
 const target=path.join(f.root,'models','small');await fs.mkdir(target,{recursive:true});await fs.writeFile(path.join(target,'model.bin'),'old model');
 engine.run=async(_cmd,args,onLine)=>{if(args[0].endsWith('store_download.py')){await fs.writeFile(path.join(f.root,'models','stage-small','model.bin'),'new model');onLine('{"type":"download-complete"}');return '';}throw Error('incompatible model');};
 await assert.rejects(engine.installStoreModel(plan),/incompatible/);assert.equal(await fs.readFile(path.join(target,'model.bin'),'utf8'),'old model');assert.equal(engine.busy,false);
 engine.run=async()=>{engine.cancelled=true;throw Error('cancelled');};assert.equal((await engine.installStoreModel(plan)).canceled,true);assert.equal(await fs.readFile(path.join(target,'model.bin'),'utf8'),'old model');
 engine.run=async(_cmd,args,onLine)=>{if(args[0].endsWith('store_download.py'))onLine('{"type":"download-complete"}');else onLine('{"type":"prepared"}');return '';};
 await engine.installStoreModel(plan);assert.equal(await fs.readFile(path.join(target,'model.bin'),'utf8'),'new model');assert.equal(JSON.parse(await fs.readFile(path.join(f.root,'store-models.json'),'utf8'))[0].revision,sha);
});
test('interrupted replace rolls back before registration and finishes cleanup after registration',async()=>{
 const f=await fixture(),models=path.join(f.root,'models'),backup='backup-small-11111111-1111-1111-1111-111111111111',stage=path.join(models,'stage-small'),target=path.join(models,'small');
 await fs.mkdir(path.join(models,backup),{recursive:true});await fs.writeFile(path.join(models,backup,'model.bin'),'old');await fs.mkdir(target);await fs.writeFile(path.join(target,'model.bin'),'new');
 const journal=path.join(f.root,'model-install-journal.json');await fs.writeFile(journal,JSON.stringify({version:1,id:'small',revision:sha,stage:'stage-small',backup}));
 const {recoverInstallation}=require('../electron/model-installation.cjs');await recoverInstallation(f.root);assert.equal(await fs.readFile(path.join(target,'model.bin'),'utf8'),'old');assert.equal(await fs.readFile(path.join(stage,'model.bin'),'utf8'),'new');
 await fs.rename(target,path.join(models,backup));await fs.rename(stage,target);await fs.writeFile(path.join(f.root,'store-models.json'),JSON.stringify([{id:'small',revision:sha}]));await fs.writeFile(journal,JSON.stringify({version:1,id:'small',revision:sha,stage:'stage-small',backup}));
 await recoverInstallation(f.root);assert.equal(await fs.readFile(path.join(target,'model.bin'),'utf8'),'new');await assert.rejects(fs.access(path.join(models,backup)));await assert.rejects(fs.access(journal));
});
