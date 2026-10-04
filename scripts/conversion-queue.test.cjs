const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { Library } = require('../electron/library.cjs');
const { Transcriber } = require('../electron/transcriber.cjs');
const { ConversionQueue } = require('../electron/conversion-queue.cjs');

async function until(check) {
  for (let i = 0; i < 600; i++) { if (await check()) return; await new Promise(resolve => setTimeout(resolve, 5)); }
  assert.fail('Background job did not reach the expected state');
}
async function fixture(t) {
  await fs.mkdir('test-results', { recursive: true });
  const root = await fs.mkdtemp(path.resolve('test-results/queue-'));
  const library = new Library(path.join(root, 'library')); await library.ready;
  const source = path.join(root, 'source.wav'); await fs.writeFile(source, 'immutable test audio');
  const notes = [];
  for (let i = 0; i < 3; i++) notes.push((await library.importAudio(source, '')).note);
  let queue;
  const engine = new Transcriber({ root: path.join(root, 'engine'), resources: root, library, onChange: () => queue?.changed() });
  engine.auxiliary = { prepare: async () => {}, diarize: async (_, segments) => segments };
  engine.preferences = { model: 'small', device: 'auto' }; engine.state.model = 'small';
  engine.detect = async () => { engine.update({ ready: true, model: engine.preferences.model, device: 'cuda', stage: 'idle' }); return engine.snapshot(); };
  const workers = [], models = [];
  engine.run = (_, args, line) => {
    models.push(engine.preferences.model);
    return new Promise((resolve, reject) => workers.push({ model: engine.preferences.model,
      finish() { line(JSON.stringify({ type: 'result', segments: [{ start: 0, end: 1, text: '검증 내용' }], seconds: 1, model: this.model, device: 'cuda', compute_type: 'int8_float16', language: 'ko' })); resolve(); },
      fail() { reject(new Error('invalid audio')); },
    }));
  };
  queue = new ConversionQueue(engine, library, () => {});
  t.after(() => queue.shutdown());
  return { root, library, engine, queue, notes, workers, models };
}
test('queue serializes real engine lifecycles and preserves each requested model', async t => {
  const { queue, engine, library, notes, workers, models } = await fixture(t);
  await Promise.all(notes.map((note, i) => queue.enqueue({ id: note.id, model: ['small', 'large-v3-turbo', 'large-v3'][i] })));
  await until(() => workers.length === 1);
  assert.equal(queue.snapshot().queue.length, 3);
  assert.deepEqual(queue.snapshot().queue.map(job => job.status), ['active', 'queued', 'queued']);
  for (let i = 0; i < 3; i++) {
    assert.equal(workers.length, i + 1, 'Only one GPU worker may run at a time');
    workers[i].finish();
    await until(() => i < 2 ? workers.length === i + 2 : !queue.hasJobs && !engine.busy);
  }
  assert.deepEqual(models, ['small', 'large-v3-turbo', 'large-v3']);
  for (const [i, note] of notes.entries()) {
    const saved = (await library.list()).notes.find(item => item.id === note.id);
    assert.equal(saved.status, 'done'); assert.equal(saved.transcription.model, models[i]);
    assert.equal(await fs.readFile((await library.getAudio(note.id)).filename, 'utf8'), 'immutable test audio');
  }
});
test('waiting cancellation, duplicate requests and failed active jobs never stop the next job', async t => {
  const { queue, engine, library, notes, workers } = await fixture(t);
  await queue.enqueue(notes[0].id); await queue.enqueue(notes[1].id); await queue.enqueue(notes[2].id);
  await until(() => workers.length === 1);
  await assert.rejects(queue.enqueue(notes[0].id), /이미/);
  await queue.cancel(notes[1].id);
  assert.equal((await library.list()).notes.find(note => note.id === notes[1].id).status, 'cancelled');
  assert.equal(queue.snapshot().queue.length, 2);
  workers[0].fail(); await until(() => workers.length === 2);
  workers[1].finish(); await until(() => !queue.hasJobs && !engine.busy);
  const saved = (await library.list()).notes;
  assert.equal(saved.find(note => note.id === notes[0].id).status, 'failed');
  assert.equal(saved.find(note => note.id === notes[2].id).status, 'done');
  assert.equal(workers.length, 2);
});
test('active cancellation retains the existing script and advances after the worker has stopped', async t => {
  const { queue, engine, library, notes, workers } = await fixture(t);
  await library.completeTranscription(notes[0].id, { segments: [{ start: 0, end: 1, text: '기존 스크립트' }], seconds: 1 });
  await queue.enqueue(notes[0].id); await queue.enqueue(notes[1].id);
  await until(() => workers.length === 1);
  await queue.cancel(notes[0].id);
  assert.equal(workers.length, 1);
  workers[0].finish(); await until(() => workers.length === 2);
  const saved = (await library.list()).notes.find(note => note.id === notes[0].id);
  assert.equal(saved.status, 'cancelled'); assert.equal(saved.segments[0].text, '기존 스크립트');
  workers[1].finish(); await until(() => !queue.hasJobs && !engine.busy);
});
test('cancelling during model selection prevents inference and continues the queue', async t => {
  const { queue, engine, library, notes, workers } = await fixture(t);
  const original = engine.configure.bind(engine); let release;
  engine.configure = async value => { if (!release) await new Promise(resolve => { release = resolve; }); return original(value); };
  await queue.enqueue(notes[0].id); await queue.enqueue(notes[1].id);
  await until(() => Boolean(release)); await queue.cancel(notes[0].id); release();
  await until(() => workers.length === 1);
  assert.equal((await library.list()).notes.find(note => note.id === notes[0].id).status, 'cancelled');
  assert.equal(queue.snapshot().queue[0].id, notes[1].id);
  workers[0].finish(); await until(() => !queue.hasJobs && !engine.busy);
});
