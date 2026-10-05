const { spawn } = require('node:child_process');

// One serialized model instance; release after a short idle period or any failure.
class WorkWorker {
  constructor(engine, idleMs = 30000) { this.engine = engine; this.idleMs = idleMs; this.child = null; this.pending = null; }
  async run(command, args, onLine) {
    clearTimeout(this.idle);
    if (this.stopping) await this.exited;
    this.stopping = false;
    const index = args.indexOf('--audio'), audio = args[index + 1];
    const workerArgs = args.filter((_value, i) => i !== index && i !== index + 1);
    workerArgs[1] = 'serve'; const key = JSON.stringify([command, workerArgs]);
    if (this.child && this.key !== key) await this.close();
    if (this.pending) throw new Error('이미 Work 변환 작업이 진행 중입니다.');
    if (!this.child) {
      const child = spawn(command, workerArgs, { windowsHide: true, shell: false, env: { ...process.env, PYTHONUTF8: '1', PYTHONUNBUFFERED: '1', HF_HOME: require('node:path').join(this.engine.root, 'hf-cache'), HF_HUB_DISABLE_TELEMETRY: '1' } });
      this.child = child; this.key = key; let buffer = '', stderr = '';
      child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
      child.stdout.on('data', text => {
        buffer += text;
        if (buffer.length > 2000000) { this.fail(new Error('Work 응답 크기를 초과했습니다.')); return; }
        while (buffer.includes('\n')) {
          const end = buffer.indexOf('\n'), line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
          const job = this.pending; if (!job) continue;
          let event; try { event = JSON.parse(line); } catch { continue; }
          job.onLine(line);
          if (event.type === 'error') this.fail(new Error(event.message));
          else if (event.type === 'result') {
            this.pending = null; job.resolve('');
            this.idle = setTimeout(() => this.close().catch(() => {}), this.idleMs); this.idle.unref();
          }
        }
      });
      child.stderr.on('data', text => { stderr = (stderr + text).slice(-3000); });
      child.stdin.on('error', error => this.fail(error));
      child.on('error', error => this.fail(error));
      this.exited = new Promise(resolve => child.once('close', code => {
        if (this.child === child) { this.child = null; this.key = null; }
        if (this.pending) { this.pending.reject(new Error(stderr || `Work 엔진이 종료됐습니다 (${code}).`)); this.pending = null; }
        resolve();
      }));
    }
    this.engine.child = this.child;
    return new Promise((resolve, reject) => { this.pending = { resolve, reject, onLine }; this.child.stdin.write(JSON.stringify({ audio }) + '\n'); });
  }
  fail(error) { if (this.pending) { this.pending.reject(error); this.pending = null; } if (this.child) { this.stopping = true; this.engine.kill(this.child); } }
  async close() {
    clearTimeout(this.idle); const child = this.child; if (!child) return; this.stopping = true;
    if (this.pending) this.fail(new Error('cancelled'));
    else if (child.stdin.writable) child.stdin.end('{"type":"stop"}\n');
    const timer = setTimeout(() => this.engine.kill(child), 3000); await this.exited; clearTimeout(timer);
    if (this.engine.child === child) this.engine.child = null;
  }
}
module.exports = { WorkWorker };
