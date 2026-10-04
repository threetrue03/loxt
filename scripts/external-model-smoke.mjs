import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, stat, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

await mkdir('test-results', { recursive: true });
const data = process.env.LOXT_EXTERNAL_TEST_PROFILE ? path.resolve(process.env.LOXT_EXTERNAL_TEST_PROFILE) : await mkdtemp(path.resolve('test-results/external-model-'));
if (!data.startsWith(path.resolve('test-results') + path.sep)) throw new Error('Private external model test profile required');
const cache = path.resolve('test-results/prepared-gpu-4yyczuvz/transcription');
const root = path.join(data, 'transcription');
const source = path.join(cache, 'models', 'small');
const original = await stat(path.join(source, 'model.bin'));
await mkdir(path.join(root, 'models'), { recursive: true });
// Private copies keep preparation from modifying the reusable test engine.
if (!process.env.LOXT_EXTERNAL_TEST_PROFILE) {
  for (const name of ['python-base-3.13.16', 'venv']) await cp(path.join(cache, name), path.join(root, name), { recursive: true });
  await symlink(path.join(cache, 'wheels'), path.join(root, 'wheels'), 'junction');
}
await writeFile(path.join(root, 'settings.json'), JSON.stringify({ model: 'small', device: 'auto' }));
const env = { ...process.env, SORINOTE_TEST: '1', SORINOTE_TEST_DATA: data };
delete env.ELECTRON_RUN_AS_NODE; delete env.SORINOTE_DEV;
const executablePath = process.argv[2];
const app = await electron.launch({ ...(executablePath ? { executablePath: path.resolve(executablePath) } : { args: ['.'] }), env });
try {
  const page = await app.firstWindow(); page.setDefaultTimeout(60000);
  async function waitEnvironment(predicate) {
    const deadline = Date.now() + 60000;
    while (true) {
      const state = await page.evaluate(() => window.desktop.getTranscriptionEnvironment());
      if (predicate(state)) return state;
      if (Date.now() > deadline) throw new Error('External model state timeout: ' + state.message);
      await page.waitForTimeout(100);
    }
  }
  await page.getByRole('heading', { name: '전체 녹음', exact: true }).waitFor();
  await waitEnvironment(state => !state.busy);
  let previousIds = [];
  try { previousIds = JSON.parse(await readFile(path.join(root, 'external-models.json'), 'utf8')).map(model => model.id); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  await page.getByRole('button', { name: '설정', exact: true }).click();
  await app.evaluate(({ dialog }, directory) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [directory] }); }, source);
  await page.getByRole('button', { name: '외부 모델 불러오기', exact: true }).click();
  const imported = await waitEnvironment(state => !state.busy && state.models.some(model => model.external && model.downloaded && !previousIds.includes(model.id)));
  const external = imported.models.find(model => model.external && !previousIds.includes(model.id));
  assert.ok(external.id.startsWith('external-'));
  assert.equal(await page.locator('.external-model-heading').textContent(), '외부 모델');
  console.log('PASS: native external model copied and listed');
  const capture = await app.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0].webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG().toString('base64'));
  await writeFile(path.join(data, 'external-model-library.png'), Buffer.from(capture, 'base64'));
  await page.getByRole('button', { name: '← 보관함으로 돌아가기', exact: true }).click();
  await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, path.resolve('test-results/korean-speech.wav'));
  await page.getByRole('button', { name: '파일 불러오기', exact: true }).click();
  await page.getByRole('button', { name: '변환하기', exact: true }).click();
  await page.getByLabel('변환 모델', { exact: true }).selectOption(external.id);
  await page.getByRole('dialog').getByRole('button', { name: '변환하기', exact: true }).click();
  const deadline = Date.now() + 240000;
  let result;
  do {
    result = (await page.evaluate(() => window.desktop.getLibrary())).notes[0];
    if (result.status === 'failed') throw new Error(result.transcriptionError);
    if (Date.now() > deadline) throw new Error('External model preparation/conversion timeout');
    await page.waitForTimeout(300);
  } while (result.status !== 'done');
  assert.equal(result.transcription.model, external.id);
  assert.equal(result.transcription.device, 'cuda');
  assert.match(result.segments.map(segment => segment.text).join(' '), /한국어/);
  const prepared = JSON.parse(await readFile(path.join(root, 'prepared.json'), 'utf8'));
  assert.ok(Object.keys(prepared.validations).some(key => key.startsWith(external.id + ':cuda:')));
  await page.getByRole('button', { name: '녹음 재생', exact: true }).waitFor();
  console.log('PASS: native external-model import, model selection, automatic engine validation, real Korean CUDA conversion, player transition');
  await page.getByRole('button', { name: '설정', exact: true }).click();
  await page.getByRole('button', { name: 'small 모델 삭제', exact: true }).last().click();
  await page.getByRole('button', { name: '삭제 확인', exact: true }).click();
  await waitEnvironment(state => !state.busy && !state.models.some(model => model.id === external.id));
  await assert.rejects(stat(path.join(root, 'models', external.id)), { code: 'ENOENT' });
  const after = await stat(path.join(source, 'model.bin'));
  assert.equal(after.size, original.size); assert.equal(after.mtimeMs, original.mtimeMs);
  assert.equal((await page.evaluate(() => window.desktop.getLibrary())).notes[0].done, true);
  console.log('PASS: external-model deletion preserves original user source and saved script');
  console.log('TEST_PROFILE', data);
} finally {
  await app.evaluate(({ BrowserWindow }) => { for (const window of BrowserWindow.getAllWindows()) window.destroy(); }).catch(() => {});
  await app.close().catch(() => {});
}
