const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { waveHeader } = require('./pcm-wave.cjs');

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MIME = { '.webm': 'audio/webm', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.flac': 'audio/flac', '.mp4': 'audio/mp4' };
function validNote(note) {
  return note && typeof note === 'object' && ID.test(note.id)
    && typeof note.title === 'string' && typeof note.folder === 'string'
    && Array.isArray(note.segments) && (note.kind === 'folder' ? require('./folder-trash.cjs').validFolderTrash(note) : note.kind === 'memo' || (note.kind === 'pdf' && note.audioFile === 'original.pdf' && Number.isSafeInteger(note.pages) && note.pages > 0) || (typeof note.audioFile === 'string' && path.basename(note.audioFile) === note.audioFile
    && Boolean(MIME[path.extname(note.audioFile)])));
}
function recoverConversion(note) {
  if (note.done && note.diarization?.status === 'pending') return { ...note, status: 'partial', transcriptionError: '', diarization: { status: 'failed', error: '앱 종료로 화자 분석이 중단됐습니다. 화자 분석만 다시 시도할 수 있습니다.' } };
  if (['queued', 'transcribing'].includes(note.status)) return { ...note, status: 'failed', transcriptionError: '앱 종료로 변환이 중단됐습니다. 다시 시도해 주세요.' };
  return note;
}

function title(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 120) throw new Error('제목을 120자 이내로 입력해 주세요.');
  return value.trim();
}
function folderTitle(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 80 || /[\\/]/.test(value) || ['all', 'recent', 'trash', '.', '..'].includes(value.trim())) throw new Error('폴더 이름을 80자 이내로 입력해 주세요. /와 \\는 사용할 수 없습니다.');
  return value.trim();
}
function duration(seconds) {
  const total = Math.floor(seconds);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
function date() {
  const now = new Date();
  return `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')}`;
}
async function replaceFile(source, target) {
  for (let attempt = 0; ; attempt++) {
    try { await fs.rename(source, target); return; }
    catch (error) {
      if (process.platform !== 'win32' || !['EPERM', 'EBUSY', 'EACCES'].includes(error.code) || attempt >= 4) throw error;
      await new Promise(resolve => setTimeout(resolve, 25 * 2 ** attempt));
    }
  }
}
async function atomicJson(filename, data) {
  const temporary = filename + '.tmp';
  const handle = await fs.open(temporary, 'w');
  try { await handle.writeFile(JSON.stringify(data, null, 2)); await handle.sync(); }
  finally { await handle.close(); }
  await replaceFile(temporary, filename);
}
async function exists(filename) {
  try { await fs.access(filename); return true; } catch { return false; }
}
async function mapLimited(items,limit,work){const results=new Array(items.length);let cursor=0;await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{for(;;){const i=cursor++;if(i>=items.length)return;results[i]=await work(items[i]);}}));return results;}

