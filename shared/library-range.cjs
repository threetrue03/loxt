const {summary}=require('./library-summary.cjs');
// The navigation catalog contains identities and status, never document bodies.
function catalogNote(note){
 const result=summary(note);
 delete result.segments;delete result.memoPreview;delete result.pdfPreview;
 if(note.kind==='folder')result.folderCount=note.folderPaths?.length||note.folderCount||1;
 delete result.folderPaths;delete result.members;delete result.folderMembers;delete result.trashFolders;
 return {...result,segments:[],_catalog:true};
}
const catalogs=new WeakMap();
function track(store){
 let state=catalogs.get(store);if(!state){state={revision:-1,refs:new Map(),notes:new Map(),history:[]};catalogs.set(store,state);}
 if(state.revision===store.revision)return state;
 const refs=new Map(store.data.notes.map(n=>[n.id,n])),upsert=[],remove=[];
 for(const [id,note]of refs)if(state.refs.get(id)!==note){const value=catalogNote(note);state.notes.set(id,value);upsert.push(value);}
 for(const id of state.refs.keys())if(!refs.has(id)){state.notes.delete(id);remove.push(id);}
 const change={from:state.revision,revision:store.revision,upsert,remove,folders:[...store.data.folders],folderParents:{...store.data.folderParents}};
 state.refs=refs;state.revision=store.revision;state.history.push(change);
 while(state.history.length>32)state.history.shift();
 return state;
}
async function catalog(store,{since}={}){
 await store.ready;await store.queue;const state=track(store),base={revision:state.revision,recovery:store.recovery,indexError:store.indexError||null,storagePath:store.root};
 if(Number.isSafeInteger(since)&&since<=state.revision){
  if(since===state.revision)return {...base,delta:true,from:since,upsert:[],remove:[],folders:[...store.data.folders],folderParents:{...store.data.folderParents}};
  const changes=state.history.filter(c=>c.revision>since);
  if(changes[0]?.from===since){const upsert=new Map(),remove=new Set();for(const c of changes){for(const id of c.remove){upsert.delete(id);remove.add(id);}for(const n of c.upsert){remove.delete(n.id);upsert.set(n.id,n);}}if(upsert.size+remove.size<=512)return {...base,delta:true,from:since,upsert:[...upsert.values()],remove:[...remove],folders:[...store.data.folders],folderParents:{...store.data.folderParents}};}
 }
 return {...base,notes:[...state.notes.values()],folders:[...store.data.folders],folderParents:{...store.data.folderParents},catalog:true};
}
async function page(store,{folder='',sort='date',offset=0,limit=120,ids}={}){
 await store.ready;await store.queue;
 if(typeof folder!=='string'||folder.length>1024||!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>240||ids&&(!Array.isArray(ids)||ids.length>100000||ids.some(id=>typeof id!=='string')))throw Error('보관함 조회 범위를 확인해 주세요.');
 const wanted=ids?new Set(ids):null,special=['library','recent','trash'].includes(folder);
 let notes=store.data.notes.filter(n=>(folder==='trash'?n.deleted:!n.deleted)&&(special||n.folder===folder)&&(!wanted||wanted.has(n.id)));
 notes.sort((a,b)=>sort==='title'?a.title.localeCompare(b.title,'ko')||a.id.localeCompare(b.id):(b.createdAt||'').localeCompare(a.createdAt||'')||a.id.localeCompare(b.id));
 if(folder==='recent')notes=notes.slice(0,5);
 return {revision:store.revision,offset,total:notes.length,notes:notes.slice(offset,offset+limit).map(summary)};
}
function transportResult(value){if(!value||typeof value!=='object')return value;if(Array.isArray(value.notes)&&Array.isArray(value.folders)){const {folderIds,...rest}=value;return {...rest,notes:value.notes.map(catalogNote),catalog:true};}if(value.library)return {...value,library:transportResult(value.library)};return value;}
module.exports={catalogNote,catalog,page,track,transportResult};
