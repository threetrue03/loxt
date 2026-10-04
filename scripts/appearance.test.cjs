const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { Appearance } = require('../electron/appearance.cjs');
async function profile() { await fs.mkdir('test-results', { recursive: true }); return fs.mkdtemp(path.resolve('test-results/appearance-')); }
test('existing users default to dark; selection is shared and survives restart without changing existing preferences', async () => {
  const root = await profile(), filename = path.join(root, 'appearance.json');
  const original = path.join(root, 'settings.json'); await fs.writeFile(original, '{"model":"small","device":"auto"}');
  const appearance = new Appearance(filename); assert.equal(appearance.theme, 'dark');
  await appearance.set('light'); assert.equal(new Appearance(filename).theme, 'light');
  await Promise.all([appearance.set('dark'), appearance.set('light')]); assert.equal(new Appearance(filename).theme, 'light');
  assert.equal(await fs.readFile(original, 'utf8'), '{"model":"small","device":"auto"}');
  await assert.rejects(appearance.set('system'), /지원하지/); await assert.rejects(appearance.set(null), /지원하지/);
});
test('corrupt settings stay intact until user selects a valid theme; failed writes retain the prior selection', async () => {
  const root = await profile(), filename = path.join(root, 'appearance.json'); await fs.writeFile(filename, '{bad');
  const appearance = new Appearance(filename); assert.equal(appearance.theme, 'dark'); assert.match(appearance.error, /읽지 못/);
  assert.equal(await fs.readFile(filename, 'utf8'), '{bad'); await appearance.set('light'); assert.equal(appearance.error, '');
  await fs.mkdir(filename + '.tmp'); await assert.rejects(appearance.set('dark'));
  assert.equal(appearance.theme, 'light'); assert.equal(new Appearance(filename).theme, 'light');
  await fs.rmdir(filename + '.tmp'); await appearance.set('dark'); assert.equal(appearance.theme, 'dark');
});
