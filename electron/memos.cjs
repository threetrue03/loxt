const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { atomicJson } = require('./library.cjs');
const sync=require('./document-sync.cjs');
const ID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
const types = new Set(['paragraph','heading','bulletListItem','numberedListItem','checkListItem','toggleListItem','quote','table','codeBlock','image','file','divider','mathBlock']);
const imageTypes = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp' };
// Only deeply frozen, server-validated roots can bypass repeated patch validation.
// A transport payload never acquires trust merely by reusing an ID.
const validatedBlocks = new WeakMap();
const frozenValues = new WeakSet();
function freezeDocument(value) { if (!value || typeof value !== 'object' || frozenValues.has(value)) return; for (const child of Object.values(value)) freezeDocument(child); if (!Object.isFrozen(value)) Object.freeze(value); frozenValues.add(value); }
function validateBlocks(blocks, { trusted = false } = {}) {
  if (!Array.isArray(blocks) || !blocks.length) throw new Error('메모 본문이 비어 있거나 최대 크기(5 MB)를 초과했습니다.');
  // No active schemes or external images/files may enter the persisted document.
  function urls(value) {
    if (!value || typeof value !== 'object') return;
    for (const [key, item] of Object.entries(value)) {
      if (key === 'href' && typeof item === 'string' && !/^(https?:|mailto:)/i.test(item)) throw new Error('웹 주소 또는 이메일 링크만 사용할 수 있습니다.');
      if (key === 'url' && item && !/^loxt-asset:\/\/memo\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.[a-z0-9]{1,12}$/.test(item)) throw new Error('이미지와 파일은 PC에서 첨부해 주세요.');
      urls(item);
    }
  }
  let total = 0, bytes = 2;
  for (const block of blocks) {
    let stats = (trusted || Object.isFrozen(block)) && validatedBlocks.get(block);
    if (!stats) {
      let count = 0, maximumDepth = 0;
      function visit(list, depth) {
        if (depth > 32 || !Array.isArray(list)) throw new Error('메모의 중첩 구조를 확인해 주세요.');
        maximumDepth = Math.max(maximumDepth, depth);
        for (const item of list) {
          if (++count > 10000 || !item || !types.has(item.type) || typeof item.id !== 'string' || item.id.length > 120) throw new Error('지원하지 않는 메모 블록입니다.');
          if (item.children) visit(item.children, depth + 1);
        }
      }
      visit([block], 0); urls(block);
      stats = { count, depth: maximumDepth, bytes: Buffer.byteLength(JSON.stringify(block)) };
      freezeDocument(block); validatedBlocks.set(block, stats);
    }
    total += stats.count; bytes += stats.bytes + (total === stats.count ? 0 : 1);
    if (total > 10000 || stats.depth > 32) throw new Error('지원하지 않는 메모 블록입니다.');
    if (bytes > 5_000_000) throw new Error('메모 본문이 비어 있거나 최대 크기(5 MB)를 초과했습니다.');
  }
  return blocks;
}
function plainText(blocks, limit = 2000) {
  const parts = []; let length = 0;
  function walk(value) {
    if (length >= limit || !value || typeof value !== 'object') return;
    if (typeof value.text === 'string') { const separator = parts.length ? 1 : 0; const text = value.text.slice(0, Math.max(0, limit - length - separator)); parts.push(text); length += text.length + separator; }
    if (length >= limit) return;
    if (Array.isArray(value)) { for (const child of value) { if(length>=limit)break; walk(child); } }
    else if (value.type === 'tableContent') { for (const row of value.rows || []) { if(length>=limit)break; walk(row); } }
    else for (const [key, child] of Object.entries(value)) { if(length>=limit)break; if (['content','children','cells'].includes(key)) walk(child); }
  }
  walk(blocks); return parts.join(' ').slice(0, limit);
}
class Memos {
  constructor(library) { this.library = library; }
  note(id, editable = false) {
    if (!ID.test(id || '')) throw new Error('메모를 찾지 못했습니다.');
    const note = this.library.data.notes.find(n => n.id === id) || this.library.sessions.get(id)?.note;
    if (!note || (editable && note.deleted)) throw new Error('메모가 삭제되었거나 존재하지 않습니다.');
    return note;
  }
  directory(id) { return path.join(this.library.recordings, id); }
  create(folder = '') {
    return this.library.enqueue(async () => {
      const now = new Date();
      const note = { id: randomUUID(), kind: 'memo', title: '새 메모', folder: this.library.validateFolder(folder), date: `${now.getFullYear()}.${String(now.getMonth()+1).padStart(2,'0')}.${String(now.getDate()).padStart(2,'0')}`, createdAt: now.toISOString(), editedAt: now.toISOString(), segments: [], done: true, status: 'memo', deleted: false, memoPreview: '' };
      await fs.mkdir(this.directory(note.id));
      await atomicJson(path.join(this.directory(note.id), 'memo.json'), { version: 1, revision: 0, blocks: [{ id: randomUUID(), type: 'paragraph', props: {}, content: [], children: [] }] });
      return { note, library: await this.library.saveNote(note) };
    });
  }
  async read(id) {
    await this.library.ready; this.note(id);
    const file=path.join(this.directory(id),'memo.json'),cached=await sync.cached(this.library,file);if(cached)return cached;
    try {
      const doc = JSON.parse(await fs.readFile(path.join(this.directory(id), 'memo.json'), 'utf8'));
      if (doc.version !== 1 || !Number.isSafeInteger(doc.revision)) throw new Error('메모 형식이 올바르지 않습니다.');
      validateBlocks(doc.blocks); return sync.replay(file,doc,'blocks',value=>validateBlocks(value,{trusted:true}));
    } catch (error) {
      if(error.code==='ENOENT'&&this.note(id).kind!=='memo'){const [log,backup]=await Promise.all([fs.stat(file+'.journal').catch(e=>{if(e.code==='ENOENT')return null;throw e;}),fs.stat(file+'.backup').catch(e=>{if(e.code==='ENOENT')return null;throw e;})]);if(!log?.size&&!backup)return {version:1,revision:0,blocks:[{id,type:'paragraph',content:[],children:[]}]};}
      try {
        const backup = JSON.parse(await fs.readFile(path.join(this.directory(id), 'memo.json.backup'), 'utf8'));
        if (backup.version !== 1 || !Number.isSafeInteger(backup.revision)) throw new Error('잘못된 백업');
        validateBlocks(backup.blocks);
        return {...await sync.replay(file,backup,'blocks',value=>validateBlocks(value,{trusted:true})),recovered:true};
      } catch { /* Never replace an unreadable body with an empty document. */ }
      throw new Error('메모를 읽지 못했습니다. 원본을 유지했습니다. ' + error.message);
    }
  }
  save(payload) {
    return this.library.document(payload?.id, async () => {
      const note = this.note(payload?.id, true), current = await this.read(note.id);
      if(payload.revision!==current.revision){const error=new Error('다른 화면에서 메모가 변경되었습니다. 내 초안을 보존하고 최신 내용을 확인해 주세요.');error.code='CONFLICT';throw error;}
      const blocks = validateBlocks(payload.patch?sync.apply(current.blocks,payload.patch):payload.blocks, { trusted: Boolean(payload.patch) });
      const doc = { version: 1, revision: current.revision + 1, updatedAt: new Date().toISOString(), blocks };
      if (current.recovered) await fs.copyFile(path.join(this.directory(note.id), 'memo.json'), path.join(this.directory(note.id), 'memo.json.damaged-' + Date.now())).catch(error => { if (error.code !== 'ENOENT') throw error; });
      if(payload.patch){const file=path.join(this.directory(note.id),'memo.json');await fs.stat(file).catch(async error=>{if(error.code!=='ENOENT')throw error;await atomicJson(file,{version:1,revision:current.revision,blocks:current.blocks});});await sync.append(this.library,file,current,doc,payload.patch);}else {
      await atomicJson(path.join(this.directory(note.id), 'memo.json.backup'), { version: 1, revision: current.revision, updatedAt: current.updatedAt, blocks: current.blocks });
      await atomicJson(path.join(this.directory(note.id), 'memo.json'), doc);await sync.reset(this.library,path.join(this.directory(note.id),'memo.json'),doc);sync.forget(this.library,path.join(this.directory(note.id),'memo.json'));}
      // A durable body save is authoritative even if the optional index preview fails.
      const result=this.library.documentChanged(note.id,'memo',doc,{hasMemo:true,editedAt:doc.updatedAt,memoPreview:note.kind==='memo'?plainText(blocks):note.memoPreview});return payload.ack?{revision:result.revision,updatedAt:result.updatedAt}:result;
    });
  }
  async changes({id,since}){const doc=await this.read(id);return sync.changes(this.library,path.join(this.directory(id),'memo.json'),doc,since,'blocks');}
  attach(payload) {
    return this.library.enqueue(async () => {
      this.note(payload?.id, true);
      if (!(payload.bytes instanceof Uint8Array) || !payload.bytes.length || payload.bytes.length > 32 * 1024 * 1024 || typeof payload.name !== 'string') throw new Error('32 MB 이하의 파일을 첨부해 주세요.');
      let ext = path.extname(payload.name).toLowerCase(); if (!/^\.[a-z0-9]{1,12}$/.test(ext)) ext = '.bin';
      const filename = randomUUID() + ext, folder = path.join(this.directory(payload.id), 'attachments');
      await fs.mkdir(folder, { recursive: true });
      const file = await fs.open(path.join(folder, filename), 'wx');
      try { await file.writeFile(payload.bytes); await file.sync(); } finally { await file.close(); }
      return `loxt-asset://memo/${payload.id}/${filename}`;
    });
  }
  async asset(url) {
    const parsed = new URL(url), [id, filename, ...rest] = parsed.pathname.slice(1).split('/');
    if (parsed.protocol !== 'loxt-asset:' || parsed.hostname !== 'memo' || rest.length || !ID.test(id || '') || !/^[a-f0-9-]{36}\.[a-z0-9]{1,12}$/.test(filename || '') || !ID.test(filename.slice(0,36))) throw new Error('첨부파일 경로가 올바르지 않습니다.');
    await this.library.ready; this.note(id);
    const location = path.join(this.directory(id), 'attachments', filename);
    if (!(await fs.lstat(location)).isFile()) throw new Error('첨부파일을 찾지 못했습니다.');
    return { filename: location, mime: imageTypes[path.extname(filename)] || 'application/octet-stream', id, name: filename };
  }
}
module.exports = { Memos, validateBlocks, plainText };
