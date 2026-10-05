const { WorkWorker } = require('./work-worker.cjs');
const path = require('node:path');
const fs = require('node:fs/promises');
const { spawn } = require('node:child_process');
const os = require('node:os');
const { randomUUID } = require('node:crypto');
const { Auxiliary } = require('./auxiliary.cjs');
const { MODELS, validateSettings, recommendation, computeType } = require('./transcription-config.cjs');

function friendlyError(raw) {
  if (/invalid data found|invalid.*audio|averror|error opening input/i.test(raw)) return '원본 오디오를 읽지 못했습니다. 파일이 손상되었거나 지원하지 않는 형식일 수 있습니다. 다른 원본으로 다시 시도해 주세요.';
  if (/No module named|not a supported wheel|No matching distribution/i.test(raw)) return '변환 엔진 설치를 완료하지 못했습니다. 앱 설치 파일의 복구 기능으로 다시 설치해 주세요.';
  if (/out of memory|cuda.*memory/i.test(raw)) return '메모리가 부족합니다. 더 작은 모델을 선택한 뒤 다시 시도해 주세요.';
  if (/cudnn|cublas|cudart|dll|cuda driver/i.test(raw)) return 'GPU 실행 라이브러리를 불러오지 못했습니다. NVIDIA 드라이버를 확인하고 앱 설치 파일의 복구 기능을 실행해 주세요.';
  if (/certificate|ssl|connection|timeout|network|resolve|huggingface/i.test(raw)) return '다운로드 연결에 문제가 있습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.';
  if (/ENOSPC|disk|space/i.test(raw)) return '저장 공간이 부족합니다. 앱 저장 드라이브의 여유 공간을 확인해 주세요.';
  return raw.trim().slice(-700) || '변환 작업에 실패했습니다. 다시 시도해 주세요.';
}

