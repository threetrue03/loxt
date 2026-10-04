const fs = require('node:fs');
const promises = require('node:fs/promises');
const path = require('node:path');

const THEMES = ['dark', 'light'];
class Appearance {
  constructor(filename) {
    this.filename = filename; this.theme = 'dark'; this.error = ''; this.queue = Promise.resolve();
    try {
      const value = JSON.parse(fs.readFileSync(filename, 'utf8'));
      if (value.version !== 1 || !THEMES.includes(value.theme)) throw new Error('Invalid appearance settings');
      this.theme = value.theme;
    } catch (error) { if (error.code !== 'ENOENT') this.error = '저장된 테마를 읽지 못했습니다. 테마를 다시 선택해 저장해 주세요.'; }
  }
  snapshot() { return { theme: this.theme, error: this.error }; }
  set(theme) {
    if (!THEMES.includes(theme)) return Promise.reject(new Error('지원하지 않는 테마입니다.'));
    const work = this.queue.then(async () => {
      await promises.mkdir(path.dirname(this.filename), { recursive: true });
      await promises.writeFile(this.filename + '.tmp', JSON.stringify({ version: 1, theme }, null, 2));
      await promises.rename(this.filename + '.tmp', this.filename);
      this.theme = theme; this.error = ''; return this.snapshot();
    });
    this.queue = work.catch(() => {}); return work;
  }
}
module.exports = { Appearance, THEMES };
