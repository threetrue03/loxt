const { validateSettings } = require('./transcription-config.cjs');

class ConversionQueue {
  constructor(engine, library, notify) {
    this.engine = engine; this.library = library; this.notify = notify;
    this.waiting = []; this.active = null; this.closed = false; this.paused = false; this.submission = Promise.resolve();
  }
  get hasJobs() { return Boolean(this.active || this.waiting.length); }
  store(workspace) { return workspace === 'live' && this.liveLibrary ? this.liveLibrary : this.library; }
  snapshot() {
    const state = this.engine.snapshot();
    if (state.operation === 'live') { state.busy = false; state.operation = null; state.stage = 'idle'; }
    const active = this.active ? { ...this.active, progress: state.progress, stage: state.stage, status: this.active.started ? 'active' : 'starting' } : null;
    return { ...state, busy: state.busy || this.hasJobs, queue: [...(active ? [active] : []), ...this.waiting.map(job => ({ ...job, status: 'queued', progress: 0 }))], task: state.task ? { ...state.task, title: this.active?.title } : null };
  }
  emit() { this.notify(this.snapshot()); }
  changed() {
    this.emit();
    if (this.active?.started && !this.engine.busy) { this.active = null; this.emit(); }
    if (!this.active && this.waiting.length && !this.engine.busy) this.kick();
  }
  enqueue(payload) {
    const work = this.submission.then(async () => {
      const id = typeof payload === 'string' ? payload : payload?.id;
      if (payload?.workspace && !['work', 'live'].includes(payload.workspace)) throw new Error('지원하지 않는 보관함입니다.');
      const workspace = payload?.workspace === 'live' ? 'live' : 'work', library = this.store(workspace);
      const note = (await library.list()).notes.find(item => item.id === id);
      if (!note || note.deleted) throw new Error('변환할 녹음을 찾지 못했습니다.');
      if (this.closed) throw new Error('앱을 종료하고 있습니다.');
      if (this.active?.id === id || this.waiting.some(job => job.id === id)) throw new Error('이미 변환 목록에 있는 녹음입니다.');
      const settings = validateSettings({ model: payload?.model || this.engine.state.model, device: 'auto' }, await this.engine.catalogue());
      await library.getAudio(id);
      await library.setTranscription(id, { status: 'queued', transcriptionError: '' });
      this.waiting.push({ id, title: note.title, model: settings.model, ...(workspace === 'live' ? { workspace } : {}) }); this.emit(); this.kick();
      return this.snapshot();
    });
    this.submission = work.catch(() => {}); return work;
  }
  kick() {
    if (this.closed || this.paused || this.active || !this.waiting.length || this.engine.busy) return;
    const job = this.waiting.shift(); this.active = { ...job, started: false, cancelled: false }; this.emit();
    this.run(this.active);
  }
  async run(job) {
    try {
      await this.engine.configure({ model: job.model, device: 'auto' });
      if (job.cancelled || this.closed) throw new Error('cancelled');
      await this.engine.startAutomatic(job.id, this.store(job.workspace)); job.started = true;
      this.changed();
    } catch (error) {
      await this.store(job.workspace).setTranscription(job.id, { status: job.cancelled ? 'cancelled' : 'failed', transcriptionError: job.cancelled ? '' : error.message }).catch(() => {});
      if (this.active === job) this.active = null;
      this.emit(); this.kick();
    }
  }
  async cancel(id) {
    if (!id || id === this.active?.id) {
      if (this.active && this.engine.state.stage !== 'saving') this.active.cancelled = true;
      this.engine.cancel(); this.emit(); return this.snapshot();
    }
    const index = this.waiting.findIndex(job => job.id === id);
    if (index >= 0) {
      const [job] = this.waiting.splice(index, 1);
      await this.store(job.workspace).setTranscription(id, { status: 'cancelled', transcriptionError: '' }); this.emit();
    }
    return this.snapshot();
  }
  async environment() { if (!this.paused) await this.engine.detect(); return this.snapshot(); }
  pause() { this.paused = true; this.emit(); }
  resume() { this.paused = false; this.emit(); this.kick(); }
  shutdown() { this.closed = true; this.engine.shutdown(); }
}
module.exports = { ConversionQueue };
