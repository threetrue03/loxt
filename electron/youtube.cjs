const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { validateSettings } = require('./transcription-config.cjs');

function youtubeUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) throw new Error('YouTube 영상 링크를 입력해 주세요.');
  let url;
  try { url = new URL(value.trim()); } catch { throw new Error('올바른 YouTube 영상 링크를 입력해 주세요.'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port) throw new Error('YouTube 영상 링크만 사용할 수 있습니다.');
  let id;
  if (url.hostname === 'youtu.be' && /^\/[\w-]{11}$/.test(url.pathname)) id = url.pathname.slice(1);
  else if (['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(url.hostname) && url.pathname === '/watch') id = url.searchParams.get('v');
  if (!id || !/^[\w-]{11}$/.test(id)) throw new Error('일반 YouTube 영상 링크를 입력해 주세요. Shorts·재생목록·실시간 방송은 지원하지 않습니다.');
  return `https://www.youtube.com/watch?v=${id}`;
}
function videoInfo(info, url) {
  const id = new URL(url).searchParams.get('v');
  if (info.id !== id || info._type === 'playlist') throw new Error('영상 정보를 확인하지 못했습니다.');
  if (info.is_live || info.is_upcoming || info.was_live || (info.live_status && info.live_status !== 'not_live')) throw new Error('실시간 방송과 방송 다시보기는 지원하지 않습니다. 일반 업로드 영상을 선택해 주세요.');
  if (info.availability && info.availability !== 'public') throw new Error('공개된 일반 영상만 가져올 수 있습니다.');
  if (!Number.isFinite(info.duration) || info.duration <= 0 || info.duration > 7 * 24 * 3600) throw new Error('영상 길이를 확인할 수 없거나 지원 범위를 초과합니다.');
  return { url, videoId: id, title: String(info.title || 'YouTube 영상').trim().slice(0, 120) || 'YouTube 영상', uploader: String(info.uploader || info.channel || '').slice(0, 200), seconds: info.duration };
}
function friendlyError(error) {
  const message = String(error.message || error);
  if (/sign in|bot|confirm.*age|age.restrict|login|cookies/i.test(message)) return 'YouTube에서 로그인 또는 추가 확인을 요구해 음성을 가져올 수 없습니다. 다른 공개 영상으로 시도해 주세요.';
  if (/private|unavailable|removed|not available|copyright/i.test(message)) return '비공개·삭제·지역 제한 등으로 영상을 가져올 수 없습니다.';
  if (/timed? ?out|network|resolve|connection|HTTP Error/i.test(message)) return 'YouTube 연결을 확인하지 못했습니다. 네트워크를 확인하고 다시 시도해 주세요.';
  if (/format.*not available|no video formats/i.test(message)) return '이 영상에서 음성 파일을 가져올 수 없습니다. 다른 영상으로 시도해 주세요.';
  if (/ENOENT/i.test(message)) return 'YouTube 도구를 찾지 못했습니다. 최신 LOXT 설치 파일로 앱을 복구해 주세요.';
  return message.replace(/\x1b\[[0-9;]*m/g, '').slice(-600);
}

class YouTubeImports {
  constructor({ root, executable, node = process.execPath, library, queue, notify, runner }) {
    Object.assign(this, { root, executable, node, library, queue, notify });
    this.jobs = []; this.active = null; this.tokens = new Map(); this.children = new Set(); this.closed = false; this.inspectBusy = false;
    this.runner = runner || this.run.bind(this);
    // Discard only this feature's abandoned temporary download directories.
    this.ready = fs.mkdir(root, { recursive: true }).then(async () => {
      for (const entry of await fs.readdir(root, { withFileTypes: true })) if (entry.isDirectory() && /^youtube-[0-9a-f-]{36}$/.test(entry.name)) await fs.rm(path.join(root, entry.name), { recursive: true, force: true });
    });
    this.ready.catch(() => {});
  }
  get hasJobs() { return this.jobs.length > 0; }
  snapshot(completed) { return { jobs: this.jobs.map(({ child, directory, cancelled, ...job }) => ({ ...job, source: 'youtube', workspace: 'work' })), ...(completed ? { completed } : {}) }; }
  emit(completed) { this.notify?.(this.snapshot(completed)); }
  run(args, { onLine = () => {}, onChild = () => {}, timeout = 0 } = {}) {
    return new Promise((resolve, reject) => {
      const child = spawn(this.executable, ['--ignore-config', '--no-playlist', '--no-cache-dir', '--no-warnings', '--no-update', '--no-plugin-dirs', '--socket-timeout', '20', '--retries', '2', '--extractor-retries', '2', '--no-js-runtimes', '--js-runtimes', `node:${this.node}`, ...args], { windowsHide: true, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', PYTHONUTF8: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
      this.children.add(child); onChild(child);
      child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
      let buffer = '', stderr = '', failure;
      const timer = timeout ? setTimeout(() => { failure = new Error('YouTube 영상 확인 시간이 초과되었습니다. 다시 시도해 주세요.'); this.kill(child); }, timeout) : null;
      child.stdout.on('data', data => {
        buffer += data.toString('utf8');
        if (buffer.length > 8_000_000) { failure = new Error('영상 정보가 너무 큽니다.'); this.kill(child); return; }
        let end;
        while ((end = buffer.indexOf('\n')) >= 0) { const line = buffer.slice(0, end).trim(); buffer = buffer.slice(end + 1); try { onLine(line); } catch (error) { failure = error; this.kill(child); } }
      });
      child.stderr.on('data', data => { stderr = (stderr + data.toString('utf8')).slice(-2500); });
      child.once('error', error => { failure = error; });
      child.once('close', code => { clearTimeout(timer); this.children.delete(child); if (failure || code !== 0) reject(failure || new Error(stderr.trim() || '음성 가져오기가 중단되었습니다.')); else resolve(); });
    });
  }
  kill(child) {
    // yt-dlp may run a JS solver; terminate its process tree on Windows.
    if (process.platform === 'win32' && child?.pid) spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' }).on('error', () => child.kill());
    else child?.kill();
  }
  async inspect(value) {
    const url = youtubeUrl(value);
    if (this.closed || this.inspectBusy) throw new Error('영상 확인이 진행 중입니다. 잠시 뒤 다시 시도해 주세요.');
    this.inspectBusy = true;
    this.inspectCancelled = false;
    try {
      let raw;
      await this.runner(['--dump-single-json', '--skip-download', '--', url], { timeout: 90_000, onChild: child => { this.inspectChild = child; if (this.inspectCancelled) this.kill(child); }, onLine: line => { if (line.startsWith('{')) raw = JSON.parse(line); } });
      if (this.inspectCancelled || this.closed) throw new Error('영상 확인을 취소했습니다.');
      const info = videoInfo(raw || {}, url), token = randomUUID();
      for (const [key, entry] of this.tokens) if (Date.now() - entry.time > 30 * 60_000) this.tokens.delete(key);
      if (this.tokens.size >= 50) this.tokens.delete(this.tokens.keys().next().value);
      this.tokens.set(token, { info, time: Date.now() });
      return { ...info, token };
    } catch (error) { throw new Error(friendlyError(error)); }
    finally { this.inspectBusy = false; this.inspectChild = null; }
  }
  cancelInspect() { this.inspectCancelled = true; if (this.inspectChild) this.kill(this.inspectChild); }
  async start(payload) {
    if (this.closed || this.jobs.length >= 20) throw new Error('진행 중인 음성 가져오기를 마친 뒤 다시 시도해 주세요.');
    const entry = this.tokens.get(payload?.token);
    if (!entry || Date.now() - entry.time > 30 * 60_000) throw new Error('영상 확인이 만료되었습니다. 링크를 다시 확인해 주세요.');
    await this.library.ready;
    const folder = this.library.validateFolder(payload.folder || '');
    const { model } = validateSettings({ model: payload.model || this.queue.engine.preferences?.model || 'small', device: 'auto' }, await this.queue.engine.catalogue());
    // Recheck after asynchronous validation; a token can only submit one job.
    if (this.closed || !this.tokens.has(payload.token) || this.jobs.length >= 20) throw new Error('이미 처리된 요청입니다. 영상을 다시 확인해 주세요.');
    this.tokens.delete(payload.token);
    const job = { id: `youtube-${randomUUID()}`, title: entry.info.title, info: entry.info, folder, model, progress: 0, stage: 'downloading', status: 'queued', cancelled: false };
    this.jobs.push(job); this.emit(); this.kick();
    return { id: job.id };
  }
  cancel(id) {
    const job = this.jobs.find(item => item.id === id);
    if (!job) return;
    if (job.stage === 'saving') throw new Error('음성을 저장하는 중입니다. 저장이 끝난 뒤 변환을 취소해 주세요.');
    job.cancelled = true;
    if (job === this.active) { if (job.child) this.kill(job.child); }
    else { this.jobs = this.jobs.filter(item => item !== job); this.emit(); }
  }
  async kick() {
    if (this.active || this.closed || !this.jobs.length) return;
    const job = this.active = this.jobs[0]; job.status = 'active'; job.progress = null; this.emit();
    let completed;
    try {
      await this.ready;
      job.directory = path.join(this.root, job.id); await fs.mkdir(job.directory, { recursive: true });
      if (job.cancelled || this.closed) return;
      await this.runner(['--newline', '--progress', '--no-simulate', '--max-filesize', '2G', '-f', 'bestaudio[ext=m4a]/bestaudio[ext=webm]', '-o', path.join(job.directory, 'audio.%(ext)s'), '--progress-template', 'download:LOXT:%(progress.downloaded_bytes)s:%(progress.total_bytes)s:%(progress.total_bytes_estimate)s:%(progress.fragment_index)s:%(progress.fragment_count)s', '--', job.info.url], {
        onChild: child => { job.child = child; if (job.cancelled || this.closed) this.kill(child); },
        onLine: line => {
          if (!line.startsWith('LOXT:') || job.cancelled) return;
          const [, bytes, total, estimate, fragment, count] = line.split(':').map((item, index) => index ? Number(item) : item);
          const size = total > 0 ? total : estimate > 0 ? estimate : 0;
          const measured = size > 0 ? bytes / size * 100 : count > 0 ? fragment / count * 100 : null;
          job.progress = measured !== null && Number.isFinite(measured) ? Math.max(0, Math.min(100, Math.floor(measured))) : null; this.emit();
        },
      });
      if (job.cancelled || this.closed) return;
      const files = (await fs.readdir(job.directory)).filter(file => /^audio\.(m4a|webm)$/.test(file));
      if (files.length !== 1) throw new Error('완료된 음성 파일을 찾지 못했습니다.');
      job.stage = 'saving'; job.progress = 100; this.emit();
      const imported = await this.library.importAudio(path.join(job.directory, files[0]), job.folder, { title: job.title, seconds: job.info.seconds, source: { type: 'youtube', url: job.info.url, videoId: job.info.videoId, uploader: job.info.uploader } });
      completed = { id: job.id, noteId: imported.note.id };
      try { await this.queue.enqueue({ id: imported.note.id, model: job.model }); }
      catch (error) { completed.error = `음성은 보관함에 저장했습니다. 변환을 시작하지 못했습니다: ${friendlyError(error)}`; }
    } catch (error) { if (!job.cancelled && !this.closed) completed = { id: job.id, error: friendlyError(error) }; }
    finally {
      if (job.directory) await fs.rm(job.directory, { recursive: true, force: true }).catch(() => {});
      this.jobs = this.jobs.filter(item => item !== job); this.active = null; this.emit(completed); this.kick();
    }
  }
  shutdown() { this.closed = true; for (const job of this.jobs) job.cancelled = true; for (const child of this.children) this.kill(child); }
}

module.exports = { YouTubeImports, youtubeUrl, videoInfo, friendlyError };
