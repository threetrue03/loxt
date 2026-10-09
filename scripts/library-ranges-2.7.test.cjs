const {test}=require('node:test'),assert=require('node:assert/strict');
const {catalog,page,track}=require('../shared/library-range.cjs');
function store(){return {ready:Promise.resolve(),revision:1,root:'private',data:{folders:['a','b'],folderParents:{},notes:Array.from({length:300},(_,i)=>({id:String(i),title:'기록 '+i,folder:i<200?'a':'b',createdAt:String(i).padStart(4,'0'),memoPreview:'본문'.repeat(1000),segments:Array.from({length:24},(_,n)=>({start:n,text:'스크립트'})),deleted:false}))}};}
test('catalog omits bodies; folder pages bound previews and keep complete counts',async()=>{
 const s=store(),c=await catalog(s),p=await page(s,{folder:'a',offset:120,limit:120});
 assert.equal(c.notes.length,300);assert.equal(c.notes[0].segments.length,0);assert.equal(c.notes[0].memoPreview,undefined);assert.equal(c.notes[0].segmentCount,24);
 assert.equal(p.total,200);assert.equal(p.notes.length,80);assert.ok(p.notes.every(n=>n.folder==='a'&&n.segmentCount===24&&n.segments.length===8));
 await assert.rejects(page(s,{limit:10000}));
});
test('incremental catalogs preserve creates, updates, removals and fall back after gaps',async()=>{
 const s=store();await catalog(s);s.data.notes[0]={...s.data.notes[0],title:'변경'};s.revision=2;track(s);
 s.data.notes=s.data.notes.filter(n=>n.id!=='1');s.revision=3;track(s);
 const c=await catalog(s,{since:1});assert.equal(c.delta,true);assert.equal(c.upsert.length,1);assert.equal(c.upsert[0].title,'변경');assert.deepEqual(c.remove,['1']);
 assert.equal((await catalog(s,{since:3})).upsert.length,0);assert.equal((await catalog(s,{since:0})).catalog,true);
});
test('catalog and pages wait for metadata transaction completion before recording its revision',async()=>{
 const s=store();await catalog(s);let commit;s.queue=new Promise(resolve=>commit=resolve);
 s.revision=2;let completed=false;const request=catalog(s,{since:1}).then(value=>{completed=true;return value;});const scoped=page(s,{folder:'b'});
 await new Promise(resolve=>setImmediate(resolve));assert.equal(completed,false);
 s.data={...s.data,notes:s.data.notes.map(n=>n.id==='0'?{...n,folder:'b',title:'이동 완료'}:n)};commit();
 const delta=await request;assert.equal(delta.upsert[0].title,'이동 완료');assert.equal(delta.upsert[0].folder,'b');assert.equal((await scoped).total,101);
 assert.equal((await catalog(s,{since:2})).upsert.length,0);
});
