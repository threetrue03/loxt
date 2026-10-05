const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { WorkspacePreferences } = require('../electron/workspace-preferences.cjs');
const { ModelActions } = require('../electron/model-actions.cjs');
const { SettingsSupport, directoryUsage, diagnosticInfo } = require('../electron/settings-support.cjs');
const { Transcriber } = require('../electron/transcriber.cjs');
const { ConversionQueue } = require('../electron/conversion-queue.cjs');
async function root(t) { await fs.mkdir('test-results', { recursive: true }); const value = await fs.mkdtemp(path.resolve('test-results/settings-unit-')); t.after(() => fs.rm(value, { recursive: true, force: true })); return value; }

test('legacy Work selection migrates once; concurrent per-mode saves survive restart', async t => {
  const base = await root(t); await fs.mkdir(path.join(base, 'transcription'));
  await fs.writeFile(path.join(base, 'transcription/settings.json'), '{"model":"medium","device":"cpu"}');
  const store = new WorkspacePreferences(base);
  assert.equal(store.snapshot().work.model, 'medium'); assert.equal(store.snapshot().live.model, 'large-v3-turbo');
  await store.migrate({ work: { microphone: 'device-old', layout: 'list' }, live: { layout: 'compact' } });
  await Promise.all([store.set('work', { model: 'small' }), store.set('live', { model: 'large-v3', microphone: '__system__' }), store.set('work', { layout: 'cards' })]);
  const reopened = new WorkspacePreferences(base).snapshot();
  assert.deepEqual(reopened.work, { model: 'small', microphone: 'device-old', layout: 'cards' });
  assert.deepEqual(reopened.live, { model: 'large-v3', microphone: '__system__', layout: 'compact' });
  await store.migrate({ work: { layout: 'list', microphone: 'overwrite' } });
  assert.deepEqual(store.snapshot().work, reopened.work);
  assert.equal(await fs.readFile(path.join(base, 'transcription/settings.json'), 'utf8'), '{"model":"medium","device":"cpu"}');
});
test('failed save retains the applied value and a successful retry recovers', async t => {
  const store = new WorkspacePreferences(await root(t)); await store.set('work', { layout: 'compact' });
  await fs.mkdir(store.filename + '.tmp');
  await assert.rejects(store.set('work', { layout: 'list' })); assert.equal(store.snapshot().work.layout, 'compact');
  assert.equal(new WorkspacePreferences(path.dirname(store.filename)).snapshot().work.layout, 'compact');
  await fs.rmdir(store.filename + '.tmp'); await store.set('work', { layout: 'list' }); assert.equal(store.snapshot().work.layout, 'list');
});
test('corrupt preferences are preserved before explicit recovery', async t => {
  const base = await root(t), filename = path.join(base, 'workspace-preferences.json'); await fs.writeFile(filename, 'corrupt retained bytes');
  const store = new WorkspacePreferences(base); assert.ok(store.snapshot().error);
  await store.migrate({ work: { layout: 'list' } }); assert.equal(await fs.readFile(filename, 'utf8'), 'corrupt retained bytes');
  await store.set('work', { layout: 'compact' });
  const backup = (await fs.readdir(base)).find(name => name.startsWith('workspace-preferences.json.invalid-'));
  assert.equal(await fs.readFile(path.join(base, backup), 'utf8'), 'corrupt retained bytes'); assert.equal(store.snapshot().error, '');
});
test('per-job queue model and transient configure never overwrite saved defaults', async t => {
  const base = await root(t), engineRoot = path.join(base, 'transcription'); await fs.mkdir(engineRoot);
  const saved = '{"model":"medium","device":"auto"}'; await fs.writeFile(path.join(engineRoot, 'settings.json'), saved);
  const prefs = new WorkspacePreferences(base); await prefs.set('work', { model: 'small' }); await prefs.set('live', { model: 'large-v3' });
  const engine = new Transcriber({ root: engineRoot, resources: base });
  engine.detect = async () => { engine.state.model = engine.preferences.model; return engine.snapshot(); };
  await engine.configure({ model: 'large-v3-turbo', device: 'auto' }, { persist: false });
  const library = { list: async () => ({ notes: [{ id: 'audio', title: 'private title' }] }), getAudio: async () => ({}), setTranscription: async () => {} };
  const queue = new ConversionQueue(engine, library, () => {}); queue.paused = true; queue.defaults = mode => prefs.snapshot()[mode].model;
  await queue.enqueue('audio'); assert.equal(queue.snapshot().queue[0].model, 'small');
  await queue.cancel('audio'); await queue.enqueue({ id: 'audio', workspace: 'live' }); assert.equal(queue.snapshot().queue[0].model, 'large-v3');
  assert.equal(await fs.readFile(path.join(engineRoot, 'settings.json'), 'utf8'), saved);
  assert.equal(prefs.snapshot().work.model, 'small'); assert.equal(prefs.snapshot().live.model, 'large-v3');
});
test('model actions reject duplicates, retain readable errors across restart, and report cancellation', async t => {
  const base = await root(t), actions = new ModelActions(base, () => {}); let release;
  const active = actions.run('install', 'small', () => new Promise(resolve => { release = resolve; }));
  await assert.rejects(actions.run('delete', 'small', async () => ({})), /현재 모델/); release({ canceled: true }); await active;
  assert.match(actions.snapshot().message, /취소/); assert.equal(actions.snapshot().pending, null);
  await assert.rejects(actions.run('delete', 'small', async () => { throw new Error('Error invoking remote method \'test\': Error: cannot remove model\n    at internal'); }));
  const next = new ModelActions(base, () => {}); assert.equal(next.snapshot().issues.small.text, 'cannot remove model');
  await next.run('delete', 'small', async () => ({})); assert.equal(next.snapshot().issues.small, undefined);
});
test('storage counts real bytes once, skips junctions, coalesces requests and caches without mutation', async t => {
  const base = await root(t), support = new SettingsSupport(base), dirs = support.locations();
  for (const dir of Object.values(dirs)) await fs.mkdir(dir, { recursive: true });
  const audio = path.join(dirs.work, 'audio.wav'); await fs.writeFile(audio, Buffer.alloc(24)); await fs.link(audio, path.join(dirs.live, 'shared.wav'));
  await fs.writeFile(path.join(dirs.live, 'other.wav'), Buffer.alloc(11)); await fs.writeFile(path.join(dirs.models, 'model.bin'), Buffer.alloc(50));
  await fs.symlink(dirs.models, path.join(dirs.work, 'outside'), 'junction');
  const [a, b] = await Promise.all([support.storage(), support.storage()]); assert.equal(a, b);
  assert.equal(a.rows.reduce((sum, row) => sum + row.bytes, 0), 85); assert.equal(a.rows[0].skipped, 1); assert.equal(a.rows[1].skipped, 1);
  await fs.writeFile(path.join(dirs.work, 'new.wav'), Buffer.alloc(5)); assert.equal(await support.storage(), a);
  assert.equal((await support.storage(true)).rows.reduce((sum, row) => sum + row.bytes, 0), 90);
  assert.equal((await fs.readFile(audio)).length, 24); assert.equal((await directoryUsage(path.join(dirs.work, 'outside'))).bytes, 0);
  await assert.rejects(support.existingLog(), /로그가 없습니다/);
});
test('invalid action journal cannot lock model actions; journal write failure is explained', async t => {
  const base = await root(t); await fs.writeFile(path.join(base, 'model-actions.json'), '{"issues":null}');
  const actions = new ModelActions(base, () => {}); await fs.mkdir(actions.filename + '.tmp');
  await actions.run('default', 'small', async () => ({}), 'live');
  assert.equal(actions.snapshot().pending, null); assert.match(actions.snapshot().message, /안내 기록을 저장하지 못했습니다/);
  await fs.rmdir(actions.filename + '.tmp');
  await assert.rejects(actions.run('default', 'small', async () => { throw Error('EACCES: private path'); }, 'live'));
  assert.equal(actions.snapshot().issues.small.mode, 'live'); assert.doesNotMatch(actions.snapshot().issues.small.text, /private path/);
});
test('diagnostics omit transcript, filenames, paths and unconfirmed execution claims', () => {
  const engine = new Transcriber({ root: 'private', resources: 'private' }); assert.equal(engine.state.device, null);
  engine.recordExecution({ device: 'cpu', model: 'small', compute_type: 'int8', filename: 'private-file.wav' }, 'work');
  const text = diagnosticInfo('1.12.0', { ...engine.snapshot(), gpu: { name: 'RTX test', memory: 6144 }, error: 'C:\\Users\\private\\file', title: 'private script', lastExecution: { device: 'cpu', model: 'small', filename: 'private-file.wav' } }, { work: { model: 'small' }, live: { model: 'large-v3-turbo' } });
  assert.equal(JSON.parse(text).lastExecution.device, 'cpu'); assert.doesNotMatch(text, /private|filename|Users|script/);
});
test('initial catalog and failed registry reads never claim a verified empty model list', async t => {
  const base = await root(t), engine = new Transcriber({ root: base, resources: base });
  assert.equal(engine.snapshot().modelsChecked, false);
  engine.run = async () => ''; await fs.writeFile(path.join(base, 'external-models.json'), 'corrupt registry');
  await assert.rejects(engine.detect(), /목록을 읽지 못했습니다/);
  assert.equal(engine.snapshot().busy, false); assert.equal(engine.snapshot().modelsChecked, false); assert.ok(engine.snapshot().error);
  await fs.writeFile(path.join(base, 'external-models.json'), '[]'); await engine.detect();
  assert.equal(engine.snapshot().modelsChecked, true); assert.equal(engine.snapshot().error, '');
});
