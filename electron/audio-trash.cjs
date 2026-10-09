const fs=require('node:fs/promises'),path=require('node:path'),{randomUUID}=require('node:crypto');
const ID=/^[a-f0-9-]{36}$/;
async function present(file){try{await fs.access(file);return true;}catch(error){if(error.code==='ENOENT')return false;throw error;}}
function location(store,id,name){if(!ID.test(id)||typeof name!=='string'||path.basename(name)!==name||!/^audio\.(webm|ogg|mp3|wav|m4a|aac|flac|mp4)$/.test(name))throw Error('원본 위치를 확인해 주세요.');return path.join(store.recordings,id,name);}
async function commitAudioTransfer(store,journal){
 const {atomicJson}=require('./library.cjs');
 if(journal?.version!==1||!Array.isArray(journal.moves)||!Array.isArray(journal.notes)||!Array.isArray(journal.remove))throw Error('녹음 이동 기록을 확인해 주세요.');store.validateIndex(journal.data);if(journal.notes.some(n=>!ID.test(n?.id)||!journal.data.notes.some(d=>d.id===n.id&&JSON.stringify(d)===JSON.stringify(n))))throw Error('녹음 이동 메타데이터를 확인해 주세요.');
 for(const move of journal.moves){const from=location(store,move.from,move.name),to=location(store,move.to,move.name);await fs.mkdir(path.dirname(to),{recursive:true});if(await present(from)){if(await present(to))throw Error('복원 위치에 이미 원본이 있습니다. 두 파일을 보존했습니다.');await fs.rename(from,to);}else if(!await present(to))throw Error('녹음 원본 이동을 마치지 못했습니다.');}
 for(const note of journal.notes){await fs.mkdir(path.join(store.recordings,note.id),{recursive:true});await atomicJson(path.join(store.recordings,note.id,'note.json'),note);}
 await store.saveIndex(journal.data);store.data=journal.data;
 for(const id of journal.remove){if(!ID.test(id)||journal.data.notes.some(n=>n.id===id))throw Error('삭제 위치를 확인해 주세요.');const directory=path.resolve(store.recordings,id);if(path.dirname(directory)!==path.resolve(store.recordings))throw Error('삭제 위치를 확인해 주세요.');await fs.rm(directory,{recursive:true,force:true});}
 await fs.unlink(path.join(store.root,'audio-transfer.json'));store.audioTransferPending=false;
}
async function transfer(store,notes,moves,remove=[],base=store.data){const {atomicJson}=require('./library.cjs');notes=notes.map(n=>({...n,updatedRevision:store.revision+1}));const mapped=new Map(notes.map(n=>[n.id,n])),removed=new Set(remove),data={...base,notes:base.notes.filter(n=>!removed.has(n.id)).map(n=>mapped.get(n.id)||n)};const present=new Set(data.notes.map(n=>n.id));for(const n of notes)if(!present.has(n.id)){data.notes.unshift(n);present.add(n.id);}const journal={version:1,data,notes,moves,remove};store.validateIndex(data);await atomicJson(path.join(store.root,'audio-transfer.json'),journal);store.audioTransferPending=true;await commitAudioTransfer(store,journal);return store.snapshot();}
function detachAudio(id){return this.enqueue(async()=>{const note=this.data.notes.find(n=>n.id===id);if(!note||note.deleted||note.audioMissing||!note.done||['memo','pdf','audio'].includes(note.kind)||this.sessions.has(id)||this.documents.has(id)||['recording','queued','transcribing'].includes(note.status))throw Error('저장·변환이 끝난 녹음 원본만 분리할 수 있습니다.');await fs.access(location(this,id,note.audioFile));const audio={...note,id:randomUUID(),kind:'audio',hasMemo:false,memoPreview:'',parentRecordingId:id,deleted:true,done:false,segments:[],status:'ready',source:undefined,diarization:undefined,audioMissing:false,detachedAt:new Date().toISOString()};return transfer(this,[{...note,audioMissing:true,audioTrashId:audio.id},audio],[{from:id,to:audio.id,name:note.audioFile}]);});}
async function restoreDetached(store,selected,options={}){
 const base=options.data||store.data,byId=new Map(base.notes.map(n=>[n.id,n])),merged=new Map((options.extraNotes||[]).map(n=>[n.id,n])),moves=[],remove=[...(options.remove||[])],selection=new Set(selected.map(n=>n.id));
 for(const original of selected){if(original.kind==='folder')continue;const note=byId.get(original.id)||original;
  if(note.kind!=='audio'||!note.parentRecordingId){merged.set(note.id,{...note,deleted:false,folder:base.folders.includes(note.folder)?note.folder:''});continue;}
  const parent=byId.get(note.parentRecordingId);
  if(parent?.audioMissing&&parent.audioTrashId===note.id){if(store.documents.has(parent.id)||store.sessions.has(parent.id))throw Error('기록 저장을 마친 뒤 복원해 주세요.');moves.push({from:note.id,to:parent.id,name:note.audioFile});remove.push(note.id);}
  else merged.set(note.id,{...note,kind:undefined,parentRecordingId:undefined,deleted:false,folder:base.folders.includes(note.folder)?note.folder:''});
 }
 for(const move of moves){const parent=merged.get(move.to)||byId.get(move.to);merged.set(move.to,{...parent,deleted:selection.has(parent.id)?false:parent.deleted,audioMissing:false,audioTrashId:null});merged.delete(move.from);}
 return transfer(store,[...merged.values()],moves,[...new Set(remove)],base);
}
module.exports={commitAudioTransfer,detachAudio,restoreDetached};
