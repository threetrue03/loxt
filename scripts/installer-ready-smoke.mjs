import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import path from 'node:path';
import { rename } from 'node:fs/promises';
const data = path.resolve(process.argv[2]);
if (!data.startsWith(path.resolve('test-results') + path.sep)) throw new Error('Isolated test profile required');
const prepared = path.join(data, 'transcription', 'prepared.json');
const backup = prepared + '.automatic-test-backup';
const unprepared = process.argv.includes('--unprepared');
if (unprepared) await rename(prepared, backup);
const env = { ...process.env, SORINOTE_TEST: '1', SORINOTE_TEST_DATA: data,
  PATH: `${process.env.WINDIR}\\System32;${process.env.WINDIR}` };
delete env.ELECTRON_RUN_AS_NODE;
delete env.SORINOTE_DEV;
const app = await electron.launch({ ...(process.argv.includes('--source') ? { args: ['.'] } : { executablePath: path.resolve('release/stage5/win-unpacked/LOXT.exe') }), env });
try {
  const page = await app.firstWindow();
  await page.getByRole('heading', { name: '전체 녹음', exact: true }).waitFor();
  let state;
  for (let count = 0; count < 300; count++) {
    state = await page.evaluate(() => window.desktop.getTranscriptionEnvironment());
    if (!state.busy) break;
    await page.waitForTimeout(100);
  }
  assert.equal(state.ready, !unprepared, state.message + ' ' + state.error);
  console.log(`PASS: ${unprepared ? 'unprepared state recognized for automatic setup test' : 'installed preparation recognized without manual setup'}: ${state.model}/${state.device}/${state.computeType}`);
  const fixture = path.resolve('test-results/korean-speech.wav');
  await app.evaluate(({ dialog }, filename) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filename] }); }, fixture);
  await page.getByRole('button', { name: '파일 불러오기', exact: true }).click();
  await page.getByRole('textbox', { name: '녹음 제목 변경', exact: true }).waitFor();
  const note = (await page.evaluate(() => window.desktop.getLibrary())).notes[0];
  await page.getByRole('button', { name: '변환하기', exact: true }).click();
  await page.getByLabel('변환 모델', { exact: true }).selectOption(state.model);
  await page.getByRole('dialog').getByRole('button', { name: '변환하기', exact: true }).click();
  for (let count = 0; count < 600; count++) {
    const result = (await page.evaluate(() => window.desktop.getLibrary())).notes.find(item => item.id === note.id);
    if (result.status === 'failed') throw new Error(result.transcriptionError);
    if (result.status === 'done') {
      assert.match(result.segments.map(item => item.text).join(' '), /안녕/);
      assert.equal(result.transcription.device, 'cuda');
      const ready = await page.evaluate(() => window.desktop.getTranscriptionEnvironment());
      assert.equal(ready.devicePreference, 'auto');
      console.log('PASS: real Korean transcription on CUDA with automatic device selection and no manual preparation');
      break;
    }
    if (count === 599) throw new Error('Transcription timeout');
    await page.waitForTimeout(200);
  }
} finally { await app.close(); if (unprepared) await rename(backup, prepared); }
