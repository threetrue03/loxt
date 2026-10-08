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
        await this.commit(to); source.pop(); target.push(item); return store.snapshot();
      }
      if (!['move', 'trash'].includes(payload?.action)) throw new Error('지원하지 않는 관리 작업입니다.');
      const ids = new Set(payload.ids || []), folders = payload.folders || [];
      if (!Array.isArray(payload.ids || []) || !Array.isArray(folders) || ids.size + folders.length === 0 || ids.size + folders.length > 10000) throw new Error('관리할 항목을 선택해 주세요.');
      for (const id of ids) if (!store.data.notes.some(n => n.id === id && !n.deleted)) throw new Error('선택한 기록을 다시 확인해 주세요.');
      const roots = folders.filter(f => !folders.some(other => other !== f && f.startsWith(other + '/')));
      const removed = new Set(); for (const f of roots) for (const child of store.folderSubtree(f)) removed.add(child);
      let destination = ''; const mapping = new Map();
      if (payload.action === 'move') {
        destination = store.validateFolder(payload.folder || '');
        if (removed.has(destination)) throw new Error('폴더를 자기 자신이나 하위 폴더로 이동할 수 없습니다.');
        for (const root of roots) {
          const next = [destination, root.split('/').at(-1)].filter(Boolean).join('/');
          for (const old of removed) if (old === root || old.startsWith(root + '/')) mapping.set(old, next + old.slice(root.length));
        }
      }
      const before = { folders: [...store.data.folders], folderParents: { ...store.data.folderParents }, notes: {} };
      const after = { folders: payload.action === 'trash' ? store.data.folders.filter(f => !removed.has(f)) : store.data.folders.map(f => mapping.get(f) || f), folderParents: {}, notes: {} };
      if (new Set(after.folders).size !== after.folders.length || after.folders.some(f => f.length > 1024 || f.split('/').length > 16)) throw new Error('대상 폴더에 같은 이름이 있거나 경로가 너무 깊습니다.');
      for (const f of after.folders) { const parent = f.includes('/') ? f.slice(0, f.lastIndexOf('/')) : ''; if (parent) after.folderParents[f] = parent; }
      for (const n of store.data.notes) if (ids.has(n.id) || removed.has(n.folder)) {
        this.check(n); before.notes[n.id] = { folder: n.folder, deleted: Boolean(n.deleted) };
        after.notes[n.id] = payload.action === 'trash' ? { folder: removed.has(n.folder) ? '' : n.folder, deleted: true } : { folder: mapping.get(n.folder) || destination, deleted: Boolean(n.deleted) };
      }
      await this.commit(after); this.undo.push({ before, after }); this.undo = this.undo.slice(-100); this.redo = [];
      return store.snapshot();
    });
  }
  check(note) { if (this.library.sessions.has(note.id) || ['recording', 'queued', 'transcribing'].includes(note.status)) throw new Error('진행 중인 녹음·변환을 마친 뒤 기록을 변경해 주세요.'); }
  async commit(value) {
    const store = this.library, changed = store.data.notes.filter(n => value.notes[n.id]).map(n => ({ ...n, ...value.notes[n.id] })), mapped = new Map(changed.map(n => [n.id, n]));
    const data = { ...store.data, folders: value.folders, folderParents: value.folderParents, notes: store.data.notes.map(n => mapped.get(n.id) || n) };
    const journal = { version: 1, data, notes: changed };
    store.validateIndex(data); await atomicJson(path.join(store.root, 'folder-rename.json'), journal); store.folderRenamePending = true;
    await store.commitFolderRename(journal); store.data = data; store.folderRenamePending = false;
  }
}
module.exports = { LibraryActions };