class Transcriber {
  constructor({ root, resources, runtime, runtimeRequired = false, library, onChange }) {
    this.root = root;
    this.resources = resources;
    this.runtime = runtime || path.join(resources, '../python-runtime');
    this.runtimeRequired = runtimeRequired;
    this.auxiliary = new Auxiliary(this);
    this.workWorker = new WorkWorker(this);
    this.library = library;
    this.onChange = onChange;
    this.python = path.join(root, 'venv', 'Scripts', 'python.exe');
    this.modelDir = path.join(root, 'models', 'medium');
    this.child = null;
    this.operation = null;
    this.requestId = null;
    this.cancelled = false;
    this.preferences = null;
    this.state = { ready: false, stage: 'idle', message: '변환 환경을 확인해 주세요.', error: '', progress: null, gpu: null, python: '', model: 'medium', devicePreference: 'auto', device: null, hardwareChecked: false, computeType: 'int8_float16', ram: os.totalmem(), models: MODELS, modelsChecked: false, recommended: null, task: null };
  }
  snapshot() { return structuredClone({ ...this.state, busy: this.busy, operation: this.operation }); }
  update(changes) {
    if (Object.keys(changes).length && Object.entries(changes).every(([key, value]) => this.state[key] === value)) return;
    Object.assign(this.state, changes); this.onChange?.(this.snapshot());
  }
  get busy() { return Boolean(this.operation || this.requestId); }
  run(command, args, onLine = () => {}, timeout = 0) {
    if (this.cancelled) return Promise.reject(new Error('cancelled'));
    if (args[1] === 'transcribe' && path.basename(args[0]) === 'worker.py') return this.workWorker.run(command, args, onLine);
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, { windowsHide: true, shell: false,
        env: { ...process.env, PYTHONUTF8: '1', PYTHONUNBUFFERED: '1', HF_HOME: path.join(this.root, 'hf-cache'), HF_HUB_DISABLE_TELEMETRY: '1', HF_HUB_DISABLE_IMPLICIT_TOKEN: '1', HF_HUB_DOWNLOAD_TIMEOUT: '60', HF_HUB_DISABLE_PROGRESS_BARS: '0' } });
      this.child = child;
      child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
      let stdout = '', stderr = '', pending = '';
      const timer = timeout ? setTimeout(() => this.kill(child), timeout) : null;
      child.stdout.on('data', buffer => {
        const chunk = buffer; stdout = (stdout + chunk).slice(-2_000_000); pending += chunk;
        while (pending.includes('\n')) { const end = pending.indexOf('\n'); onLine(pending.slice(0, end).trim()); pending = pending.slice(end + 1); }
      });
      child.stderr.on('data', buffer => { stderr = (stderr + buffer).slice(-6000); });
      child.once('error', error => { clearTimeout(timer); if (this.child === child) this.child = null; reject(error); });
      child.once('close', code => {
        clearTimeout(timer); if (this.child === child) this.child = null;
        if (pending.trim()) onLine(pending.trim());
        if (this.cancelled) reject(new Error('cancelled'));
        else if (code === 0) resolve(stdout.trim());
        else reject(new Error(stderr || stdout || `${command} 실행 실패 (${code})`));
      });
    });
  }
  async basePython() {
    // A private copy keeps venv's base interpreter stable across installer upgrades.
    const base = path.join(this.root, 'python-base-3.13.16');
    try {
      await fs.access(path.join(this.runtime, 'python.exe'));
      try { await fs.access(path.join(base, 'sorinote-runtime.json')); }
      catch {
        await fs.mkdir(this.root, { recursive: true });
        await fs.cp(this.runtime, base, { recursive: true, filter: source => path.basename(source) !== 'sorinote-runtime.json' });
        await fs.copyFile(path.join(this.runtime, 'sorinote-runtime.json'), path.join(base, 'sorinote-runtime.json'));
      }
      const executable = path.join(base, 'python.exe');
      await this.run(executable, ['-c', 'import venv, ensurepip; print("ready")'], undefined, 15000);
      return executable;
    } catch (error) {
      if (this.cancelled) throw new Error('cancelled');
      // Dev source checkouts may not have run bundle:python; packaged apps must use the bundle.
      if (this.runtimeRequired) throw error;
    }
    for (const [command, prefix] of [['py', ['-3']], ['python', []]]) {
      try {
        const value = await this.run(command, [...prefix, '-c', 'import sys; assert sys.version_info >= (3,9); print(sys.executable)'], undefined, 15000);
        if (path.isAbsolute(value)) return value;
      } catch { if (this.cancelled) throw new Error('cancelled'); }
    }
    throw new Error('Python 3.9 이상을 찾지 못했습니다. Python을 설치한 뒤 앱을 다시 실행해 주세요.');
  }
  worker(command, handler) {
    return this.run(this.python, [path.join(this.resources, 'worker.py'), command, ...this.workerArgs()], line => {
      try { handler(JSON.parse(line)); } catch { /* third-party stdout is not a protocol command */ }
    }, command === 'probe' ? 30000 : 0);
  }
  workerArgs() { return ['--model-dir', this.modelDir, '--model', this.state.model, '--device', this.state.device, '--compute-type', this.state.computeType, '--parent-pid', String(process.pid), '--lock-environment']; }
  async saveJson(filename, value) {
    await fs.mkdir(this.root, { recursive: true });
    const temporary = filename + '.tmp';
    const handle = await fs.open(temporary, 'w');
    try { await handle.writeFile(JSON.stringify(value, null, 2)); await handle.sync(); } finally { await handle.close(); }
    await fs.rename(temporary, filename);
  }
  async catalogue() {
    let external = [];
    try { external = JSON.parse(await fs.readFile(path.join(this.root, 'external-models.json'), 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw new Error('외부 모델 목록을 읽지 못했습니다. 앱 복구 후 다시 시도해 주세요.'); }
    if (!Array.isArray(external) || external.some(model => !/^external-[a-f0-9-]{36}$/.test(model.id) || typeof model.label !== 'string')) throw new Error('외부 모델 목록이 올바르지 않습니다.');
    return [...MODELS, ...external.map(model => ({ id: model.id, label: model.label.slice(0, 120), size: model.size || '로컬 모델', description: '외부 모델 · faster-whisper', external: true }))];
  }
  async importModel(directory) {
    if (this.busy) throw new Error('현재 작업을 마친 뒤 모델을 불러와 주세요.');
    await this.releaseWorkWorker();
    this.operation = 'import'; this.update({ stage: 'loading', message: '외부 모델 불러오는 중', error: '' });
    const id = `external-${randomUUID()}`;
    const target = path.resolve(this.root, 'models', id);
    try {
      const required = ['model.bin', 'config.json', 'tokenizer.json'];
      for (const name of required) {
        const info = await fs.lstat(path.join(directory, name));
        if (!info.isFile() || info.isSymbolicLink() || !info.size) throw new Error('model.bin, config.json, tokenizer.json이 있는 faster-whisper 모델 폴더를 선택해 주세요.');
      }
      JSON.parse(await fs.readFile(path.join(directory, 'config.json'), 'utf8'));
      JSON.parse(await fs.readFile(path.join(directory, 'tokenizer.json'), 'utf8'));
      await fs.mkdir(target, { recursive: true });
      const entries = await fs.readdir(directory, { withFileTypes: true });
      for (const item of entries) {
        if (item.isFile() && (required.includes(item.name) || /^[a-zA-Z0-9_.-]+\.(json|txt)$/.test(item.name))) await fs.copyFile(path.join(directory, item.name), path.join(target, item.name));
      }
      const bytes = (await fs.stat(path.join(target, 'model.bin'))).size;
      const model = { id, label: path.basename(directory).slice(0, 120), size: `${(bytes / 1024 ** 3).toFixed(2)} GB` };
      const existing = (await this.catalogue()).filter(item => item.external);
      await this.saveJson(path.join(this.root, 'external-models.json'), [...existing, model]);
      this.update({ message: '외부 모델을 불러왔습니다.' });
    } catch (error) {
      if (path.dirname(target) === path.resolve(this.root, 'models') && /^external-[a-f0-9-]{36}$/.test(id)) await fs.rm(target, { recursive: true, force: true });
      throw new Error(error.code === 'ENOENT' ? 'faster-whisper 모델 폴더를 선택해 주세요. model.bin, config.json, tokenizer.json이 필요합니다.' : error.message);
    } finally { this.operation = null; this.update({ stage: 'idle' }); }
    return this.detect();
  }
  async modelList() {
    let validations = {};
    try { validations = JSON.parse(await fs.readFile(path.join(this.root, 'prepared.json'), 'utf8')).validations || {}; } catch {}
    return Promise.all((await this.catalogue()).map(async model => {
      const directory = path.join(this.root, 'models', model.id);
      let downloaded = false, bytes = 0, partial = false;
      try {
        bytes = (await fs.stat(path.join(directory, 'model.bin'))).size;
        await Promise.all(['config.json', 'tokenizer.json'].map(name => fs.access(path.join(directory, name))));
        downloaded = bytes > 0;
      } catch { try { partial = (await fs.stat(path.join(directory, 'model.bin.part'))).size > 0; } catch { /* no download */ } }
      return { ...model, downloaded, bytes, partial, validated: downloaded && Object.keys(validations).some(key => key.startsWith(`${model.id}:${this.state.device}:`)) };
    }));
  }
  async configure(value, { persist = true } = {}) {
    if (this.busy) throw new Error('작업을 마치거나 취소한 뒤 설정을 변경해 주세요.');
    this.operation = 'configure'; this.update({});
    try { const next = validateSettings(value, await this.catalogue()); if (next.model !== this.state.model) await this.releaseWorkWorker(); if (persist) await this.saveJson(path.join(this.root, 'settings.json'), next); this.preferences = next; }
    finally { this.operation = null; this.update({}); }
    return this.detect();
  }
  async deleteModel(name) {
    if (this.busy) throw new Error('작업 중에는 모델을 삭제할 수 없습니다.');
    await this.releaseWorkWorker();
    this.operation = 'delete'; this.update({});
    try {
      const catalog = await this.catalogue();
      if (!catalog.some(model => model.id === name)) throw new Error('모델 이름이 올바르지 않습니다.');
      // Only registered managed directories; the imported source is never deleted.
      const directory = path.resolve(this.root, 'models', name);
      if (path.dirname(directory) !== path.resolve(this.root, 'models')) throw new Error('모델 경로가 올바르지 않습니다.');
      await fs.rm(directory, { recursive: true, force: true });
      if (catalog.find(model => model.id === name).external) {
        await this.saveJson(path.join(this.root, 'external-models.json'), catalog.filter(model => model.external && model.id !== name));
        if (this.preferences?.model === name) {
          this.preferences = { model: this.state.recommended?.model || 'small', device: 'auto' };
          await this.saveJson(path.join(this.root, 'settings.json'), this.preferences);
        }
      }
    }
    finally { this.operation = null; if (name === this.state.model) this.state.ready = false; this.update({}); }
    return this.detect();
  }
  validationKey() { return `${this.state.model}:${this.state.device}:${this.state.computeType}`; }
  async installModels(names) {
    if (this.busy) throw new Error('작업을 마치거나 취소한 뒤 모델을 설치해 주세요.');
    await this.releaseWorkWorker();
    if (!Array.isArray(names) || !names.length || names.length > 3 || names.some(name => !MODELS.some(model => model.preset && model.id === name))) throw new Error('설치할 모델을 확인해 주세요.');
    const models = [...new Set(names)];
    this.operation = 'download'; this.cancelled = false;
    this.update({ stage: 'downloading', error: '', progress: null, message: '모델 설치 중', download: { model: models[0], index: 1, total: models.length } });
    let failure = null, wasCancelled = false;
    try {
      const python = await this.basePython();
      let completed = false;
      await this.run(python, [path.join(this.resources, 'install_models.py'), '--root', path.join(this.root, 'models'), '--models', models.join(','), '--prepare', '--runtime', path.dirname(python), '--device', 'auto', '--parent-pid', String(process.pid)], line => {
        let event; try { event = JSON.parse(line); } catch { return; }
        if (event.type === 'model-start') this.update({ download: { model: event.model, index: event.index, total: event.total }, progress: null, message: `${MODELS.find(model => model.id === event.model).label} 모델 설치 중 · ${event.index}/${event.total}` });
        if (event.type === 'download') this.update({ progress: Math.min(99, Math.floor(event.current / event.total * 100)) });
        if (event.type === 'error') failure = friendlyError(event.message);
        if (event.type === 'engine-start') this.update({ stage: 'installing', message: event.message, progress: null });
        if (event.type === 'validation-start') this.update({ stage: 'checking', message: `${event.model} 실제 실행 검사 중`, progress: null });
        if (event.type === 'environment-ready') completed = true;
      });
      if (!completed) throw new Error('모델 설치를 확인하지 못했습니다. 다시 시도해 주세요.');
    } catch (error) { failure = this.cancelled ? null : failure || friendlyError(error.message); }
    finally {
      const cancelled = this.cancelled; wasCancelled = cancelled;
      this.operation = null;
      await this.detect();
      this.update({ stage: 'idle', progress: null, download: null, error: failure || '', message: cancelled ? '변환 준비를 취소했습니다. 다음 준비에서 설치된 파일을 재사용합니다.' : failure ? '변환 준비 미완료 · 다시 시도해 주세요.' : '설치한 모델의 변환 준비 완료 · 현재 모델 선택은 유지합니다.' });
      this.update({});
    }
    return { ...this.snapshot(), canceled: wasCancelled };
  }
  async detect(internal = false) {
    if (this.busy && !internal) return this.snapshot();
    this.operation = 'detect'; if (!internal) this.cancelled = false;
    this.update({ stage: 'checking', message: 'PC와 변환 환경 확인 중', error: '' });
    try {
      let gpu = null;
      try {
        const output = await this.run('nvidia-smi', ['--query-gpu=name,memory.total,driver_version', '--format=csv,noheader,nounits'], undefined, 15000);
        const [name, memory, driver] = output.split(/\r?\n/)[0].split(',').map(s => s.trim());
        if (name && Number(memory) > 0) gpu = { name, memory: Number(memory), driver };
      } catch { /* absence of a driver/device is shown in settings */ }
      const recommended = recommendation(gpu, this.state.ram);
      if (!this.preferences) {
        try { this.preferences = validateSettings(JSON.parse(await fs.readFile(path.join(this.root, 'settings.json'), 'utf8')), await this.catalogue()); }
        catch (error) {
          if (error.code !== 'ENOENT') this.update({ error: '저장된 설정을 읽지 못해 추천 설정으로 확인합니다. 설정을 다시 저장해 주세요.' });
          this.preferences = { model: recommended.model, device: 'auto' };
        }
      }
      const device = this.preferences.device === 'auto' ? (gpu ? 'cuda' : 'cpu') : this.preferences.device;
      this.modelDir = path.join(this.root, 'models', this.preferences.model);
      this.update({ gpu, hardwareChecked: true, recommended, model: this.preferences.model, devicePreference: this.preferences.device, device });
      let ready = false, python = '';
      try {
        if (device === 'cuda' && !gpu) throw new Error('NVIDIA GPU를 찾지 못했습니다. CPU 또는 자동 선택으로 변경해 주세요.');
        await fs.access(this.python); python = this.python;
        await this.worker('probe', event => { if (event.type === 'probe') { ready = event.model_ready; this.update({ computeType: computeType(device, event.compute_types) }); } });
        const prepared = JSON.parse(await fs.readFile(path.join(this.root, 'prepared.json'), 'utf8'));
        ready = ready && (prepared.validations?.[this.validationKey()] || (prepared.model === 'medium' && this.validationKey() === 'medium:cuda:int8_float16'));
      } catch { ready = false; }
      this.update({ ready: Boolean(ready), python, models: await this.modelList(), modelsChecked: true, stage: 'idle', message: ready ? `${device === 'cuda' ? 'GPU' : 'CPU'} 변환 준비 완료` : device === 'cuda' && !gpu ? 'NVIDIA GPU가 없습니다. CPU 또는 자동 선택으로 변경해 주세요.' : '변환 준비가 필요합니다.' });
    } catch (error) { this.update({ stage: 'idle', modelsChecked: false, error: friendlyError(error.message) }); throw error; }
    finally { this.operation = null; this.update({}); }
    return this.snapshot();
  }
  async prepare(internal = false) {
    if (this.busy && !internal) throw new Error('현재 작업을 마친 뒤 다시 시도해 주세요.');
    this.operation = 'prepare'; if (!internal) this.cancelled = false;
    this.update({ ready: false, stage: 'installing', error: '', progress: null, message: '앱 전용 Python 환경 준비 중' });
    try {
      await this.releaseWorkWorker();
      if (this.state.device === 'cuda' && !this.state.gpu) throw new Error('NVIDIA GPU를 찾지 못했습니다. CPU 또는 자동 선택으로 변경해 주세요.');
      const python = await this.basePython();
      let prepared = false;
      await this.run(python, [path.join(this.resources, 'engine_prepare.py'), '--skip-auxiliary', '--transient', '--root', this.root, '--runtime', path.dirname(python), '--models', this.state.model, '--device', this.state.devicePreference, '--parent-pid', String(process.pid)], line => {
        let event; try { event = JSON.parse(line); } catch { return; }
        if (event.type === 'engine-start') this.update({ stage: 'installing', message: event.message, progress: null });
        if (event.type === 'model-start') this.update({ stage: 'downloading', message: `${event.model} 모델 준비 중`, progress: null });
        if (event.type === 'download') this.update({ progress: Math.min(99, Math.floor(event.current / event.total * 100)) });
        if (event.type === 'validation-start') this.update({ stage: 'checking', message: `${event.model} 실제 실행 검사 중`, progress: null });
        if (event.type === 'model-ready') this.update({ computeType: event.compute_type });
        if (event.type === 'error') this.update({ error: friendlyError(event.message) });
        if (event.type === 'environment-ready') prepared = event.selected_ready;
      });
      if (!prepared) throw new Error('모델 실행을 확인하지 못했습니다. 다시 시도해 주세요.');
      this.update({ python: this.python });
      this.update({ ready: true, stage: 'idle', models: await this.modelList(), modelsChecked: true, message: `${this.state.device === 'cuda' ? 'GPU' : 'CPU'} 변환 준비 완료`, error: '', progress: null });
    } catch (error) {
      this.update({ stage: 'idle', ready: false, progress: null, message: this.cancelled ? '환경 준비를 취소했습니다.' : '환경 준비 실패', error: this.cancelled ? '' : (this.state.error || friendlyError(error.message)) });
    } finally { this.operation = null; this.update({}); }
    return { ...this.snapshot(), canceled: this.cancelled };
  }
  async startAutomatic(id, library = this.library) {
    if (this.busy) throw new Error('현재 작업을 마친 뒤 다시 시작해 주세요.');
    this.requestId = id;
    this.taskLibrary = library;
    this.cancelled = false;
    this.operation = 'pending';
    this.update({ stage: 'loading', error: '', progress: null, message: '변환 시작 중', task: { id, segments: [] } });
    this.startWithPreparation(id);
    return this.snapshot();
  }
  async startWithPreparation(id) {
    try {
      await (this.taskLibrary || this.library).getAudio(id);
      if (this.cancelled) throw new Error('cancelled');
      await this.detect(true);
      if (this.cancelled) throw new Error('cancelled');
      if (this.preferences.device !== 'auto') {
        const next = { model: this.preferences.model, device: 'auto' };
        await this.saveJson(path.join(this.root, 'settings.json'), next);
        this.preferences = next;
        if (this.cancelled) throw new Error('cancelled');
        await this.detect(true);
      }
      if (this.cancelled) throw new Error('cancelled');
      if (!this.state.ready) await this.prepare(true);
      if (this.cancelled) throw new Error('cancelled');
      if (!this.state.ready) throw new Error(this.state.error || '모델 설치를 완료하지 못했습니다. 다시 시도해 주세요.');
      await this.start(id, true);
    } catch (error) {
      const message = this.cancelled ? '' : friendlyError(error.message);
      await (this.taskLibrary || this.library).setTranscription(id, { status: this.cancelled ? 'cancelled' : 'failed', transcriptionError: message }).catch(() => {});
      this.operation = null;
      this.update({ stage: 'idle', progress: null, task: null, error: message, message: this.cancelled ? '변환을 취소했습니다. 원본은 유지됩니다.' : '변환을 시작하지 못했습니다.' });
    } finally { this.requestId = null; if (this.operation !== 'transcribe') { this.child = null; this.taskLibrary = null; } this.update({}); }
  }
  async start(id, internal = false) {
    if (this.busy && !internal) throw new Error('현재 변환 작업을 마친 뒤 다시 시작해 주세요.');
    if (!this.state.ready) throw new Error('설정에서 변환 준비를 먼저 완료해 주세요.');
    this.operation = 'transcribe'; if (!internal) { this.cancelled = false; this.taskLibrary = null; }
    try {
      const audio = await (this.taskLibrary || this.library).getAudio(id);
      await (this.taskLibrary || this.library).setTranscription(id, { status: 'transcribing', transcriptionError: '' });
      this.update({ stage: 'loading', message: '변환 시작 중', progress: null, error: '', task: { id, segments: [] } });
      // IPC resolves immediately; the background operation reports through events.
      this.transcribe(id, audio.filename);
    } catch (error) { this.operation = null; this.update({}); throw error; }
    return this.snapshot();
  }
  async transcribe(id, filename) {
    let result;
    try {
      await this.run(this.python, [path.join(this.resources, 'worker.py'), 'transcribe', ...this.workerArgs(), '--audio', filename], line => {
        let event; try { event = JSON.parse(line); } catch { return; }
        if (event.type === 'phase') this.update({ stage: event.phase, message: event.message, progress: null });
        if (event.type === 'segment') this.update({ progress: event.duration > 0 ? Math.min(99, Math.floor(event.end / event.duration * 100)) : null, task: { id, segments: [...this.state.task.segments, { start: event.start, end: event.end, text: event.text }] } });
        if (event.type === 'result') result = event;
        if (event.type === 'error') this.update({ error: friendlyError(event.message) });
      });
      if (this.cancelled) throw new Error('cancelled');
      if (!result) throw new Error('변환 결과를 받지 못했습니다. 다시 시도해 주세요.');
      this.recordExecution(result, (this.taskLibrary || this.library) === this.library ? 'work' : 'live');
      const store = this.taskLibrary || this.library;
      // Base conversion is committed before optional speaker analysis.
      result.diarization = { status: 'pending' };
      await store.completeTranscription(id, result);
      this.update({ stage: 'diarizing', message: '화자 분석 중', progress: null });
      try {
        await this.auxiliary.prepare(undefined, child => { this.child = child; });
        const segments = await this.auxiliary.diarize(filename, result.segments, child => { this.child = child; });
        if (this.cancelled) throw new Error('cancelled');
        result = { ...result, segments, diarization: { status: 'done' } };
      } catch (error) {
        result = { ...result, diarization: { status: 'failed', error: this.cancelled ? '화자 분석을 취소했습니다.' : friendlyError(error.message) } };
      }
      this.child = null;
      this.update({ stage: 'saving', message: '스크립트 저장 중', progress: null });
      await store.completeTranscription(id, result);
      this.update({ stage: 'idle', progress: null, message: result.diarization.status === 'failed' ? '스크립트 저장 완료 · 화자 분석 실패' : '변환 완료', task: null, error: '' });
    } catch (error) {
      const message = this.cancelled ? '' : this.state.error || friendlyError(error.message);
      await (this.taskLibrary || this.library).setTranscription(id, { status: this.cancelled ? 'cancelled' : 'failed', transcriptionError: message }).catch(() => {});
      this.update({ stage: 'idle', progress: null, task: null, message: this.cancelled ? '변환을 취소했습니다. 원본은 유지됩니다.' : '변환 실패', error: message });
    } finally { this.operation = null; this.taskLibrary = null; this.child = null; this.update({}); }
  }
  recordExecution(result, mode) {
    if (!['cuda', 'cpu'].includes(result?.device)) return;
    const lastExecution = { mode, model: result.model, device: result.device, computeType: result.compute_type, at: new Date().toISOString() };
    this.update({ lastExecution });
  }
  async retrySpeakers(id, library = this.library) {
    if (this.busy) throw new Error('현재 작업을 마친 뒤 다시 시도해 주세요.');
    const note = (await library.list()).notes.find(note => note.id === id);
    if (!note?.done || note.deleted) throw new Error('화자를 분석할 스크립트가 없습니다.');
    this.operation = 'transcribe'; this.cancelled = false; this.taskLibrary = library;
    this.update({ stage: 'diarizing', task: { id, segments: [] }, message: '화자 분석 재시도 중' });
    const result = { segments: note.segments, seconds: note.seconds, model: note.transcription?.model, device: note.transcription?.device, compute_type: note.transcription?.computeType, language: note.transcription?.language };
    try {
      const audio = await library.getAudio(id);
      await this.auxiliary.prepare(undefined, child => { this.child = child; });
      result.segments = await this.auxiliary.diarize(audio.filename, note.segments, child => { this.child = child; });
      if (this.cancelled) throw new Error('화자 분석을 취소했습니다.');
      result.diarization = { status: 'done' };
      await library.completeTranscription(id, result);
    } catch (error) { await library.setTranscription(id, { status: 'partial', diarization: { status: 'failed', error: friendlyError(error.message) } }); }
    finally { this.child = null; this.operation = null; this.taskLibrary = null; this.update({ stage: 'idle', task: null, progress: null }); }
    return this.snapshot();
  }
  releaseWorkWorker() { return this.workWorker.close(); }
  cancel() {
    if (!this.requestId && !['prepare', 'transcribe', 'download'].includes(this.operation)) return this.snapshot();
    // Saving an already completed result must finish atomically.
    if (this.state.stage === 'saving') return this.snapshot();
    this.cancelled = true; this.workWorker.close().catch(() => {}); if (this.child && !(this.auxiliary.children.has(this.child) && this.auxiliary.listeners.size > 1)) this.kill(this.child);
    this.update({ message: '작업을 취소하는 중…' });
    return this.snapshot();
  }
  kill(child) {
    if (process.platform === 'win32' && child.pid) {
      // Windows venv launchers can have a Python child; stop the whole task tree.
      const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore', shell: false });
      killer.on('error', () => child.kill());
    } else child.kill();
  }
  shutdown() { this.workWorker.close().catch(() => {}); this.cancelled = true; if (this.child) this.kill(this.child); }
}
module.exports = { Transcriber, friendlyError };
