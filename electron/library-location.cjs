const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { createReadStream } = require('node:fs');
const { atomicJson } = require('./library.cjs');
async function files(root) {
  const entries = [];
  async function walk(dir) {
    for (const item of await fs.readdir(dir, { withFileTypes: true })) {
      const name = path.join(dir, item.name);
      if (item.isSymbolicLink()) throw new Error('보관함에 링크가 있어 자동 이전할 수 없습니다.');
      if (item.isDirectory()) await walk(name); else if (item.isFile()) entries.push(path.relative(root, name));
    }
  }
  await walk(root); return entries.sort();
}
async function hash(file) { const sum = createHash('sha256'); for await (const chunk of createReadStream(file)) sum.update(chunk); return sum.digest('hex'); }
async function verify(source, target) {
  const list = await files(source), copied = await files(target);
  if (JSON.stringify(list) !== JSON.stringify(copied)) throw new Error('이전 파일 목록이 일치하지 않습니다. 기존 보관함은 유지됩니다.');
  for (const item of list) if (await hash(path.join(source, item)) !== await hash(path.join(target, item))) throw new Error('이전 파일 검증에 실패했습니다. 기존 보관함은 유지됩니다.');
}
async function copyVerified(source, target, resume = false) {
  if (path.resolve(source).toLowerCase() === path.resolve(target).toLowerCase()) return;
  if (await fs.stat(target).then(() => true, e => e.code === 'ENOENT' ? false : Promise.reject(e))) {
    if (resume) { await verify(source,target); return; }
    throw new Error('대상에 보관함 폴더가 이미 있습니다. 비어 있는 다른 위치를 선택해 주세요.');
  }
  await files(source); // Reject links before copying any data.
  const stage = path.resolve(path.dirname(target), '.loxt-transfer-' + randomUUID());
  if (path.dirname(stage) !== path.resolve(path.dirname(target))) throw new Error('이전 경로를 확인해 주세요.');
  try {
    await fs.cp(source, stage, { recursive: true, errorOnExist: true, force: false });
    await verify(source,stage);
    await fs.rename(stage,target);
  } finally { await fs.rm(stage,{recursive:true,force:true}).catch(() => {}); }
}
class LibraryLocation {
  constructor(userData, defaultRoot) { this.file = path.join(userData, 'library-location.json'); this.userData = userData; this.defaultRoot = defaultRoot; this.root = null; this.busy = false; }
  async initialize() {
    try { const value = JSON.parse(await fs.readFile(this.file, 'utf8')); if (value.version !== 1 || !path.isAbsolute(value.root)) throw new Error('보관함 위치 설정이 올바르지 않습니다.'); this.root = value.root; return this.root; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    this.root = this.defaultRoot; await fs.mkdir(this.root, { recursive: true });
    for (const [old, next] of [['library', 'work-library'], ['live-library', 'live-library']]) {
      const source = path.join(this.userData, old), target = path.join(this.root, next);
      if (await fs.stat(source).then(() => true, e => e.code === 'ENOENT' ? false : Promise.reject(e))) await copyVerified(source, target, true);
    }
    await atomicJson(this.file, { version: 1, root: this.root }); return this.root;
  }
  async change(destination, stores) {
    if (this.busy) throw new Error('보관함 이전 중입니다.');
    if (!path.isAbsolute(destination) || destination.length > 2000) throw new Error('저장 위치를 확인해 주세요.');
    destination = path.resolve(destination);
    if (destination.toLowerCase() === this.root.toLowerCase()) return;
    if (destination.toLowerCase().startsWith(this.root.toLowerCase() + path.sep) || this.root.toLowerCase().startsWith(destination.toLowerCase() + path.sep)) throw new Error('기존 보관함과 겹치지 않는 위치를 선택해 주세요.');
    this.busy = true;
    try {
      // Caller excludes writers, then holds both library queues until the switch is durable.
      await fs.mkdir(destination, { recursive: true });
      for (const [mode, store] of Object.entries(stores)) await copyVerified(store.root, path.join(destination, mode === 'work' ? 'work-library' : 'live-library'));
      await atomicJson(this.file, { version: 1, root: destination });
      this.root = destination;
      for (const [mode, store] of Object.entries(stores)) { store.root = path.join(destination, mode === 'work' ? 'work-library' : 'live-library'); store.index = path.join(store.root, 'library.json'); store.recordings = path.join(store.root, 'recordings'); store.onChange(++store.revision); }
    } finally { this.busy = false; }
  }
}
module.exports = { LibraryLocation, copyVerified };
