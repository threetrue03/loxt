import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { Library } from '../electron/library.cjs';

await mkdir('test-results', { recursive: true });
const pointer = path.resolve('test-results/theme-baseline.json');
let profile;
if (process.argv.includes('--baseline') || process.argv.includes('--fresh') || !existsSync(pointer)) {
  profile = await mkdtemp(path.resolve('test-results/theme-'));
  const wav = Buffer.alloc(44 + 64000); wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(16000, 24); wav.writeUInt32LE(32000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
  const source = path.join(profile, 'fixture.wav'); await writeFile(source, wav);
  for (const name of ['library', 'live-library']) {
    const library = new Library(path.join(profile, name)); await library.createFolder('강의'); await library.createFolder('하위 폴더', '강의');
    for (let index = 0; index < 3; index++) {
      const note = (await library.importAudio(source, '')).note;
      await library.updateNote(note.id, { title: `테마 검증 ${index + 1}`, seconds: 2 });
      if (index < 2) await library.completeTranscription(note.id, { seconds: 2, segments: [{ start: .1, end: 1.5, text: '테마를 바꾸어도 같은 스크립트와 녹음을 유지합니다.', speaker: 'A' }] });
    }
  }
  await writeFile(pointer, JSON.stringify({ profile }));
} else profile = JSON.parse(await readFile(pointer, 'utf8')).profile;
const env = { ...process.env, SORINOTE_TEST: '1', SORINOTE_TEST_DATA: profile }; delete env.ELECTRON_RUN_AS_NODE; delete env.SORINOTE_DEV;
const executable = process.argv.slice(2).find(argument => argument.endsWith('.exe'));
const launch = () => electron.launch({ ...(executable ? { executablePath: path.resolve(executable) } : {}), args: executable ? [] : ['.'], env });
let app = await launch();
try {
  let page = await app.firstWindow(); page.setDefaultTimeout(20000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].show());
  if (!process.argv.includes('--baseline')) {
    await page.evaluate(async () => { await window.desktop.appearance.set('dark'); localStorage.setItem('loxt.workspace', 'work'); });
    await page.reload();
  }
  const scope = page.locator('[data-workspace="work"]'); await scope.getByRole('heading', { name: '홈', exact: true }).waitFor();
  await scope.getByRole('button', { name: '모두 보기', exact: true }).click(); await scope.getByRole('button', { name: '카드 보기', exact: true }).click();
  const colors = await page.evaluate(() => {
    const selectors = ['.app-header', '.sidebar', '.main', '.note-card', '.note-card .note-title', '.note-card .note-folder', '.note-card .cell', '.preview-segment', '.folder-card', '.folder-card>svg', '.custom-select .menu-trigger'];
    return Object.fromEntries(selectors.map(selector => { const node = document.querySelector(`[data-workspace="work"] ${selector}`), style = getComputedStyle(node); return [selector, Object.fromEntries(['color', 'backgroundColor', 'borderTopColor', 'borderRadius', 'fontFamily', 'fontSize'].map(key => [key, style[key]]))]; }));
  });
  const capture = async name => { await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); const png = await app.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64')); await writeFile(path.join(profile, name), Buffer.from(png, 'base64')); };
  if (process.argv.includes('--baseline')) { await writeFile(path.join(profile, 'dark-baseline.json'), JSON.stringify(colors, null, 2)); await capture('dark-before.png'); console.log('BASELINE', profile); }
  else {
    // Captured from the original app before the theme migration, so a fresh
    // checkout can verify dark compatibility without private test data.
    const baseline = JSON.parse(await readFile(new URL('./fixtures/dark-theme-baseline.json', import.meta.url), 'utf8'));
    // Approved 1.11.0 A16 typography predates this settings change. Keep every original color/geometry assertion.
    baseline['.note-card .cell'].fontSize = '12px'; baseline['.note-card .note-folder'].fontSize = '12px'; baseline['.preview-segment'].fontSize = '13px';
    assert.deepEqual(colors, baseline); await capture('dark-after.png'); console.log('PASS original dark colors and geometry');
    const workBefore = await page.evaluate(() => window.desktop.getLibrary());
    const liveBefore = await page.evaluate(() => window.desktop.live.getLibrary());
    const darkLogo = await scope.locator('.brand-logo').getAttribute('src');
    async function selectTheme(mode, theme) {
      const scope = page.locator(`[data-workspace="${mode}"]`);
      await scope.getByRole('button', { name: '테마', exact: true }).click();
      await page.getByRole('menuitemradio', { name: theme === 'light' ? '라이트 테마' : '다크 테마', exact: true }).click();
      await page.waitForFunction(theme => document.documentElement.dataset.theme === theme, theme);
      await page.waitForFunction(theme => window.desktop.appearance.get().then(value => value.theme === theme), theme);
    }
    async function switchTo(mode) {
      await page.getByRole('button', { name: '워크스페이스 선택', exact: true }).click();
      await page.getByRole('menuitemradio', { name: new RegExp(mode === 'live' ? '^Live' : '^Work') }).click();
    }
    await scope.getByRole('button', { name: '설정', exact: true }).click();
    await selectTheme('work', 'light'); await capture('light-settings.png');
    assert.notEqual(await scope.locator('.brand-logo').getAttribute('src'), darkLogo);
    assert.ok(await scope.locator('.brand-logo').evaluate(img => img.complete && img.naturalWidth > 0));
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme), 'light');
    assert.equal(await app.evaluate(({ nativeTheme }) => nativeTheme.themeSource), 'light');
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBackgroundColor()), '#F6F6F4');
    await scope.getByRole('button', { name: '모델 보관함', exact: true }).click(); await capture('light-models.png');
    const environment = await page.evaluate(() => window.desktop.getTranscriptionEnvironment());
    const publish = state => app.evaluate(({ BrowserWindow }, state) => BrowserWindow.getAllWindows()[0].webContents.send('transcription:state', state), state);
    await publish({ ...environment, busy: true, operation: 'download', download: { model: 'small' }, progress: 42 });
    await scope.getByRole('button', { name: '저성능 설치 진행', exact: true }).waitFor(); await capture('light-model-download.png');
    await publish(environment);
    await scope.getByRole('button', { name: '← 돌아가기', exact: true }).click();
    await capture('light-library.png');
    await scope.locator('.note-card').filter({ hasText: '테마 검증 1' }).click({ button: 'right' });
    await page.getByRole('menuitem', { name: '폴더 이동하기', exact: true }).click();
    await page.getByRole('menu', { name: '폴더 이동', exact: true }).waitFor(); await capture('light-context-move.png'); await page.keyboard.press('Escape');
    await scope.getByRole('button', { name: '정렬', exact: true }).click(); await capture('light-sort-menu.png'); await page.keyboard.press('Escape');
    await scope.locator('.note-card').filter({ hasText: '테마 검증 1' }).locator(':scope > .cell.date').click(); await scope.getByRole('button', { name: '다시 변환하기', exact: true }).waitFor();
    await capture('light-script.png');
    const note = workBefore.notes.find(note => note.title === '테마 검증 1');
    await publish({ ...environment, busy: true, task: { id: note.id }, progress: 42, queue: [{ id: note.id, workspace: 'work', title: note.title, status: 'transcribing' }] });
    await scope.locator('.script-skeleton').waitFor(); await capture('light-skeleton-progress.png');
    await publish(environment); await scope.getByRole('button', { name: '전체 복사', exact: true }).waitFor();
    await app.evaluate(({ dialog }, file) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: file }); }, path.join(profile, 'theme-export.txt'));
    await scope.getByRole('button', { name: '내보내기', exact: true }).click(); await scope.locator('.toast').waitFor();
    assert.equal(await scope.locator('.toast').evaluate(node => getComputedStyle(node).animationDuration), '2.5s');
    await page.waitForTimeout(1400); await capture('light-toast.png'); await scope.locator('.toast').waitFor({ state: 'detached' });
    await scope.getByRole('button', { name: '다시 변환하기', exact: true }).click();
    await page.getByRole('button', { name: '변환 모델', exact: true }).click(); await capture('light-conversion-menu.png'); await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '닫기', exact: true }).click();
    await scope.getByRole('button', { name: 'YouTube 불러오기', exact: true }).click();
    await page.getByLabel('영상 링크', { exact: true }).fill('https://example.com/video');
    await page.getByRole('button', { name: '영상 확인', exact: true }).click();
    await page.getByRole('alert').waitFor(); await capture('light-youtube-error.png');
    await page.getByRole('button', { name: '닫기', exact: true }).click();
    await scope.locator('.sidebar-create').click(); await capture('light-work-ready.png');
    await switchTo('live'); const liveScope = page.locator('[data-workspace="live"]');
    await liveScope.getByRole('button', { name: '설정', exact: true }).click();
    assert.equal(await liveScope.getByRole('button', { name: '테마', exact: true }).innerText().then(value => value.trim()), '라이트 테마');
    await selectTheme('live', 'dark'); assert.equal(await scope.locator('.brand-logo').getAttribute('src'), darkLogo);
    await selectTheme('live', 'light'); await liveScope.getByRole('button', { name: '← 돌아가기', exact: true }).click();
    await liveScope.getByRole('button', { name: '모두 보기', exact: true }).click(); await liveScope.getByRole('button', { name: '카드 보기', exact: true }).click();
    await capture('light-live-library.png');
    await liveScope.getByRole('button', { name: '새 Live 녹음', exact: true }).click();
    await liveScope.getByRole('button', { name: 'Live 변환 모델', exact: true }).click(); await capture('light-live-menu.png'); await page.keyboard.press('Escape');
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(860, 640)); await capture('light-small-window.png');
    assert.equal(await liveScope.locator('.main').evaluate(node => node.scrollWidth > node.clientWidth), false);
    assert.deepEqual((await page.evaluate(() => window.desktop.getLibrary())).notes, workBefore.notes);
    assert.deepEqual((await page.evaluate(() => window.desktop.live.getLibrary())).notes, liveBefore.notes);
    assert.deepEqual(errors, []);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(window => window.destroy())); await app.close(); app = await launch();
    page = await app.firstWindow(); page.setDefaultTimeout(20000);
    assert.equal(await page.evaluate(() => window.desktop.appearance.initial), 'light');
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
    assert.equal(await app.evaluate(({ nativeTheme }) => nativeTheme.themeSource), 'light');
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBackgroundColor()), '#F6F6F4');
    await capture('light-restarted.png');
    console.log('PASS light Work/Live settings, shared selection, logos/native window, menus/dialogs/errors, small viewport, unchanged libraries and restart'); console.log('TEST_PROFILE', profile);
  }
} finally { await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(window => window.destroy())).catch(() => {}); await app.close(); }
