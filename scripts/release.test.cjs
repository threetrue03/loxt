const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { Library } = require('../electron/library.cjs');
const { Transcriber } = require('../electron/transcriber.cjs');
const { validateSettings, recommendation, computeType } = require('../electron/transcription-config.cjs');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
async function profile() { await fs.mkdir('test-results', { recursive: true }); return fs.mkdtemp(path.resolve('test-results/release-')); }

test('Python worker stops when its owning process exits unexpectedly', { skip: process.platform !== 'win32', timeout: 15000 }, async () => {
  const parent = spawn(process.execPath, ['-e', 'setTimeout(() => process.exit(0), 4000)'], { windowsHide: true, stdio: 'ignore' });
  const worker = spawn(path.resolve('.runtime/python/python.exe'), ['-u', '-c', 'import sys,time; from watchdog import watch_parent; watch_parent(int(sys.argv[1])); print("ready", flush=True); time.sleep(60)', String(parent.pid)], { cwd: path.resolve('python'), windowsHide: true });
  let output = ''; worker.stdout.on('data', chunk => { output += chunk; });
  try {
    const [code] = await once(worker, 'exit');
    assert.equal(code, 1); assert.match(output, /ready/);
  } finally { worker.kill(); parent.kill(); }
});

test('unsupported paths/settings are rejected; hardware recommendations and supported compute types', () => {
  assert.throws(() => validateSettings({ model: '../../library', device: 'cpu' }));
  assert.throws(() => validateSettings({ model: 'tiny', device: 'amd' }));
  assert.equal(recommendation(null, 16 * 1024 ** 3).device, 'cpu');
  assert.equal(recommendation({ memory: 6144 }, 16 * 1024 ** 3).model, 'large-v3-turbo');
  assert.equal(recommendation({ memory: 12288 }, 16 * 1024 ** 3).model, 'large-v3');
  assert.equal(recommendation(null, 16 * 1024 ** 3).model, 'small');
  assert.equal(computeType('cuda', ['float16', 'int8_float16']), 'int8_float16');
  assert.equal(computeType('cpu', ['int8', 'float32']), 'int8');
});

test('interrupted retranscription preserves successful text and the original; retry completes', async () => {
  const root = await profile();
  const source = path.join(root, 'original.wav');
  await fs.writeFile(source, 'immutable original bytes');
  let library = new Library(path.join(root, 'library'));
  const { note } = await library.importAudio(source, '');
  const result = { segments: [{ start: 0, end: 1, text: '완료된 전사문' }], seconds: 1, language: 'ko', model: 'tiny', device: 'cpu', compute_type: 'int8' };
  await library.completeTranscription(note.id, result);
  await library.setTranscription(note.id, { status: 'transcribing' });
  library = new Library(path.join(root, 'library'));
  let saved = (await library.list()).notes[0];
  assert.equal(saved.status, 'failed'); assert.equal(saved.done, true);
  assert.deepEqual(saved.segments, result.segments); assert.match(saved.transcriptionError, /중단/);
  assert.equal(await fs.readFile((await library.getAudio(note.id)).filename, 'utf8'), 'immutable original bytes');
  await library.setTranscription(note.id, { status: 'cancelled' });
  saved = (await library.list()).notes[0]; assert.equal(saved.done, true); assert.deepEqual(saved.segments, result.segments);
  await library.completeTranscription(note.id, { ...result, segments: [{ start: 0, end: 1, text: '재시도 결과' }] });
  assert.equal((await library.list()).notes[0].status, 'done');
});

