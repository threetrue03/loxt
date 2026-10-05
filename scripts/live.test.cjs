const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const vm = require('node:vm');
const { Library } = require('../electron/library.cjs');
const { LiveWindows } = require('../electron/live-windows.cjs');
const { LiveEngine } = require('../electron/live-engine.cjs');
const { ConversionQueue } = require('../electron/conversion-queue.cjs');
const { Transcriber } = require('../electron/transcriber.cjs');
const { MODELS } = require('../electron/transcription-config.cjs');
const frame = (seconds = .1, value = 5000) => { const bytes = Buffer.alloc(Math.round(seconds * 32000)); for (let i = 0; i < bytes.length; i += 2) bytes.writeInt16LE(value, i); return bytes; };
async function store() { await fs.mkdir('test-results', { recursive: true }); return new Library(await fs.mkdtemp(path.resolve('test-results/live-unit-'))); }
async function fixture(start = true) {
  const library = await store(), held = [];
  const engine = { operation: null, preferences: { model: 'small', device: 'auto' }, state: { model: 'small', ready: true, device: 'cuda', computeType: 'int8_float16' },
    auxiliary: { prepare: async () => {}, diarize: async (_, segments) => segments },
    get busy() { return Boolean(this.operation); }, update(value) { Object.assign(this.state, value); },
    async configure(value) { this.preferences = value; this.state.model = value.model; }, kill() {},
  };
  const queue = { active: null, paused: false, pause() { this.paused = true; }, resume() { this.paused = false; } };
  const live = new LiveEngine(engine, queue, library, () => {});
  live.openWorker = async () => { live.workerExit = Promise.resolve(); live.child = { killed: false, stdin: { writable: true, write(line) { held.push(JSON.parse(line)); }, end() {} } }; };
  if (start) { await live.prepare({ model: 'large-v3-turbo' }); await live.start({ title: 'Live test', model: 'large-v3-turbo' }); }
  async function append(bytes) { await live.append({ id: live.state.id, sequence: live.accepted, bytes }); }
  async function reply(words) { await live.receive({ seq: live.pending.seq, segments: [{ words }] }); }
  return { library, engine, queue, live, held, append, reply };
}

test('PCM WAV preserves header and samples, derives duration, and recovers confirmed script after a crash', async () => {
  const library = await store(); const { id } = await library.beginRecording({ title: 'Live', mime: 'audio/wav' });
  const bytes = frame(.5); await library.appendRecording({ id, sequence: 0, bytes });
  await assert.rejects(library.appendRecording({ id, sequence: 1, bytes: Buffer.alloc(3) }));
  await assert.rejects(library.appendRecording({ id, sequence: 2, bytes }));
  await library.checkpointLive(id, [{ start: 0, end: .5, text: '복구 테스트' }]);
  await library.appendRecording({ id, sequence: 1, bytes });
  await library.abandonRecording(id);
  const recovered = new Library(library.root); const note = (await recovered.list()).notes[0];
  assert.equal(note.seconds, 1); assert.equal(note.recovered, true); assert.equal(note.done, true);
  assert.equal(note.segments[0].text, '복구 테스트');
  const wav = await fs.readFile((await recovered.getAudio(id)).filename);
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF'); assert.equal(wav.readUInt32LE(40), 32000);
  assert.deepEqual(wav.subarray(44), Buffer.concat([bytes, bytes]));
  const second = await recovered.beginRecording({ title: 'duration', mime: 'audio/wav' });
  await recovered.appendRecording({ id: second.id, sequence: 0, bytes });
  assert.equal((await recovered.finishRecording({ id: second.id, seconds: 999 })).note.seconds, .5);
});

test('Live scheduler previews every 2 seconds, holds .6 seconds at hard boundaries, finalizes after .5 seconds silence', () => {
  const windows = new LiveWindows(), jobs = [];
  for (let i = 0; i < 60; i++) { const job = windows.append(frame()); if (job) jobs.push(job); }
  assert.deepEqual(jobs.map(job => [job.end, job.final]), [[2, false], [4, false], [6, true]]);
  assert.equal(jobs[2].cutoff, 5.4);
  for (let i = 0; i < 20; i++) { const job = windows.append(frame()); if (job) jobs.push(job); }
  assert.equal(jobs.at(-1).start, 4.8); assert.ok(jobs.at(-1).pcm.length <= 7 * 32000);
  for (let i = 0; i < 5; i++) { const job = windows.append(frame(.1, 0)); if (job) jobs.push(job); }
  assert.equal(jobs.at(-1).final, true); assert.equal(jobs.at(-1).cutoff, 8.5);
  const short = new LiveWindows(); short.append(frame(.2));
  for (let i = 0; i < 15; i++) assert.equal(short.append(frame(.1, 0)), null);
  const quiet = new LiveWindows(); for (let i = 0; i < 120; i++) assert.equal(quiet.append(frame(.1, 0)), null);
});

