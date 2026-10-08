import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile, symlink, stat } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

// This integration test uses the real managed engine and RTX GPU, with test-only audio/data.
await mkdir('test-results', { recursive: true });
const data = await mkdtemp(path.resolve('test-results/transcription-'));
const fixture = path.resolve('test-results/korean-speech.wav');
await stat(fixture);
const profile = path.resolve(process.env.SORINOTE_ENGINE_TEST_PROFILE || 'test-results/prepared-gpu-4yyczuvz');
if (!profile.startsWith(path.resolve('test-results') + path.sep)) throw new Error('Private engine test profile required');
const runtime = path.join(profile, 'transcription');
const privateRoot = path.join(data, 'transcription');
await mkdir(path.join(privateRoot, 'models'), { recursive: true });
await symlink(path.join(runtime, 'venv'), path.join(privateRoot, 'venv'), 'junction');
await symlink(path.join(runtime, 'models', 'small'), path.join(privateRoot, 'models', 'small'), 'junction');
await writeFile(path.join(privateRoot, 'prepared.json'), await readFile(path.join(runtime, 'prepared.json')));
await writeFile(path.join(privateRoot, 'settings.json'), JSON.stringify({ model: 'small', device: 'auto' }));
const env = { ...process.env, SORINOTE_TEST: '1', SORINOTE_TEST_DATA: data };
delete env.ELECTRON_RUN_AS_NODE; delete env.SORINOTE_DEV;
const executablePath = process.argv[2];
let app, page;
const errors = [];
async function launch() {
  app = await electron.launch({ ...(executablePath ? { executablePath: path.resolve(executablePath) } : {}),
    args: [...(executablePath ? [] : ['.']), '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${fixture}`], env });
  await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 0 }); });
  page = await app.firstWindow(); page.setDefaultTimeout(30000);
  page.on('pageerror', error => errors.push(error.message));
  await page.waitForFunction(() => !document.querySelector('.sidebar .primary')?.disabled, undefined, { polling: 100 });
  await waitState(() => page.evaluate(() => window.desktop.getTranscriptionEnvironment()), state => !state.busy);
}
async function waitState(read, check, timeout = 60000) {
  const end = Date.now() + timeout;
  while (true) { const state = await read(); if (check(state)) return state; if (Date.now() > end) throw new Error('State wait timed out'); await page.waitForTimeout(100); }
}
async function waitNote(id, status) {
  const deadline = Date.now() + 120000;
  while (true) {
    const note = (await page.evaluate(() => window.desktop.getLibrary())).notes.find(n => n.id === id);
    if (note?.status === status) break;
    if (status === 'done' && note?.status === 'failed') throw new Error(note.transcriptionError);
    if (Date.now() > deadline) throw new Error(`전사 상태 대기 시간 초과: ${note?.status} → ${status}`);
    await page.waitForTimeout(200);
  }
  await page.waitForFunction(() => !document.querySelector('.conversion-progress progress'), undefined, { polling: 100, timeout: 15000 });
}
async function imported(filename) {
  await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, filename);
  await page.getByRole('button', { name: '파일 불러오기', exact: true }).click();
  await page.getByRole('textbox', { name: '녹음 제목 변경', exact: true }).waitFor();
  return (await page.evaluate(() => window.desktop.getLibrary())).notes[0];
}
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
try {
  await launch();
  assert.equal((await page.evaluate(() => window.desktop.getLibrary())).notes.length, 0);
  await page.getByRole('button', { name: '설정', exact: true }).click();
  await page.getByRole('button', { name: '앱 정보', exact: true }).click();
  await page.getByText('문제 확인', { exact: true }).click();
  assert.match(await page.locator('.settings-page').textContent(), /RTX 2060/);
  await page.getByRole('button', { name: '← 보관함으로 돌아가기', exact: true }).last().click();
  const note = await imported(fixture);
  await page.getByRole('button', { name: '변환하기', exact: true }).click();
  await page.getByLabel('변환 모델', { exact: true }).selectOption('small');
  await page.getByRole('dialog').getByRole('button', { name: '변환하기', exact: true }).click();
  await page.getByRole('button', { name: '변환 취소', exact: true }).click();
  await waitNote(note.id, 'cancelled');
  assert.equal((await page.evaluate(() => window.desktop.getLibrary())).notes.find(n => n.id === note.id).done, false);
  await page.getByRole('button', { name: '변환하기', exact: true }).click();
  await page.getByLabel('변환 모델', { exact: true }).selectOption('small');
  await page.getByRole('dialog').getByRole('button', { name: '변환하기', exact: true }).click();
  await waitNote(note.id, 'done');
  let library = await page.evaluate(() => window.desktop.getLibrary());
  let result = library.notes.find(n => n.id === note.id);
  assert.equal(result.transcription.device, 'cuda');
  assert.equal(result.transcription.model, 'small');
  assert.equal(result.transcription.language, 'ko');
  assert.equal(result.transcription.computeType, 'int8_float16');
  const text = result.segments.map(s => s.text).join(' ');
  assert.match(text, /안녕하세요/);
  assert.match(text, /한국어/);
  assert.ok(result.segments.every(s => s.end >= s.start && s.start >= 0));
  assert.equal(await page.locator('.segment').count(), result.segments.length);
  const directory = path.join(library.storagePath, 'recordings', note.id);
  assert.equal(hash(await readFile(path.join(directory, note.audioFile))), hash(await readFile(fixture)));
  assert.match(await readFile(path.join(directory, 'transcript.txt'), 'utf8'), /한국어/);
  assert.equal(JSON.parse(await readFile(path.join(directory, 'transcript.json'), 'utf8')).device, 'cuda');
  const exported = path.join(data, '내보낸 전사문.txt');
  await app.evaluate(({ dialog }, file) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: file }); }, exported);
  await page.getByRole('button', { name: '녹음 재생', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('audio').currentTime > 0.1);
  await page.getByRole('button', { name: '녹음 일시정지', exact: true }).click();
  await page.getByRole('button', { name: '내보내기', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.toast')?.textContent === '스크립트를 저장했습니다.', undefined, { polling: 100 });
  assert.match(await readFile(exported, 'utf8'), /한국어/);
  await page.getByRole('textbox', { name: '녹음 제목 변경', exact: true }).fill('한국어 GPU 전사 검사');
  await page.locator('.detail-tabs:visible').click();
  await page.waitForFunction(async id => (await window.desktop.getLibrary()).notes.find(n => n.id === id)?.title === '한국어 GPU 전사 검사', note.id, { polling: 100 });
  const captured = await app.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0].webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG().toString('base64'));
  await writeFile(path.join(data, 'transcription.png'), Buffer.from(captured, 'base64'));
  console.log('PASS: 실제 RTX 2060 한국어 전사, 취소/재시도, 시간별 결과, 원본 유지, 스크립트 내보내기/JSON 저장', text);

  await page.getByRole('button', { name: '새 녹음', exact: true }).click();
  await page.getByLabel('녹음 제목', { exact: true }).fill('자동 전사 검사');
  await page.getByRole('button', { name: '녹음 시작', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.clock').textContent === '00:02', undefined, { polling: 100 });
  await page.getByRole('button', { name: '← 녹음 목록', exact: true }).click();
  await page.getByRole('button', { name: '한국어 GPU 전사 검사 열기', exact: true }).click();
  await page.getByRole('button', { name: '설정', exact: true }).click();
  await page.getByRole('heading', { name: '일반', exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelector('.clock').textContent >= '00:06', undefined, { polling: 100 });
  await page.getByRole('button', { name: '녹음으로 돌아가기', exact: true }).click();
  assert.ok(await page.locator('.clock:visible').textContent() >= '00:06');
  await page.getByRole('button', { name: '녹음 중단', exact: true }).click();await page.getByRole('button',{name:'변환하기',exact:true}).click();
  await page.getByLabel('변환 모델', { exact: true }).selectOption('small');
  await page.getByRole('dialog').getByRole('button', { name: '변환하기', exact: true }).click();
  await page.getByRole('textbox', { name: '녹음 제목 변경', exact: true }).waitFor();
  const recorded = (await page.evaluate(() => window.desktop.getLibrary())).notes.find(n => n.title === '자동 전사 검사');
  await waitNote(recorded.id, 'done');
  const automatic = (await page.evaluate(() => window.desktop.getLibrary())).notes.find(n => n.id === recorded.id);
  assert.equal(automatic.transcription.device, 'cuda'); assert.ok(automatic.segments.length);
  assert.ok(Math.abs(Number(await page.getByLabel('재생 위치', { exact: true }).getAttribute('max')) - automatic.seconds) < 0.1);
  console.log('PASS: 실제 MediaRecorder 종료 후 자동 GPU 전사');
  console.log('PASS: 녹음 중 보관함·다른 기록·설정으로 이동 후 같은 녹음으로 복귀, 녹음 시간과 원본 유지');

  const badFile = path.join(data, '손상된 음원.wav');
  await writeFile(badFile, 'not a valid audio file');
  const bad = await imported(badFile);
  await page.getByRole('button', { name: '변환하기', exact: true }).click();
  await page.getByLabel('변환 모델', { exact: true }).selectOption('small');
  await page.getByRole('dialog').getByRole('button', { name: '변환하기', exact: true }).click();
  await waitNote(bad.id, 'failed');
  library = await page.evaluate(() => window.desktop.getLibrary());
  assert.equal(library.notes.find(n => n.id === bad.id).done, false);
  assert.match(library.notes.find(n => n.id === bad.id).transcriptionError, /오디오/);
  assert.equal(await page.getByRole('button', { name: '변환하기', exact: true }).count(), 1);
  console.log('PASS: 손상된 원본은 오류 안내, 가짜 완료/전사문 생성 없음');

  await app.close(); await launch();
  result = (await page.evaluate(() => window.desktop.getLibrary())).notes.find(n => n.id === note.id);
  assert.equal(result.title, '한국어 GPU 전사 검사'); assert.equal(result.done, true);
  assert.deepEqual(result.segments, library.notes.find(n => n.id === note.id).segments);
  assert.deepEqual(errors, []);
  console.log('PASS: 재실행 후 전사문/제목 유지, 렌더러 오류 없음');
  console.log('TEST_PROFILE', data);
} finally {
  await app?.evaluate(({ BrowserWindow }) => { for (const window of BrowserWindow.getAllWindows()) window.destroy(); }).catch(() => {});
  await app?.close().catch(() => {});
}
