import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile, stat, readdir, rmdir } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

await mkdir('test-results', { recursive: true });
const testData = await mkdtemp(path.resolve('test-results/profile-'));
const fixture = path.join(testData, 'input.wav');
// 실제 사용자 마이크를 켜지 않고 합성 테스트 음원을 MediaRecorder에 공급합니다.
const rate = 48000, samples = rate * 12;
const wav = Buffer.alloc(44 + samples * 2);
wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
wav.write('data', 36); wav.writeUInt32LE(samples * 2, 40);
for (let i = 0; i < samples; i++) wav.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 440 * i / rate) * 10000), 44 + i * 2);
await writeFile(fixture, wav);
const env = { ...process.env, SORINOTE_TEST: '1', SORINOTE_TEST_DATA: testData };
delete env.ELECTRON_RUN_AS_NODE; delete env.SORINOTE_DEV;
const executablePath = process.argv[2];
const errors = [];
async function launch() {
  const app = await electron.launch({
    ...(executablePath ? { executablePath: path.resolve(executablePath) } : {}),
    args: [...(executablePath ? [] : ['.']), '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${fixture}`], env,
  });
  await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 0 }); });
  const page = await app.firstWindow();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') console.error('Renderer:', message.text()); });
  await page.getByRole('heading', { name: '홈', exact: true }).waitFor();
  await page.waitForFunction(() => !document.querySelector('.sidebar .primary').disabled, undefined, { polling: 100, timeout: 15000 });
  return { app, page };
}
let { app, page } = await launch();
function waitFor(fn, arg) { return page.waitForFunction(fn, arg, { polling: 100, timeout: 15000 }); }
try {
  assert.equal(await page.locator('.row').count(), 0);
  assert.equal(await page.locator('.folders button').count(), 0);
  const isolation = await page.evaluate(() => ({ require: typeof window.require, process: typeof window.process }));
  assert.deepEqual(isolation, { require: 'undefined', process: 'undefined' });
  await page.getByRole('button', { name: '새 폴더', exact: true }).click();
  await page.getByLabel('새 폴더 이름', { exact: true }).fill('내 기록');
  await page.getByLabel('새 폴더 이름', { exact: true }).press('Enter');
  await page.locator('.folder-card').filter({hasText:'내 기록'}).click();
  await page.getByRole('heading', { name: '내 기록', exact: true }).waitFor();

  await page.getByRole('button', { name: '새 녹음', exact: true }).click();
  await page.getByRole('textbox', { name: '녹음 제목', exact: true }).waitFor();
  assert.equal(await page.getByRole('dialog').count(), 0);
  await page.getByLabel('녹음 제목', { exact: true }).fill('실제 녹음 테스트');
  await page.getByRole('button', { name: '녹음 시작', exact: true }).click();
  await waitFor(() => document.querySelector('.clock').textContent === '00:02');
  const recordingRoot = path.join((await page.evaluate(() => window.desktop.getLibrary())).storagePath, 'recordings');
  const ids = await readdir(recordingRoot);
  const directories = await Promise.all(ids.map(async id => ({ id, size: (await stat(path.join(recordingRoot, id, 'audio.webm.part'))).size })));
  assert.ok(directories[0].size > 1000, '녹음 중에 이미 원본 조각이 파일로 저장되어야 합니다.');
  await page.getByRole('button', { name: '일시정지', exact: true }).click();
  const paused = await page.locator('.clock').textContent();
  await page.waitForTimeout(1100);
  assert.equal(await page.locator('.clock').textContent(), paused, '일시정지 중 시간은 증가하지 않아야 합니다.');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  assert.equal(await page.getByRole('textbox', { name: '녹음 제목', exact: true }).count(), 1, '녹음 중 창 닫기는 차단해야 합니다.');
  await page.getByRole('button', { name: '녹음 계속', exact: true }).click();
  await waitFor(() => document.querySelector('.clock').textContent === '00:03');
  // 별도 테스트 보관함에 충돌을 만들어 목록 저장 실패 후 재시도에서 원본이 유지되는지 확인합니다.
  const indexCollision = path.join(path.dirname(recordingRoot), 'library.json.tmp');
  await mkdir(indexCollision);
  const base = await page.evaluate(() => window.desktop.getTranscriptionEnvironment());
  await app.evaluate(({ipcMain},base) => { ipcMain.removeHandler('transcription:start'); ipcMain.handle('transcription:start', () => base); },base);
  await page.getByRole('button', { name: '녹음 중단', exact: true }).click();await page.getByRole('button',{name:'변환하기',exact:true}).click();
  await page.getByRole('dialog').getByRole('button', { name: '변환하기', exact: true }).click();
  await page.getByRole('button', { name: '저장 재시도', exact: true }).waitFor();
  await page.getByRole('button', { name: '닫기', exact: true }).click();
  assert.ok((await stat(path.join(recordingRoot, directories[0].id, 'audio.webm'))).size > 1000);
  await rmdir(indexCollision);
  await page.getByRole('button', { name: '저장 재시도', exact: true }).click();
  await page.getByRole('dialog', { name: '변환하기', exact: true }).waitFor();
  await page.getByRole('button', { name: '닫기', exact: true }).click();
  let library = await page.evaluate(() => window.desktop.getLibrary());
  assert.equal(library.notes.length, 1);
  const recorded = library.notes[0];
  assert.equal(recorded.done, false);
  assert.deepEqual(recorded.segments, []);
  assert.equal(recorded.folder, '내 기록');
  const recordedPath = path.join(library.storagePath, 'recordings', recorded.id, recorded.audioFile);
  const bytes = await readFile(recordedPath);
  assert.ok(bytes.length > 1000);
  const decoded = await page.evaluate(async id => {
    const response = await fetch(`sorinote-audio://recording/${id}`);
    const context = new AudioContext();
    try {
      const audio = await context.decodeAudioData(await response.arrayBuffer());
      const channel = audio.getChannelData(0);
      return { duration: audio.duration, peak: channel.reduce((peak, sample) => Math.max(peak, Math.abs(sample)), 0) };
    } finally { await context.close(); }
  }, recorded.id);
  assert.ok(decoded.duration > 2 && Math.abs(decoded.duration - recorded.seconds) < 0.8, `인코딩된 오디오(${decoded.duration})와 저장된 시간(${recorded.seconds})이 일치해야 합니다.`);
  assert.ok(decoded.peak > 0.01, '실제 인코딩된 녹음은 무음이 아니어야 합니다.');

  const partial = await page.evaluate(async id => {
    const response = await fetch(`sorinote-audio://recording/${id}`, { headers: { Range: 'bytes=0-63' } });
    return { status: response.status, bytes: (await response.arrayBuffer()).byteLength };
  }, recorded.id);
  assert.deepEqual(partial, { status: 206, bytes: 64 });
  const invalid = await page.evaluate(async () => (await fetch('sorinote-audio://recording/not-a-recording')).status);
  assert.equal(invalid, 404);
  console.log('PASS: 실제 MediaRecorder 입력, 조각 저장, 일시정지, 저장 실패 후 재시도, 오디오 디코딩, 구간 요청');

  await page.getByRole('button', { name: '← 녹음 목록', exact: true }).click();
  await app.evaluate(({ dialog }, filename) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filename] }); }, fixture);
  await page.getByRole('button', { name: '파일 불러오기', exact: true }).click();
  await page.getByRole('textbox', { name: '녹음 제목 변경', exact: true }).waitFor();
  await waitFor(async () => (await window.desktop.getLibrary()).notes.some(n => n.title === 'input' && n.seconds > 11));
  library = await page.evaluate(() => window.desktop.getLibrary());
  const imported = library.notes.find(n => n.title === 'input');
  const copied = await readFile(path.join(library.storagePath, 'recordings', imported.id, imported.audioFile));
  assert.equal(createHash('sha256').update(copied).digest('hex'), createHash('sha256').update(wav).digest('hex'));
  await page.getByRole('textbox', { name: '녹음 제목 변경', exact: true }).fill('불러온 원본');
  await page.locator('.detail-tabs:visible').click();
  await waitFor(async () => (await window.desktop.getLibrary()).notes.some(n => n.title === '불러온 원본'));
  await page.getByRole('button', { name: '← 녹음 목록', exact: true }).click();
  await page.getByRole('button', { name: '불러온 원본 관리', exact: true }).click();
  await page.getByRole('menuitem', { name: '폴더 이동하기', exact: true }).click();
  await page.getByRole('treeitem', { name: '폴더 지정 해제', exact: true }).click();
  await page.getByRole('menu', { name: '녹음 메뉴' }).waitFor({ state: 'hidden' });
  await page.locator('.nav').getByRole('button', { name: /홈/ }).click();
  await page.getByRole('button', { name: '불러온 원본 관리', exact: true }).click();
  await page.getByRole('menuitem', { name: '휴지통으로 이동', exact: true }).click();
  await page.getByRole('menu', { name: '녹음 메뉴' }).waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: '휴지통', exact: true }).click();
  await page.getByRole('button', { name: '불러온 원본 관리', exact: true }).click();
  await page.getByRole('menuitem', { name: '복원', exact: true }).click();
  await page.getByRole('menu', { name: '녹음 메뉴' }).waitFor({ state: 'hidden' });
  assert.ok((await stat(recordedPath)).size > 1000);

  // 중단된 녹음 복구와 중복 조각의 재전송을 검사합니다.
  const recovery = await page.evaluate(() => window.desktop.beginRecording({ title: '복구 검사', folder: '', mime: 'audio/webm' }));
  const upload = { id: recovery.id, sequence: 0, bytes: [...bytes] };
  await page.evaluate(payload => window.desktop.appendRecording({ ...payload, bytes: new Uint8Array(payload.bytes) }), upload);
  await page.evaluate(payload => window.desktop.appendRecording({ ...payload, bytes: new Uint8Array(payload.bytes) }), upload);
  await page.evaluate(id => window.desktop.checkpointRecording({ id, seconds: 3 }), recovery.id);
  await page.evaluate(id => window.desktop.abandonRecording(id), recovery.id);
  await app.close();
  ({ app, page } = await launch());
  library = await page.evaluate(() => window.desktop.getLibrary());
  assert.equal(library.notes.length, 3);
  assert.deepEqual(library.folders, ['내 기록']);
  assert.equal(library.notes.find(n => n.id === imported.id).title, '불러온 원본');
  assert.equal(library.notes.find(n => n.id === imported.id).folder, '');
  assert.equal(library.notes.find(n => n.id === recovery.id).recovered, true);
  const recoveredBytes = await readFile(path.join(library.storagePath, 'recordings', recovery.id, 'audio.webm'));
  assert.equal(recoveredBytes.length, bytes.length, '중복 조각은 두 번 쓰면 안 됩니다.');
  console.log('PASS: 파일 원본 복사, 제목/폴더 이동, 휴지통/복원, 재실행 유지, 중단된 녹음 복구');

  await app.evaluate(({ BrowserWindow }) => {
    const session = BrowserWindow.getAllWindows()[0].webContents.session;
    session.setPermissionCheckHandler(() => false);
    session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  });
  await page.getByRole('button', { name: '새 녹음', exact: true }).click();
  await page.getByRole('button', { name: '녹음 시작', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: '마이크 사용 권한이 없습니다.' }).waitFor();
  assert.equal((await page.evaluate(() => window.desktop.getLibrary())).notes.length, 3);
  assert.deepEqual(errors, []);
  console.log('PASS: 마이크 권한 거부 시 안내, 가짜 기록 생성 없음, 렌더러 격리');
} finally {
  await app.evaluate(({ BrowserWindow }) => { for (const window of BrowserWindow.getAllWindows()) window.destroy(); }).catch(() => {});
  await app.close();
}
