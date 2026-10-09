// Metadata checkpoints do not copy the complete recording. Chunks are immutable.
let database;
function open(){
 if(!database)database=new Promise((resolve,reject)=>{
  const request=indexedDB.open('loxt-recording-drafts',2);
  request.onupgradeneeded=()=>{
   const db=request.result,tx=request.transaction;
   const meta=db.objectStoreNames.contains('recordings')?tx.objectStore('recordings'):db.createObjectStore('recordings',{keyPath:'key'});
   const chunks=db.createObjectStore('chunks',{keyPath:['key','sequence']});chunks.createIndex('recording','key');
   const cursor=meta.openCursor();cursor.onsuccess=()=>{const c=cursor.result;if(!c)return;const old=c.value;if(old.chunks){old.chunks.forEach((bytes,sequence)=>chunks.put({key:old.key,sequence,bytes}));const next={...old,count:old.chunks.length};delete next.chunks;c.update(next);}c.continue();};
  };
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(new Error('녹음 임시 저장소를 열지 못했습니다. 브라우저 저장 공간을 확인해 주세요.'));
 });return database;
}
async function transaction(mode,work){const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction(['recordings','chunks'],mode);let value;work(tx.objectStore('recordings'),tx.objectStore('chunks'),result=>{value=result;});tx.oncomplete=()=>resolve(value);tx.onerror=tx.onabort=()=>reject(new Error('녹음 임시 저장 공간이 부족하거나 조각 순서가 올바르지 않습니다. 저장된 녹음을 복구한 뒤 다시 시도해 주세요.'));});}
export function recordingJournal(host){
 const key=id=>host+':'+id,changed=()=>window.dispatchEvent(new Event('loxt:recording-drafts'));
 return {
  begin:(id,payload)=>transaction('readwrite',meta=>meta.put({...payload,id,key:key(id),host,createdAt:new Date().toISOString(),count:0,bytes:0,seconds:0})),
  append:({id,sequence,bytes})=>transaction('readwrite',(meta,chunks)=>{const request=meta.get(key(id));request.onsuccess=()=>{const entry=request.result;if(!entry||sequence>entry.count){meta.transaction.abort();return;}if(sequence<entry.count)return;if(entry.bytes+bytes.byteLength>128*1024*1024){meta.transaction.abort();return;}chunks.put({key:entry.key,sequence,bytes:new Uint8Array(bytes).slice().buffer});meta.put({...entry,count:entry.count+1,bytes:entry.bytes+bytes.byteLength});};}),
  checkpoint:({id,seconds})=>transaction('readwrite',meta=>{const request=meta.get(key(id));request.onsuccess=()=>{if(request.result)meta.put({...request.result,seconds});};}),
  async remove(id){await transaction('readwrite',(meta,chunks)=>{meta.delete(key(id));const c=chunks.index('recording').openCursor(IDBKeyRange.only(key(id)));c.onsuccess=()=>{if(c.result){c.result.delete();c.result.continue();}};});changed();},
  async list(){return transaction('readonly',(meta,chunks,done)=>{const request=meta.getAll();request.onsuccess=()=>{const entries=request.result.filter(e=>e.host===host);let remaining=entries.length;if(!remaining){done([]);return;}for(const entry of entries){const r=chunks.index('recording').getAll(IDBKeyRange.only(entry.key));r.onsuccess=()=>{entry.chunks=r.result.sort((a,b)=>a.sequence-b.sequence).map(c=>c.bytes);if(--remaining===0)done(entries);};}};});},
  changed,
 };
}