test('no NVIDIA GPU selects CPU; settings persist; busy changes and invalid deletion are blocked', async () => {
  const root = await profile();
  const resources = path.resolve('python');
  const transcriber = new Transcriber({ root, resources });
  transcriber.run = async () => { throw new Error('no NVIDIA GPU'); };
  let state = await transcriber.detect(); assert.equal(state.device, 'cpu'); assert.equal(state.ready, false);
  await transcriber.configure({ model: 'tiny', device: 'cpu' });
  const next = new Transcriber({ root, resources }); next.run = transcriber.run;
  state = await next.detect(); assert.equal(state.model, 'tiny'); assert.equal(state.devicePreference, 'cpu');
  next.operation = 'transcribe';
  await assert.rejects(next.configure({ model: 'base', device: 'auto' }), /작업/);
  await assert.rejects(next.deleteModel('tiny'), /작업/);
  next.operation = null;
  await assert.rejects(next.deleteModel('../library'), /모델/);
  const retained = path.join(root, 'library', 'recordings'); await fs.mkdir(retained, { recursive: true });
  await fs.writeFile(path.join(retained, 'original'), 'keep');
  const model = path.join(root, 'models', 'tiny'); await fs.mkdir(model, { recursive: true });
  await fs.writeFile(path.join(model, 'model.bin.part'), 'partial');
  assert.equal((await next.modelList()).find(m => m.id === 'tiny').partial, true);
  await next.deleteModel('tiny');
  assert.equal(await fs.readFile(path.join(retained, 'original'), 'utf8'), 'keep');
  assert.equal((await next.modelList()).find(m => m.id === 'tiny').partial, false);
  const remove = fs.rm;
  let lastState;
  next.onChange = value => { lastState = value; };
  fs.rm = async () => { throw new Error('EACCES'); };
  try { await assert.rejects(next.deleteModel('tiny'), /EACCES/); }
  finally { fs.rm = remove; }
  assert.equal(lastState.busy, false); assert.equal(lastState.ready, false);
});

test('model installation validates selection, uses shared cache and preserves preferences; cancellation/failure return idle', async () => {
  const root = await profile();
  const transcriber = new Transcriber({ root, resources: path.resolve('python') });
  transcriber.run = async () => { throw new Error('no GPU'); };
  await transcriber.configure({ model: 'medium', device: 'cpu' });
  const before = await fs.readFile(path.join(root, 'settings.json'), 'utf8');
  for (const names of [[], ['../library'], ['medium'], null]) await assert.rejects(transcriber.installModels(names), /모델/);
  transcriber.operation = 'prepare';
  await assert.rejects(transcriber.installModels(['small']), /작업/);
  transcriber.operation = null;
  transcriber.basePython = async () => 'bundled-python';
  const states = [];
  transcriber.onChange = state => states.push(state);
  const detect = transcriber.detect.bind(transcriber);
  transcriber.detect = async () => {
    const run = transcriber.run;
    transcriber.run = async () => { throw new Error('no GPU'); };
    try { return await detect(); } finally { transcriber.run = run; }
  };
  transcriber.run = async (command, args, line) => {
    assert.equal(command, 'bundled-python');
    assert.equal(args[args.indexOf('--root') + 1], path.join(root, 'models'));
    assert.equal(args[args.indexOf('--models') + 1], 'small,large-v3-turbo');
    line(JSON.stringify({ type: 'model-start', model: 'small', index: 1, total: 2 }));
    line(JSON.stringify({ type: 'download', current: 5, total: 10 }));
    line(JSON.stringify({ type: 'models-installed', models: ['small', 'large-v3-turbo'] }));
    assert.ok(args.includes('--prepare'));
    line(JSON.stringify({ type: 'environment-ready', selected_ready: false }));
  };
  let state = await transcriber.installModels(['small', 'small', 'large-v3-turbo']);
  assert.equal(state.busy, false); assert.equal(state.error, ''); assert.equal(state.model, 'medium');
  assert.ok(states.some(state => state.operation === 'download' && state.progress === 50));
  assert.equal(await fs.readFile(path.join(root, 'settings.json'), 'utf8'), before);
  transcriber.run = async () => { throw new Error('connection timeout'); };
  state = await transcriber.installModels(['small']);
  assert.equal(state.busy, false); assert.match(state.error, /연결/);
  transcriber.run = async () => { transcriber.cancel(); throw new Error('cancelled'); };
  state = await transcriber.installModels(['small']);
  assert.equal(state.busy, false); assert.equal(state.error, ''); assert.match(state.message, /취소/);
});
