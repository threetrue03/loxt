// Real public metadata, pinned tiny download and local CUDA timing. No user library writes.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {ModelStore,installationPlan}=require('../electron/model-store.cjs'),{Transcriber}=require('../electron/transcriber.cjs');
const {computeType}=require('../electron/transcription-config.cjs');
async function main(){
 const output=path.resolve('test-results/model-store-2.6.0');await fs.mkdir(output,{recursive:true});const root=await fs.mkdtemp(path.join(output,'real-'));
 if(process.argv.includes('--catalog-only')) {
   const engine={snapshot:()=>({}),modelList:async()=>[]},store=new ModelStore(root,{engine});const catalog=await store.list({force:true});assert.ok(!catalog.error,catalog.error);assert.deepEqual(catalog.models.map(model=>model.id),['tiny','base','small','medium','large-v3-turbo','large-v3']);const standard=catalog.models.find(model=>model.id==='large-v3-turbo');assert.equal(standard.compatibility,'supported');await fs.writeFile(path.join(output,'real-catalog.json'),JSON.stringify(catalog,null,2));console.log(JSON.stringify(catalog.models.map(model=>({id:model.id,repo:model.repo,license:model.license}))));return;
 }
 const interpreter=path.join(process.env.APPDATA,'sorinote-desktop','transcription','venv','Scripts','python.exe');await fs.access(interpreter);
 process.env.PYTHONDONTWRITEBYTECODE='1';
 const engine=new Transcriber({root,resources:path.resolve('python'),runtime:path.resolve('.runtime/python')});
 engine.state.python=interpreter;engine.python=interpreter;engine.basePython=async()=>path.resolve('.runtime/python/python.exe');engine.releaseWorkWorker=async()=>{};
 engine.detect=async()=>{engine.cancelled=false;engine.update({models:await engine.modelList()});return engine.snapshot();};
 const gpu=(await engine.run('nvidia-smi',['--query-gpu=name,memory.total','--format=csv,noheader,nounits'],()=>{},15000)).split('\n')[0].split(',').map(s=>s.trim());engine.state.gpu={name:gpu[0],memory:Number(gpu[1])};engine.state.hardwareChecked=true;engine.state.device='cuda';
 await engine.run(interpreter,[path.resolve('python/worker.py'),'probe','--model-dir',path.join(root,'models','tiny'),'--device','cuda'],line=>{try{const value=JSON.parse(line);if(value.type==='probe')engine.state.computeType=computeType('cuda',value.compute_types);}catch{}},60000);
 const store=new ModelStore(root,{engine,preferences:{set:async()=>{}},fetcher:(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(8000)})});engine.store=store;await store.ready;
 const plan=await store.plan('Systran/faster-whisper-tiny');assert.equal(plan.model.engine,'faster-whisper');assert.ok(plan.files.some(file=>file.name==='model.bin'&&file.hash.length===64));
 const search=await store.search({query:'faster-whisper-tiny',force:true});assert.ok(search.models.some(model=>model.repo==='Systran/faster-whisper-tiny'));
 const actual=[];engine.onChange=state=>{if(state.progress!=null)actual.push(state.progress);};
 await engine.installStoreModel(plan);const installed=(await engine.modelList()).find(model=>model.id==='tiny');assert.equal(installed.downloaded,true);assert.equal(installed.revision,plan.revision);assert.ok(actual.some(percent=>percent>0&&percent<=99));
 const measurement=await store.benchmark('tiny');assert.equal(measurement.device,'cuda');assert.equal(measurement.accuracyMeasured,false);assert.ok(measurement.rtf>0&&measurement.previewLatencyMs>0);
 const result={version:'2.6.0',profile:root,metadataSource:plan.repo,pinnedRevision:plan.revision,files:plan.files,downloadBytes:plan.files.reduce((sum,file)=>sum+file.size,0),hashVerified:true,executionValidated:installed.validated,gpu:engine.state.gpu,measurement,scope:'Real generated Windows sample; no Korean accuracy or full Live latency measurement; user library/settings unchanged'};
 await fs.writeFile(path.join(output,'real-integration.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
