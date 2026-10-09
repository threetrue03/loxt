const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { Library } = require('../electron/library.cjs');
test('folder deletion preserves hierarchy and audio; partial restoration and permanent deletion survive restart', async () => {
  await fs.mkdir('test-results', { recursive: true }); const root = await fs.mkdtemp(path.resolve('test-results/trash-'));
  let library = new Library(root); await library.ready;
  await library.createFolder('회의'); await library.createFolder({name:'내부',parent:'회의'}); await library.createFolder('유지');
  const file = path.join(root,'예시.wav'); await fs.writeFile(file,'audio-original');
  const {note} = await library.importAudio(file,'회의/내부'); const {note:keep} = await library.importAudio(file,'유지');
  await assert.rejects(library.deleteTrash([keep.id])); await assert.rejects(library.deleteFolder(''));
  const result = await library.deleteFolder('회의'); assert.deepEqual(result.removed,['회의','회의/내부']);
  assert.equal(result.library.notes.find(n=>n.id===note.id).deleted,true); assert.equal(result.library.notes.find(n=>n.id===note.id).folder,'');
  assert.equal(await fs.readFile((await library.getAudio(note.id)).filename,'utf8'),'audio-original');
  library = new Library(root); await library.ready; assert.deepEqual((await library.list()).folders,['유지']);
  const restored = await library.restoreTrash([note.id]); assert.equal(restored.notes.find(n=>n.id===note.id).deleted,false);assert.equal(restored.notes.find(n=>n.id===note.id).folder,'회의/내부');const group=restored.notes.find(n=>n.kind==='folder');await library.restoreTrash([group.id]);
  await library.updateNote(note.id,{deleted:true}); await library.deleteTrash([note.id]);
  assert.equal((await library.list()).notes.length,1); await assert.rejects(fs.access(path.join(root,'recordings',note.id)));
  library = new Library(root); await library.ready; assert.deepEqual((await library.list()).notes.map(n=>n.id),[keep.id]);
});
test('folder deletion rejects live recordings; deletion journal completes before orphan recovery', async () => {
  const root = await fs.mkdtemp(path.resolve('test-results/trash-recovery-')); let library = new Library(root); await library.ready; await library.createFolder('진행');
  const session = await library.beginRecording({title:'녹음',folder:'진행',mime:'audio/webm'}); await assert.rejects(library.deleteFolder('진행')); await library.abandonRecording(session.id);
  const file=path.join(root,'원본.wav');await fs.writeFile(file,'original'); const {note}=await library.importAudio(file,''); await library.updateNote(note.id,{deleted:true});
  const data=JSON.parse(await fs.readFile(path.join(root,'library.json'),'utf8')); data.notes=data.notes.filter(n=>n.id!==note.id);
  await fs.writeFile(path.join(root,'trash-delete.json'),JSON.stringify({version:1,data,ids:[note.id]}));
  library=new Library(root);await library.ready; assert.equal((await library.list()).notes.some(n=>n.id===note.id),false);await assert.rejects(fs.access(path.join(root,'recordings',note.id)));
});
