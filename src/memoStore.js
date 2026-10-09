import {documentPending,registerDocumentFlusher} from './documentPending.js';
// Saves survive panel closure and navigation. Bodies stay outside the library index.
const entries = new Map();
const empty = { loading: true, blocks: null, revision: 0, dirty: false, saving: false, error: '' };
const listeners = new Set();
let installed = false;
const draftKey = id => `loxt.memo.draft:${window.desktop?.hostId || 'desktop'}:${id}`;
function backup(entry) {
  try { localStorage.setItem(draftKey(entry.id), JSON.stringify({ blocks: entry.state.blocks, revision: entry.state.revision })); }
  catch { entry.state = { ...entry.state, error: '초안 저장 공간이 부족합니다. 현재 메모를 백업해 주세요.' }; }
}
function trimCache() {
  const idle = [...entries.values()].filter(entry => !entry.listeners.size && !entry.state.dirty && !entry.state.saving && !entry.state.loading);
  for (const entry of idle.slice(0, Math.max(0, entries.size - 20))) entries.delete(entry.id);
}
function publish(entry, change) {
  entry.state = { ...entry.state, ...change };
  for (const listener of entry.listeners) listener();
  for (const listener of listeners) listener();
  documentPending('memo',[...entries.values()].filter(e=>e.state.dirty||e.state.saving).map(e=>e.id));
  trimCache();
}
export function memoEntry(id) {
  if (!installed && window.desktop?.memos) {
    installed=true;registerDocumentFlusher('memo',flushMemos);
    window.desktop.onLibraryChange(event => {
      if(event.kind&&event.kind!=='memo'&&!event.resync)return;
      for (const entry of entries.values()) if ((!event.id||entry.id===event.id) && !entry.state.dirty && !entry.state.saving && !entry.state.loading) {
        window.desktop.memos.get(entry.id).then(doc => {
          if (!entry.state.dirty && !entry.state.saving && doc.revision > entry.state.revision) publish(entry, doc);
        }).catch(error => publish(entry, { error: error.message }));
      }
    });
    window.addEventListener('beforeunload', event => {
      if ([...entries.values()].some(entry => entry.state.dirty)) {
        for (const entry of entries.values()) if (entry.state.dirty) backup(entry);
        event.preventDefault(); event.returnValue = '';
      }
    });
  }
  if (!entries.has(id)) entries.set(id, { id, state: empty, listeners: new Set(), request: null, load: null, timer: null, lastSavedAt: Date.now() });
  return entries.get(id);
}
export function loadMemo(id) {
  const entry = memoEntry(id);
  if (entry.load) return entry.load;
  entry.load = window.desktop.memos.get(id).then(doc => {
    let draft; try { draft = JSON.parse(localStorage.getItem(draftKey(id))); } catch {}
    publish(entry, { ...doc, ...draft, dirty: Boolean(draft), loading: false, error: draft ? '저장 대기 중인 초안을 복구했습니다. 저장하거나 최신 내용을 확인해 주세요.' : '' });
  }).catch(error => { entry.load = null; publish(entry, { loading: false, error: error.message }); });
  return entry.load;
}
export function changeMemo(id, blocks) {
  const entry = memoEntry(id);
  publish(entry, { blocks, dirty: true, error: '' });
  clearTimeout(entry.backupTimer);entry.backupTimer=setTimeout(()=>backup(entry),150);
  clearTimeout(entry.timer);
  // Coalesce typing, but checkpoint at least every two seconds during long input.
  entry.timer = setTimeout(() => { void saveMemo(id).catch(() => {}); }, Math.min(250, Math.max(0, 2000 - (Date.now() - entry.lastSavedAt))));
}
export async function saveMemo(id) {
  const entry = memoEntry(id);
  clearTimeout(entry.timer); entry.timer = null;
  if (entry.request) { await entry.request; if (entry.state.dirty) return saveMemo(id); return; }
  if (!entry.state.dirty || !entry.state.blocks) return;
  publish(entry, { saving: true, error: '' });
  entry.request = (async () => {
    while (entry.state.dirty) {
      const blocks = entry.state.blocks;
      const doc = await window.desktop.memos.save({ id, blocks, revision: entry.state.revision });
      entry.lastSavedAt = Date.now();
      publish(entry, { revision: doc.revision, recovered: false, dirty: entry.state.blocks !== blocks });
      if (entry.state.dirty) backup(entry); else {clearTimeout(entry.backupTimer);localStorage.removeItem(draftKey(id));}
    }
  })();
  try { await entry.request; publish(entry, { saving: false, error: '' }); }
  catch (error) { backup(entry); publish(entry, { saving: false, dirty: true, error: error.message }); throw error; }
  finally { entry.request = null; }
}
export async function flushMemos() { await Promise.all([...entries.keys()].map(saveMemo)); }
export function subscribeMemoErrors(listener) { listeners.add(listener); return () => listeners.delete(listener); }
export function memoErrors() { return [...entries.values()].filter(entry => entry.state.error && entry.state.dirty).map(entry => ({ id: entry.id, error: entry.state.error })); }
export async function latestMemo(id) {
  const entry = memoEntry(id); clearTimeout(entry.timer);
  if (entry.request) await entry.request.catch(() => {});
  if (entry.state.dirty) backup(entry);
  const doc = await window.desktop.memos.get(id);
  publish(entry, { ...doc, dirty: false, saving: false, error: '' });
}
export function downloadMemoDraft(id) {
  const entry = memoEntry(id), url = URL.createObjectURL(new Blob([JSON.stringify({ version: 1, id, ...entry.state }, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = 'LOXT-메모-초안.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

registerDocumentFlusher('memo',flushMemos);
