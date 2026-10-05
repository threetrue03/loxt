const path = require('node:path');
const { spawn } = require('node:child_process');
const { LiveWindows } = require('./live-windows.cjs');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

class LiveEngine {
  constructor(engine, queue, library, notify, notifyMeter) {
    this.engine = engine; this.queue = queue; this.library = library; this.notify = notify; this.notifyMeter = notifyMeter;
    this.state = { stage: 'idle', id: null, seconds: 0, segments: [], preview: [], error: '', delaySeconds: 0 };
    this.ingest = Promise.resolve(); this.jobs = []; this.pending = null; this.sequence = 0; this.child = null; this.cancelled = false;
  }
  get busy() { return !['idle', 'done'].includes(this.state.stage); }
  snapshot() { return structuredClone(this.state); }
  update(change) {
    Object.assign(this.state, change);
    if (Object.keys(change).every(key => ['seconds', 'level', 'delaySeconds'].includes(key))) { this.notifyMeter?.({ id: this.state.id, ...change }); return; }
    if (this.notifyPatch && Object.keys(change).every(key => key === 'preview')) { this.notifyPatch({ id: this.state.id, append: [], state: change }); return; }
    this.notify?.(this.snapshot());
  }
  prepare(options) {
    if (this.busy) throw new Error('이미 Live 작업이 진행 중입니다.');
    this.cancelled = false; this.executionRecorded = false; this.jobs = []; this.pending = null; this.sequence = 0; this.windows = new LiveWindows(); this.accepted = 0;
    this.ingest = Promise.resolve(); this.confirmedEnd = 0; this.confirmedUntil = 0; this.processedEnd = 0; this.checkpointAt = 0; this.failure = null; this.saved = null;
    this.update({ stage: 'preparing', preparationPhase: this.queue.active || this.engine.busy ? 'waiting' : 'checking', preparationDetail: null, progress: null, id: null, seconds: 0, level: 0, segments: [], preview: [], error: '', delaySeconds: 0, title: options?.title || '새 Live 녹음' });
    this.queue.pause(); this.starting = this.initialize(options); return this.starting;
  }
  environmentChanged() {
    if (this.state.stage !== 'preparing' || this.state.preparationPhase !== 'prepare') return;
    const { stage, progress } = this.engine.state;
    this.update({ preparationDetail: stage, progress: stage === 'downloading' && Number.isFinite(progress) ? progress : null });
  }
  async start(options) {
    if (this.state.stage !== 'ready' || !this.child || this.failure || options?.model !== this.modelInfo.model) throw new Error('선택한 Live 모델을 먼저 준비해 주세요.');
    this.update({ stage: 'starting' });
    try {
      const { id } = await this.library.beginRecording({ title: options?.title || '새 Live 녹음', folder: options?.folder || '', mime: 'audio/wav' });
      this.update({ id, title: options?.title || '새 Live 녹음', stage: 'recording' });
      return this.snapshot();
    } catch (error) { this.update({ stage: 'ready', error: error.message }); throw error; }
  }
  async initialize(options) {
    try {
      // Reserve the GPU before waiting: finish the active Work file, hold later jobs.
      while (this.queue.active || this.engine.busy) { if (this.cancelled) throw new Error('Live 시작을 취소했습니다.'); await wait(100); }
      if (this.cancelled) throw new Error('Live 시작을 취소했습니다.');
      await this.engine.releaseWorkWorker?.();
      this.previous = { ...this.engine.preferences };
      this.update({ preparationPhase: 'checking' });
      await this.engine.configure({ model: options?.model || 'large-v3-turbo', device: 'auto' }, { persist: false });
      if (this.cancelled) throw new Error('Live 시작을 취소했습니다.');
      if (!this.engine.state.ready) { this.update({ preparationPhase: 'prepare' }); await this.engine.prepare(); }
      if (!this.engine.state.ready) throw new Error(this.engine.state.error || 'Live 모델을 준비하지 못했습니다.');
      if (this.cancelled) throw new Error('Live 시작을 취소했습니다.');
      this.update({ preparationPhase: 'prepare' });
      await this.engine.auxiliary.prepare(event => {
        if (event.type === 'phase') this.update({ preparationDetail: 'installing', progress: null });
        if (event.type === 'download') this.update({ preparationDetail: 'downloading', progress: Math.min(99, Math.floor(event.current / event.total * 100)) });
      }, child => { this.auxChild = child; });
      this.auxChild = null;
      if (this.cancelled) throw new Error('Live 시작을 취소했습니다.');
      this.modelInfo = { model: this.engine.state.model, device: this.engine.state.device, compute_type: this.engine.state.computeType, language: 'ko' };
      this.engine.operation = 'live'; this.engine.update({ stage: 'live' });
      this.update({ preparationPhase: 'loading', progress: null });
      await this.openWorker();
      if (this.cancelled) throw new Error('Live 시작을 취소했습니다.');
      if (this.failure) throw this.failure;
      this.update({ stage: 'ready', preparationPhase: null, progress: null, model: this.modelInfo.model, device: this.modelInfo.device });
      return this.snapshot();
    } catch (error) {
      this.auxChild = null;
      await this.release(); this.update({ stage: 'idle', preparationPhase: null, progress: null, error: this.cancelled ? '' : error.message }); throw error;
    }
  }
  openWorker() {
    return new Promise((resolve, reject) => {
      const child = spawn(this.engine.python, [path.join(this.engine.resources, 'live_worker.py'), '--model-dir', this.engine.modelDir, '--device', this.modelInfo.device, '--compute-type', this.modelInfo.compute_type, '--speaker-models', this.engine.auxiliary.models, '--speaker-site', this.engine.auxiliary.site, '--parent-pid', String(process.pid)], { windowsHide: true, env: { ...process.env, PYTHONUTF8: '1', PYTHONUNBUFFERED: '1' } });
      this.child = child; let ready = false, buffer = '', stderr = '';
      const timer = setTimeout(() => { reject(new Error('Live 모델 시작 시간이 초과됐습니다.')); this.engine.kill(child); }, 120000);
      child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
      child.stdout.on('data', text => {
        buffer += text;
        if (buffer.length > 2000000) { this.fail(new Error('Live 응답이 너무 큽니다.')); return; }
        while (buffer.includes('\n')) {
          const end = buffer.indexOf('\n'), line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
          let event; try { event = JSON.parse(line); } catch { continue; }
          if (event.type === 'ready') { ready = true; clearTimeout(timer); resolve(); }
          if (event.type === 'error') { const error = new Error(event.message); if (!ready) { clearTimeout(timer); reject(error); } this.fail(error); }
          if (event.type === 'result') this.receive(event).catch(error => this.fail(error));
        }
      });
      child.stderr.on('data', text => { stderr = (stderr + text).slice(-3000); });
      child.stdin.on('error', error => { if (!this.releasing) this.fail(error); });
      child.on('error', error => { clearTimeout(timer); reject(error); this.fail(error); });
      this.workerExit = new Promise(done => child.once('close', code => {
        clearTimeout(timer); if (!ready) reject(new Error(stderr || 'Live 모델을 시작하지 못했습니다.'));
        if (!this.releasing && !this.cancelled) this.fail(new Error(stderr || `Live 변환 엔진이 종료됐습니다 (${code}). 원본은 계속 저장됩니다.`));
        done();
      }));
    });
  }
  append(payload) {
    if (!['recording', 'error'].includes(this.state.stage) || payload?.id !== this.state.id) throw new Error('진행 중인 Live 녹음이 없습니다.');
    const bytes = payload.bytes;
    if (!(bytes instanceof Uint8Array) || !bytes.length || bytes.length > 8000 || bytes.length % 2 || payload.sequence !== this.accepted) throw new Error('Live 오디오 순서 또는 크기가 올바르지 않습니다.');
    this.accepted++;
    const work = this.ingest.then(async () => {
      await this.library.appendRecording(payload);
      const job = this.windows.append(Buffer.from(bytes));
      if (job && !this.failure) this.enqueue(job);
      const seconds = this.windows.total / 16000;
      this.update({ seconds, level: this.windows.level, delaySeconds: this.pending || this.jobs.length ? Math.max(0, seconds - this.processedEnd) : 0 });
      if (seconds - this.checkpointAt >= 5) { this.checkpointAt = seconds; await this.library.checkpointLive(this.state.id, this.state.segments); }
      return { id: this.state.id, seconds, sequence: payload.sequence };
    });
    this.ingest = work.catch(error => { this.fail(error); }); return work;
  }
  enqueue(job) {
    this.jobs = this.jobs.filter(item => item.final);
    if (this.jobs.length >= 100) { this.fail(new Error('변환이 녹음 속도를 따라가지 못했습니다. 원본을 저장한 뒤 더 작은 모델로 다시 시작해 주세요.')); return; }
    this.jobs.push({ ...job, seq: ++this.sequence }); this.pump();
  }
  pump() {
    if (this.pending || !this.jobs.length || this.failure || !this.child) return;
    this.pending = this.jobs.shift(); const job = this.pending;
    this.requestTimer = setTimeout(() => this.fail(new Error('Live 변환 시간이 초과됐습니다. 원본은 계속 저장됩니다.')), 60000);
    this.child.stdin.write(JSON.stringify({ seq: job.seq, pcm: job.pcm.toString('base64') }) + '\n');
  }
  async receive(event) {
    const job = this.pending; if (!job || event.seq !== job.seq || this.failure) return;
    if (!this.executionRecorded) { this.engine.recordExecution?.(this.modelInfo, 'live'); this.executionRecorded = true; }
    clearTimeout(this.requestTimer);
    const segments = [];
    for (const segment of event.segments || []) {
      const words = (segment.words || []).map(word => ({ start: word.start + job.start, end: word.end + job.start, text: word.text, speaker: word.speaker ?? segment.speaker ?? null })).filter(word => Number.isFinite(word.start) && Number.isFinite(word.end) && word.start >= 0 && word.end > word.start && word.end <= job.end + 0.001 && word.end > Math.max(this.confirmedEnd, this.confirmedUntil) + 0.02 && (!job.final || word.end <= job.cutoff + 0.001));
      let group;
      for (const word of words) {
        if (!group || group.speaker !== word.speaker) { group = { start: Math.max(this.confirmedEnd, this.confirmedUntil, word.start), end: word.end, text: word.text, speaker: word.speaker, words: [word] }; segments.push(group); }
        else { group.end = word.end; group.text += word.text; group.words.push(word); }
      }
      for (const item of segments) item.text = item.text.trim();
    }
    this.processedEnd = Math.max(this.processedEnd, job.end);
    if (job.final) {
      const confirmed = [...this.state.segments, ...segments]; this.confirmedEnd = confirmed.at(-1)?.end || this.confirmedEnd;
      this.confirmedUntil = Math.max(this.confirmedUntil, job.cutoff);
      if (this.notifyPatch) { this.state.segments = confirmed; this.state.preview = []; this.notifyPatch({ id: this.state.id, append: segments, state: { preview: [] } }); }
      else this.update({ segments: confirmed, preview: [] });
      await this.library.checkpointLive(this.state.id, confirmed);
    } else this.update({ preview: segments });
    this.pending = null; this.pump();
  }
  fail(error) {
    if (this.releasing || this.failure) return;
    this.failure = error; clearTimeout(this.requestTimer); this.jobs = []; this.pending = null;
    this.update({ stage: this.state.id ? 'error' : this.state.stage, error: error.message, preview: [] });
    if (this.child) this.engine.kill(this.child);
    if (this.state.stage === 'ready') this.release().then(() => this.update({ stage: 'idle' })).catch(() => {});
  }
  async pause(id, paused) {
    if (id !== this.state.id || !['recording', 'paused', 'error'].includes(this.state.stage)) throw new Error('진행 중인 Live 녹음이 없습니다.');
    await this.ingest;
    if (paused && !this.failure) { const job = this.windows.final(); if (job) this.enqueue(job); }
    this.update({ stage: this.failure ? 'error' : paused ? 'paused' : 'recording', level: 0 }); return this.snapshot();
  }
  finish(id) {
    if (this.finishing) return this.finishing;
    this.finishing = this.finishInternal(id).finally(() => { this.finishing = null; }); return this.finishing;
  }
  async finishInternal(id) {
    if (this.state.stage === 'ready') {
      await this.release(); this.update({ stage: 'idle', preparationPhase: null, progress: null, error: '' }); return { canceled: true };
    }
    if (this.state.stage === 'preparing') {
      this.cancelled = true;
      if (!this.queue.active && ['prepare', 'detect', 'configure'].includes(this.engine.operation)) this.engine.cancel();
      if (this.child) this.engine.kill(this.child);
      if (this.auxChild) this.engine.kill(this.auxChild);
      await this.starting.catch(() => {}); return { canceled: true };
    }
    if (id !== this.state.id || !this.busy) throw new Error('진행 중인 Live 녹음이 없습니다.');
    this.update({ stage: 'finishing' }); await this.ingest;
    try {
      if (!this.failure) { const job = this.windows.final(); if (job) this.enqueue(job); while (this.pending || this.jobs.length) await wait(50); }
      if (!this.saved) {
        const session = this.library.sessions.get(id);
        if (!session?.bytes) { await this.library.discardRecording(id); await this.release(); this.update({ stage: 'done' }); return { canceled: true, library: await this.library.list() }; }
        this.saved = await this.library.finishRecording({ id });
      }
      await this.closeWorker();
      this.update({ finishingPhase: 'diarizing' });
      const audio = await this.library.getAudio(id);
      let segments = this.state.segments, diarization = { status: 'done' };
      try { segments = await this.engine.auxiliary.diarize(audio.filename, segments, child => { this.auxChild = child; }); }
      catch (error) { diarization = { status: 'failed', error: error.message }; }
      this.auxChild = null; this.update({ segments, finishingPhase: null });
      await this.library.completeTranscription(id, { ...this.modelInfo, seconds: this.saved.note.seconds, segments, diarization });
      if (this.failure) await this.library.setTranscription(id, { status: 'failed', transcriptionError: this.failure.message });
      const library = await this.library.list();
      await this.release(); this.update({ stage: 'done', preview: [], delaySeconds: 0 });
      return { note: library.notes.find(note => note.id === id), library };
    } catch (error) { await this.release(); this.update({ stage: 'error', error: `저장을 마치지 못했습니다. 다시 종료해 주세요. ${error.message}` }); throw error; }
  }
  async closeWorker() {
    this.releasing = true; clearTimeout(this.requestTimer);
    if (this.child) {
      if (!this.child.killed && this.child.stdin.writable) this.child.stdin.end(JSON.stringify({ type: 'stop' }) + '\n');
      const child = this.child; const timer = setTimeout(() => this.engine.kill(child), 5000);
      await this.workerExit; clearTimeout(timer); this.child = null;
    }
    this.releasing = false;
  }
  async release() {
    await this.closeWorker();
    if (this.engine.operation === 'live') { this.engine.operation = null; this.engine.update({ stage: 'idle' }); }
    if (this.previous?.model && !this.engine.busy) await this.engine.configure(this.previous, { persist: false }).catch(() => {});
    this.previous = null; this.releasing = false; this.queue.resume();
  }
  shutdown() { this.releasing = true; clearTimeout(this.requestTimer); if (this.child) this.engine.kill(this.child); if (this.auxChild) this.engine.kill(this.auxChild); }
}
module.exports = { LiveEngine };
