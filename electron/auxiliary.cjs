const path = require('node:path');
const fs = require('node:fs/promises');
const { spawn } = require('node:child_process');

class Auxiliary {
  constructor(engine) {
    this.engine = engine; this.root = path.join(engine.root, 'auxiliary');
    this.python = path.join(this.root, 'venv', 'Scripts', 'python.exe');
    this.models = path.join(this.root, 'models'); this.site = path.join(this.root, 'venv', 'Lib', 'site-packages');
    this.children = new Set(); this.listeners = new Set(); this.ready = false;
  }
  run(python, args, onEvent = () => {}, { input, onChild } = {}) {
    return new Promise((resolve, reject) => {
      const child = spawn(python, args.map(String), { windowsHide: true, env: { ...process.env, PYTHONUTF8: '1', PYTHONUNBUFFERED: '1' } });
      this.children.add(child); onChild?.(child); let buffer = '', errors = '', result;
      child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
      child.stdout.on('data', value => {
        buffer += value;
        if (buffer.length > 10000000) { this.engine.kill(child); reject(new Error('보조 엔진의 응답 크기를 초과했습니다.')); return; }
        while (buffer.includes('\n')) { const end = buffer.indexOf('\n'), line = buffer.slice(0,end); buffer = buffer.slice(end+1); let event; try { event = JSON.parse(line); } catch { continue; }
          if (event.type === 'result') result = event; if (event.type === 'error') errors = event.message;
          onEvent(event);
        }
      });
      child.stderr.on('data', text => { errors = (errors + text).slice(-2500); });
      child.on('error', reject); child.on('close', code => { this.children.delete(child); code === 0 ? resolve(result) : reject(new Error(errors || '음성 보조 엔진이 중단됐습니다. 다시 시도해 주세요.')); });
      child.stdin.on('error', () => {}); child.stdin.end(input ? JSON.stringify(input) : undefined);
    });
  }
  async prepare(onEvent = () => {}, onChild) {
    if (this.ready) return;
    this.listeners.add(onEvent);
    try {
      if (!this.preparing) {
        await fs.mkdir(this.root, { recursive: true });
        // Set the reservation synchronously before another capture/convert can prepare.
        if (!this.preparing) this.preparing = this.run(path.join(this.engine.runtime, 'python.exe'), [path.join(this.engine.resources, 'auxiliary_prepare.py'), '--root', this.root, '--runtime', this.engine.runtime, '--parent-pid', process.pid], event => { for (const listener of this.listeners) listener(event); }, { onChild }).then(() => { this.ready = true; }).finally(() => { this.preparing = null; });
      }
      await this.preparing;
    } finally { this.listeners.delete(onEvent); }
  }
  async diarize(audio, segments, onChild) {
    try {
      const result = await this.run(this.python, [path.join(this.engine.resources, 'diarize_file.py'), '--models', this.models, '--audio', audio, '--parent-pid', process.pid], undefined, { input: { segments }, onChild });
      if (!Array.isArray(result?.segments)) throw new Error('화자 분석 결과를 받지 못했습니다.');
      return result.segments;
    } catch (error) { this.ready = false; throw error; }
  }
  shutdown() { for (const child of this.children) this.engine.kill(child); }
}
module.exports = { Auxiliary };
