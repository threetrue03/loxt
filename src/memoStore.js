// Saves survive panel closure and navigation. Bodies stay outside the library index.
const entries = new Map();
const empty = { loading: true, blocks: null, revision: 0, dirty: false, saving: false, error: '' };
const listeners = new Set();
let installed = false;
function trimCache() {
  const idle = [...entries.values()].filter(entry => !entry.listeners.size && !entry.state.dirty && !entry.state.saving && !entry.state.loading);
  for (const entry of idle.slice(0, Math.max(0, entries.size - 20))) entries.delete(entry.id);
}
function publish(entry, change) {
  entry.state = { ...entry.state, ...change };
  for (const listener of entry.listeners) listener();
  for (const listener of listeners) listener();
  window.desktop?.memos?.pending([...entries.values()].filter(e => e.state.dirty || e.state.saving).map(e => e.id));
  trimCache();
}
export function memoEntry(id) {
  if (!installed && window.desktop?.memos) { installed = true; window.desktop.memos.onFlush(flushMemos); }
  if (!entries.has(id)) entries.set(id, { id, state: empty, listeners: new Set(), request: null, load: null, timer: null, lastSavedAt: Date.now() });
  return entries.get(id);
}
export function loadMemo(id) {
  const entry = memoEntry(id);
  if (entry.load) return entry.load;
  entry.load = window.desktop.memos.get(id).then(doc => { publish(entry, { ...doc, loading: false, error: '' }); }).catch(error => { entry.load = null; publish(entry, { loading: false, error: error.message }); });
  return entry.load;
}
export function changeMemo(id, blocks) {
  const entry = memoEntry(id);
  publish(entry, { blocks, dirty: true, error: '' });
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
    }
  })();
  try { await entry.request; publish(entry, { saving: false, error: '' }); }
  catch (error) { publish(entry, { saving: false, dirty: true, error: error.message }); throw error; }
  finally { entry.request = null; }
}
export async function flushMemos() { await Promise.all([...entries.keys()].map(saveMemo)); }
export function subscribeMemoErrors(listener) { listeners.add(listener); return () => listeners.delete(listener); }
export function memoErrors() { return [...entries.values()].filter(entry => entry.state.error && entry.state.dirty).map(entry => ({ id: entry.id, error: entry.state.error })); }
