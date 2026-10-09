const fs=require('node:fs/promises'),path=require('node:path');
const {createHash}=require('node:crypto');
const {atomicJson}=require('./library.cjs');
const states=new WeakMap();
function cache(library){if(!states.has(library))states.set(library,new Map());return states.get(library);}
function apply(items,patch){
 if(!patch||!Array.isArray(patch.upsert)||!Array.isArray(patch.remove)||patch.remove.some(id=>typeof id!=='string')||patch.upsert.some(item=>!item||typeof item.id!=='string'))throw Error('문서 변경 형식을 확인해 주세요.');
 if(new Set(patch.upsert.map(item=>item.id)).size!==patch.upsert.length)throw Error('중복된 문서 항목입니다.');
 const removed=new Set(patch.remove),changed=new Map(patch.upsert.map(item=>[item.id,item]));
 let result=items.filter(item=>!removed.has(item.id)).map(item=>{const next=changed.get(item.id)||item;changed.delete(item.id);return next;}).concat([...changed.values()]);
 if(patch.order){if(!Array.isArray(patch.order)||new Set(patch.order).size!==result.length||patch.order.length!==result.length)throw Error('문서 순서를 확인해 주세요.');const byID=new Map(result.map(item=>[item.id,item]));result=patch.order.map(id=>{if(!byID.has(id))throw Error('문서 순서를 확인해 주세요.');return byID.get(id);});}
 return result;
}
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
// fsync each small append before acknowledging. Snapshots are bounded checkpoints,
// not the authoritative copy while a journal exists. Revision skips make replay
// safe if the process stops between replacing a snapshot and trimming its log.
async function replay(file,doc,field,validate){
 let content;try{content=await fs.readFile(file+'.journal','utf8');}catch(e){if(e.code==='ENOENT')return doc;throw e;}
 const incomplete=content.length>0&&!content.endsWith('\n');if(incomplete)content=content.slice(0,content.lastIndexOf('\n')+1);
 for(const line of content.split('\n')){if(!line)continue;let entry;try{entry=JSON.parse(line);}catch{throw Error('문서 저장 기록이 손상되었습니다. 원본과 초안을 보존했습니다.');}
  const {checksum,...record}=entry;if(checksum!==digest(record))throw Error('문서 저장 기록을 확인하지 못했습니다.');if(record.revision<=doc.revision)continue;
  if(record.base!==doc.revision)throw Error('문서 저장 기록의 순서가 일치하지 않습니다.');doc={version:1,revision:record.revision,updatedAt:record.updatedAt,[field]:validate(apply(doc[field],record.patch))};
 }return incomplete?{...doc,journalTail:true}:doc;
}
function remember(library,file,doc){const entries=cache(library);let item=entries.get(file);if(!item){item={doc,feed:[],bytes:0,count:0,size:Buffer.byteLength(JSON.stringify(doc)),feedBytes:0};entries.set(file,item);}else item.doc=doc;while(entries.size>40)entries.delete(entries.keys().next().value);return item;}
async function signature(file){const [snapshot,log]=await Promise.all([fs.stat(file),fs.stat(file+'.journal').catch(e=>{if(e.code==='ENOENT')return {size:0,mtimeMs:0};throw e;})]);return [snapshot.size,snapshot.mtimeMs,log.size,log.mtimeMs].join(':');}
async function cached(library,file){const item=cache(library).get(file);if(!item)return null;try{if(item.signature===await signature(file))return item.doc;}catch{}forget(library,file);return null;}
function forget(library,file){cache(library).delete(file);}
async function append(library,file,current,doc,patch){
 if(current.journalTail){const log=file+'.journal',content=await fs.readFile(log);await fs.copyFile(log,log+'.damaged-'+Date.now());const handle=await fs.open(log,'r+');try{await handle.truncate(content.lastIndexOf(10)+1);await handle.sync();}finally{await handle.close();}}
 const previous=cache(library).get(file),item=remember(library,file,current);if(!previous)item.bytes=(await fs.stat(file+'.journal').catch(()=>({size:0}))).size;
 if(item.count>=64||item.bytes>1024*1024||current.recovered){
  await atomicJson(file+'.backup',current);await atomicJson(file,current);
  const handle=await fs.open(file+'.journal','w');try{await handle.sync();}finally{await handle.close();}item.count=0;item.bytes=0;
 }
 const record={base:current.revision,revision:doc.revision,updatedAt:doc.updatedAt,patch},line=JSON.stringify({...record,checksum:digest(record)})+'\n';
 const handle=await fs.open(file+'.journal','a');try{await handle.writeFile(line);await handle.sync();}catch(e){forget(library,file);throw e;}finally{await handle.close();}
 item.count++;item.bytes+=Buffer.byteLength(line);item.doc=doc;item.signature=await signature(file);item.feed.push(record);item.size+=Buffer.byteLength(line);
 let bytes=0;for(let i=item.feed.length-1;i>=0;i--){bytes+=Buffer.byteLength(JSON.stringify(item.feed[i]));if(bytes>2*1024*1024||item.feed.length-i>64){item.feed.splice(0,i+1);break;}}item.feedBytes=Math.min(bytes,2*1024*1024);let total=[...cache(library).values()].reduce((sum,value)=>sum+value.size+value.feedBytes,0);for(const [key,value]of cache(library)){if(total<=32*1024*1024)break;cache(library).delete(key);total-=value.size+value.feedBytes;}
}
async function reset(library,file,doc){const handle=await fs.open(file+'.journal','w');try{await handle.sync();}finally{await handle.close();}forget(library,file);remember(library,file,doc);}
function changes(library,file,doc,since,field){
 const feed=cache(library).get(file)?.feed||[];
 if(since===doc.revision)return {revision:doc.revision,patches:[]};
 const records=feed.filter(record=>record.revision>since);
 if(Number.isSafeInteger(since)&&records.length&&records[0].base===since&&records.at(-1).revision===doc.revision)return {revision:doc.revision,updatedAt:doc.updatedAt,patches:records.map(record=>({base:record.base,revision:record.revision,patch:record.patch}))};
 return {snapshot:doc,revision:doc.revision};
}
module.exports={apply,replay,cached,remember,append,reset,changes,forget};
