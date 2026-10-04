const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { Transcriber } = require('../electron/transcriber.cjs');

async function fixture(t) {
  await fs.mkdir('test-results', { recursive: true });
  const root = await fs.mkdtemp(path.resolve('test-results/automatic-'));
  const writes = [];
  const library = { getAudio: async () => ({ filename: 'sample.wav' }), setTranscription: async (id, value) => writes.push(value), completeTranscription: async (id, result) => writes.push(result) };
  const engine = new Transcriber({ root, resources: root, library });
  engine.auxiliary = { prepare: async () => {}, diarize: async (_, segments) => segments };
  engine.preferences = { model: 'small', device: 'cpu' };
  let installed = false, preparations = 0;
  engine.detect = async () => { engine.update({ ready: installed, device: engine.preferences.device === 'auto' ? 'cuda' : 'cpu' }); return engine.snapshot(); };
  engine.prepare = async () => { preparations++; installed = true; engine.update({ ready: true }); return engine.snapshot(); };
  engine.run = async (command, args, line) => line(JSON.stringify({ type: 'result', segments: [{ start: 0, end: 1, text: '검증 음성' }], seconds: 1, model: 'small', device: 'cuda', compute_type: 'int8_float16', language: 'ko' }));
  return { engine, library, writes, preparations: () => preparations };
}
async function settled(engine) {
  for (let i = 0; i < 500 && engine.busy; i++) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(engine.busy, false, 'automatic request must release its reservation');
}
test('automatic request prepares once, migrates legacy device to auto, and reuses the ready model', async t => {
  const { engine, writes, preparations } = await fixture(t);
  assert.equal((await engine.startAutomatic('one')).busy, true);
  await settled(engine);
  assert.equal(preparations(), 1);
  assert.equal(engine.preferences.device, 'auto');
  assert.equal(JSON.parse(await fs.readFile(path.join(engine.root, 'settings.json'), 'utf8')).device, 'auto');
  assert.equal(writes.at(-1).device, 'cuda');
  await engine.startAutomatic('two'); await settled(engine);
  assert.equal(preparations(), 1);
  assert.equal(engine.state.task, null);
});
test('reservation blocks duplicate starts and model changes; cancellation before preparation retains the original', async t => {
  const { engine, library, writes, preparations } = await fixture(t);
  let release;
  library.getAudio = () => new Promise(resolve => { release = resolve; });
  await engine.startAutomatic('one');
  await assert.rejects(engine.startAutomatic('two'), /현재 작업/);
  await assert.rejects(engine.configure({ model: 'small', device: 'auto' }), /작업/);
  engine.cancel(); release({ filename: 'original.wav' });
  await settled(engine);
  assert.equal(preparations(), 0);
  assert.equal(writes.at(-1).status, 'cancelled');
  assert.equal(writes.at(-1).transcriptionError, '');
});
test('cancellation during internal detection remains cancelled and never starts preparation', async t => {
  const { engine, writes, preparations } = await fixture(t);
  let release;
  engine.detect = Transcriber.prototype.detect;
  engine.run = () => new Promise(resolve => { release = resolve; });
  await engine.startAutomatic('one');
  while (!release) await new Promise(resolve => setTimeout(resolve, 5));
  engine.cancel(); release('NVIDIA GPU, 6144, 500');
  await settled(engine);
  assert.equal(preparations(), 0);
  assert.equal(writes.at(-1).status, 'cancelled');
});
test('failed automatic preparation returns an actionable error without launching inference', async t => {
  const { engine, writes } = await fixture(t);
  engine.prepare = async () => engine.update({ ready: false, error: '다운로드 연결에 문제가 있습니다.' });
  await engine.startAutomatic('one'); await settled(engine);
  assert.equal(writes.at(-1).status, 'failed');
  assert.match(engine.state.error, /연결/);
  assert.equal(engine.state.task, null);
});
