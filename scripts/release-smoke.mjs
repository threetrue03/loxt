import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
const executablePath = path.resolve(process.argv[2] || 'release/stage5/win-unpacked/Sorinote.exe');
await mkdir('test-results', { recursive: true });
const data = process.argv[3] ? path.resolve(process.argv[3]) : await mkdtemp(path.resolve('test-results/fresh-install-'));
// PATH excludes all installed Python launchers: only the packaged runtime can bootstrap.
const env = { ...process.env, PATH: `${process.env.WINDIR}\\System32;${process.env.WINDIR}`, SORINOTE_TEST: '1', SORINOTE_TEST_DATA: data };
delete env.ELECTRON_RUN_AS_NODE; delete env.SORINOTE_DEV;
let app, page;
const errors = [];
async function launch() {
  app = await electron.launch({ executablePath, env });
  await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 0 }); });
  page = await app.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  await page.getByRole('heading', { name: '전체 녹음', exact: true }).waitFor();
  // Node-side polling avoids waiting on cross-world Promise objects.
  await idle();
}
async function idle() {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    const state = await page.evaluate(() => window.desktop.getTranscriptionEnvironment());
    if (!state.busy) return state;
    await page.waitForTimeout(100);
  }
  throw new Error('Environment did not become idle');
}
async function waitDone(id) {
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    const note = (await page.evaluate(() => window.desktop.getLibrary())).notes.find(n => n.id === id);
    if (note?.status === 'done') return note;
    if (note?.status === 'failed') throw new Error(note.transcriptionError);
    await page.waitForTimeout(200);
  }
  throw new Error('Transcription timed out');
}
async function screenshot(filename) {
  const encoded = await app.evaluate(async ({ BrowserWindow }) => {
    const image = await BrowserWindow.getAllWindows()[0].webContents.capturePage(undefined, { stayHidden: true, stayAwake: true });
    return image.toPNG().toString('base64');
  });
  await writeFile(path.join(data, filename), Buffer.from(encoded, 'base64'));
}
try {
  await launch();
  assert.equal((await page.evaluate(() => window.desktop.getLibrary())).notes.length, 0);
  // Legacy CPU models remain accessible when previously selected/installed.
  await page.evaluate(() => window.desktop.configureTranscription({ model: 'tiny', device: 'auto' }));
  await page.getByRole('button', { name: '설정', exact: true }).click();
  let state = await idle();
  assert.equal(state.devicePreference, 'auto'); assert.equal(state.model, 'tiny');
  if (!process.argv[3]) assert.equal(state.ready, false);
  console.log('PASS: packaged settings sidebar and legacy tiny model with automatic device');
  // Start via the same IPC as the button; the renderer displays the real download progress.
  state = await page.evaluate(() => window.desktop.prepareTranscription());
  assert.equal(state.ready, true, state.error);
  assert.equal(state.computeType, state.device === 'cuda' ? 'int8_float16' : 'int8');
  const config = await readFile(path.join(data, 'transcription', 'venv', 'pyvenv.cfg'), 'utf8');
  assert.ok(config.includes('python-base-3.13.16')); assert.ok(!config.includes('Python313'));
  console.log('PASS: fresh private engine installed using bundled Python, no system Python PATH');
  await page.getByRole('heading', { name: '모델 보관함', exact: true }).waitFor();
  await screenshot('settings.png');
  await page.getByRole('button', { name: '← 보관함으로 돌아가기', exact: true }).click();
  const fixture = path.resolve('test-results/korean-speech.wav');
  await app.evaluate(({ dialog }, filename) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filename] }); }, fixture);
  await page.getByRole('button', { name: '파일 불러오기', exact: true }).click();
  await page.getByRole('textbox', { name: '녹음 제목 변경', exact: true }).waitFor();
  const note = (await page.evaluate(() => window.desktop.getLibrary())).notes[0];
  await page.getByRole('button', { name: '전사하기', exact: true }).click();
  const done = await waitDone(note.id);
  await idle();
  assert.equal(done.transcription.device, state.device); assert.equal(done.transcription.model, 'tiny');
  assert.ok(done.segments.length > 0); assert.match(done.segments.map(s => s.text).join(' '), /안녕/);
  await page.getByRole('button', { name: '다시 전사', exact: true }).waitFor();
  assert.equal(await page.getByLabel('전사 모델', { exact: true }).inputValue(), 'tiny');
  await screenshot('cpu-transcript.png');
  const library = await page.evaluate(() => window.desktop.getLibrary());
  const raw = await readFile(path.join(library.storagePath, 'recordings', note.id, note.audioFile));
  assert.deepEqual(raw, await readFile(fixture));
  console.log('PASS: real Korean transcription, correct automatic device metadata, original unchanged');
  await page.evaluate(() => window.desktop.configureTranscription({ model: 'base', device: 'auto' }));
  state = await page.evaluate(() => window.desktop.getTranscriptionEnvironment()); assert.equal(state.ready, false);
  state = await page.evaluate(() => window.desktop.configureTranscription({ model: 'tiny', device: 'auto' })); assert.equal(state.ready, true);
  await app.close(); await launch();
  state = await idle();
  assert.equal(state.model, 'tiny'); assert.equal(state.devicePreference, 'auto'); assert.equal(state.ready, true);
  assert.deepEqual((await page.evaluate(() => window.desktop.getLibrary())).notes[0].segments, done.segments);
  console.log('PASS: switching back reuses installed model; restart preserves settings and text');
  await page.getByRole('button', { name: '설정', exact: true }).click();
  await page.getByRole('button', { name: 'tiny 모델 삭제', exact: true }).click();
  await page.getByRole('button', { name: '삭제 확인', exact: true }).click();
  state = await idle();
  assert.equal(state.ready, false); assert.equal(state.models.find(m => m.id === 'tiny').downloaded, false);
  assert.deepEqual((await page.evaluate(() => window.desktop.getLibrary())).notes[0].segments, done.segments);
  assert.deepEqual(await readFile(path.join(library.storagePath, 'recordings', note.id, note.audioFile)), raw);
  assert.deepEqual(errors, []);
  console.log('PASS: model deletion leaves audio/transcript intact; renderer has no errors');
  console.log('TEST_PROFILE', data);
} finally {
  await app?.evaluate(({ BrowserWindow }) => { for (const window of BrowserWindow.getAllWindows()) window.destroy(); }).catch(() => {});
  await app?.close().catch(() => {});
}
