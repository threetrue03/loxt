const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { WorkWorker } = require('../electron/work-worker.cjs');
const { LiveEngine } = require('../electron/live-engine.cjs');

async function fixture(t) {
  await fs.mkdir(path.resolve('test-results'), { recursive: true });
  const root = await fs.mkdtemp(path.resolve('test-results/work-pool-'));
  const script = path.join(root, 'worker.cjs');
  await fs.writeFile(script, `const readline=require('node:readline');readline.createInterface({input:process.stdin}).on('line',line=>{const p=JSON.parse(line);if(p.type==='stop')return process.exit(0);if(p.audio==='error'){console.log(JSON.stringify({type:'error',message:'out of memory'}));return process.exit(1);}setTimeout(()=>console.log(JSON.stringify({type:'result',pid:process.pid,segments:[]})),p.audio==='slow'?1000:5);});`);
  const engine = { root, kill: child => child.kill() };
  const pool = new WorkWorker(engine, 80);
  t.after(() => pool.close());
  const run = (audio = 'ok', model = 'same') => pool.run(process.execPath, [script, 'transcribe', '--audio', audio, '--model', model], () => {});
  return { pool, run };
}
test('Work pool reuses a model, switches workers on model change, and releases idle process', async t => {
  const { pool, run } = await fixture(t);
  await run(); const first = pool.child.pid;
  await run(); assert.equal(pool.child.pid, first);
  await run('ok', 'different'); assert.notEqual(pool.child.pid, first);
  await new Promise(resolve => setTimeout(resolve, 180));
  assert.equal(pool.child, null);
  await run(); assert.ok(pool.child);
});
test('Work pool releases failed worker and retries with a fresh worker', async t => {
  const { pool, run } = await fixture(t);
  await assert.rejects(run('error'), /out of memory/);
  await run(); assert.ok(pool.child); assert.equal(pool.pending, null);
});
test('Work pool cancellation rejects active job, exits, then accepts a new job', async t => {
  const { pool, run } = await fixture(t);
  const job = run('slow'); const rejected = assert.rejects(job, /cancelled/);
  await pool.close(); await rejected; assert.equal(pool.child, null);
  await run(); assert.ok(pool.child);
});
test('Live reservation releases the resident Work worker before configuring its model', async t => {
  const { pool, run } = await fixture(t); await run(); assert.ok(pool.child);
  let resumed = false;
  const engine = { preferences: { model: 'old', device: 'auto' }, state: { ready: true, model: 'same', device: 'cpu', computeType: 'int8' }, releaseWorkWorker: () => pool.close(), configure: async () => assert.equal(pool.child, null), auxiliary: { prepare: async () => {} }, update: () => {} };
  const live = new LiveEngine(engine, { active: false, pause: () => {}, resume: () => { resumed = true; } }, {}, () => {});
  live.openWorker = async () => { live.child = {}; };
  live.closeWorker = async () => { live.child = null; };
  await live.prepare({ model: 'same' }); assert.equal(live.state.stage, 'ready');
  await live.finish(null); assert.equal(resumed, true); assert.equal(pool.child, null);
});
