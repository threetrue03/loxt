import { _electron as electron } from 'playwright';
import { readFile, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(workspace);
const root = path.join(workspace, 'test-results');
const pointer = path.join(root, 'design-preview.json');
await mkdir(root, { recursive: true });
let data;
try { data = JSON.parse(await readFile(pointer, 'utf8')).profile; }
catch (error) { if (error.code !== 'ENOENT') throw error; }
if (!data) {
  data = await mkdtemp(path.join(root, 'design-preview-'));
  await writeFile(pointer, JSON.stringify({ profile: data }, null, 2));
}
data = path.resolve(data);
const relative = path.relative(root, data);
if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Preview requires a private test-results profile.');
const env = { ...process.env, SORINOTE_TEST: '1', SORINOTE_TEST_DATA: data };
delete env.ELECTRON_RUN_AS_NODE; delete env.SORINOTE_DEV;
const app = await electron.launch({ args: ['.'], env });
try {
  const page = await app.firstWindow();
  await page.getByRole('heading', { name: '전체 녹음', exact: true }).waitFor();
  await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    window.setSize(1440, 900);
    window.setTitle('LOXT · 디자인 테스트 (별도 보관함)');
    window.show(); window.focus();
  });
  console.log('PREVIEW_READY', data);
  await app.waitForEvent('close', { timeout: 0 });
} catch (error) { await app.close(); throw error; }
