import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Library } from '../electron/library.cjs';

await mkdir('test-results', { recursive: true });
const profile = await mkdtemp(path.resolve('test-results/home-ui-'));
const wav = Buffer.alloc(44 + 16000 * 2 * 2);
wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(16000, 24); wav.writeUInt32LE(32000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
const source = path.join(profile, 'sample.wav'); await writeFile(source, wav);
const env = { ...process.env, SORINOTE_TEST: '1', SORINOTE_TEST_DATA: profile };
delete env.ELECTRON_RUN_AS_NODE; delete env.SORINOTE_DEV;
const launch = () => electron.launch({ ...(process.argv[2] ? { executablePath: path.resolve(process.argv[2]) } : {}), args: process.argv[2] ? [] : ['.'], env });
let app = await launch();
try {
  let page = await app.firstWindow(); page.setDefaultTimeout(15000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].show());
  const scope = mode => page.locator(`[data-workspace="${mode}"]`);
  const home = mode => scope(mode).locator('.home-page');
  const capture = async name => {
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const png = await app.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'));
    await writeFile(path.join(profile, name), Buffer.from(png, 'base64'));
  };
  const switchTo = async mode => { await page.getByRole('button', { name: '워크스페이스 선택', exact: true }).click(); await page.getByRole('menuitemradio', { name: new RegExp(`^${mode === 'work' ? 'Work' : 'Live'}`) }).click(); await home(mode).waitFor(); };
  const goHome = async mode => { await scope(mode).getByRole('button', { name: '홈', exact: true }).click(); await home(mode).waitFor(); };
  await home('work').waitFor(); await home('work').getByText('첫 기록을 시작해보세요', { exact: true }).waitFor();
  assert.equal(await home('work').getByRole('heading', { name: '진행 중', exact: true }).count(), 0);
  assert.equal(await home('work').getByRole('button', { name: '정렬', exact: true }).count(), 0);
  await capture('work-empty.png');
  await home('work').locator('.home-start-action').first().click(); await scope('work').getByLabel('녹음 제목', { exact: true }).waitFor(); await goHome('work');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(window => window.destroy())); await app.close();
  const fixture = {};
  for (const mode of ['work', 'live']) {
    const library = new Library(path.join(profile, mode === 'work' ? 'library' : 'live-library'));
    await library.createFolder('강의'); await library.createFolder({ name: '알고리즘', parent: '강의' });
    fixture[mode] = [];
    for (let i = 1; i <= (mode === 'work' ? 5 : 2); i++) {
      const { note } = await library.importAudio(source, i === 1 ? '강의' : '');
      await library.updateNote(note.id, { title: `${mode === 'work' ? 'Work' : 'Live'} 기록 ${i}` });
      await library.completeTranscription(note.id, { seconds: 2, segments: [{ start: 0, end: 1, text: '홈에서도 스크립트 텍스트를 선택할 수 있습니다.', speaker: 'A' }], model: 'small', device: 'cpu', compute_type: 'int8', language: 'ko' });
      fixture[mode].push(note.id);
    }
  }
  app = await launch(); page = await app.firstWindow(); page.setDefaultTimeout(15000); page.on('pageerror', error => errors.push(error.message));
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].show());
  await home('work').getByText('하던 기록으로 돌아오세요', { exact: true }).waitFor();
  assert.equal(await home('work').locator('.home-folders .folder-card').count(), 1);
  await home('work').getByRole('button', { name: '모두 보기', exact: true }).click();
  await scope('work').getByRole('heading', { name: '모든 기록', exact: true }).waitFor(); assert.equal(await scope('work').locator('.note-card').count(), 5);
  for (let i = 1; i <= 5; i++) {
    await scope('work').getByRole('button', { name: `Work 기록 ${i} 열기`, exact: true }).click();
    await scope('work').getByLabel('녹음 제목 변경', { exact: true }).waitFor();
    await scope('work').getByRole('button', { name: /녹음 목록/ }).click();
  }
  await goHome('work');
  assert.deepEqual(await home('work').locator('.note-title').allTextContents(), ['Work 기록 5', 'Work 기록 4', 'Work 기록 3', 'Work 기록 2']);
  await home('work').locator('.note-preview p').first().click(); assert.equal(await home('work').locator('.note-card').count(), 4);
  await capture('work-home.png');
  await home('work').locator('.home-folders .folder-card').click(); await scope('work').getByRole('heading', { name: '강의', exact: true }).waitFor();
  assert.equal(await scope('work').locator('.folder-card').count(), 1); await goHome('work');
  await switchTo('live'); await home('live').getByText('하던 기록으로 돌아오세요', { exact: true }).waitFor(); assert.equal(await home('live').locator('.note-card').count(), 0);
  await home('live').locator('.home-start-action').first().click(); await scope('live').getByLabel('Live 녹음 제목', { exact: true }).waitFor(); await goHome('live');
  await home('live').getByRole('button', { name: '모두 보기', exact: true }).click();
  await scope('live').getByRole('button', { name: 'Live 기록 1 열기', exact: true }).click(); await scope('live').getByLabel('녹음 제목 변경', { exact: true }).waitFor(); await goHome('live');
  assert.deepEqual(await home('live').locator('.note-title').allTextContents(), ['Live 기록 1']);
  const baseline = await page.evaluate(() => window.desktop.getTranscriptionEnvironment());
  const state = { ...baseline, queue: [{ id: fixture.work[0], title: 'Work 기록 1', status: 'transcribing', progress: 64 }, { id: fixture.live[0], title: 'Live 기록 1', workspace: 'live', status: 'queued' }] };
  await app.evaluate(({ BrowserWindow }, value) => BrowserWindow.getAllWindows()[0].webContents.send('transcription:state', value), state);
  await home('live').locator('.home-conversion-job').waitFor(); assert.equal(await home('live').locator('.home-conversion-job').count(), 1); assert.match(await home('live').locator('.home-jobs').innerText(), /Live 기록 1.*대기 중/s);
  await capture('live-home.png');
  await switchTo('work'); await home('work').locator('.home-conversion-job').waitFor(); assert.match(await home('work').locator('.home-jobs').innerText(), /Work 기록 1.*64%/s);
  await home('work').locator('.home-conversion-job').click(); await scope('work').getByLabel('녹음 제목 변경', { exact: true }).waitFor(); await goHome('work');
  assert.equal((await home('work').locator('.note-title').allTextContents())[0], 'Work 기록 1');
  await app.evaluate(({ BrowserWindow }, value) => BrowserWindow.getAllWindows()[0].webContents.send('transcription:state', value), baseline);
  await page.reload(); await home('work').locator('.note-card').first().waitFor(); assert.equal((await home('work').locator('.note-title').allTextContents())[0], 'Work 기록 1');
  await home('work').getByRole('button', { name: 'Work 기록 1 관리', exact: true }).click(); await page.getByRole('menuitem', { name: '휴지통으로 이동', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('[data-workspace="work"] .home-recordings .note-title')?.textContent.includes('Work 기록 1'));
  assert.ok(!(await home('work').locator('.note-title').allTextContents()).includes('Work 기록 1'));
  await switchTo('live'); assert.deepEqual(await home('live').locator('.note-title').allTextContents(), ['Live 기록 1']);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(860, 640)); await capture('live-home-small.png');
  assert.equal(await scope('live').locator('.main').evaluate(element => element.scrollWidth > element.clientWidth), false);
  await switchTo('work'); await capture('work-home-small.png'); assert.equal(await scope('work').locator('.main').evaluate(element => element.scrollWidth > element.clientWidth), false);
  assert.deepEqual(errors, []);
  await writeFile(path.join(profile, 'result.json'), JSON.stringify({ version: '1.8.0', recentLimit: 4, separateHistory: true, historyPersists: true, trashExcluded: true, jobNavigation: true, responsive: true, errors }, null, 2));
  console.log('PASS home actions, empty states, four recent opens, persisted/separate history, trash exclusion, folder/jobs navigation and responsive layouts'); console.log('TEST_PROFILE', profile);
} finally { await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(window => window.destroy())).catch(() => {}); await app.close(); }
