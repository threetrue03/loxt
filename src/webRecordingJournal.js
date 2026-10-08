// Only unfinished recordings for this host are retained. This is not a library replica.
let database;
function open() {
  if (!database) database = new Promise((resolve, reject) => {
    const request = indexedDB.open('loxt-recording-drafts', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('recordings', { keyPath: 'key' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('녹음 임시 저장소를 열지 못했습니다. Safari 저장 공간을 확인해 주세요.'));
  });
  return database;
}
async function transaction(mode, work) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('recordings', mode);
    const store = tx.objectStore('recordings'); let value;
    work(store, result => { value = result; });
    tx.oncomplete = () => resolve(value);
    tx.onerror = tx.onabort = () => reject(new Error('녹음 임시 저장 공간이 부족합니다. 저장된 조각을 복구한 뒤 다시 시도해 주세요.'));
  });
}
export function recordingJournal(host) {
  const key = id => host + ':' + id;
  const changed = () => window.dispatchEvent(new Event('loxt:recording-drafts'));
  return {
    async begin(id, payload) { await transaction('readwrite', store => store.put({ ...payload, id, key:key(id), host, createdAt:new Date().toISOString(), chunks:[], bytes:0, seconds:0 })); },
    async append({id, sequence, bytes}) {
      await transaction('readwrite', store => {
        const request = store.get(key(id));
        request.onsuccess = () => {
          const entry = request.result;
          if (!entry || sequence > entry.chunks.length) { store.transaction.abort(); return; }
          if (sequence < entry.chunks.length) return;
          if (entry.bytes + bytes.byteLength > 128 * 1024 * 1024) { store.transaction.abort(); return; }
          // ArrayBuffer works across Safari and WebKit IndexedDB implementations.
          entry.chunks.push(new Uint8Array(bytes).slice().buffer); entry.bytes += bytes.byteLength; store.put(entry);
        };
      });
    },
    async checkpoint({id,seconds}) { await transaction('readwrite', store => { const request=store.get(key(id)); request.onsuccess=()=>{if(request.result)store.put({...request.result,seconds});}; }); },
    async remove(id) { await transaction('readwrite', store => store.delete(key(id))); changed(); },
    async list() { return (await transaction('readonly',(store,done)=>{const request=store.getAll();request.onsuccess=()=>done(request.result);})).filter(entry=>entry.host===host); },
    changed,
  };
}
