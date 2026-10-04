const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { Library } = require('../electron/library.cjs');

test('out-of-range transcription cannot replace a saved script or extend the recording length', async () => {
  await fs.mkdir('test-results', { recursive: true });
  const root = await fs.mkdtemp(path.resolve('test-results/timestamps-'));
  const library = new Library(root);
  const file = path.join(root, 'original.wav'); await fs.writeFile(file, 'original audio');
  const { note } = await library.importAudio(file, '');
  const valid = { seconds: 56.28, segments: [{ start: 52, end: 56.28, text: '기존 스크립트' }], model: 'small', device: 'cpu', compute_type: 'int8', language: 'ko' };
  await library.completeTranscription(note.id, valid);
  const before = await library.list(), directory = path.join(library.recordings, note.id);
  const json = await fs.readFile(path.join(directory, 'transcript.json'));
  const txt = await fs.readFile(path.join(directory, 'transcript.txt'));
  for (const segment of [{ start: 79.9, end: 81.46 }, { start: 50, end: 81.46 }, { start: 56.28, end: 56.28 }]) {
    await assert.rejects(library.completeTranscription(note.id, { ...valid, segments: [{ ...segment, text: '범위 밖 스크립트' }] }), /원본 녹음 길이/);
    assert.deepEqual(await library.list(), before);
    assert.deepEqual(await fs.readFile(path.join(directory, 'transcript.json')), json);
    assert.deepEqual(await fs.readFile(path.join(directory, 'transcript.txt')), txt);
  }
  assert.equal(await fs.readFile((await library.getAudio(note.id)).filename, 'utf8'), 'original audio');
});
