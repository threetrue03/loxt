import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, readFile, symlink } from 'node:fs/promises';
import path from 'node:path';

await mkdir('test-results', { recursive: true });
const profile = await mkdtemp(path.resolve('test-results/youtube-smoke-'));
const cache = path.join(process.env.APPDATA, 'sorinote-desktop', 'transcription');
const transcription = path.join(profile, 'transcription'); await mkdir(transcription);
for (const name of ['venv', 'models']) await symlink(path.join(cache, name), path.join(transcription, name), 'junction');
await symlink(path.resolve('.runtime/auxiliary'), path.join(transcription, 'auxiliary'), 'junction');
await writeFile(path.join(transcription, 'settings.json'), JSON.stringify({ model: 'small', device: 'auto' }));
await writeFile(path.join(transcription, 'prepared.json'), JSON.stringify({ validations: { 'small:cuda:int8_float16': true } }));
const env = { ...process.env, SORINOTE_TEST: '1', SORINOTE_TEST_DATA: profile }; delete env.ELECTRON_RUN_AS_NODE; delete env.SORINOTE_DEV;
const launch = () => electron.launch({ ...(process.argv[2] ? { executablePath: path.resolve(process.argv[2]) } : {}), args: process.argv[2] ? [] : ['.'], env });
let app = await launch(); let page;
const videoUrl = 'https://www.youtube.com/watch?v=jNQXAC9IVRw';
const capture = async name => { const bytes = await app.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64')); await writeFile(path.join(profile, name), Buffer.from(bytes, 'base64')); };
try {
  page = await app.firstWindow(); page.setDefaultTimeout(100_000); const errors = []; page.on('pageerror', error => errors.push(error.message));
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].show());
  await page.getByRole('heading', { name: '홈', exact: true }).waitFor();
  assert.equal((await page.evaluate(() => window.desktop.getAppInfo())).version, JSON.parse(await readFile('package.json', 'utf8')).version);
  await page.evaluate(async () => { await window.desktop.createFolder('영상'); await window.desktop.createFolder('하위 폴더', '영상'); });
  // Refresh the app so folder choices reflect persisted state, as in a normal launch.
  await page.reload(); await page.getByRole('heading', { name: '홈', exact: true }).waitFor();
  const work = page.locator('[data-workspace="work"]');
  await work.getByRole('button', { name: 'YouTube 불러오기', exact: true }).click();
  await page.getByRole('textbox', { name: '영상 링크', exact: true }).fill('https://example.com');
  await page.getByRole('button', { name: '영상 확인', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: '일반 YouTube 영상 링크' }).waitFor();
  await page.getByRole('textbox', { name: '영상 링크', exact: true }).fill(videoUrl);
  await capture('youtube-link.png');
  await page.getByRole('button', { name: '영상 확인', exact: true }).click();
  await page.locator('.youtube-video h3').filter({ hasText: 'Me at the zoo' }).waitFor();
  assert.equal(await page.getByRole('group', { name: '저장할 폴더' }).getByRole('button', { name: '하위 폴더', exact: true }).count(), 0);
  await page.getByRole('group', { name: '저장할 폴더' }).getByRole('button', { name: '영상', exact: true }).click();
  await page.getByRole('button', { name: '변환 모델', exact: true }).click();
  const popup = page.getByRole('menu', { name: '변환 모델', exact: true }); assert.ok((await popup.boundingBox()).width <= 320);
  await page.getByRole('menuitemradio', { name: /^저성능/ }).click();
  await capture('youtube-options.png');
  // Subscribe before clicking: the tiny real video may finish downloading quickly.
  await page.evaluate(() => { window.youtubeEvents = []; window.desktop.youtube.onState(state => window.youtubeEvents.push(state)); });
  await page.getByRole('button', { name: '변환하기', exact: true }).click();
  await page.getByRole('heading', { name: 'YouTube 불러오기', exact: true }).waitFor({ state: 'hidden' });
  await work.getByRole('button', { name: '변환 작업 보기', exact: true }).click();
  await page.locator('.conversion-job').filter({ hasText: 'Me at the zoo' }).waitFor();
  await capture('youtube-progress.png'); await page.getByRole('button', { name: '닫기', exact: true }).click();
  await page.getByRole('button', { name: '워크스페이스 선택', exact: true }).click(); await page.getByRole('menuitemradio', { name: /^Live/ }).click();
  let note;
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    note = (await page.evaluate(() => window.desktop.getLibrary())).notes[0];
    const failure = await page.evaluate(() => window.youtubeEvents.find(event => event.completed?.error)?.completed.error);
    if (failure) throw new Error(failure);
    if (note?.done || note?.status === 'failed') break;
    await page.waitForTimeout(200);
  }
  assert.ok(note, 'Downloaded recording was not saved');
  assert.equal(note.title, 'Me at the zoo'); assert.equal(note.folder, '영상'); assert.equal(note.source.url, videoUrl);
  assert.equal(note.status, 'done', note.transcriptionError); assert.equal(note.transcription.device, 'cuda'); assert.equal(note.transcription.model, 'small'); assert.ok(note.segments.length > 0);
  assert.equal((await page.evaluate(() => window.desktop.live.getLibrary())).notes.length, 0);
  const events = await page.evaluate(() => window.youtubeEvents);
  assert.ok(events.some(event => event.jobs.some(job => job.progress > 0))); assert.ok(events.some(event => event.completed?.noteId === note.id));
  await page.getByRole('button', { name: '워크스페이스 선택', exact: true }).click(); await page.getByRole('menuitemradio', { name: /^Work/ }).click();
  await work.getByRole('button', { name: '모두 보기', exact: true }).click();
  await work.getByRole('button', { name: 'Me at the zoo 열기', exact: true }).click();
  await work.getByRole('button', { name: 'YouTube 원본 열기', exact: true }).waitFor();
  await app.evaluate(({ shell }) => { globalThis.youtubeOpenedSource = null; shell.openExternal = async value => { globalThis.youtubeOpenedSource = value; }; });
  await work.getByRole('button', { name: 'YouTube 원본 열기', exact: true }).click();
  assert.equal(await app.evaluate(() => globalThis.youtubeOpenedSource), videoUrl);
  await page.waitForFunction(() => !document.querySelector('[data-workspace="work"] button.play').disabled);
  assert.ok(Math.abs(await page.evaluate(() => document.querySelector('[data-workspace="work"] audio').duration) - note.seconds) < .3);
  await work.getByRole('textbox', { name: '녹음 제목 변경', exact: true }).fill('YouTube 가져오기 검증'); await page.keyboard.press('Enter');
  await work.getByRole('button', { name: '전체 복사', exact: true }).waitFor();
  await app.evaluate(({ dialog }, filename) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: filename }); }, path.join(profile, 'export.txt'));
  await work.getByRole('button', { name: '내보내기', exact: true }).click();
  await page.waitForTimeout(300); assert.ok((await readFile(path.join(profile, 'export.txt'), 'utf8')).includes(note.segments[0].text));
  await page.waitForFunction(() => document.querySelector('[data-workspace="work"] input[aria-label="녹음 제목 변경"]').value === 'YouTube 가져오기 검증');
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await capture('youtube-script.png'); assert.deepEqual(errors, []);
  await app.close(); app = await launch(); page = await app.firstWindow(); await page.getByRole('heading', { name: '홈', exact: true }).waitFor();
  const reloaded = (await page.evaluate(() => window.desktop.getLibrary())).notes[0]; assert.equal(reloaded.source.url, videoUrl); assert.equal(reloaded.title, 'YouTube 가져오기 검증'); assert.equal(reloaded.done, true);
  await writeFile(path.join(profile, 'result.json'), JSON.stringify({ title: note.title, seconds: note.seconds, segments: note.segments.length, device: note.transcription.device, model: note.transcription.model, actualYoutube: true, actualInference: true, errors }, null, 2));
  console.log('PASS actual YouTube metadata/audio, chosen folder/model, CUDA inference, background workspace navigation, Work/Live isolation, playback metadata, export, rename, source persistence and restart'); console.log('TEST_PROFILE', profile);
} catch (error) { if (page) await capture('failure.png').catch(() => {}); throw error; }
finally { await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(window => window.destroy())).catch(() => {}); await app.close().catch(() => {}); }
