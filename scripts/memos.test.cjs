const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { randomUUID } = require('node:crypto');
const { Library } = require('../electron/library.cjs');
const { Memos, validateBlocks, plainText } = require('../electron/memos.cjs');
const { cleanHTML, documentHTML } = require('../electron/memo-export.cjs');
const block = text => [{ id: randomUUID(), type: 'paragraph', content: [{type:'text',text,styles:{}}], children: [] }];
async function setup(t) { const root = await fs.mkdtemp(path.join(os.tmpdir(), 'loxt-memo-')); t.after(() => fs.rm(root, { recursive:true, force:true })); const library = new Library(root); await library.ready; return { root, library, memos: new Memos(library) }; }
test('memo bodies persist, recover from an index loss and follow folder/trash operations', async t => {
  const { root, library, memos } = await setup(t);
  await library.createFolder({ name: '회의' }); const { note } = await memos.create('회의');
  const doc = await memos.read(note.id); await memos.save({id:note.id,revision:doc.revision,blocks:block('한글 메모 내용')});
  assert.equal(library.data.notes[0].memoPreview, '한글 메모 내용'); assert.equal(library.data.notes[0].audioFile, undefined);
  await assert.rejects(library.getAudio(note.id)); await assert.rejects(library.setTranscription(note.id,{status:'queued'}));
  await library.renameFolder({folder:'회의',name:'새 회의'}); assert.equal(library.data.notes[0].folder,'새 회의');
  await fs.unlink(library.index); const next = new Library(root); await next.ready; assert.equal(next.data.notes[0].id,note.id);
  const store = new Memos(next); assert.equal(plainText((await store.read(note.id)).blocks),'한글 메모 내용');
  await next.deleteFolder('새 회의'); assert.equal(next.data.notes[0].deleted,true); await assert.rejects(store.save({id:note.id,revision:1,blocks:block('삭제된 메모')}));
  await next.restoreTrash([note.id]); assert.equal(next.data.notes[0].folder,'');
  await next.updateNote(note.id,{deleted:true}); await next.deleteTrash([note.id]); await assert.rejects(fs.stat(path.join(next.recordings,note.id)));
});
test('attached memo survives conversion and stale saves never overwrite new content', async t => {
  const { library, memos } = await setup(t); const {id}=await library.beginRecording({title:'녹음',folder:'',mime:'audio/webm'});
  await library.appendRecording({id,sequence:0,bytes:new Uint8Array([1,2,3])}); await library.finishRecording({id,seconds:2});
  await memos.save({id,revision:0,blocks:block('독립 저장된 메모')});
  await library.setTranscription(id,{status:'transcribing'}); await library.completeTranscription(id,{seconds:2,segments:[{start:0,end:1,text:'새 결과'}]});
  assert.equal(plainText((await memos.read(id)).blocks),'독립 저장된 메모');
  await assert.rejects(memos.save({id,revision:0,blocks:block('오래된 결과')}), /다른 화면/);
});
test('save failures retain the last durable body and allow retry', async t => {
  const { library, memos } = await setup(t), {note}=await memos.create(); const temp=path.join(library.recordings,note.id,'memo.json.tmp');
  await fs.mkdir(temp); await assert.rejects(memos.save({id:note.id,revision:0,blocks:block('다시 시도')})); assert.equal((await memos.read(note.id)).revision,0);
  await fs.rmdir(temp); await memos.save({id:note.id,revision:0,blocks:block('다시 시도')}); assert.equal((await memos.read(note.id)).revision,1);
});
test('damaged memo reads its backup without replacing the original; next save archives the damage', async t => {
  const { library, memos } = await setup(t), {note}=await memos.create();
  await memos.save({id:note.id,revision:0,blocks:block('첫 내용')}); await memos.save({id:note.id,revision:1,blocks:block('두 번째 내용')});
  const filename=path.join(library.recordings,note.id,'memo.json'); await fs.writeFile(filename,'damaged original');
  const recovered=await memos.read(note.id); assert.equal(recovered.recovered,true); assert.equal(plainText(recovered.blocks),'첫 내용'); assert.equal(await fs.readFile(filename,'utf8'),'damaged original');
  await memos.save({id:note.id,revision:recovered.revision,blocks:block('복구 후 수정')}); assert.equal(plainText((await memos.read(note.id)).blocks),'복구 후 수정');
  assert.ok((await fs.readdir(path.dirname(filename))).some(name=>name.startsWith('memo.json.damaged-')));
});
test('attachments use UUID paths and exports remove executable HTML', async t => {
  const { memos }=await setup(t), {note}=await memos.create();
  const url=await memos.attach({id:note.id,name:'../../한글.png',bytes:new Uint8Array([1,2,3])}), asset=await memos.asset(url); assert.equal(asset.mime,'image/png');
  await assert.rejects(memos.asset(`loxt-asset://memo/${note.id}/../../library.json`));
  assert.throws(()=>validateBlocks([{...block('')[0],props:{url:'https://remote.example/image'}}])); assert.throws(()=>validateBlocks([{...block('')[0],content:[{type:'link',href:'javascript:alert(1)',content:[]}]}]));
  const html=cleanHTML('<script>alert(1)</script><img src="https://remote.example" onerror="alert(1)"><a href="javascript:alert(1)">x</a><strong>정상</strong>');
  assert.doesNotMatch(html,/script|onerror|remote.example/); assert.match(html, /<strong>정상<\/strong>/);
  const exported=await documentHTML({id:note.id,title:'<제목>',html:`<img src="${url}"><math><mi>x</mi></math>`},memos); assert.match(exported,/data:image\/png;base64/); assert.match(exported,/&lt;제목&gt;/);
});