class Library {
  constructor(root) {
    this.root = root;
    this.recordings = path.join(root, 'recordings');
    this.index = path.join(root, 'library.json');
    this.sessions = new Map();
    this.revision = 0;
    this.onChange = () => {};
    this.data = { version: 1, folders: [], notes: [] };
    this.queue = Promise.resolve();
    this.documents = new Map();this.metadataRevisions=new Map();
    this.ready = this.initialize();
  }
  enqueue(work) {
    const result = this.queue.then(() => this.ready).then(() => {
      if (this.audioTransferPending) throw new Error('녹음 원본 이동을 마치지 못했습니다. 앱을 다시 실행해 주세요.');
      if (this.folderRenamePending) throw new Error('폴더 변경 저장을 마치지 못했습니다. 앱을 다시 실행해 주세요. 원본은 유지됩니다.');
      if (this.trashDeletePending) throw new Error('휴지통 삭제를 마치지 못했습니다. 앱을 다시 실행해 주세요.');
      return work();
    });
    this.queue = result.catch(() => {});
    return result;
  }
  async initialize() {
    await fs.mkdir(this.recordings, { recursive: true });
    const journalPath = path.join(this.root, 'folder-rename.json');
    if (await exists(journalPath)) await this.commitFolderRename(JSON.parse(await fs.readFile(journalPath, 'utf8')));
    const trashJournal = path.join(this.root, 'trash-delete.json');
    if (await exists(trashJournal)) await this.commitTrashDelete(JSON.parse(await fs.readFile(trashJournal, 'utf8')));
    const audioJournal = path.join(this.root,'audio-transfer.json');
    if (await exists(audioJournal)) await require('./audio-trash.cjs').commitAudioTransfer(this,JSON.parse(await fs.readFile(audioJournal,'utf8')));
    let recovery = null;
    try { this.data = this.validateIndex(JSON.parse(await fs.readFile(this.index, 'utf8'))); }
    catch (error) {
      recovery = { reason: error.code === 'ENOENT' ? 'missing' : 'damaged', backup: false, skipped: 0 };
      if (error.code !== 'ENOENT') {
        // Preserve the original before attempting any repair; failure aborts safely.
        recovery.archive = this.index + '.damaged-' + Date.now() + '-' + randomUUID();
        await fs.copyFile(this.index, recovery.archive);
      }
      try { this.data = this.validateIndex(JSON.parse(await fs.readFile(this.index + '.backup', 'utf8'))); recovery.backup = true; }
      catch {
        this.data = { version: 1, folders: [], folderParents: {}, notes: [] };
        if (recovery.archive) {
          try {
            const damaged = JSON.parse(await fs.readFile(recovery.archive, 'utf8'));
            const salvage = { ...damaged, notes: Array.isArray(damaged.notes) ? damaged.notes.filter(validNote) : [] };
            this.data = this.validateIndex(salvage);
          } catch { /* Per-recording metadata is the final recovery source. */ }
        }
      }
    }
    this.revision = this.data.revision || 0;
    if (recovery?.reason === 'missing' && !this.data.notes.length && !(await fs.readdir(this.recordings)).length) recovery = null;
    this.recovery = recovery || this.data.recovery || null;
    // 각 녹음의 메타데이터로 목록을 복구하므로 목록 저장 직전 중단에도 원본이 남습니다.
    let changed = Boolean(recovery);
    const entries=(await fs.readdir(this.recordings,{withFileTypes:true})).filter(entry=>entry.isDirectory()&&ID.test(entry.name));
    const loaded=await mapLimited(entries,8,async entry=>{const directory=path.join(this.recordings,entry.name);try{const note=JSON.parse(await fs.readFile(path.join(directory,'note.json'),'utf8'));if(!validNote(note)||note.id!==entry.name)return null;const audio=path.join(directory,['memo','folder'].includes(note.kind)?'note.json':note.audioFile);return {directory,note,audio,hasAudio:['memo','folder'].includes(note.kind)||await exists(audio)};}catch{return null;}});
    const byId=new Map(this.data.notes.map((note,index)=>[note.id,index])),added=[],folderSet=new Set(this.data.folders);
    for (const item of loaded) {
      if(!item){if(recovery)recovery.skipped++;continue;}
      const {directory,audio}=item;let note=item.note,hasAudio=item.hasAudio;
      const partial = audio + '.part';
      if (!hasAudio && await exists(partial)) {
        const stat = await fs.stat(partial);
        if (note.live && note.mime === 'audio/wav' && stat.size >= 44) {
          const bytes = Math.floor((stat.size - 44) / 2) * 2;
          if (!bytes) continue;
          const handle = await fs.open(partial, 'r+');
          try { await handle.truncate(bytes + 44); await handle.write(waveHeader(bytes), 0, 44, 0); await handle.sync(); }
          finally { await handle.close(); }
          note.seconds = bytes / 32000; note.duration = duration(note.seconds);
        }
        if (stat.size === 0) continue;
        await fs.rename(partial, audio);
        hasAudio=true;
        note.recovered = true;
        note.done = Boolean(note.live);
        note.status = 'ready';
        await atomicJson(path.join(directory, 'note.json'), note);
      }
      if (!hasAudio && !(note.audioMissing && note.done)) continue;
      // Page operations persist the complete drawing snapshot before deferred metadata.
      if(note.documentType==='drawing'){try{const doc=JSON.parse(await fs.readFile(path.join(directory,'annotations.json'),'utf8'));if(doc.version===1&&Array.isArray(doc.pageIds)){const ids=require('./drawing-pages.cjs').validatePages(doc.pageIds);if(note.pages!==ids.length){note.pages=ids.length;await atomicJson(path.join(directory,'note.json'),note);changed=true;}}}catch{ /* The PDF reader reports invalid annotations without changing the original. */ }}
      if (note.folder && note.folder.length <= 1024 && !folderSet.has(note.folder)) {
        const parts = note.folder.split('/');
        for (let i = 1; i <= parts.length; i++) {
          const folder = parts.slice(0, i).join('/');
          if (!folderSet.has(folder)){this.data.folders.push(folder);folderSet.add(folder);}
          if (i > 1) this.data.folderParents[folder] = parts.slice(0, i - 1).join('/');
        }
        changed = true;
      }
      if (note.status === 'recording') {
        note.status = 'ready'; note.recovered = true; if (note.live) note.done = true;
        await atomicJson(path.join(directory, 'note.json'), note);
      }
      const restored = recoverConversion(note);
      if (restored !== note) {
        note = restored;
        await atomicJson(path.join(directory, 'note.json'), note);
      }
      const current = byId.get(note.id);
      if (current === undefined) { added.push(note); changed = true; }
      else if (JSON.stringify(this.data.notes[current]) !== JSON.stringify(note)) { const previous=this.data.notes[current];this.data.notes[current]=note; if(!previous._summary||JSON.stringify(previous)!==JSON.stringify(require('../shared/library-summary.cjs').summary(note)))changed=true; }
    }
    if(added.length)this.data.notes=[...added.reverse(),...this.data.notes];
    if (recovery) {
      const available=await mapLimited(this.data.notes,8,async note=>note.audioMissing&&note.done||await exists(path.join(this.recordings,note.id,['memo','folder'].includes(note.kind)?'note.json':note.audioFile))?recoverConversion(note):null);
      recovery.skipped+=available.filter(n=>!n).length;this.data.notes=available.filter(Boolean);
    }
    if (changed || !(await exists(this.index))) { this.validateIndex(this.data); await this.saveIndex(this.data, !recovery); }
  }
  validateIndex(data) {
    if (data?.version !== 1 || !Array.isArray(data.folders) || !Array.isArray(data.notes)
      || !data.folders.every(name => typeof name === 'string' && name.length <= 1024) || !data.notes.every(validNote)) throw new Error('저장 목록 형식이 올바르지 않습니다.');
    const parents = data.folderParents || {};
    if (typeof parents !== 'object' || Array.isArray(parents) || Object.entries(parents).some(([child, parent]) => !data.folders.includes(child) || !data.folders.includes(parent) || child === parent)) throw new Error('폴더 구조가 올바르지 않습니다.');
    for (const folder of data.folders) {
      let current = folder; const seen = new Set();
      while (Object.hasOwn(parents, current)) { if (seen.has(current)) throw new Error('폴더 구조가 올바르지 않습니다.'); seen.add(current); current = parents[current]; }
    }
    return { ...data, folderParents: parents };
  }
  async saveIndex(data, backup = true, notify = true) {
    this.validateIndex(data);
    if (backup) {
      try {
        this.validateIndex(JSON.parse(await fs.readFile(this.index, 'utf8')));
        await fs.copyFile(this.index, this.index + '.backup.tmp');
        await replaceFile(this.index + '.backup.tmp', this.index + '.backup');
      } catch (error) { if (error.code !== 'ENOENT' && ['EACCES', 'ENOSPC', 'EPERM'].includes(error.code)) throw error; }
    }
    data.revision = ++this.revision; data.recovery = this.recovery || null;
    await atomicJson(this.index, require('../shared/library-summary.cjs').lightResult(data));
    if(notify)this.emitChange({kind:'library'});
  }
  snapshot() {
    return JSON.parse(JSON.stringify({ ...this.data, revision: this.revision, recovery: this.recovery, storagePath: this.root }));
  }
  async list() { await this.ready; return this.snapshot(); }
  async listSummary() { await this.ready; return require('../shared/library-summary.cjs').lightResult({...this.data,revision:this.revision,recovery:this.recovery,storagePath:this.root,indexError:this.indexError||null}); }
  async detail(id) { await this.ready; const note=this.data.notes.find(n=>n.id===id); if(!note)throw new Error('문서를 찾지 못했습니다.'); return JSON.parse(JSON.stringify(note)); }
  emitChange(change) { const revision=this.revision,event={...change,...require('./sync-trace.cjs').current()};setImmediate(()=>this.onChange(revision,event)); }
  document(id, work) {
    const trace=require('./sync-trace.cjs');trace.mark('queued');
    const previous=this.documents.get(id)||Promise.resolve();
    const next=previous.catch(()=>{}).then(()=>this.ready).then(()=>{trace.mark('saveStarted');return work();});
    this.documents.set(id,next); next.finally(()=>{if(this.documents.get(id)===next)this.documents.delete(id);}).catch(()=>{});return next;
  }
  documentChanged(id,kind,doc,changes) {
    // A durable document is acknowledged independently of unrelated metadata work.
    this.metadataRevisions.set(kind+':'+id,doc.revision);
    const original=this.data.notes.find(n=>n.id===id)||this.sessions.get(id)?.note;
    this.revision++;
    if(original&&!original.deleted){const updated={...original,...changes,updatedRevision:this.revision};this.data={...this.data,notes:[updated,...this.data.notes.filter(n=>n.id!==id)]};}
    const trace=require('./sync-trace.cjs');trace.mark('bodyDurable');trace.mark('eventQueued');this.emitChange({id,kind,documentRevision:doc.revision,...trace.current()});
    const save=()=>this.enqueue(async()=>{if(this.metadataRevisions.get(kind+':'+id)!==doc.revision)return;const current=this.data.notes.find(n=>n.id===id)||this.sessions.get(id)?.note;if(current&&!current.deleted)await this.saveNote({...current,...changes},true);});
    const retry=attempt=>save().catch(error=>{this.indexError='본문은 저장됐지만 목록 갱신을 마치지 못했습니다. '+error.message;this.emitChange({id,kind:'library',error:this.indexError});if(attempt<3){const timer=setTimeout(()=>retry(attempt+1),1000*attempt);timer.unref?.();}});
    retry(1);return doc;
  }
  scheduleIndex() {
    this.indexDirty=true;this.indexSince ||= Date.now();clearTimeout(this.indexTimer);
    this.indexTimer=setTimeout(()=>this.flushIndex().catch(error=>{this.indexError=error.message;this.emitChange({kind:'library',error:this.indexError});}),Math.min(500,Math.max(0,1500-(Date.now()-this.indexSince))));this.indexTimer.unref?.();
  }
  flushIndex() {
    clearTimeout(this.indexTimer);
    return this.enqueue(async()=>{if(!this.indexDirty)return;await this.saveIndex(this.data,true,false);this.indexDirty=false;this.indexSince=0;this.indexError='';});
  }
  validateFolder(folder) {
    if (folder !== '' && !this.data.folders.includes(folder)) throw new Error('저장할 폴더를 다시 선택해 주세요.');
    return folder;
  }
  createFolder(payload) {
    return this.enqueue(async () => {
      let name = typeof payload === 'string' ? payload : payload?.name;
      const parent = typeof payload === 'string' ? '' : payload?.parent || '';
      name = folderTitle(name);
      this.validateFolder(parent);
      name = parent ? `${parent}/${name.trim()}` : name.trim();
      if (name.length > 1024 || name.split('/').length > 16) throw new Error('폴더 단계가 너무 깊습니다.');
      if (this.data.folders.includes(name)) throw new Error('이미 있는 폴더 이름입니다.');
      const next = { ...this.data, folders: [...this.data.folders, name],folderIds:{...this.data.folderIds,[name]:randomUUID()}, folderParents: { ...this.data.folderParents, ...(parent ? { [name]: parent } : {}) } };
      await this.saveIndex( next); this.data = next;
      return this.snapshot();
    });
  }
  async commitFolderRename(journal) {
    const data = journal?.data;
    if (journal?.version !== 1 || data?.version !== 1 || !Array.isArray(data.folders) || !data.folders.every(folder => typeof folder === 'string' && folder.length <= 1024)
      || !Array.isArray(data.notes) || !data.notes.every(validNote) || !Array.isArray(journal.notes) || !journal.notes.every(validNote)) throw new Error('폴더 변경 기록을 읽지 못했습니다. 원본은 유지됩니다.');
    const removed=journal.remove||[];if(!Array.isArray(removed)||removed.some(id=>!ID.test(id)||data.notes.some(note=>note.id===id)))throw Error('폴더 복구 정리 위치를 확인해 주세요.');
    for (const note of journal.notes) {await fs.mkdir(path.join(this.recordings,note.id),{recursive:true});await atomicJson(path.join(this.recordings, note.id, 'note.json'), note);}
    await this.saveIndex( data);
    for(const id of removed){const directory=path.resolve(this.recordings,id);if(path.dirname(directory)!==path.resolve(this.recordings))throw Error('폴더 복구 정리 위치를 확인해 주세요.');await fs.rm(directory,{recursive:true,force:true});}
    await fs.unlink(path.join(this.root, 'folder-rename.json'));
  }
  renameFolder(payload) {
    return this.enqueue(async () => {
      const from = this.validateFolder(payload?.folder);
      if (!from) throw new Error('변경할 폴더를 선택해 주세요.');
      const parents = this.data.folderParents || {};
      const parent = Object.hasOwn(parents, from) ? parents[from] : '';
      const to = parent ? `${parent}/${folderTitle(payload?.name)}` : folderTitle(payload?.name);
      if (from === to) return { library: this.snapshot(), renamed: {} };
      const mapped = new Map();
      const remap = folder => {
        if (mapped.has(folder)) return mapped.get(folder);
        const ancestor = Object.hasOwn(parents, folder) ? parents[folder] : '';
        const next = folder === from ? to : ancestor && remap(ancestor) !== ancestor ? `${remap(ancestor)}/${folder.slice(ancestor.length + 1)}` : folder;
        mapped.set(folder, next); return next;
      };
      const folders = this.data.folders.map(remap);
      if (new Set(folders).size !== folders.length) throw new Error('이미 있는 폴더 이름입니다.');
      if (folders.some(folder => folder.length > 1024)) throw new Error('폴더 경로가 너무 깁니다.');
      const folderParents = Object.fromEntries(Object.entries(parents).map(([child, ancestor]) => [remap(child), remap(ancestor)]));
      const historyPath=value=>typeof value==='string'&&(value===from||value.startsWith(from+'/'))?to+value.slice(from.length):value;
      const remapNote = note => ({ ...note, folder: remap(note.folder),...(note.trashedFolderPath?{trashedFolderPath:historyPath(note.trashedFolderPath)}:{}),...(note.kind==='folder'?{folderTrashRoot:historyPath(note.folderTrashRoot),folderPaths:note.folderPaths.map(historyPath),folderMembers:Object.fromEntries(Object.entries(note.folderMembers).map(([id,p])=>[id,historyPath(p)])),...(note.restoredRoot?{restoredRoot:historyPath(note.restoredRoot)}:{})}:{} ) });
      const notes = this.data.notes.map(remapNote);
      const changed = notes.filter((note, index) => JSON.stringify(note)!==JSON.stringify(this.data.notes[index]));
      const active = [...this.sessions.values()].map(session => remapNote(session.note)).filter(note => note.folder !== this.sessions.get(note.id).note.folder);
      const next = { ...this.data, folders, folderParents,folderIds:Object.fromEntries(Object.entries(this.data.folderIds||{}).map(([folder,id])=>[remap(folder),id])), notes };
      const journal = { version: 1, data: next, notes: [...changed, ...active] };
      await atomicJson(path.join(this.root, 'folder-rename.json'), journal);
      this.folderRenamePending = true;
      await this.commitFolderRename(journal);
      this.data = next; this.folderRenamePending = false;
      for (const note of active) this.sessions.get(note.id).note = note;
      return { library: this.snapshot(), renamed: Object.fromEntries([...mapped].filter(([old, value]) => old !== value)) };
    });
  }
  async saveNote(note, deferred = false) {
    note={...note,updatedRevision:this.revision+1};
    await atomicJson(path.join(this.recordings, note.id, 'note.json'), note);
    const next = { ...this.data, notes: [note, ...this.data.notes.filter(n => n.id !== note.id)] };
    if(deferred){this.data=next;this.revision++;this.scheduleIndex();this.emitChange({id:note.id,kind:'metadata',note:require('../shared/library-summary.cjs').summary(note)});}
    else {await this.saveIndex(next);this.data=next;}
    return deferred ? undefined : this.snapshot();
  }
  folderSubtree(folder) {
    this.validateFolder(folder);
    if (!folder) throw new Error('내 보관함은 삭제할 수 없습니다.');
    const removed = new Set([folder]);
    for (let changed = true; changed;) {
      changed = false;
      for (const name of this.data.folders) if (!removed.has(name) && removed.has(this.data.folderParents?.[name])) { removed.add(name); changed = true; }
    }
    return removed;
  }
  async deleteFolder(folder) {await this.ready;const removed=[...this.folderSubtree(folder)];const library=await new(require('./library-actions.cjs').LibraryActions)(this).run({action:'trash',ids:[],folders:[folder]});return {library,removed};}
  trashNotes(ids) {
    if (!Array.isArray(ids) || !ids.length || ids.length > 10000 || ids.some(id => !ID.test(id)) || new Set(ids).size !== ids.length) throw new Error('휴지통 항목을 다시 선택해 주세요.');
    const notes = ids.map(id => this.data.notes.find(note => note.id === id));
    if (notes.some(note => !note?.deleted || ['recording', 'queued', 'transcribing'].includes(note.status) || this.sessions.has(note.id))) throw new Error('선택한 휴지통 항목을 처리할 수 없습니다. 진행 중인 작업을 확인해 주세요.');
    return notes;
  }
  restoreTrash(ids) {
    return this.enqueue(async () => {
      const selected=this.trashNotes(ids);
      if(selected.some(n=>n.kind==='folder'||n.trashedFolderId)){
        const plan=require('./folder-trash.cjs').restorePlan(this,selected);
        const selectedIds=new Set(selected.map(n=>n.id)),audio=plan.notes.filter(n=>n.kind==='audio'&&n.parentRecordingId&&!selectedIds.has(n.id));
        if(selected.some(n=>n.kind==='audio'&&n.parentRecordingId)||audio.length){const result=await require('./audio-trash.cjs').restoreDetached(this,[...selected,...audio],{data:plan.data,extraNotes:plan.notes,remove:plan.remove});return {...result,restoredFolders:plan.restored};}
        const journal={version:1,data:plan.data,notes:plan.notes,remove:plan.remove};await atomicJson(path.join(this.root,'folder-rename.json'),journal);this.folderRenamePending=true;await this.commitFolderRename(journal);this.data=plan.data;this.folderRenamePending=false;return {...this.snapshot(),restoredFolders:plan.restored};
      }
      if(selected.some(n=>n.kind==='audio'&&n.parentRecordingId)) return require('./audio-trash.cjs').restoreDetached(this,selected);
      const changed = selected.map(note => ({ ...note, deleted: false, folder: this.data.folders.includes(note.folder) ? note.folder : '' }));
      const mapped = new Map(changed.map(note => [note.id, note]));
      const next = { ...this.data, notes: this.data.notes.map(note => mapped.get(note.id) || note) };
      const journal = { version: 1, data: next, notes: changed };
      await atomicJson(path.join(this.root, 'folder-rename.json'), journal); this.folderRenamePending = true;
      await this.commitFolderRename(journal); this.data = next; this.folderRenamePending = false;
      return this.snapshot();
    });
  }
  async commitTrashDelete(journal) {
    const data = journal?.data;
    if (journal?.version !== 1 || data?.version !== 1 || !Array.isArray(data.folders) || !Array.isArray(data.notes) || !data.notes.every(validNote)
      || !Array.isArray(journal.ids) || journal.ids.some(id => !ID.test(id) || data.notes.some(note => note.id === id))) throw new Error('휴지통 삭제 기록을 읽지 못했습니다.');
    // The journal stays until all UUID directories are removed, preventing metadata recovery from resurrecting deleted recordings.
    await this.saveIndex( data);
    for (const id of journal.ids) {
      const target = path.resolve(this.recordings, id);
      if (path.dirname(target) !== path.resolve(this.recordings)) throw new Error('잘못된 삭제 위치입니다.');
      await fs.rm(target, { recursive: true, force: true });
    }
    await fs.unlink(path.join(this.root, 'trash-delete.json'));
  }
  deleteTrash(ids) {
    return this.enqueue(async () => {
      this.trashNotes(ids);ids=require('./folder-trash.cjs').expandPermanentIds(this,ids);if(ids.some(id=>this.documents.has(id)||this.sessions.has(id)))throw new Error('문서 저장을 마친 뒤 삭제해 주세요.');
      const selected = new Set(ids), next = { ...this.data, notes: this.data.notes.filter(note => !selected.has(note.id)) };
      const journal = { version: 1, data: next, ids };
      await atomicJson(path.join(this.root, 'trash-delete.json'), journal); this.trashDeletePending = true;
      await this.commitTrashDelete(journal); this.data = next; this.trashDeletePending = false;
      return this.snapshot();
    });
  }
  moveNotes(payload) {
    return this.enqueue(async () => {
      const ids = payload?.ids;
      if (!Array.isArray(ids) || !ids.length || ids.length > 10000 || ids.some(id => !ID.test(id)) || new Set(ids).size !== ids.length) throw new Error('이동할 녹음을 다시 선택해 주세요.');
      const folder = this.validateFolder(payload.folder);
      const selected = ids.map(id => this.data.notes.find(note => note.id === id));
      if (selected.some(note => !note || note.deleted || this.sessions.has(note.id))) throw new Error('이동할 수 없는 녹음이 포함되어 있습니다.');
      const changed = selected.map(note => ({ ...note, folder }));
      const mapped = new Map(changed.map(note => [note.id, note]));
      const next = { ...this.data, notes: this.data.notes.map(note => mapped.get(note.id) || note) };
      const journal = { version: 1, data: next, notes: changed };
      await atomicJson(path.join(this.root, 'folder-rename.json'), journal); this.folderRenamePending = true;
      await this.commitFolderRename(journal); this.data = next; this.folderRenamePending = false;
      return this.snapshot();
    });
  }
  detachAudio(id) { return require('./audio-trash.cjs').detachAudio.call(this,id); }
  discardRecording(id) {
    return this.enqueue(async () => {
      if (!ID.test(id)) throw new Error('녹음을 찾지 못했습니다.');
      const session = this.sessions.get(id), note = this.data.notes.find(item => item.id === id);
      if (!session && (!note || note.done || !['ready', 'recording'].includes(note.status))) throw new Error('진행 중인 새 녹음만 버릴 수 있습니다.');
      const next = { ...this.data, notes: this.data.notes.filter(item => item.id !== id) };
      const journal = { version: 1, data: next, ids: [id] };
      await atomicJson(path.join(this.root, 'trash-delete.json'), journal); this.trashDeletePending = true;
      if (session && !session.closed) { await session.handle.close(); session.closed = true; }
      this.sessions.delete(id);
      await this.commitTrashDelete(journal); this.data = next; this.trashDeletePending = false;
      return this.snapshot();
    });
  }
  beginRecording(payload) {
    return this.enqueue(async () => {
      const mime = payload?.mime;
      const ext = mime === 'audio/webm' ? '.webm' : mime === 'audio/ogg' ? '.ogg' : mime === 'audio/wav' ? '.wav' : mime === 'audio/mp4' ? '.m4a' : null;
      if (!ext) throw new Error('지원하지 않는 녹음 형식입니다.');
      const note = { id: randomUUID(), title: title(payload.title), folder: this.validateFolder(payload.folder || ''), date: date(), createdAt: new Date().toISOString(), seconds: 0, duration: '00:00', done: false, deleted: false, segments: [], audioFile: 'audio' + ext, mime, status: 'recording' };
      if (mime === 'audio/wav') note.live = true;
      const directory = path.join(this.recordings, note.id);
      await fs.mkdir(directory);
      await atomicJson(path.join(directory, 'note.json'), note);
      const handle = await fs.open(path.join(directory, note.audioFile + '.part'), 'wx');
      if (mime === 'audio/wav') await handle.write(waveHeader(0));
      this.sessions.set(note.id, { note, handle, bytes: 0, sequence: 0, closed: false });
      return { id: note.id };
    });
  }
  appendRecording(payload) {
    return this.enqueue(async () => {
      const session = this.sessions.get(payload?.id);
      if (!session || session.closed) throw new Error('진행 중인 녹음을 찾지 못했습니다.');
      if (!Number.isInteger(payload.sequence) || payload.sequence < 0) throw new Error('녹음 조각 순서가 올바르지 않습니다.');
      if (payload.sequence < session.sequence) return { accepted: true };
      if (payload.sequence !== session.sequence) throw new Error('녹음 조각 순서가 올바르지 않습니다.');
      if (!(payload.bytes instanceof Uint8Array) || payload.bytes.length === 0 || payload.bytes.length > 16 * 1024 * 1024) throw new Error('녹음 조각이 올바르지 않습니다.');
      if (session.note.mime === 'audio/wav' && payload.bytes.length % 2) throw new Error('오디오 샘플 길이가 올바르지 않습니다.');
      if (session.note.mime === 'audio/wav' && session.bytes + payload.bytes.length > 0xffffffff - 36) throw new Error('녹음 파일의 최대 크기에 도달했습니다. 녹음을 종료하고 저장해 주세요.');
      const buffer = Buffer.from(payload.bytes);
      let written = 0;
      try {
        while (written < buffer.length) {
          const result = await session.handle.write(buffer, written, buffer.length - written, session.bytes + written + (session.note.mime === 'audio/wav' ? 44 : 0));
          if (result.bytesWritten === 0) throw new Error('녹음 파일을 쓰지 못했습니다.');
          written += result.bytesWritten;
        }
      } catch (error) { await session.handle.truncate(session.bytes + (session.note.mime === 'audio/wav' ? 44 : 0)); throw error; }
      session.bytes += buffer.length; session.sequence++;
      return { accepted: true };
    });
  }
  finishRecording(payload) {
    return this.enqueue(async () => {
      const session = this.sessions.get(payload?.id);
      if (!session || !session.bytes) throw new Error('저장할 녹음 데이터가 없습니다.');
      const seconds = session.note.mime === 'audio/wav' ? session.bytes / 32000 : payload.seconds;
      if (!Number.isFinite(seconds) || seconds < 0 || seconds > 7 * 24 * 3600) throw new Error('녹음 시간이 올바르지 않습니다.');
      const note = { ...session.note, ...this.data.notes.find(item => item.id === payload.id), seconds, duration: duration(seconds), status: 'ready' };
      const directory = path.join(this.recordings, note.id);
      if (!session.closed) { if (note.mime === 'audio/wav') await session.handle.write(waveHeader(session.bytes), 0, 44, 0); await session.handle.sync(); await session.handle.close(); session.closed = true; }
      const partial = path.join(directory, note.audioFile + '.part');
      if (await exists(partial)) await fs.rename(partial, path.join(directory, note.audioFile));
      const library = await this.saveNote(note);
      this.sessions.delete(note.id);
      return { library, note };
    });
  }
  checkpointRecording(payload) {
    return this.enqueue(async () => {
      const session = this.sessions.get(payload?.id);
      if (!session || session.closed) return;
      session.note = { ...session.note, ...this.data.notes.find(item => item.id === payload.id) };
      if (Number.isFinite(payload.seconds) && payload.seconds >= 0) {
        session.note.seconds = payload.seconds;
        session.note.duration = duration(payload.seconds);
      }
      await session.handle.sync();
      await atomicJson(path.join(this.recordings, session.note.id, 'note.json'), session.note);
    });
  }
  checkpointLive(id, segments) {
    return this.enqueue(async () => {
      const session = this.sessions.get(id);
      if (!session || session.closed || session.note.mime !== 'audio/wav') throw new Error('진행 중인 Live 녹음이 없습니다.');
      const seconds = session.bytes / 32000;
      if (!Array.isArray(segments) || !segments.every(s => Number.isFinite(s.start) && Number.isFinite(s.end) && s.start >= 0 && s.start <= s.end && s.end <= seconds && typeof s.text === 'string')) throw new Error('Live 스크립트 시간이 올바르지 않습니다.');
      session.note = { ...session.note, ...this.data.notes.find(item => item.id === id), segments, seconds, duration: duration(seconds) };
      await session.handle.write(waveHeader(session.bytes), 0, 44, 0); await session.handle.sync();
      // Per-note checkpoints remain durable; rebuilding the global index recovers them.
      await atomicJson(path.join(this.recordings, id, 'note.json'), session.note);
      this.data.notes = [session.note, ...this.data.notes.filter(note => note.id !== id)];
    });
  }
  abandonRecording(id) {
    return this.enqueue(async () => {
      const session = this.sessions.get(id);
      if (!session) return;
      if (!session.closed) { await session.handle.close(); session.closed = true; }
      this.sessions.delete(id);
      // .part 파일은 삭제하지 않습니다. 다음 실행 시 저장된 부분을 복구합니다.
    });
  }
  async importAudio(filename, folder, metadata) {
      await this.ready;
      const ext = path.extname(filename).toLowerCase();
      if (!MIME[ext]) throw new Error('지원하지 않는 오디오 파일 형식입니다.');
      const source = await fs.stat(filename);
      if (!source.isFile() || source.size === 0) throw new Error('비어 있거나 읽을 수 없는 파일입니다.');
      const note = { id: randomUUID(), title: title(path.basename(filename, path.extname(filename)).slice(0, 120)), folder: this.validateFolder(folder || ''), date: date(), createdAt: new Date().toISOString(), seconds: 0, duration: '00:00', done: false, deleted: false, segments: [], audioFile: 'audio' + ext, mime: MIME[ext], status: 'ready' };
      if (metadata) {
        const { youtubeUrl } = require('./youtube.cjs');
        if (metadata.source?.type !== 'youtube' || youtubeUrl(metadata.source.url) !== metadata.source.url || !Number.isFinite(metadata.seconds) || metadata.seconds <= 0 || metadata.seconds > 7 * 24 * 3600) throw new Error('영상 정보가 올바르지 않습니다.');
        note.title = title(metadata.title); note.seconds = metadata.seconds; note.duration = duration(metadata.seconds);
        note.source = { type: 'youtube', url: metadata.source.url, videoId: new URL(metadata.source.url).searchParams.get('v'), uploader: String(metadata.source.uploader || '').slice(0, 200) };
      }
      const directory = path.join(this.recordings, note.id);
      await fs.mkdir(directory);
      const partial = path.join(directory, note.audioFile + '.part');
      await fs.copyFile(filename, partial);
      await fs.rename(partial, path.join(directory, note.audioFile));
      return this.enqueue(async()=>{this.validateFolder(note.folder);const library=await this.saveNote(note);return {library,note};});
  }
  updateNote(id, changes, expected) {
    return this.enqueue(async () => {
      const original = this.data.notes.find(n => n.id === id);
      if (!original) throw new Error('녹음을 찾지 못했습니다.');
      if(expected&&['title','folder','deleted'].some(key=>Object.hasOwn(expected,key)&&original[key]!==expected[key])){const error=new Error('다른 기기에서 기록이 변경되었습니다. 최신 내용을 확인한 뒤 다시 시도해 주세요.');error.code='CONFLICT';throw error;}
      const note = { ...original };
      if (Object.hasOwn(changes, 'title')) note.title = title(changes.title);
      if (Object.hasOwn(changes, 'folder')) note.folder = this.validateFolder(changes.folder);
      if (Object.hasOwn(changes, 'deleted')) {
        if (typeof changes.deleted !== 'boolean') throw new Error('잘못된 요청입니다.');
        note.deleted = changes.deleted;
      }
      if (Object.hasOwn(changes, 'seconds')) {
        if (!Number.isFinite(changes.seconds) || changes.seconds < 0 || changes.seconds > 7 * 24 * 3600) throw new Error('잘못된 녹음 시간입니다.');
        note.seconds = changes.seconds; note.duration = duration(changes.seconds);
      }
      return this.saveNote(note);
    });
  }
  setTranscription(id, changes) {
    return this.enqueue(async () => {
      const note = this.data.notes.find(n => n.id === id);
      if (!note || note.audioMissing || ['memo','pdf','folder'].includes(note.kind) || (note.deleted && changes.status === 'transcribing') || note.status === 'recording') throw new Error('전사할 원본을 찾지 못했습니다.');
      return this.saveNote({ ...note, ...changes });
    });
  }
  completeTranscription(id, result) {
    return this.enqueue(async () => {
      const note = this.data.notes.find(n => n.id === id);
      if (!note || ['memo','pdf','folder'].includes(note.kind) || !Array.isArray(result.segments) || !Number.isFinite(result.seconds) || result.seconds < 0
        || !result.segments.every(s => Number.isFinite(s.start) && Number.isFinite(s.end) && s.start >= 0 && s.end >= s.start && typeof s.text === 'string')) throw new Error('전사 결과 형식이 올바르지 않습니다.');
      if (result.segments.some(s => s.start >= result.seconds || s.end > result.seconds)) throw new Error('스크립트 시간이 원본 녹음 길이를 초과했습니다. 다시 변환해 주세요.');
      const directory = path.join(this.recordings, id);
      await atomicJson(path.join(directory, 'transcript.json'), result);
      const { serializeTranscript } = await import('../shared/transcript.js');
      const text = serializeTranscript(result.segments, { time: true, brackets: true });
      const temporary = path.join(directory, 'transcript.txt.tmp');
      await fs.writeFile(temporary, '\ufeff' + text, 'utf8');
      await replaceFile(temporary, path.join(directory, 'transcript.txt'));
      return this.saveNote({ ...note, done: true, status: result.diarization?.status === 'failed' ? 'partial' : result.diarization?.status === 'pending' ? 'transcribing' : 'done', diarization: result.diarization || { status: 'done' }, segments: result.segments,
        seconds: result.seconds, duration: duration(result.seconds), transcriptionError: '',
        transcription: { model: result.model, device: result.device, computeType: result.compute_type, language: result.language, completedAt: new Date().toISOString() } });
    });
  }
  async getAudio(id) {
    await this.ready;
    if (!ID.test(id)) throw new Error('잘못된 녹음 ID입니다.');
    const note = this.data.notes.find(n => n.id === id);
    if (!note || note.audioMissing || ['memo','pdf','folder'].includes(note.kind) || !MIME[path.extname(note.audioFile)] || path.basename(note.audioFile) !== note.audioFile) throw new Error('녹음을 찾지 못했습니다.');
    return { filename: path.join(this.recordings, id, note.audioFile), mime: note.mime };
  }
}

module.exports = { Library, atomicJson };
