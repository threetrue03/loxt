import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
const out = path.resolve('test-results/settings-1.12.0'); await mkdir(out, { recursive: true });
const profile = await mkdtemp(path.join(out, 'profile-')), results = { simulated: 'Model catalog and progress fixtures; no real download or inference in this script' }, errors = [];
const root = path.join(profile, 'transcription');
for (const id of ['small', 'large-v3-turbo', 'medium']) { const dir = path.join(root, 'models', id); await mkdir(dir, { recursive: true }); for (const name of ['model.bin', 'config.json', 'tokenizer.json']) await writeFile(path.join(dir, name), '{}'); }
await writeFile(path.join(root, 'settings.json'), '{"model":"small","device":"auto"}');
const env = { ...process.env, SORINOTE_TEST: '1', SORINOTE_TEST_DATA: profile }; delete env.ELECTRON_RUN_AS_NODE; delete env.SORINOTE_DEV;
const exe = process.argv.slice(2).find(value => value.endsWith('.exe'));
const launch = () => electron.launch({ ...(exe ? { executablePath: path.resolve(exe) } : {}), args: exe ? [] : ['.'], env });
let app = await launch(), page;
try {
  page = await app.firstWindow(); page.setDefaultTimeout(10000); page.on('pageerror', error => errors.push(error.message));
  await app.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0].setSize(1280, 880); BrowserWindow.getAllWindows()[0].show(); });
  const panel = () => page.locator('.workspace-panel:not([hidden])');
  const settings = () => panel().locator('.settings-panel');
  const select = async (name, choice) => { await settings().getByRole('button', { name, exact: true }).click(); await page.getByRole('menuitemradio', { name: choice, exact: true }).click(); };
  const tab = name => panel().getByRole('navigation', { name: '설정 메뉴' }).getByRole('button', { name, exact: true }).click();
  const mode = async name => { await panel().getByRole('button', { name: '워크스페이스 선택', exact: true }).click(); await page.getByRole('menuitemradio', { name: new RegExp('^' + name) }).click(); };
  const capture = async name => { await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); const data = await app.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64')); await writeFile(path.join(out, name + '.png'), Buffer.from(data, 'base64')); };
  await panel().getByRole('heading', { name: '홈', exact: true }).waitFor();
  await page.waitForFunction(async () => (await window.desktop.preferences.get()).migrated);
  await panel().getByRole('button', { name: '설정', exact: true }).click();
  assert.deepEqual(await panel().getByRole('navigation', { name: '설정 메뉴' }).getByRole('button').allTextContents(), ['일반', '녹음', '모델 보관함', '저장 공간', '앱 정보']);
  await select('보관함 보기', '목록'); await capture('work-general-dark');
  await tab('녹음'); await select('기본 녹음 장치', '컴퓨터 소리');
  await mode('Live'); await settings().getByRole('heading', { name: '녹음', exact: true }).waitFor();
  assert.deepEqual(await panel().getByRole('navigation', { name: '설정 메뉴' }).getByRole('button').allTextContents(), ['일반', '녹음', '모델 보관함', '저장 공간', '앱 정보']);
  await tab('일반'); await select('보관함 보기', '작은 카드'); await select('테마', '라이트 테마');
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'light'); await capture('live-general-light');
  await mode('Work'); assert.match(await settings().getByRole('button', { name: '보관함 보기', exact: true }).innerText(), /목록/);
  // Force an actual preferences write failure only in this private profile.
  await mkdir(path.join(profile, 'workspace-preferences.json.tmp'));
  await select('보관함 보기', '카드'); await settings().getByRole('alert').filter({ hasText: '설정을 저장하지 못했습니다' }).waitFor();
  assert.match(await settings().getByRole('button', { name: '보관함 보기', exact: true }).innerText(), /목록/);
  await tab('앱 정보'); await tab('일반'); assert.equal(await settings().getByRole('alert').filter({ hasText: '설정을 저장하지 못했습니다' }).count(), 1);
  await rm(path.join(profile, 'workspace-preferences.json.tmp'), { recursive: true }); await settings().getByRole('button', { name: '다시 시도', exact: true }).click();
  await page.waitForFunction(async () => (await window.desktop.preferences.get()).work.layout === 'cards'); results.saveFailureRetry = true;
  // Device failure and disconnection use injected enumeration results, not physical unplugging.
  await page.evaluate(() => { navigator.mediaDevices.enumerateDevices = async () => { throw new DOMException('blocked', 'NotAllowedError'); }; });
  await tab('녹음'); await settings().getByRole('alert').filter({ hasText: '정보 접근이 제한' }).waitFor();
  await page.evaluate(async () => { navigator.mediaDevices.enumerateDevices = async () => []; await window.desktop.preferences.set('work', { microphone: 'disconnected-device' }); });
  await settings().getByRole('button', { name: '장치 다시 확인', exact: true }).click();
  await settings().getByRole('alert').filter({ hasText: '이전에 선택한 장치' }).waitFor(); await capture('disconnected-device');
  await settings().getByRole('button', { name: '기본 마이크 사용', exact: true }).click();
  await page.waitForFunction(async () => (await window.desktop.preferences.get()).work.microphone === ''); results.deviceFailureAndRemedy = true;
  const state = { hardwareChecked: true, ready: false, stage: 'idle', busy: false, model: 'small', device: 'cpu', gpu: { name: 'NVIDIA GPU detected', memory: 6144 }, ram: 16 * 1024 ** 3, recommended: { model: 'large-v3-turbo' }, models: [
    { id: 'small', label: '저성능', size: '486 MB', description: '가볍게 사용', preset: true, downloaded: true, validated: false },
    { id: 'large-v3-turbo', label: '표준', size: '1.62 GB', description: '속도와 정확도 균형', preset: true, downloaded: true, validated: true },
    { id: 'large-v3', label: '고성능', size: '3.09 GB', description: '정확도 우선', preset: true, downloaded: false },
    { id: 'medium', label: 'medium', size: '1.5 GB', description: '기본 제공 모델', downloaded: true },
    { id: 'external-fixture', label: '매우 긴 외부 모델 이름 '.repeat(10), size: '2.3 GB', description: '외부 모델 · faster-whisper', external: true, downloaded: true }
  ] };
  await app.evaluate(({ ipcMain, BrowserWindow }, state) => { ipcMain.removeHandler('transcription:environment'); ipcMain.handle('transcription:environment', () => { BrowserWindow.getAllWindows()[0].webContents.send('transcription:state', state); return state; }); BrowserWindow.getAllWindows()[0].webContents.send('transcription:state', state); }, state);
  await app.evaluate(({ BrowserWindow }, state) => BrowserWindow.getAllWindows()[0].webContents.send('transcription:state', { ...state, modelsChecked: false, error: '' }), state);
  await tab('모델 보관함'); await settings().getByText('모델 목록을 확인하는 중…', { exact: true }).waitFor(); assert.equal(await settings().locator('.model-row').count(), 0);
  await app.evaluate(({ BrowserWindow }, state) => BrowserWindow.getAllWindows()[0].webContents.send('transcription:state', { ...state, modelsChecked: false, error: '모델 목록 확인에 실패했습니다.' }), state);
  await settings().getByRole('alert').filter({ hasText: '모델 목록 확인에 실패' }).waitFor(); await capture('catalog-error');
  await settings().getByRole('button', { name: '다시 확인', exact: true }).click(); await settings().locator('.model-row').first().waitFor(); results.catalogLoadingAndFailure = true;
  await tab('모델 보관함'); await settings().getByRole('button', { name: 'Work 기본으로 사용', exact: true }).first().click();
  await page.waitForFunction(async () => (await window.desktop.preferences.get()).work.model === 'large-v3-turbo');
  await mode('Live'); await settings().getByRole('button', { name: 'Live 기본으로 사용', exact: true }).first().click();
  await page.waitForFunction(async () => (await window.desktop.preferences.get()).live.model === 'small');
  const row = settings().locator('.model-entry').filter({ hasText: '표준' }); assert.match(await row.innerText(), /설치됨/); assert.match(await row.innerText(), /이 PC에 추천/); assert.match(await row.innerText(), /Work 기본 모델/);
  await capture('models-light'); results.separateDefaults = true;
  // Deterministic model lifecycle UI tests using the real action journal and simulated engine.
  await app.evaluate(({ ipcMain, BrowserWindow }, state) => {
    const require = process.getBuiltinModule('module').createRequire(process.cwd() + '/package.json');
    const { ModelActions } = require(process.cwd() + '/electron/model-actions.cjs');
    const send = () => BrowserWindow.getAllWindows()[0].webContents.send('settings:changed', { ...qaActions.snapshot(), lockReason: qaLock || '' });
    globalThis.qaLock = ''; globalThis.qaState = state; globalThis.qaInstallCalls = 0; globalThis.qaCancelCalls = 0;
    globalThis.qaActions = new ModelActions(process.env.SORINOTE_TEST_DATA, send);
    ipcMain.removeHandler('settings:state'); ipcMain.handle('settings:state', () => ({ ...qaActions.snapshot(), lockReason: qaLock }));
    ipcMain.removeHandler('transcription:install-models'); ipcMain.handle('transcription:install-models', (_e, names) => qaActions.run('install', names[0], () => { qaInstallCalls++; return new Promise(resolve => { globalThis.qaResolve = resolve; }); }));
    ipcMain.removeHandler('transcription:cancel'); ipcMain.handle('transcription:cancel', () => { qaCancelCalls++; qaResolve({ canceled: true }); return {}; });
    ipcMain.removeHandler('transcription:delete-model'); ipcMain.handle('transcription:delete-model', (_e, id) => qaActions.run('delete', id, async () => { throw Error('삭제 권한을 확인해 주세요.'); }));
    send();
  }, state);
  await settings().getByRole('button', { name: '고성능 모델 설치', exact: true }).dblclick();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('transcription:state', { ...qaState, stage: 'downloading', progress: 42, operation: 'download', download: { model: 'large-v3' } }));
  await settings().getByRole('button', { name: '고성능 설치 진행', exact: true }).waitFor();
  assert.equal(await settings().getByRole('button', { name: '고성능 설치 진행', exact: true }).innerText(), '42%');
  assert.match(await settings().locator('.settings-phase').filter({hasText:'고성능'}).textContent(), /다운로드 중/); assert.equal(await settings().locator('.settings-phase').first().evaluate(node=>getComputedStyle(node).display==='none'),false);
  await tab('일반'); await mode('Work'); await tab('모델 보관함');
  assert.equal(await settings().getByRole('button', { name: '고성능 설치 진행', exact: true }).innerText(), '42%');
  await settings().getByRole('button', { name: '고성능 설치 취소', exact: true }).click();
  await settings().getByText('모델 작업을 취소했습니다.', { exact: false }).waitFor();
  assert.deepEqual(await app.evaluate(() => [qaInstallCalls, qaCancelCalls]), [1, 1]); results.progressNavigationAndCancel = true;
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('transcription:state', qaState));
  await settings().getByRole('button', { name: '표준 모델 삭제', exact: true }).click();
  assert.match(await settings().locator('.model-row-warning').innerText(), /녹음과 스크립트는 유지/);
  assert.match(await settings().locator('.model-row-warning').innerText(), /기본 모델/);
  await settings().getByRole('button', { name: '삭제 확인', exact: true }).click();
  await settings().locator('.model-row-error').filter({ hasText: '삭제 권한' }).waitFor();
  await tab('일반'); await mode('Live'); await tab('모델 보관함');
  await settings().locator('.model-row-error').filter({ hasText: '삭제 권한' }).waitFor();
  await settings().locator('.model-row-error').getByRole('button', { name: '다시 시도' }).click();
  await capture('persistent-model-error'); results.modelErrorPersistenceAndDeleteWarning = true;
  await app.evaluate(({ BrowserWindow }) => { globalThis.qaLock = 'Live 작업을 마치거나 취소한 뒤 모델을 변경할 수 있어요.'; BrowserWindow.getAllWindows()[0].webContents.send('settings:changed', { ...qaActions.snapshot(), lockReason: qaLock }); });
  await mode('Work'); assert.equal(await settings().getByRole('button', { name: '고성능 모델 설치', exact: true }).isDisabled(), true);
  assert.match(await settings().locator('.settings-lock').innerText(), /Live 작업/); await capture('model-lock');
  await app.evaluate(({ BrowserWindow }) => { globalThis.qaLock = ''; BrowserWindow.getAllWindows()[0].webContents.send('settings:changed', { ...qaActions.snapshot(), lockReason: '' }); }); results.modelLockUI = true;
  await tab('앱 정보'); await settings().getByText('문제 확인', { exact: true }).click();
  assert.equal(await settings().locator('dl>div').filter({ hasText: '자동 선택된 실행 장치' }).locator('dd').innerText(), 'CPU');
  assert.equal(await settings().locator('dl>div').filter({ hasText: '마지막 작업의 실행 장치' }).locator('dd').innerText(), '미확인'); results.deviceAccuracy = true;
  await settings().getByRole('button', { name: '진단 정보 복사', exact: true }).click();
  const copied = await app.evaluate(({ clipboard }) => clipboard.readText()); assert.doesNotMatch(copied, /Users|profile-|script|filename/);
  await tab('저장 공간'); await settings().getByText('마지막 확인', { exact: false }).waitFor(); assert.equal(await settings().locator('.storage-entry').count(), 3); await capture('storage-light');
  await tab('일반'); await select('테마', '다크 테마'); await tab('모델 보관함');
  await app.evaluate(({ BrowserWindow }) => { const window = BrowserWindow.getAllWindows()[0]; window.setSize(860, 640); window.webContents.setZoomFactor(1.5); });
  await capture('models-small-150-dark');
  const bounds = await settings().evaluate(node => ({ width: node.clientWidth, scrollWidth: node.scrollWidth, models: [...node.querySelectorAll('.model-row')].map(row => ({ width: row.clientWidth, scrollWidth: row.scrollWidth, sizeVisible: [...row.querySelectorAll('.model-size')].some(size => size.getClientRects().length) })) }));
  assert.ok(bounds.scrollWidth <= bounds.width + 1); assert.ok(bounds.models.every(row => row.scrollWidth <= row.width + 1 && row.sizeVisible)); results.smallWindow = bounds;
  await tab('일반'); await settings().getByRole('button', { name: '보관함 보기', exact: true }).focus(); await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Escape');
  assert.equal(await settings().getByRole('button', { name: '보관함 보기', exact: true }).evaluate(node => node === document.activeElement), true);
  assert.equal(await panel().getByRole('navigation', { name: '설정 메뉴' }).locator('[aria-current="page"]').innerText(), '일반');
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('End'); await page.keyboard.press('Enter'); await page.waitForFunction(async()=> (await window.desktop.preferences.get()).work.layout==='list');
  await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab'); results.keyboard = true;
  await app.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0].setSize(1280, 880); BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1); });
  await panel().getByRole('button', { name: '← 돌아가기', exact: true }).click();
  await mode('Live'); await panel().getByRole('button', { name: '새 Live 녹음', exact: true }).click();
  assert.match(await panel().getByRole('button', { name: 'Live 변환 모델', exact: true }).innerText(), /저성능/); results.liveDefaultApplied = true;
  await panel().getByRole('button', { name: 'Live 변환 모델', exact: true }).click(); const modelMenu=page.getByRole('menu',{name:'Live 변환 모델',exact:true});
  assert.equal(await modelMenu.locator('.menu-group-label').filter({hasText:'기본 모델'}).count(),1); assert.equal(await modelMenu.getByRole('menuitemradio',{name:'medium',exact:true}).count(),1);
  const labels=await modelMenu.innerText(); assert.ok(labels.indexOf('medium')<labels.indexOf('외부 모델')); await page.keyboard.press('Escape'); results.modelGrouping=true;
  await panel().getByRole('button', { name: '설정', exact: true }).click(); await panel().getByRole('button', { name: '← 돌아가기', exact: true }).click();
  assert.equal(await panel().getByRole('textbox', { name: 'Live 녹음 제목', exact: true }).count(), 1); results.returnDestination = true;
  const saved = await page.evaluate(() => window.desktop.preferences.get());
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(window => window.destroy())); await app.close(); app = await launch(); page = await app.firstWindow(); page.setDefaultTimeout(10000);
  await page.getByRole('heading', { name: '홈', exact: true }).waitFor(); assert.deepEqual(await page.evaluate(() => window.desktop.preferences.get()), saved); results.restart = true;
  assert.equal((await page.evaluate(() => window.desktop.getAppInfo())).version, JSON.parse(await readFile('package.json', 'utf8')).version); assert.deepEqual(errors, []); results.pageErrors = errors; results.profile = profile;
} catch (error) { results.failure = error.stack; console.error(error.stack); process.exitCode = 1; }
finally { await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(window => window.destroy())).catch(() => {}); await app.close().catch(() => {}); await writeFile(path.join(out, exe ? 'packaged.json' : 'source.json'), JSON.stringify(results, null, 2)); console.log(JSON.stringify(results)); }
