import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile, symlink } from 'node:fs/promises';
import path from 'node:path';
import { Library } from '../electron/library.cjs';

await mkdir('test-results', { recursive: true });
const data = await mkdtemp(path.resolve('test-results/background-'));
const fixture = path.resolve('test-results/korean-speech.wav');
const runtime = path.resolve('test-results/prepared-gpu-4yyczuvz/transcription');
const root = path.join(data, 'transcription');
await mkdir(path.join(root, 'models'), { recursive: true });
await symlink(path.join(runtime, 'venv'), path.join(root, 'venv'), 'junction');
await symlink(path.join(runtime, 'models/small'), path.join(root, 'models/small'), 'junction');
await writeFile(path.join(root, 'prepared.json'), await readFile(path.join(runtime, 'prepared.json')));
await writeFile(path.join(root, 'settings.json'), JSON.stringify({ model: 'small', device: 'auto' }));
const library = new Library(path.join(data, 'library')); await library.ready;
const notes = [];
for (let i = 0; i < 3; i++) {
  const { note } = await library.importAudio(fixture, '');
  await library.updateNote(note.id, { title: `대기열 검사 ${i + 1}` }); notes.push(note);
}
const env = { ...process.env, SORINOTE_TEST: '1', SORINOTE_TEST_DATA: data };
delete env.ELECTRON_RUN_AS_NODE; delete env.SORINOTE_DEV;
const executablePath = process.argv[2];
const app = await electron.launch({ ...(executablePath ? { executablePath: path.resolve(executablePath) } : {}), args: executablePath ? [] : ['.'], env });
const errors = [];
try {
  const page = await app.firstWindow(); page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));
  async function until(read, check, timeout = 120000) {
    const end = Date.now() + timeout;
    while (true) { const value = await read(); if (check(value)) return value; if (Date.now() > end) throw new Error('Background conversion timed out'); await page.waitForTimeout(100); }
  }
  await page.getByRole('heading', { name: '전체 녹음', exact: true }).waitFor();
  await until(() => page.evaluate(() => window.desktop.getTranscriptionEnvironment()), value => !value.busy);
  // Hold the first real CUDA worker until all UI interactions finish. Results remain unmodified.
  await app.evaluate(({ app }) => {
    const load = process.mainModule.require.bind(process.mainModule);
    const { Transcriber } = load(load('node:path').join(app.getAppPath(), 'electron/transcriber.cjs'));
    const run = Transcriber.prototype.run; let first = true;
    Transcriber.prototype.run = async function(command, args, ...rest) {
      if (args.includes('transcribe') && first) { first = false; await new Promise(resolve => { globalThis.__loxtReleaseQueue = resolve; }); if (this.cancelled) throw new Error('cancelled'); }
      return run.call(this, command, args, ...rest);
    };
  });
  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: `대기열 검사 ${i + 1} 열기`, exact: true }).click();
    assert.equal(await page.getByRole('button', { name: '녹음 장치 선택', exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: '내보내기', exact: true }).count(), 0);
    await page.getByRole('button', { name: '변환하기', exact: true }).click();
    await page.getByLabel('변환 모델', { exact: true }).selectOption('small');
    await page.getByRole('dialog').getByRole('button', { name: '변환하기', exact: true }).click();
    await page.getByRole('button', { name: '← 녹음 목록', exact: true }).click();
  }
  await page.getByLabel('추가 대기 2개', { exact: true }).waitFor();
  await page.getByRole('button', { name: '변환 작업 보기', exact: true }).click();
  assert.equal(await page.locator('.conversion-job').count(), 3);
  await page.getByRole('button', { name: '대기열 검사 3 변환 중단', exact: true }).click();
  await until(() => page.evaluate(() => window.desktop.getLibrary()), value => value.notes.find(note => note.id === notes[2].id)?.status === 'cancelled');
  await page.waitForFunction(() => document.querySelectorAll('.conversion-job').length === 2);
  assert.equal(await page.locator('.conversion-job').count(), 2);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.waitForTimeout(100);
  const image = await app.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0].webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG().toString('base64'));
  await writeFile(path.join(data, 'queue.png'), Buffer.from(image, 'base64'));
  await page.getByRole('button', { name: '닫기', exact: true }).click();
  await page.getByRole('button', { name: '설정', exact: true }).click();
  await page.getByRole('heading', { name: '일반', exact: true }).waitFor();
  await page.getByRole('button', { name: '변환 작업 보기', exact: true }).click();
  await page.getByRole('button', { name: '대기열 검사 2', exact: true }).click();
  await page.getByRole('textbox', { name: '녹음 제목 변경', exact: true }).waitFor();
  await until(() => app.evaluate(() => typeof globalThis.__loxtReleaseQueue), value => value === 'function');
  await app.evaluate(() => globalThis.__loxtReleaseQueue());
  const saved = await until(() => page.evaluate(() => window.desktop.getLibrary()), value => notes.slice(0, 2).every(note => value.notes.find(item => item.id === note.id)?.status === 'done'));
  await until(() => page.evaluate(() => window.desktop.getTranscriptionEnvironment()), value => !value.busy && !value.queue.length);
  for (const note of notes.slice(0, 2)) {
    const result = saved.notes.find(item => item.id === note.id);
    assert.equal(result.transcription.device, 'cuda'); assert.equal(result.transcription.model, 'small');
    assert.match(result.segments.map(segment => segment.text).join(' '), /한국어/);
    assert.deepEqual(await readFile((await library.getAudio(note.id)).filename), await readFile(fixture));
  }
  assert.equal(saved.notes.find(note => note.id === notes[2].id).done, false);
  await page.locator('.workspace-player:visible').waitFor();
  assert.equal(await page.getByRole('button', { name: '내보내기', exact: true }).count(), 1);
  assert.equal(await page.getByRole('button', { name: '변환 작업 보기', exact: true }).count(), 0);
  assert.deepEqual(errors, []);
  console.log('PASS: actual RTX 2060 serial queue, sidebar counts/list/cancellation, background navigation through settings, automatic completed player/export, unchanged originals');
  console.log('TEST_PROFILE', data);
} finally {
  await app.evaluate(({ BrowserWindow }) => { for (const window of BrowserWindow.getAllWindows()) window.destroy(); }).catch(() => {});
  await app.close().catch(() => {});
}
