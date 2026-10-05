const fs = require('node:fs/promises');
const path = require('node:path');

async function directoryUsage(root, seen = new Set()) {
  let bytes = 0, files = 0, skipped = 0;
  const walk = async directory => {
    let entries;
    try { const info = await fs.lstat(directory); if (info.isSymbolicLink()) { skipped++; return; } entries = await fs.readdir(directory, { withFileTypes: true }); }
    catch (error) { if (error.code !== 'ENOENT') throw error; return; }
    for (const entry of entries) {
      const filename = path.join(directory, entry.name), info = await fs.lstat(filename).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
      if (!info) continue;
      if (info.isSymbolicLink()) { skipped++; continue; }
      if (info.isDirectory()) { await walk(filename); continue; }
      if (!info.isFile()) continue;
      const identity = info.ino ? `${info.dev}:${info.ino}` : await fs.realpath(filename);
      if (seen.has(identity)) { skipped++; continue; }
      seen.add(identity); bytes += info.size; files++;
    }
  };
  await walk(root); return { bytes, files, skipped };
}

class SettingsSupport {
  constructor(root) { this.root = root; this.cache = null; this.pending = null; }
  locations() { return { work: path.join(this.root, 'library'), live: path.join(this.root, 'live-library'), models: path.join(this.root, 'transcription', 'models') }; }
  async storage(force = false) {
    if (this.pending) return this.pending;
    if (!force && this.cache && Date.now() - this.cache.checkedAt < 15000) return this.cache;
    this.pending = (async () => {
      const seen = new Set(), rows = [];
      for (const [id, location] of Object.entries(this.locations())) {
        try { const usage = await directoryUsage(location, seen); const volume = await fs.statfs(location).catch(() => null); rows.push({ id, path: location, ...usage, free: volume ? Number(volume.bavail) * Number(volume.bsize) : null }); }
        catch { rows.push({ id, path: location, error: '사용량을 확인하지 못했습니다. 폴더 접근 권한을 확인해 주세요.' }); }
      }
      this.cache = { rows, checkedAt: Date.now() }; return this.cache;
    })().finally(() => { this.pending = null; });
    return this.pending;
  }
  async existingLog() {
    for (const filename of [path.join(this.root, 'transcription', 'models', 'installer-preparation.log'), path.join(this.root, 'transcription', 'installer-preparation.log')]) {
      try { if ((await fs.stat(filename)).isFile()) return filename; } catch {}
    }
    throw new Error('저장된 설치 로그가 없습니다. 문제가 다시 발생하면 설치 파일의 복구 기능을 사용해 주세요.');
  }
}

function diagnosticInfo(version, environment, defaults) {
  // Deliberately whitelist fields: no paths, titles, transcripts, raw errors or filenames.
  const modelId = id => /^external-/.test(id || '') ? 'external-model' : id;
  environment = { ...environment, lastExecution: environment.lastExecution ? { mode: environment.lastExecution.mode, model: modelId(environment.lastExecution.model), device: environment.lastExecution.device, computeType: environment.lastExecution.computeType, at: environment.lastExecution.at } : null };
  defaults = { work: { model: modelId(defaults.work.model) }, live: { model: modelId(defaults.live.model) } };
  return JSON.stringify({ app: 'LOXT', version, platform: process.platform, hardware: { gpu: environment.gpu?.name || null, memoryMiB: environment.gpu?.memory || null, ramBytes: environment.ram || null }, automaticDevice: environment.device || null, lastExecution: environment.lastExecution || null, stage: environment.stage, ready: Boolean(environment.ready), defaults: { work: defaults.work.model, live: defaults.live.model }, models: environment.modelsChecked === false ? null : (environment.models || []).map(model => ({ id: model.external ? 'external-model' : model.id, installed: Boolean(model.downloaded), validated: Boolean(model.validated), partial: Boolean(model.partial) })) }, null, 2);
}
module.exports = { directoryUsage, SettingsSupport, diagnosticInfo };
