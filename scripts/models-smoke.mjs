import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
const executablePath = path.resolve(process.argv[2] || 'release/stage5/win-unpacked/Sorinote.exe');
await mkdir('test-results', { recursive: true });
const data = await mkdtemp(path.resolve('test-results/models-'));
const env = { ...process.env, SORINOTE_TEST: '1', SORINOTE_TEST_DATA: data,
  PATH: `${process.env.WINDIR}\\System32;${process.env.WINDIR}` };
delete env.ELECTRON_RUN_AS_NODE; delete env.SORINOTE_DEV;
let app, page;
const errors = [];
async function launch() {
  app = await electron.launch({ executablePath, env });
  page = await app.firstWindow(); page.setDefaultTimeout(30000);
  page.on('pageerror', error => errors.push(error.message));
  await page.getByRole('heading', { name: '전체 녹음', exact: true }).waitFor();
  await idle();
}
async function state() { return page.evaluate(() => window.desktop.getTranscriptionEnvironment()); }
async function idle(timeout = 60000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = await state();
    if (!value.busy) return value;
    await page.waitForTimeout(200);
  }
  throw new Error('model install did not finish');
}
async function capture(filename) {
  const encoded = await app.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0].webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG().toString('base64'));
  await writeFile(path.join(data, filename), Buffer.from(encoded, 'base64'));
}
try {
  await launch();
  assert.equal((await page.evaluate(() => window.desktop.getLibrary())).notes.length, 0);
  await page.getByRole('button', { name: '설정', exact: true }).click();
  const options = await page.getByLabel('전사 모델', { exact: true }).locator('option').evaluateAll(options => options.map(option => option.value));
  assert.deepEqual(options, ['small', 'large-v3-turbo', 'large-v3']);
  for (const label of ['최적화', '표준', '고성능']) assert.equal(await page.getByRole('button', { name: `${label} 모델 설치`, exact: true }).count(), 1);
  // Choose an uninstalled model; downloading a different one must not change this choice.
  await page.getByLabel('전사 모델', { exact: true }).selectOption('large-v3');
  await idle();
  await page.waitForFunction(() => document.querySelector('#transcription-model')?.value === 'large-v3' && !document.querySelector('#transcription-model')?.disabled);
  await capture('before.png');
  await page.getByRole('button', { name: '최적화 모델 설치', exact: true }).click();
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    const current = await state();
    if (current.operation === 'download' && current.progress > 0 && current.progress < 99) break;
    if (!current.busy && current.error) throw new Error(current.error);
    await page.waitForTimeout(200);
  }
  assert.equal((await state()).operation, 'download');
  await page.getByRole('button', { name: '작업 취소', exact: true }).click();
  let current = await idle();
  assert.equal(current.error, ''); assert.equal(current.model, 'large-v3');
  assert.equal(current.models.find(model => model.id === 'small').partial, true);
  assert.equal(await page.getByRole('button', { name: '최적화 모델 설치', exact: true }).textContent(), '이어받기');
  console.log('PASS: bundled model-only install without system Python/engine; cancellation retains partial and choice');
  await page.getByRole('button', { name: '최적화 모델 설치', exact: true }).click();
  current = await idle(900000);
  assert.equal(current.error, ''); assert.equal(current.model, 'large-v3');
  assert.equal(current.models.find(model => model.id === 'small').downloaded, true);
  assert.equal(current.ready, false);
  assert.ok((await stat(path.join(data, 'transcription/models/small/model.bin'))).size > 480000000);
  await page.getByRole('button', { name: '최적화 모델 선택', exact: true }).click();
  current = await idle(); assert.equal(current.model, 'small');
  await page.waitForFunction(() => document.querySelector('#transcription-model')?.value === 'small' && !document.querySelector('#transcription-model')?.disabled);
  await page.locator('.model-management').scrollIntoViewIfNeeded();
  await capture('installed.png');
  assert.equal((await page.evaluate(() => window.desktop.getLibrary())).notes.length, 0);
  await app.close(); await launch();
  current = await state(); assert.equal(current.model, 'small');
  assert.equal(current.models.find(model => model.id === 'small').downloaded, true);
  assert.deepEqual(errors, []);
  console.log('PASS: real small download/resume/SHA verification; selection and shared model cache survive restart');
  console.log('TEST_PROFILE', data);
} finally {
  await app?.evaluate(({ BrowserWindow }) => { for (const window of BrowserWindow.getAllWindows()) window.destroy(); }).catch(() => {});
  await app?.close().catch(() => {});
}
