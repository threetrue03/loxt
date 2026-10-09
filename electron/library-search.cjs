const caches=new WeakMap();
async function searchLibrary(store,p){
  if(typeof p.query!=='string'||p.query.length>500||!['title','content','both'].includes(p.field))throw new Error('검색 조건을 확인해 주세요.');
  await store.ready;const q=p.query.toLocaleLowerCase('ko');let cache=caches.get(store);if(!cache)caches.set(store,cache={items:new Map(),bytes:0});
  const notes=store.data.notes.filter(n=>!n.deleted&&n.folder===(p.folder||''));const found=new Array(notes.length);let cursor=0;async function match(n){
    if(p.field!=='content'&&n.title.toLocaleLowerCase('ko').includes(q))return n.id;
    if(p.field==='title')return null;
    const version=[n.updatedRevision,n.editedAt,n.transcription?.completedAt].join(':');let hit=cache.items.get(n.id);
    if(!hit||hit.version!==version){let text=n.segments.map(s=>s.text).join(' ');if(n.kind==='pdf')text+=' '+await new (require('./pdfs.cjs').PDFs)(store).text(n.id);if(n.kind==='memo'||n.hasMemo)text+=' '+require('./memos.cjs').plainText((await new (require('./memos.cjs').Memos)(store).read(n.id)).blocks,5_000_000);hit={version,text:text.toLocaleLowerCase('ko')};const old=cache.items.get(n.id);if(old)cache.bytes-=old.text.length*2;cache.items.set(n.id,hit);cache.bytes+=hit.text.length*2;for(const [id,item]of cache.items){if(cache.bytes<=32*1024*1024&&cache.items.size<=300)break;cache.items.delete(id);cache.bytes-=item.text.length*2;}}
    return hit.text.includes(q)?n.id:null;
  }await Promise.all(Array.from({length:Math.min(8,notes.length)},async()=>{for(;;){const index=cursor++;if(index>=notes.length)break;found[index]=await match(notes[index]);}}));return found.filter(Boolean);
}
module.exports={searchLibrary};
