const fs = require('node:fs');
const promises = require('node:fs/promises');
const path = require('node:path');
const MODES = ['work', 'live'];
const VIEWS = ['cards', 'compact', 'list'];
const validModel = value => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9.-]{0,100}$/.test(value);

class WorkspacePreferences {
  constructor(root, notify = () => {}) {
    this.filename = path.join(root, 'workspace-preferences.json'); this.notify = notify; this.queue = Promise.resolve(); this.error = '';
    let model = 'small';
    try { const old = JSON.parse(fs.readFileSync(path.join(root, 'transcription', 'settings.json'), 'utf8')); if (validModel(old.model)) model = old.model; } catch {}
    this.value = { version: 1, revision: 0, migrated: false, work: { model, microphone: '', layout: 'cards' }, live: { model: 'large-v3-turbo', microphone: '', layout: 'cards' } };
    try {
      const value = JSON.parse(fs.readFileSync(this.filename, 'utf8'));
      if (value.version !== 1 || !MODES.every(mode => validModel(value[mode]?.model) && VIEWS.includes(value[mode]?.layout) && typeof value[mode]?.microphone === 'string')) throw new Error('invalid preferences');
      this.value = value;
    } catch (error) { if (error.code !== 'ENOENT') this.error = '저장된 설정을 읽지 못했습니다. 기본값을 표시하고 있습니다. 원하는 설정을 다시 선택해 주세요.'; }
  }
  snapshot() { return structuredClone({ ...this.value, error: this.error }); }
  write(change) {
    const task = this.queue.then(async () => {
      const next = change(structuredClone(this.value));
      next.revision = (this.value.revision || 0) + 1;
      await promises.mkdir(path.dirname(this.filename), { recursive: true });
      const temporary = this.filename + '.tmp';
      await promises.writeFile(temporary, JSON.stringify(next, null, 2));
      if (this.error) await promises.copyFile(this.filename, this.filename + '.invalid-' + Date.now()).catch(error => { if (error.code !== 'ENOENT') throw error; });
      await promises.rename(temporary, this.filename);
      this.value = next; this.error = ''; this.notify(this.snapshot()); return this.snapshot();
    });
    this.queue = task.catch(() => {}); return task;
  }
  migrate(legacy) {
    if (this.value.migrated || this.error) return Promise.resolve(this.snapshot());
    return this.write(next => {
      if (next.migrated || this.error) return next;
      if (VIEWS.includes(legacy?.work?.layout)) next.work.layout = legacy.work.layout;
      if (typeof legacy?.work?.microphone === 'string' && legacy.work.microphone.length <= 1024) next.work.microphone = legacy.work.microphone;
      if (VIEWS.includes(legacy?.live?.layout)) next.live.layout = legacy.live.layout;
      next.migrated = true; return next;
    });
  }
  set(mode, change) {
    if (!MODES.includes(mode) || !change || Object.keys(change).some(key => !['model', 'microphone', 'layout'].includes(key))) return Promise.reject(new Error('설정을 확인해 주세요.'));
    if (Object.hasOwn(change, 'model') && !validModel(change.model) || Object.hasOwn(change, 'layout') && !VIEWS.includes(change.layout) || Object.hasOwn(change, 'microphone') && (typeof change.microphone !== 'string' || change.microphone.length > 1024)) return Promise.reject(new Error('설정값을 확인해 주세요.'));
    return this.write(next => { next[mode] = { ...next[mode], ...change }; next.migrated = true; return next; });
  }
}
module.exports = { WorkspacePreferences };
