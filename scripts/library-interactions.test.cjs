const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { Library } = require('../electron/library.cjs');
async function fixture() {
  await fs.mkdir('test-results', { recursive: true });
  const root = await fs.mkdtemp(path.resolve('test-results/interactions-'));
  const library = new Library(root); await library.ready;
  const file = path.join(root, 'source.wav'); await fs.writeFile(file, 'original-audio');
  await library.createFolder('강의'); await library.createFolder({ name: '요약', parent: '강의' });
  const { note: a } = await library.importAudio(file, '');
  const { note: b } = await library.importAudio(file, '강의');
  return { root, library, a, b };
}
test('group move validates every ID before mutation, persists metadata and permits root/nested targets', async () => {
  const { root, library, a, b } = await fixture();
  await assert.rejects(library.moveNotes({ ids: [a.id, '00000000-0000-0000-0000-000000000000'], folder: '강의/요약' }));
  assert.equal((await library.list()).notes.find(note => note.id === a.id).folder, '');
  await assert.rejects(library.moveNotes({ ids: [a.id, a.id], folder: '강의' }));
  await assert.rejects(library.moveNotes({ ids: [a.id], folder: '../outside' }));
  await library.moveNotes({ ids: [a.id, b.id], folder: '강의/요약' });
  const restarted = new Library(root); await restarted.ready;
  assert.ok((await restarted.list()).notes.every(note => note.folder === '강의/요약'));
  assert.equal(await fs.readFile((await restarted.getAudio(a.id)).filename, 'utf8'), 'original-audio');
  await restarted.moveNotes({ ids: [a.id, b.id], folder: '' });
  assert.ok((await restarted.list()).notes.every(note => note.folder === ''));
});
test('interrupted group move replays journal so all members reach the same destination', async () => {
  const { root, library, a, b } = await fixture();
  const commit = library.commitFolderRename;
  library.commitFolderRename = async journal => { await fs.writeFile(path.join(root, 'recordings', journal.notes[0].id, 'note.json'), JSON.stringify(journal.notes[0])); throw Error('disk interrupted'); };
  await assert.rejects(library.moveNotes({ ids: [a.id, b.id], folder: '강의' }));
  library.commitFolderRename = commit;
  const restarted = new Library(root); await restarted.ready;
  assert.ok((await restarted.list()).notes.every(note => note.folder === '강의'));
});
test('discard preserves active and finalised drafts in trash through restart, preserving other audio', async () => {
  const { root, library, a, b } = await fixture();
  const recording = await library.beginRecording({ title: '버릴 녹음', folder: '', mime: 'audio/webm' });
  await library.appendRecording({ id: recording.id, sequence: 0, bytes: new Uint8Array([1, 2, 3]) });
  await library.discardRecording(recording.id);
  assert.equal(library.sessions.size, 0);
  assert.ok(await fs.stat(path.join(root, 'recordings', recording.id)));
  assert.equal((await library.detail(recording.id)).deleted,true);
  assert.deepEqual(await fs.readFile((await library.getAudio(recording.id)).filename),Buffer.from([1,2,3]));
  await assert.rejects(library.discardRecording('../outside'));
  await library.discardRecording(a.id);
  const restarted = new Library(root); await restarted.ready;
  assert.deepEqual(new Set((await restarted.list()).notes.filter(note=>!note.deleted).map(note => note.id)), new Set([b.id]));
  assert.equal((await restarted.detail(a.id)).deleted,true);
  assert.equal((await restarted.detail(recording.id)).deleted,true);
  assert.equal(await fs.readFile((await restarted.getAudio(b.id)).filename, 'utf8'), 'original-audio');
});
