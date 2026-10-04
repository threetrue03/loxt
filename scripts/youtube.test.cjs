const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { Library } = require('../electron/library.cjs');
const { MODELS } = require('../electron/transcription-config.cjs');
const { YouTubeImports, youtubeUrl, videoInfo, friendlyError } = require('../electron/youtube.cjs');
const url = 'https://www.youtube.com/watch?v=jNQXAC9IVRw';
const raw = { id: 'jNQXAC9IVRw', title: '공개 영상', uploader: '테스트 채널', duration: 19, availability: 'public', live_status: 'not_live' };
async function until(check) { for (let i = 0; i < 600; i++) { if (await check()) return; await new Promise(resolve => setTimeout(resolve, 5)); } assert.fail('Import did not reach the expected state'); }
async function fixture(t, runner, enqueue) {
  await fs.mkdir('test-results', { recursive: true });
  const root = await fs.mkdtemp(path.resolve('test-results/youtube-'));
  const library = new Library(path.join(root, 'library')); await library.ready;
  const events = [], submitted = [];
  const queue = { engine: { preferences: { model: 'small' }, catalogue: async () => MODELS }, enqueue: enqueue || (async job => { submitted.push(job); }) };
  const manager = new YouTubeImports({ root: path.join(root, 'imports'), executable: 'test-only', library, queue, runner, notify: event => events.push(event) });
  t.after(() => manager.shutdown());
  return { root, library, manager, events, submitted };
}
const lookup = options => options.onLine(JSON.stringify(raw));
test('closing a metadata lookup stops its worker and a subsequent lookup can retry', async t => {
  let release, stopped = false, first = true;
  const { manager } = await fixture(t, async (args, options) => {
    if (first) {
      first = false;
      await new Promise(resolve => { release = resolve; options.onChild({ kill: () => { stopped = true; resolve(); } }); });
    }
    lookup(options);
  });
  const pending = manager.inspect(url);
  await until(() => Boolean(release)); manager.cancelInspect();
  await assert.rejects(pending, /취소/); assert.equal(stopped, true);
  assert.equal((await manager.inspect(url)).title, raw.title);
});
test('YouTube URLs canonicalize one video and reject unrelated domains, commands, shorts and playlists', () => {
  for (const input of [url, 'https://youtu.be/jNQXAC9IVRw?t=8', 'https://m.youtube.com/watch?v=jNQXAC9IVRw&list=ignored']) assert.equal(youtubeUrl(input), url);
  for (const input of ['file:///C:/secret', 'https://youtube.com.evil.test/watch?v=jNQXAC9IVRw', 'https://evil.test', 'https://www.youtube.com/playlist?list=ABC', 'https://www.youtube.com/shorts/jNQXAC9IVRw', 'https://user:pass@youtube.com/watch?v=jNQXAC9IVRw', 'https://youtube.com:8443/watch?v=jNQXAC9IVRw', '--exec whoami', null]) assert.throws(() => youtubeUrl(input));
  for (const change of [{ is_live: true }, { was_live: true }, { live_status: 'is_upcoming' }, { availability: 'private' }, { _type: 'playlist' }, { duration: NaN }, { id: 'another-id' }]) assert.throws(() => videoInfo({ ...raw, ...change }, url));
  assert.match(friendlyError(new Error('Sign in to confirm you are not a bot')), /추가 확인/);
});
test('download preserves title/source/duration, queues chosen model, cleans temporary audio and survives restart', async t => {
  let worker, argsUsed;
  const { root, library, manager, events, submitted } = await fixture(t, async (args, options) => {
    if (args.includes('--skip-download')) return lookup(options);
    argsUsed = args; options.onLine('LOXT:512:1024:NA:NA:NA');
    await new Promise(resolve => { worker = resolve; });
    await fs.writeFile(args[args.indexOf('-o') + 1].replace('%(ext)s', 'm4a'), 'audio bytes');
  });
  await library.createFolder('강의');
  const info = await manager.inspect('https://youtu.be/jNQXAC9IVRw');
  const result = await manager.start({ token: info.token, folder: '강의', model: 'large-v3-turbo' });
  await until(() => Boolean(worker)); assert.equal(manager.snapshot().jobs[0].progress, 50);
  assert.equal((await library.list()).notes.length, 0, 'No incomplete imported recording');
  await assert.rejects(manager.start({ token: info.token, folder: '', model: 'small' }), /만료|처리/);
  worker(); await until(() => !manager.hasJobs);
  assert.equal(submitted.length, 1); assert.equal(submitted[0].model, 'large-v3-turbo');
  const note = (await library.list()).notes[0];
  assert.equal(note.title, raw.title); assert.equal(note.folder, '강의'); assert.equal(note.seconds, 19); assert.equal(note.source.url, url);
  assert.equal(await fs.readFile((await library.getAudio(note.id)).filename, 'utf8'), 'audio bytes');
  assert.equal((await fs.readdir(path.join(root, 'imports'))).length, 0);
  assert.equal((await new Library(library.root).list()).notes[0].source.url, url);
  assert.ok(events.some(event => event.completed?.noteId === note.id));
  assert.equal(argsUsed.at(-1), url); assert.match(argsUsed[argsUsed.indexOf('-f') + 1], /bestaudio/);
  assert.equal(events.some(event => JSON.stringify(event).includes('test-results')), false, 'Renderer events contain no local paths');
  assert.equal(manager.snapshot().jobs.some(job => job.id === result.id), false);
});
test('active and waiting cancellation never imports audio or submits inference; later jobs continue', async t => {
  const releases = [];
  const { library, manager, submitted } = await fixture(t, async (args, options) => {
    if (args.includes('--skip-download')) return lookup(options);
    await new Promise(resolve => releases.push(resolve));
    await fs.writeFile(args[args.indexOf('-o') + 1].replace('%(ext)s', 'webm'), 'downloaded');
  });
  const jobs = [];
  for (let i = 0; i < 3; i++) jobs.push(await manager.start({ token: (await manager.inspect(url)).token, model: 'small' }));
  await until(() => releases.length === 1); manager.cancel(jobs[0].id); manager.cancel(jobs[1].id);
  releases[0](); await until(() => releases.length === 2); releases[1](); await until(() => !manager.hasJobs);
  assert.equal((await library.list()).notes.length, 1); assert.equal(submitted.length, 1);
});
test('failed download is actionable; failed conversion submission retains downloaded audio and source', async t => {
  let fail = true;
  const { manager, library, events } = await fixture(t, async (args, options) => {
    if (args.includes('--skip-download')) return lookup(options);
    if (fail) throw new Error('Sign in to confirm you are not a bot');
    await fs.writeFile(args[args.indexOf('-o') + 1].replace('%(ext)s', 'm4a'), 'retained audio');
  }, async () => { throw new Error('model unavailable'); });
  await manager.start({ token: (await manager.inspect(url)).token, model: 'small' }); await until(() => !manager.hasJobs);
  assert.equal((await library.list()).notes.length, 0); assert.match(events.at(-1).completed.error, /추가 확인/);
  fail = false; await manager.start({ token: (await manager.inspect(url)).token, model: 'small' }); await until(() => !manager.hasJobs);
  assert.equal((await library.list()).notes.length, 1); assert.match(events.at(-1).completed.error, /음성은 보관함에 저장/);
  await assert.rejects(manager.start({ token: (await manager.inspect(url)).token, model: '../../model' }), /모델/);
});
