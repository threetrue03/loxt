import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
await mkdir('test-results', { recursive: true });
const data = await mkdtemp(path.resolve('test-results/startup-close-'));
const env = { ...process.env, SORINOTE_TEST: '1', SORINOTE_TEST_DATA: data };
delete env.ELECTRON_RUN_AS_NODE; delete env.SORINOTE_DEV;
const app = await electron.launch({ ...(process.argv[2] ? { executablePath: path.resolve(process.argv[2]) } : { args: ['.'] }), env });
try {
  const page = await app.firstWindow();
  await page.getByRole('heading', { name: '전체 녹음', exact: true }).waitFor();
  while ((await page.evaluate(() => window.desktop.getTranscriptionEnvironment())).busy) await page.waitForTimeout(100);
  await app.evaluate(({ app }) => {
    const runtimeRequire = process.mainModule.require.bind(process.mainModule);
    const { Transcriber } = runtimeRequire(runtimeRequire('node:path').join(app.getAppPath(), 'electron/transcriber.cjs'));
    // Only this private process: slow hardware inspection to make the close race reproducible.
    Transcriber.prototype.run = async () => { await new Promise(resolve => setTimeout(resolve, 5000)); throw new Error('No GPU in close test'); };
  });
  const detecting = page.evaluate(() => window.desktop.getTranscriptionEnvironment()).catch(() => {});
  await page.waitForTimeout(100);
  const state = await page.evaluate(() => window.desktop.getTranscriptionEnvironment());
  assert.equal(state.operation, 'detect'); assert.equal(state.busy, true);
  const closed = app.waitForEvent('close', { timeout: 15000 });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  await closed; await detecting;
  console.log('PASS: hardware inspection does not block application exit');
} finally {
  await app.evaluate(({ BrowserWindow }) => { for (const window of BrowserWindow.getAllWindows()) window.destroy(); }).catch(() => {});
  await app.close().catch(() => {});
}
