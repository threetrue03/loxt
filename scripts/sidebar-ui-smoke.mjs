import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';

const { version } = JSON.parse(await readFile('package.json', 'utf8'));
const out = path.resolve(`test-results/sidebar-${version}`);
await mkdir(out, { recursive: true });
const profile = await mkdtemp(path.join(out, 'profile-'));
const env = { ...process.env, SORINOTE_TEST: '1', SORINOTE_TEST_DATA: profile };
delete env.ELECTRON_RUN_AS_NODE;
delete env.SORINOTE_DEV;
const executablePath = process.argv[2];
const app = await electron.launch({ ...(executablePath ? { executablePath: path.resolve(executablePath), args: [] } : { args: ['.'] }), env });
const result = { version, packaged: Boolean(executablePath), cases: [] };
const errors = [];
try {
  const page = await app.firstWindow();
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => errors.push(error.message));
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].setSize(1440, 900);
    BrowserWindow.getAllWindows()[0].show();
  });
  await page.getByRole('heading', { name: '홈', exact: true }).waitFor();
  for (const theme of ['dark', 'light']) {
    await page.evaluate(theme => window.desktop.appearance.set(theme), theme);
    await page.waitForFunction(theme => document.documentElement.dataset.theme === theme, theme);
    for (const mode of ['work', 'live']) {
      await page.getByRole('button', { name: '워크스페이스 선택', exact: true }).click();
      await page.getByRole('menuitemradio', { name: new RegExp(`^${mode === 'work' ? 'Work' : 'Live'}`) }).click();
      const scope = page.locator(`[data-workspace="${mode}"]`);
      for (const width of [1440, 860]) {
        await app.evaluate(({ BrowserWindow }, width) => BrowserWindow.getAllWindows()[0].setSize(width, 900), width);
        for (let cycle = 0; cycle < 2; cycle++) {
          await scope.getByRole('button', { name: '사이드바 접기', exact: true }).click();
          const reopen = scope.getByRole('button', { name: '사이드바 펼치기', exact: true });
          await reopen.waitFor({ state: 'visible' });
          await page.waitForTimeout(280);
          assert.equal(await reopen.getAttribute('aria-expanded'), 'false');
          const geometry = await reopen.evaluate(button => {
            const b = button.getBoundingClientRect(), s = button.closest('.sidebar').getBoundingClientRect();
            const hit = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
            return { button: b.toJSON(), sidebar: s.toJSON(), hit: hit?.outerHTML.slice(0, 200), clickable: hit?.closest('button') === button };
          });
          const { button: b, sidebar: s } = geometry;
          assert.ok(b.width >= 24 && b.height >= 24 && b.x >= s.x && b.right <= s.right && b.y >= s.y && b.bottom <= s.bottom && geometry.clickable, `Reopen button must remain inside the collapsed sidebar and accept clicks: ${JSON.stringify(geometry)}`);
          if (cycle === 0) await page.screenshot({ path: path.join(out, `${mode}-${theme}-${width}-collapsed.png`) });
          if (cycle === 0) await reopen.click();
          else { await reopen.focus(); await page.keyboard.press('Enter'); }
          assert.equal(await scope.getByRole('button', { name: '사이드바 접기', exact: true }).getAttribute('aria-expanded'), 'true');
        }
        result.cases.push({ mode, theme, width, mouseAndKeyboard: true });
      }
    }
  }
  assert.deepEqual(errors, []);
  result.ok = true;
  console.log(`PASS: ${result.cases.length} Work/Live, dark/light, normal/small-window sidebar cases`);
} catch (error) {
  result.error = error.stack;
  throw error;
} finally {
  result.errors = errors;
  await writeFile(path.join(out, 'results.json'), JSON.stringify(result, null, 2));
  await app.close();
}
