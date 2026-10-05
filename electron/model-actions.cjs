const fs = require('node:fs');
const promises = require('node:fs/promises');
const path = require('node:path');
const { friendlyError } = require('./transcriber.cjs');
class ModelActions {
  constructor(root, notify) {
    this.filename = path.join(root, 'model-actions.json'); this.notify = notify; this.pending = null; this.issues = {}; this.message = ''; this.writes = Promise.resolve();
    try {
      const value = JSON.parse(fs.readFileSync(this.filename, 'utf8'));
      if (value?.issues && !Array.isArray(value.issues)) this.issues = Object.fromEntries(Object.entries(value.issues).filter(([id, issue]) => /^[a-zA-Z0-9][a-zA-Z0-9.-]{0,100}$/.test(id) && ['install', 'delete', 'default', 'import', 'verify'].includes(issue?.action) && typeof issue.text === 'string'));
    } catch {}
  }
  snapshot() { return { pending: this.pending, issues: this.issues, message: this.message }; }
  async save() {
    const text = JSON.stringify({ issues: this.issues });
    const task = this.writes.then(async () => { await promises.mkdir(path.dirname(this.filename), { recursive: true }); await promises.writeFile(this.filename + '.tmp', text); await promises.rename(this.filename + '.tmp', this.filename); });
    this.writes = task.catch(() => {});
    await task.catch(() => { this.message += ' 안내 기록을 저장하지 못했습니다. 앱을 닫기 전에 오류 내용을 확인해 주세요.'; });
  }
  async run(action, id, work, mode) {
    if (this.pending) throw new Error('현재 모델 작업을 마친 뒤 다시 시도해 주세요.');
    this.pending = { action, id }; delete this.issues[id]; this.message = ''; this.notify();
    try {
      const result = await work();
      if (result?.error) throw new Error(result.error);
      this.message = action === 'delete' ? '모델을 삭제했습니다. 녹음과 스크립트는 유지됩니다.' : result?.canceled ? '모델 작업을 취소했습니다. 설치된 파일은 다음 설치에서 재사용합니다.' : action === 'default' ? '기본 모델을 저장했습니다.' : '모델 작업을 완료했습니다.';
      return result;
    } catch (error) {
      const raw = error.message.replace(/^Error invoking remote method '[^']+': Error: /, '').split(/\n\s+at /)[0];
      const text = /\b(EACCES|EPERM|EISDIR|ENOTDIR)\b/.test(raw) ? '저장 폴더의 접근 권한과 파일 사용 상태를 확인한 뒤 다시 시도해 주세요.' : friendlyError(raw);
      this.issues[id] = { action, ...(mode ? { mode } : {}), text };
      throw error;
    } finally { this.pending = null; await this.save(); this.notify(); }
  }
}
module.exports = { ModelActions };
