import { _electron as electron } from 'playwright';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
await mkdir('test-results', { recursive: true });
const data = await mkdtemp(path.resolve('test-results/splash-'));
const theme = process.argv.includes('--light') ? 'light' : 'dark';
await writeFile(path.join(data, 'appearance.json'), JSON.stringify({ version: 1, theme }));
const env = { ...process.env, SORINOTE_TEST: '1', SORINOTE_TEST_DATA: data, SORINOTE_SPLASH_TEST: '1' };
delete env.ELECTRON_RUN_AS_NODE; delete env.SORINOTE_DEV;
const executable = process.argv.slice(2).find(argument => argument.endsWith('.exe'));
const app = await electron.launch({ ...(executable ? { executablePath: path.resolve(executable) } : { args: ['.'] }), env });
try {
  const windows = await app.windows();
  const landing = windows.find(page => page.url().includes('/splash.html')) || await app.waitForEvent('window', { predicate: page => page.url().includes('/splash.html'), timeout: 3000 });
  await landing.locator('.landing img:visible').waitFor();
  assert.equal(await landing.evaluate(() => document.documentElement.dataset.theme), theme);
  assert.equal(await landing.locator('.landing img:visible').getAttribute('src').then(src => src.includes('charcoal')), theme === 'light');
  assert.equal(await landing.evaluate(() => getComputedStyle(document.body).animationDuration), '1.5s');
  assert.ok(await landing.evaluate(() => document.querySelector('img').complete && document.querySelector('img').naturalWidth > 0));
  assert.equal(await landing.evaluate(() => typeof window.require), 'undefined');
  await landing.waitForTimeout(600);
  const image = await app.evaluate(async ({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes('/splash.html'));
    return (await window.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG().toString('base64');
  });
  await writeFile(path.join(data, 'splash.png'), Buffer.from(image, 'base64'));
  await landing.waitForEvent('close', { timeout: 3000 });
  assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 1);
  console.log('PASS: logo splash renders, fades in/out over 1.5s, closes automatically, leaves only the main window');
  console.log('TEST_PROFILE', data);
} finally {
  await app.evaluate(({ BrowserWindow }) => { for (const window of BrowserWindow.getAllWindows()) window.destroy(); }).catch(() => {});
  await app.close().catch(() => {});
}
