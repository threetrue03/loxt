// Public recovery code only. No credentials or PC documents are cached here.
export function collectDrafts(storage=localStorage){
 const documents=[];
 for(let i=0;i<storage.length;i++){
  const key=storage.key(i);if(!/^loxt\.(memo|pdf)\.draft:/.test(key))continue;
  try{const data=JSON.parse(storage.getItem(key)),parts=key.split(':');const kind=parts[0].includes('.memo.')?'memo':'pdf',id=parts.at(-1),hostId=parts[1];if(/^[a-f0-9-]{36}$/.test(id))documents.push({kind,id,hostId,workspace:kind==='pdf'?parts[2]:undefined,data});}catch{}
 }
 return {type:'loxt-local-drafts',version:1,origin:location.origin,createdAt:new Date().toISOString(),documents};
}
export function downloadDrafts(){
 window.dispatchEvent(new Event('loxt:backup-drafts'));
 const bundle=collectDrafts(),url=URL.createObjectURL(new Blob([JSON.stringify(bundle)],{type:'application/json'}));
 const a=document.createElement('a');a.href=url;a.download='LOXT-초안-사본.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);return bundle.documents.length;
}
export function validateDrafts(value,hostId){
 if(value?.type!=='loxt-local-drafts'||value.version!==1||!Array.isArray(value.documents)||value.documents.length>200)throw Error('LOXT에서 받은 초안 사본을 선택해 주세요.');
 for(const d of value.documents){if(d.hostId!==hostId)throw Error('다른 PC의 초안입니다. 원래 PC에 연결한 뒤 가져와 주세요.');if(!['memo','pdf'].includes(d.kind)||!/^[a-f0-9-]{36}$/.test(d.id)||!d.data||!Number.isSafeInteger(d.data.revision)||d.data.revision<0||(d.kind==='memo'?!Array.isArray(d.data.blocks):!Array.isArray(d.data.objects)))throw Error('초안 사본의 내용을 확인해 주세요.');}
 return value.documents;
}
export async function recordingDrafts(){
 return new Promise((resolve,reject)=>{const request=indexedDB.open('loxt-recording-drafts');request.onerror=()=>reject(Error('녹음 초안을 읽지 못했습니다.'));request.onsuccess=()=>{const db=request.result;if(!db.objectStoreNames.contains('recordings')){db.close();resolve([]);return;}const tx=db.transaction('recordings','readonly'),get=tx.objectStore('recordings').getAll();get.onsuccess=()=>{db.close();resolve(get.result);};get.onerror=()=>{db.close();reject(Error('녹음 초안을 읽지 못했습니다.'));};};});
}
export async function downloadRecording(key){
 const {bytes,mime,title}=await new Promise((resolve,reject)=>{const request=indexedDB.open('loxt-recording-drafts');request.onerror=()=>reject(Error('녹음 초안을 읽지 못했습니다.'));request.onsuccess=()=>{const db=request.result;if(!db.objectStoreNames.contains('chunks')){db.close();reject(Error('녹음 조각을 찾지 못했습니다.'));return;}const tx=db.transaction(['recordings','chunks'],'readonly'),meta=tx.objectStore('recordings').get(key);meta.onsuccess=()=>{const record=meta.result;if(!record){db.close();reject(Error('녹음을 찾지 못했습니다.'));return;}const chunks=tx.objectStore('chunks').index('recording').getAll(IDBKeyRange.only(key));chunks.onsuccess=()=>{db.close();resolve({bytes:chunks.result.sort((a,b)=>a.sequence-b.sequence).map(c=>c.bytes),mime:record.mime,title:record.title});};};tx.onerror=()=>{db.close();reject(Error('녹음 초안을 읽지 못했습니다.'));};};});
 const url=URL.createObjectURL(new Blob(bytes,{type:mime})),a=document.createElement('a');a.href=url;a.download=(title||'녹음')+(mime==='audio/mp4'?'.m4a':'.webm');a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
