import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Library } from '../electron/library.cjs';

await mkdir('test-results', { recursive: true });
const data = await mkdtemp(path.resolve('test-results/workspace-switch-'));
const work = new Library(path.join(data, 'library')); await work.ready;
await work.createFolder('회의');
const wav = Buffer.alloc(44 + 16000 * 8 * 2);
wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(16000, 24); wav.writeUInt32LE(32000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
const source = path.join(data, 'Work 기록.wav'); await writeFile(source, wav);
const { note } = await work.importAudio(source, '회의');
await work.completeTranscription(note.id, { seconds: 8, segments: [{ start: 0, end: 8, text: 'Work 전용 스크립트' }], model: 'small', language: 'ko', device: 'cpu', compute_type: 'int8' });
const before = await work.list();
const env = { ...process.env, SORINOTE_TEST: '1', SORINOTE_TEST_DATA: data }; delete env.ELECTRON_RUN_AS_NODE; delete env.SORINOTE_DEV;
const launch = () => electron.launch({ ...(process.argv[2] ? { executablePath: path.resolve(process.argv[2]) } : {}), args: [...(process.argv[2] ? [] : ['.']), '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${source}`], env });
let app = await launch();
try {
  await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 0 }); });
  let page = await app.firstWindow(); page.setDefaultTimeout(15000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const panel = mode => page.locator(`.workspace-panel[data-workspace="${mode}"]`);
  async function switchTo(mode) {
    await page.getByRole('button', { name: '워크스페이스 선택', exact: true }).click();
    await page.getByRole('menuitemradio', { name: new RegExp(mode === 'live' ? '^Live' : '^Work') }).click();
    await page.waitForFunction(mode => !document.querySelector(`[data-workspace="${mode}"]`).hidden, mode);
  }
  async function capture(name) {
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const bytes = await app.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0].webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG().toString('base64'));
    await writeFile(path.join(data, name), Buffer.from(bytes, 'base64'));
  }
  await page.getByRole('button', { name: 'Work 기록 열기', exact: true }).waitFor();
  await page.getByRole('button', { name: '워크스페이스 선택', exact: true }).click();
  assert.equal(await page.getByRole('menuitemradio', { name: /^Work/ }).getAttribute('aria-checked'), 'true');
  await capture('workspace-dropdown.png'); await page.keyboard.press('Escape');
  await switchTo('live'); await page.getByRole('heading', { name: 'Live 워크스페이스', exact: true }).waitFor();
  assert.equal(await panel('live').getByText('Work 기록', { exact: true }).count(), 0);
  assert.ok(await page.getByRole('button', { name: '새 Live 녹음', exact: true }).isEnabled());
  const liveBefore = await page.evaluate(() => window.desktop.live.getLibrary());
  assert.equal(liveBefore.storagePath, path.join(data, 'live-library'));
  assert.deepEqual(liveBefore.notes, []); assert.deepEqual(liveBefore.folders, []);
  assert.deepEqual(await page.evaluate(() => window.desktop.getLibrary()), before);
  await page.getByRole('button', { name: '새 폴더', exact: true }).click();
  await page.getByLabel('새 폴더 이름', { exact: true }).fill('회의'); await page.getByLabel('새 폴더 이름', { exact: true }).press('Enter');
  await panel('live').locator('.folder-card').filter({ hasText: '회의' }).waitFor();
  await panel('live').locator('.folder-card').filter({ hasText: '회의' }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: '이름 바꾸기', exact: true }).click();
  await page.getByLabel('폴더 이름 바꾸기', { exact: true }).fill('Live 회의'); await page.getByLabel('폴더 이름 바꾸기', { exact: true }).press('Enter');
  await page.getByRole('heading', { name: 'Live 회의', exact: true }).waitFor();
  await page.getByRole('button', { name: '새로 추가하기', exact: true }).click(); await page.getByRole('menuitem', { name: '폴더', exact: true }).click();
  await page.getByLabel('새 폴더 이름', { exact: true }).fill('하위'); await page.getByLabel('새 폴더 이름', { exact: true }).press('Enter');
  await panel('live').locator('.folder-card').filter({ hasText: '하위' }).waitFor();
  assert.deepEqual((await page.evaluate(() => window.desktop.getLibrary())).folders, ['회의']);
  await capture('live-library.png');
  await switchTo('work'); await page.getByRole('button', { name: 'Work 기록 열기', exact: true }).waitFor();
  await panel('work').locator('.sidebar-create').click(); await page.getByRole('textbox', { name: '녹음 제목', exact: true }).fill('전환 중 녹음');
  await page.getByRole('button', { name: '녹음 시작', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[data-workspace="work"] .clock')?.textContent >= '00:00:02');
  const clock = await panel('work').locator('.clock').textContent();
  await switchTo('live'); await page.getByRole('button', { name: 'Work 작업 진행 중', exact: true }).waitFor();
  await page.waitForFunction(clock => document.querySelector('[data-workspace="work"] .clock').textContent > clock, clock);
  await page.getByRole('button', { name: 'Work 작업 진행 중', exact: true }).click();
  assert.equal(await page.getByRole('textbox', { name: '녹음 제목', exact: true }).inputValue(), '전환 중 녹음');
  await page.getByRole('button', { name: '녹음 중단', exact: true }).click();await page.getByRole('button',{name:'변환하기',exact:true}).click(); await page.getByRole('dialog').waitFor();
  // Switching while the review dialog is open must close its focus trap, keeping audio paused.
  await switchTo('live'); assert.equal(await page.getByRole('dialog').count(), 0);
  await switchTo('work'); await page.getByRole('button', { name: '녹음 계속', exact: true }).click();
  await page.getByRole('button', { name: '녹음 중단', exact: true }).click();await page.getByRole('button',{name:'변환하기',exact:true}).click();
  await page.getByRole('dialog').getByRole('button', { name: '버리기', exact: true }).click();
  await page.getByRole('heading', { name: '홈', exact: true }).waitFor();
  assert.deepEqual((await page.evaluate(() => window.desktop.getLibrary())).notes.map(item => item.id), [note.id]);
  await switchTo('live');
  // Work conversion events must update hidden Work without mixing its notes into Live.
  const base = await page.evaluate(() => window.desktop.getTranscriptionEnvironment());
  await app.evaluate(({ BrowserWindow }, { base, id }) => BrowserWindow.getAllWindows()[0].webContents.send('transcription:state', { ...base, busy: true, task: { id }, queue: [{ id, status: 'active', progress: 30 }] }), { base, id: note.id });
  await page.getByRole('button', { name: 'Work 작업 진행 중', exact: true }).waitFor();
  assert.equal(await panel('live').getByText('Work 기록', { exact: true }).count(), 0);
  await app.evaluate(({ BrowserWindow }, base) => BrowserWindow.getAllWindows()[0].webContents.send('transcription:state', { ...base, busy: false, task: null, queue: [] }), base);
  await page.getByRole('button', { name: 'Work 작업 진행 중', exact: true }).waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: '홈', exact: true }).click(); await page.getByRole('heading', { name: '홈', exact: true }).waitFor();
  await page.getByRole('button', { name: '사이드바 접기', exact: true }).click();
  await switchTo('work'); assert.ok(await page.getByRole('button', { name: '사이드바 접기', exact: true }).count());
  await switchTo('live'); assert.ok(await page.getByRole('button', { name: '사이드바 펼치기', exact: true }).count());
  assert.deepEqual(errors, []);
  await app.close(); app = await launch(); page = await app.firstWindow(); page.setDefaultTimeout(15000);
  await page.getByRole('heading', { name: '홈', exact: true }).waitFor();
  await page.getByRole('button', { name: '워크스페이스 선택', exact: true }).click();
  assert.equal(await page.getByRole('menuitemradio', { name: /^Live/ }).getAttribute('aria-checked'), 'true');
  await page.keyboard.press('Escape');
  assert.deepEqual((await page.evaluate(() => window.desktop.live.getLibrary())).folders, ['Live 회의', 'Live 회의/하위']);
  assert.deepEqual((await page.evaluate(() => window.desktop.getLibrary())).notes.map(item => item.id), [note.id]);
  console.log('PASS: workspace dropdown, isolated IPC/storage, Live nested folders/rename, recording continuity/pause/resume, hidden Work queue events, independent navigation/sidebar, mode persistence');
  console.log('TEST_PROFILE', data);
} finally {
  await app.evaluate(({ BrowserWindow }) => { for (const window of BrowserWindow.getAllWindows()) window.destroy(); }).catch(() => {});
  await app.close().catch(() => {});
}