test('AudioWorklet downsamples 48k and 44.1k stereo to mono 16k and pause excludes paused audio', async () => {
  const code = await fs.readFile('public/live-capture-worklet.js', 'utf8');
  for (const rate of [48000, 44100]) {
    let Processor; const emitted = [];
    vm.runInNewContext(code, { sampleRate: rate, Int16Array, AudioWorkletProcessor: class { constructor() { this.port = { postMessage: value => emitted.push(value) }; } }, registerProcessor: (_, value) => { Processor = value; } });
    const node = new Processor(); const input = [new Float32Array(rate).fill(.25), new Float32Array(rate).fill(.75)];
    node.process([input]); node.port.onmessage({ data: { type: 'pause', token: 1 } });
    assert.equal(emitted.filter(item => item.type === 'pcm').reduce((sum, item) => sum + item.samples.length, 0), 16000);
    assert.equal(emitted[0].samples[0], 16384); const count = emitted.length;
    node.process([input]); assert.equal(emitted.length, count);
    node.port.onmessage({ data: { type: 'resume' } }); node.process([input]); node.port.onmessage({ data: { type: 'flush', token: 2 } });
    assert.equal(emitted.filter(item => item.type === 'pcm').reduce((sum, item) => sum + item.samples.length, 0), 32000);
  }
});

test('Live confirms aligned words once, keeps newer preview separate and saves exact sample time', async () => {
  const { live, append, reply, engine, queue, library } = await fixture();
  for (let i = 0; i < 20; i++) await append(frame());
  await reply([{ start: 0, end: 1, text: ' 첫 문장' }]); assert.equal(live.state.preview.length, 1); assert.equal(live.state.segments.length, 0);
  for (let i = 0; i < 5; i++) await append(frame(.1, 0));
  await reply([{ start: 0, end: 1, text: ' 첫 문장' }]); assert.equal(live.state.segments.length, 1); assert.equal(live.state.preview.length, 0);
  for (let i = 0; i < 20; i++) await append(frame());
  await reply([{ start: 0, end: .2, text: ' 첫 문장' }, { start: 1, end: 2, text: ' 다음 문장' }]);
  // Overlap is filtered against the confirmed end; stopping requests a final pass.
  const done = live.finish(live.state.id); await new Promise(resolve => setTimeout(resolve, 10));
  await reply([{ start: 1, end: 2, text: ' 다음 문장' }]); const result = await done;
  assert.equal(result.note.seconds, 4.5); assert.equal(result.note.done, true);
  assert.ok(result.note.segments.every(segment => segment.end <= 4.5));
  assert.equal((await library.list()).notes.length, 1); assert.equal(queue.paused, false); assert.equal(engine.preferences.model, 'small');
});

test('worker failure retains original and confirmed words, and saving can be retried after metadata failure', async () => {
  const { live, append, library } = await fixture();
  for (let i = 0; i < 5; i++) await append(frame());
  live.fail(new Error('GPU stopped')); await append(frame());
  const complete = library.completeTranscription.bind(library); let first = true;
  library.completeTranscription = async (...args) => { if (first) { first = false; throw new Error('temporary disk failure'); } return complete(...args); };
  await assert.rejects(live.finish(live.state.id), /disk failure/); assert.equal(live.state.stage, 'error');
  const result = await live.finish(live.state.id); assert.equal(result.note.seconds, .6); assert.equal(result.note.status, 'failed');
  assert.equal((await fs.stat((await library.getAudio(result.note.id)).filename)).size, 44 + 19200);
});

test('cancel while waiting for Work leaves Work active and releases the queue without an orphan recording', async () => {
  const { live, queue, library } = await fixture(); await live.finish(live.state.id);
  queue.active = { id: 'work' }; const starting = live.prepare({ model: 'large-v3-turbo' }); const rejected = starting.catch(error => error);
  const result = await live.finish(null); assert.equal(result.canceled, true); assert.ok(await rejected instanceof Error);
  assert.equal(queue.active.id, 'work'); assert.equal(queue.paused, false); assert.equal(library.sessions.size, 0);
});

