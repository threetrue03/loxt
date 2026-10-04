import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';

await mkdir('test-results', { recursive: true });
const data = await mkdtemp(path.resolve('test-results/recording-ui-'));
const env = { ...process.env, SORINOTE_TEST: '1', SORINOTE_TEST_DATA: data };
delete env.ELECTRON_RUN_AS_NODE; delete env.SORINOTE_DEV;
const app = await electron.launch({ ...(process.argv[2] ? { executablePath: path.resolve(process.argv[2]) } : {}), args: [...(process.argv[2] ? [] : ['.']), '--use-fake-device-for-media-stream'], env });
try {
  const page = await app.firstWindow(); page.setDefaultTimeout(15000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  // Show the isolated test window so screenshots include a complete native repaint.
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].show());
  async function capture(name) {
    const bytes = await app.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'));
    await writeFile(path.join(data, name), Buffer.from(bytes, 'base64'));
  }
  await page.getByRole('heading', { name: '홈', exact: true }).waitFor();
  const logo = page.getByRole('button', { name: '워크스페이스 선택', exact: true });
  assert.equal(await logo.evaluate(el => getComputedStyle(el).borderTopWidth), '0px');
  assert.equal(await page.locator('.workspace-mode').textContent(), 'Work');
  await logo.click(); await page.mouse.move(700, 400);
  const checked = page.getByRole('menuitemradio', { name: /^Work/ });
  assert.equal(await checked.evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)');
  await checked.hover(); assert.equal(await checked.evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(59, 67, 69)');
  await page.mouse.move(700, 400); await capture('workspace-menu.png');
  await page.getByRole('menuitemradio', { name: /^Live/ }).click();
  await page.getByRole('button', { name: '새 Live 녹음', exact: true }).click();
  const title = page.getByRole('textbox', { name: 'Live 녹음 제목', exact: true });
  await title.fill('가'); const short = await title.boundingBox();
  await title.fill('길이가 변하는 Live 제목'); assert.ok((await title.boundingBox()).width > short.width);
  await title.fill('긴 제목 '.repeat(24)); assert.ok(await title.evaluate(el => el.getBoundingClientRect().right <= innerWidth));
  await title.fill('Live UI 검증'); await title.blur();
  const model = page.getByRole('button', { name: 'Live 변환 모델', exact: true }), start = page.getByRole('button', { name: 'Live 시작', exact: true });
  const modelBox = await model.boundingBox(), group = await page.locator('[data-workspace="live"] .record-start-group').boundingBox();
  assert.ok(modelBox.x + modelBox.width <= group.x); assert.ok(Math.abs(modelBox.width - group.width) < 1);
  assert.ok(Math.abs(modelBox.height - group.height) < 3);
  assert.equal(await page.locator('[data-workspace="live"] .clock').textContent(), '00:00:00');
  assert.ok(await page.locator('[data-workspace="live"] .clock').evaluate(el => el.scrollWidth <= el.clientWidth));
  await model.click(); await capture('live-model-menu.png'); await page.keyboard.press('Escape');
  await capture('live-ready.png');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(860, 640));
  assert.ok(await page.locator('[data-workspace="live"] .main').evaluate(el => el.scrollWidth <= el.clientWidth));
  assert.ok(await page.locator('[data-workspace="live"] .clock').evaluate(el => el.scrollWidth <= el.clientWidth));
  const smallModel = await model.boundingBox(), smallStart = await page.locator('[data-workspace="live"] .record-start-group').boundingBox();
  assert.ok(smallModel.x + smallModel.width <= smallStart.x); assert.ok(smallStart.x + smallStart.width <= 860);
  await capture('live-small.png');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1280, 880));
  await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:0});});
  await page.evaluate(() => { window.captureAttempts = 0; const open = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices); navigator.mediaDevices.getUserMedia = (...args) => { window.captureAttempts++; return open(...args); }; });
  await app.evaluate(({ ipcMain, BrowserWindow }) => {
    ipcMain.removeHandler('live:prepare');
    ipcMain.handle('live:prepare', () => {
      global.uiPreparation = new Promise((resolve, reject) => { global.uiResolve = resolve; global.uiReject = reject; });
      BrowserWindow.getAllWindows()[0].webContents.send('live:state', { stage: 'preparing', preparationPhase: 'prepare', progress: 42, seconds: 0, segments: [], preview: [] });
      return global.uiPreparation;
    });
  });
  await start.click();
  const preparing = page.getByRole('button', { name: '모델 준비 중 · 42%', exact: true }); await preparing.waitFor();
  assert.ok(await preparing.isDisabled()); assert.equal(await page.evaluate(() => window.captureAttempts), 1);
  await capture('live-downloading.png');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('live:state', { stage: 'preparing', preparationPhase: 'loading', progress: null, seconds: 0, segments: [], preview: [] }));
  await page.getByRole('button', { name: '모델 불러오는 중…', exact: true }).waitFor();
  assert.equal(await page.locator('[data-workspace="live"] .recording.is-recording').count(), 0);
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].webContents.send('live:state', { stage: 'idle', seconds: 0, segments: [], preview: [], error: '검증용 준비 실패' });
    global.uiReject(new Error('검증용 준비 실패'));
  });
  await page.getByRole('alert').waitFor(); assert.ok(await start.isEnabled());
  await start.click(); await preparing.waitFor();
  await app.evaluate(({ BrowserWindow, ipcMain }) => {
    const send=state=>BrowserWindow.getAllWindows()[0].webContents.send('live:state',state);
    global.uiState={stage:'idle',id:null,seconds:0,segments:[],preview:[]};
    for (const channel of ['live:state','live:start','live:append','live:finish']) ipcMain.removeHandler(channel);
    ipcMain.handle('live:state',()=>global.uiState);
    ipcMain.handle('live:start',()=>{global.uiState={...global.uiState,stage:'recording',id:'ui-recording'};send(global.uiState);return global.uiState;});
    ipcMain.handle('live:append',(_event,payload)=>{global.uiState.seconds+=payload.bytes.length/32000;send(global.uiState);return global.uiState;});
    ipcMain.handle('live:finish',()=>{global.uiState={...global.uiState,stage:'done',seconds:0};send(global.uiState);return {canceled:true};});
    const ready = { stage: 'ready', model: 'large-v3-turbo', seconds: 0, segments: [], preview: [] };
    BrowserWindow.getAllWindows()[0].webContents.send('live:state', ready); global.uiResolve(ready);
  });
  await page.getByRole('button', {name:'Live 종료',exact:true}).waitFor();
  assert.equal(await page.evaluate(() => window.captureAttempts), 2);
  await page.getByRole('button', {name:'Live 종료',exact:true}).click();
  await start.waitFor();
  assert.equal((await page.evaluate(() => window.desktop.live.getLibrary())).notes.length, 0);
  await page.getByRole('button', { name: '설정', exact: true }).click();
  await page.getByRole('button', { name: '저장 공간', exact: true }).click();
  await app.evaluate(({ shell }) => { shell.openPath = async () => '검증용 오류'; });
  await page.getByRole('button', { name: '저장 위치 열기', exact: true }).click();
  const toast = page.locator('[data-workspace="live"] .toast'); await toast.waitFor();
  assert.equal(await toast.evaluate(el => getComputedStyle(el).animationDuration), '2.5s');
  await page.waitForTimeout(1500); assert.ok(Number(await toast.evaluate(el => getComputedStyle(el).opacity)) > .75);
  await page.waitForTimeout(1100); assert.equal(await toast.count(), 0);
  assert.deepEqual(errors, []);
  console.log('PASS native logo/menu, Live title bounds, lower model controls, permission before preparation, progress/loading/failure/retry and automatic start without saving preparation audio, toast timing');
  console.log('TEST_PROFILE', data);
} finally {
  await app.evaluate(({ BrowserWindow }) => { for (const window of BrowserWindow.getAllWindows()) window.destroy(); }).catch(() => {});
  await app.close().catch(() => {});
}
