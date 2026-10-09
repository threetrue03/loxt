// Session-scoped undo for library management. Body/audio files are never rewritten.
const { atomicJson } = require('./library.cjs');
const path = require('node:path');
class LibraryActions {
  constructor(library) { this.library = library; this.undo = []; this.redo = []; }
  run(payload) {
    return this.library.enqueue(async () => {
      const store = this.library;
      if (['undo', 'redo'].includes(payload?.action)) {
        const source = payload.action === 'undo' ? this.undo : this.redo, target = payload.action === 'undo' ? this.redo : this.undo;
        const item = source.at(-1); if (!item) throw new Error('되돌릴 작업이 없습니다.');
        const from = payload.action === 'undo' ? item.after : item.before, to = payload.action === 'undo' ? item.before : item.after;
        if (JSON.stringify(store.data.folders) !== JSON.stringify(from.folders) || JSON.stringify(store.data.folderParents || {}) !== JSON.stringify(from.folderParents)) throw new Error('폴더가 다른 작업에서 변경되어 되돌릴 수 없습니다.');
        for (const [id, value] of Object.entries(from.notes)) {
          const current = store.data.notes.find(n => n.id === id);
          if (!current || current.folder !== value.folder || Boolean(current.deleted) !== value.deleted) throw new Error('기록이 다른 작업에서 변경되어 되돌릴 수 없습니다.');
          this.check(current);
        }
        for(const [id,value] of Object.entries(from.created||{})){const current=store.data.notes.find(n=>n.id===id);if(value?!current||current.kind!=='folder'||current.restoredRoot!==value.restoredRoot:current)throw Error('폴더가 다른 작업에서 복구되어 되돌릴 수 없습니다.');}
        await this.commit(to); source.pop(); target.push(item); return store.snapshot();
      }
      if (!['move', 'trash'].includes(payload?.action)) throw new Error('지원하지 않는 관리 작업입니다.');
      const ids = new Set(payload.ids || []), folders = payload.folders || [];
      if (!Array.isArray(payload.ids || []) || !Array.isArray(folders) || ids.size + folders.length === 0 || ids.size + folders.length > 10000) throw new Error('관리할 항목을 선택해 주세요.');
      for (const id of ids) if (!store.data.notes.some(n => n.id === id && !n.deleted)) throw new Error('선택한 기록을 다시 확인해 주세요.');
      const unique=[...new Set(folders)];const roots = unique.filter(f => !unique.some(other => other !== f && f.startsWith(other + '/')));
      const removed = new Set(); for (const f of roots) for (const child of store.folderSubtree(f)) removed.add(child);
      if([...store.sessions.values()].some(session=>removed.has(session.note.folder)))throw Error('이 폴더의 녹음을 종료한 뒤 변경해 주세요.');
      let destination = ''; const mapping = new Map();
      if (payload.action === 'move') {
        destination = store.validateFolder(payload.folder || '');
        if (removed.has(destination)) throw new Error('폴더를 자기 자신이나 하위 폴더로 이동할 수 없습니다.');
        for (const root of roots) {
          const next = [destination, root.split('/').at(-1)].filter(Boolean).join('/');
          for (const old of removed) if (old === root || old.startsWith(root + '/')) mapping.set(old, next + old.slice(root.length));
        }
      }
      const before = { folders: [...store.data.folders], folderParents: { ...store.data.folderParents },folderIds:{...store.data.folderIds}, notes: {},created:{} };
      const after = { folders: payload.action === 'trash' ? store.data.folders.filter(f => !removed.has(f)) : store.data.folders.map(f => mapping.get(f) || f), folderParents: {},folderIds:Object.fromEntries(Object.entries(store.data.folderIds||{}).filter(([f])=>payload.action!=='trash'||!removed.has(f)).map(([f,id])=>[mapping.get(f)||f,id])), notes: {},created:{} };
      const groups=payload.action==='trash'?roots.map(root=>require('./folder-trash.cjs').createFolderTrash(store,root,[...removed].filter(p=>p===root||p.startsWith(root+'/')))):[];
      const groupByNote=new Map();for(const group of groups){before.created[group.id]=null;after.created[group.id]=group;for(const id of Object.keys(group.folderMembers))groupByNote.set(id,group);}
      if (new Set(after.folders).size !== after.folders.length || after.folders.some(f => f.length > 1024 || f.split('/').length > 16)) throw new Error('대상 폴더에 같은 이름이 있거나 경로가 너무 깊습니다.');
      for (const f of after.folders) { const parent = f.includes('/') ? f.slice(0, f.lastIndexOf('/')) : ''; if (parent) after.folderParents[f] = parent; }
      const historyPath=value=>{if(typeof value!=='string')return value;for(const root of roots)if(value===root||value.startsWith(root+'/'))return (mapping.get(root)||root)+value.slice(root.length);return value;};
      for (const n of store.data.notes) {
        const selected=ids.has(n.id)||removed.has(n.folder),history={};
        if(payload.action==='move'){
          if(n.trashedFolderPath&&historyPath(n.trashedFolderPath)!==n.trashedFolderPath)history.trashedFolderPath=historyPath(n.trashedFolderPath);
          if(n.kind==='folder'&&(historyPath(n.folderTrashRoot)!==n.folderTrashRoot||historyPath(n.restoredRoot)!==n.restoredRoot)){history.folderTrashRoot=historyPath(n.folderTrashRoot);history.folderPaths=n.folderPaths.map(historyPath);history.folderMembers=Object.fromEntries(Object.entries(n.folderMembers).map(([id,p])=>[id,historyPath(p)]));if(n.restoredRoot)history.restoredRoot=historyPath(n.restoredRoot);}
        }
        if(!selected&&!Object.keys(history).length)continue;
        this.check(n); before.notes[n.id] = { folder: n.folder, deleted: Boolean(n.deleted),trashedFolderId:n.trashedFolderId||null,trashedFolderPath:n.trashedFolderPath||null,...Object.fromEntries(Object.keys(history).map(key=>[key,n[key]])) };
        const group=groupByNote.get(n.id);
        after.notes[n.id] = payload.action === 'trash' ? { folder: removed.has(n.folder) ? '' : n.folder, deleted: true,...(group?{trashedFolderId:group.id,trashedFolderPath:n.folder}:{}) } : { folder: selected?mapping.get(n.folder)||destination:n.folder, deleted: Boolean(n.deleted),...history };
      }
      await this.commit(after); this.undo.push({ before, after }); this.undo = this.undo.slice(-100); this.redo = [];
      return store.snapshot();
    });
  }
  check(note) { if (this.library.sessions.has(note.id) || ['recording', 'queued', 'transcribing'].includes(note.status)) throw new Error('진행 중인 녹음·변환을 마친 뒤 기록을 변경해 주세요.'); }
  async commit(value) {
    const store = this.library, changed = store.data.notes.filter(n => value.notes[n.id]).map(n => ({ ...n, ...value.notes[n.id],updatedRevision:store.revision+1 })), mapped = new Map(changed.map(n => [n.id, n]));
    const removed=new Set(Object.entries(value.created||{}).filter(([,n])=>!n).map(([id])=>id));
    const created=Object.values(value.created||{}).filter(Boolean).map(n=>({...n,updatedRevision:store.revision+1}));for(const n of created)mapped.set(n.id,n);
    const previous=store.data.notes.filter(n=>!removed.has(n.id)).map(n => mapped.get(n.id) || n),existing=new Set(previous.map(n=>n.id));
    const data = { ...store.data, folders: value.folders, folderParents: value.folderParents,folderIds:value.folderIds||{}, notes: [...created.filter(n=>!existing.has(n.id)),...previous] };
    const journal = { version: 1, data, notes: [...changed,...created],remove:[...removed] };
    store.validateIndex(data); await atomicJson(path.join(store.root, 'folder-rename.json'), journal); store.folderRenamePending = true;
    await store.commitFolderRename(journal); store.data = data; store.folderRenamePending = false;
  }
}
module.exports = { LibraryActions };