test('final speaker analysis failure still saves audio/script and releases the GPU queue', async () => {
  const { live, engine, append, reply, queue, library } = await fixture();
  for (let i = 0; i < 5; i++) await append(frame(.1,0));
  engine.auxiliary.diarize = async () => { throw new Error('speaker engine unavailable'); };
  const finishing=live.finish(live.state.id);
  await new Promise(resolve=>setTimeout(resolve,10));
  await reply([{start:0,end:.3,text:'저장된 스크립트',speaker:'A'}]);
  const result=await finishing;
  assert.equal(result.note.done,true);assert.equal(result.note.status,'partial');assert.match(result.note.diarization.error,/speaker engine/);
  assert.equal(result.note.segments[0].text,'저장된 스크립트');assert.equal(queue.paused,false);assert.equal(live.state.stage,'done');
  assert.equal((await fs.stat((await library.getAudio(result.note.id)).filename)).size,44+16000);
});

test('Work jobs submitted during Live stay queued, cancel safely, and start only after resume', async () => {
  const library = await store(), file = path.join(library.root, 'source.wav'); await fs.writeFile(file, 'source');
  const one = (await library.importAudio(file, '')).note, two = (await library.importAudio(file, '')).note, runs = [];
  const engine = { state: { model: 'small' }, operation: 'live', get busy() { return Boolean(this.operation); }, snapshot() { return { ...this.state, operation: this.operation, busy: this.busy }; }, catalogue: async () => MODELS, configure: async () => {}, startAutomatic: async id => { runs.push(id); }, cancel() {} };
  const queue = new ConversionQueue(engine, library, () => {}); queue.pause();
  await queue.enqueue(one.id); await queue.enqueue(two.id); assert.deepEqual(runs, []); assert.equal(queue.snapshot().queue.length, 2);
  await queue.cancel(two.id); engine.operation = null; queue.resume();
  await new Promise(resolve => setTimeout(resolve, 20)); assert.deepEqual(runs, [one.id]);
});

test('Live transient model selection never replaces saved Work preferences, including before a crash', async () => {
  const library = await store(); const engine = new Transcriber({ root: library.root, resources: path.resolve('python'), library });
  engine.run = async () => { throw new Error('no GPU'); };
  await engine.configure({ model: 'small', device: 'auto' });
  const settings = await fs.readFile(path.join(library.root, 'settings.json'));
  await engine.configure({ model: 'large-v3-turbo', device: 'auto' }, { persist: false });
  assert.equal(engine.state.model, 'large-v3-turbo'); assert.deepEqual(await fs.readFile(path.join(library.root, 'settings.json')), settings);
  const restarted = new Transcriber({ root: library.root, resources: path.resolve('python'), library }); restarted.run = engine.run;
  assert.equal((await restarted.detect()).model, 'small');
});

test('model preparation creates no audio and requires a separate matching-model start', async () => {
  const { live, library, queue } = await fixture(false);
  await assert.rejects(live.start({ model: 'large-v3-turbo' }), /먼저 준비/);
  await live.prepare({ model: 'large-v3-turbo' });
  assert.equal(live.state.stage, 'ready'); assert.equal(live.state.seconds, 0); assert.equal(live.state.id, null);
  assert.equal(library.sessions.size, 0); assert.deepEqual((await library.list()).notes, []);
  assert.throws(() => live.append({ id: null, sequence: 0, bytes: frame() }), /진행 중/);
  await assert.rejects(live.start({ model: 'small' }), /먼저 준비/);
  await live.finish(null); assert.equal(queue.paused, false); assert.equal(live.state.stage, 'idle');
  await live.prepare({ model: 'small' });
  const running = await live.start({ title: 'second click', model: 'small' });
  assert.ok(running.id); assert.equal(library.sessions.size, 1);
  await live.finish(running.id);
});

test('preparation forwards only measured download progress, clears loading progress and retries failures', async () => {
  const { live, engine, library, queue } = await fixture(false);
  const updates = []; live.notify = state => updates.push(state);
  engine.state.ready = false;
  engine.prepare = async () => {
    engine.state.stage = 'downloading'; engine.state.progress = 42; live.environmentChanged();
    engine.state.stage = 'checking'; engine.state.progress = null; live.environmentChanged();
    engine.state.ready = true;
  };
  const open = live.openWorker;
  live.openWorker = async () => { assert.equal(live.state.progress, null); assert.equal(live.state.preparationPhase, 'loading'); throw new Error('GPU memory'); };
  await assert.rejects(live.prepare({ model: 'large-v3-turbo' }), /GPU memory/);
  assert.ok(updates.some(state => state.progress === 42)); assert.equal(live.state.stage, 'idle'); assert.equal(queue.paused, false); assert.equal(library.sessions.size, 0);
  live.openWorker = open; await live.prepare({ model: 'large-v3-turbo' });
  assert.equal(live.state.stage, 'ready'); assert.equal(live.state.error, ''); await live.finish(null);
});
