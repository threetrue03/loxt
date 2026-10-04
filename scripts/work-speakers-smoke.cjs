const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { Library } = require('../electron/library.cjs');
const { Transcriber } = require('../electron/transcriber.cjs');
const { ConversionQueue } = require('../electron/conversion-queue.cjs');
(async () => {
  await fs.mkdir('test-results',{recursive:true});
  const root = await fs.mkdtemp(path.resolve('test-results/work-speakers-'));
  const cache = path.join(process.env.APPDATA,'sorinote-desktop','transcription'), engineRoot=path.join(root,'transcription');
  await fs.mkdir(engineRoot);
  for (const name of ['venv','models']) await fs.symlink(path.join(cache,name),path.join(engineRoot,name),'junction');
  await fs.symlink(path.resolve('.runtime/auxiliary'),path.join(engineRoot,'auxiliary'),'junction');
  await fs.writeFile(path.join(engineRoot,'settings.json'),JSON.stringify({model:'small',device:'auto'}));
  await fs.writeFile(path.join(engineRoot,'prepared.json'),JSON.stringify({validations:{'small:cuda:int8_float16':true}}));
  const work=new Library(path.join(root,'library')),live=new Library(path.join(root,'live-library'));
  const source=path.join(process.env.APPDATA,'sorinote-desktop','library','recordings','21959965-51bc-49c4-bf2c-e250b9980f0f','audio.webm');
  const workNote=(await work.importAudio(source,'')).note,liveNote=(await live.importAudio(source,'')).note;
  let queue;
  const engine=new Transcriber({root:engineRoot,resources:path.resolve('python'),runtime:path.resolve('.runtime/python'),library:work,onChange:()=>queue?.changed()});
  queue=new ConversionQueue(engine,work,()=>{});queue.liveLibrary=live;
  try {
    for (const [workspace,library,note] of [['work',work,workNote],['live',live,liveNote]]) {
      await queue.enqueue({id:note.id,model:'small',workspace});
      const deadline=Date.now()+180000;
      while(queue.hasJobs&&Date.now()<deadline)await new Promise(r=>setTimeout(r,100));
      assert.equal(queue.hasJobs,false);
      const saved=(await library.list()).notes[0];
      assert.equal(saved.status,'done',saved.transcriptionError);assert.equal(saved.transcription.device,'cuda');assert.ok(saved.segments.some(s=>s.speaker));assert.ok(saved.segments.every(s=>s.end<=saved.seconds));
      const text=await fs.readFile(path.join(library.recordings,note.id,'transcript.txt'),'utf8');assert.match(text,/\[[A-Z]+\]/);
      console.log('PASS',workspace,saved.seconds,saved.segments.length,[...new Set(saved.segments.map(s=>s.speaker))]);
    }
    assert.equal((await work.list()).notes[0].id,workNote.id);assert.equal((await live.list()).notes[0].id,liveNote.id);
    await fs.writeFile(path.join(root,'result.json'),JSON.stringify({work:await work.list(),live:await live.list()},null,2));
    console.log('TEST_PROFILE',root);
  } finally {queue.shutdown();engine.auxiliary.shutdown();}
})().catch(error=>{console.error(error);process.exitCode=1;});
