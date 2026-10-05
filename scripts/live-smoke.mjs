import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, readFile, symlink, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Library } from '../electron/library.cjs';

await mkdir('test-results', { recursive: true });
const data = await mkdtemp(path.resolve('test-results/live-smoke-'));
const cache = path.join(process.env.APPDATA, 'sorinote-desktop', 'transcription');
const transcription = path.join(data, 'transcription'); await mkdir(transcription);
// Reuse installed runtime/model files read-only; settings, locks and all recordings stay in the test profile.
for (const name of ['venv', 'models']) await symlink(path.join(cache, name), path.join(transcription, name), 'junction');
const auxiliary=path.join(transcription,'auxiliary');await mkdir(auxiliary);for(const name of ['venv','models'])await symlink(path.join(cache,'auxiliary',name),path.join(auxiliary,name),'junction');await copyFile(path.join(cache,'auxiliary/ready.json'),path.join(auxiliary,'ready.json'));
await writeFile(path.join(transcription, 'settings.json'), JSON.stringify({ model: 'small', device: 'auto' }));
await writeFile(path.join(transcription, 'prepared.json'), JSON.stringify({ validations: { 'small:cuda:int8_float16': true, 'large-v3-turbo:cuda:int8_float16': true } }));
const expectedModel = process.argv.includes('--settings') ? 'small' : 'large-v3-turbo';
if (process.argv.includes('--settings')) { const { WorkspacePreferences } = await import('../electron/workspace-preferences.cjs'); await new WorkspacePreferences(data).set('live', { model: expectedModel }); }
const source = path.join(data, 'source.wav');
// Generate a synthetic voice directly to a test-owned WAV. Never read a user's recording.
await promisify(execFile)('powershell.exe', ['-NoProfile', '-Command', `Add-Type -AssemblyName System.Speech; $speech = New-Object System.Speech.Synthesis.SpeechSynthesizer; try { $speech.SelectVoiceByHints([System.Speech.Synthesis.VoiceGender]::NotSet, [System.Speech.Synthesis.VoiceAge]::NotSet, 0, [System.Globalization.CultureInfo]::GetCultureInfo('ko-KR')) } catch {}; try { $speech.SetOutputToWaveFile($env:LOXT_TEST_AUDIO); $speech.Speak('안녕하세요. 로컬 음성 변환 기능을 검증하고 있습니다. 녹음과 스크립트는 이 컴퓨터에 저장됩니다.') } finally { $speech.Dispose() }`], { windowsHide:true, env:{...process.env, LOXT_TEST_AUDIO:source} });
const work = new Library(path.join(data, 'library')); const workNote = (await work.importAudio(source, '')).note;
const before = await work.list();
const env = { ...process.env, SORINOTE_TEST: '1', SORINOTE_TEST_DATA: data, PYTHONDONTWRITEBYTECODE:'1', HF_HUB_OFFLINE:'1', HF_HOME:path.join(data,'hf-cache') }; delete env.ELECTRON_RUN_AS_NODE; delete env.SORINOTE_DEV;
const executable = process.argv.slice(2).find(argument => argument.endsWith('.exe'));
const launch = () => electron.launch({ ...(executable ? { executablePath: path.resolve(executable) } : {}), args: [...(executable ? [] : ['.']), '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${source}`], env });
let app = await launch(); let page;
async function screenshot(name) {
  const bytes = await app.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0].webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG().toString('base64'));
  await writeFile(path.join(data, name), Buffer.from(bytes, 'base64'));
}
try {
  await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 0 }); });
  page = await app.firstWindow(); page.setDefaultTimeout(60000); const errors = []; page.on('pageerror', error => errors.push(error.message));
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].show());
  assert.equal((await page.evaluate(() => window.desktop.getAppInfo())).version, JSON.parse(await readFile('package.json', 'utf8')).version);
  async function untilState(check) { const end = Date.now() + 90000; while (Date.now() < end) { const state = await page.evaluate(() => window.desktop.live.getState()); if (check(state)) return state; await page.waitForTimeout(100); } throw new Error('Live state timeout: ' + JSON.stringify(await page.evaluate(() => window.desktop.live.getState()))); }
  async function switchTo(mode) {
    await page.getByRole('button', { name: '워크스페이스 선택', exact: true }).click();
    await page.getByRole('menuitemradio', { name: new RegExp(mode === 'live' ? '^Live' : '^Work') }).click();
    await page.waitForFunction(mode => !document.querySelector(`[data-workspace="${mode}"]`).hidden, mode);
  }
  await page.getByRole('heading', { name: '홈', exact: true }).waitFor();
  await switchTo('live'); await page.getByRole('button', { name: '새 Live 녹음', exact: true }).click();
  await page.getByRole('textbox', { name: 'Live 녹음 제목', exact: true }).fill('Live GPU 검증');
  await page.waitForFunction(() => !document.querySelector('[data-workspace="live"] button[aria-label="Live 변환 모델"]')?.disabled);
  await page.getByRole('button', { name: 'Live 녹음 장치 선택', exact: true }).click();
  assert.equal(await page.getByRole('menuitemradio', { name: '컴퓨터 소리', exact: true }).count(), 1); await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Live 시작', exact: true }).click();
  await untilState(state => state.stage === 'preparing');
  assert.ok(await page.locator('[data-workspace="live"] .record-start-group > .primary').isDisabled());
  assert.equal(await page.locator('[data-workspace="live"] .clock').textContent(), '00:00:00');
  assert.equal((await page.evaluate(() => window.desktop.live.getLibrary())).notes.length, 0);
  await screenshot('live-preparing.png');
  await untilState(state => state.stage === 'recording');
  console.log('PASS permission before preparation and automatic start after preparation');
  await untilState(state => state.seconds >= 5);
  let state = await page.evaluate(() => window.desktop.live.getState()); assert.equal(state.device, 'cuda'); assert.equal(state.model, expectedModel);
  if (process.argv.includes('--theme')) {
    const prior = (await page.evaluate(()=>window.desktop.live.getState())).seconds;
    await page.getByRole('button',{name:'설정',exact:true}).click();
    await page.getByRole('button',{name:'테마',exact:true}).click();
    await page.getByRole('menuitemradio',{name:'라이트 테마',exact:true}).click();
    await page.waitForFunction(()=>document.documentElement.dataset.theme==='light');
    await page.getByRole('button',{name:'Live 녹음으로 돌아가기',exact:true}).click();
    await untilState(state=>state.stage==='recording'&&state.seconds>prior);
    await screenshot('live-theme-light.png');
    console.log('PASS theme change via General settings retains Live CUDA engine and actual recording');
  }
  await untilState(state => state.segments.length || state.preview.length);
  assert.equal(await page.getByRole('alert').count(), 0); console.log('PASS CUDA and progressive script');
  await screenshot('live-running.png');
  await page.getByRole('button', { name: '홈', exact: true }).click();
  const hidden = (await page.evaluate(() => window.desktop.live.getState())).seconds;
  await untilState(state => state.seconds >= hidden + 1);
  await switchTo('work'); await page.getByRole('button', { name: 'Live 녹음으로 돌아가기', exact: true }).waitFor();
  if (process.argv.includes('--settings')) {
    await page.getByRole('button', { name: '설정', exact: true }).click();
    await page.getByRole('button', { name: '모델 보관함', exact: true }).click();
    await page.locator('[data-workspace="work"] .settings-lock').waitFor();
    assert.equal(await page.getByRole('button', { name: '외부 모델 불러오기', exact: true }).isDisabled(), true);
    await assert.rejects(page.evaluate(() => window.desktop.preferences.set('work', { model: 'large-v3-turbo' })), /Live 작업/);
    await screenshot('work-models-locked-by-live.png');
    await page.getByRole('button', { name: '← 돌아가기', exact: true }).click();
    console.log('PASS real Live lock disables Work model actions and backend rejects default changes');
  }
  const queued = await page.evaluate(id => window.desktop.startTranscription({ id, model: 'small' }), workNote.id);
  assert.equal(queued.queue[0].status, 'queued');
  await page.evaluate(id => window.desktop.cancelTranscription(id), workNote.id);
  await page.getByRole('button', { name: 'Live 녹음으로 돌아가기', exact: true }).click();
  await page.getByRole('button', { name: '일시정지', exact: true }).click();
  await page.getByRole('button', { name: 'Live 계속', exact: true }).waitFor();
  const paused = (await page.evaluate(() => window.desktop.live.getState())).seconds;
  await page.waitForTimeout(1100); assert.equal((await page.evaluate(() => window.desktop.live.getState())).seconds, paused);
  await page.getByRole('button', { name: 'Live 계속', exact: true }).click();
  await untilState(state => state.seconds >= paused + 3);
  await page.getByRole('button', { name: 'Live 종료', exact: true }).click();
  await page.getByRole('button', { name: '녹음 재생', exact: true }).waitFor();
  const saved = (await page.evaluate(() => window.desktop.live.getLibrary())).notes[0];
  assert.equal(saved.done, true); assert.ok(saved.segments.some(segment => segment.speaker)); assert.ok(saved.segments.length > 0); assert.equal(saved.transcription.device, 'cuda');
  assert.ok(saved.segments.every(segment => segment.end <= saved.seconds && segment.start < saved.seconds));
  const wav = await readFile(path.join(data, 'live-library', 'recordings', saved.id, 'audio.wav'));
  assert.equal(wav.readUInt32LE(40), wav.length - 44); assert.equal(saved.seconds, (wav.length - 44) / 32000);
  const audioSeconds = await page.evaluate(() => document.querySelector('[data-workspace="live"] audio').duration);
  assert.ok(Math.abs(audioSeconds - saved.seconds) < .01);
  await page.getByRole('button', { name: '녹음 재생', exact: true }).click();
  await page.getByRole('button', { name: '녹음 일시정지', exact: true }).click();
  await page.locator('[data-workspace="live"] button.segment').last().click();
  const position = await page.evaluate(() => document.querySelector('[data-workspace="live"] audio').currentTime);
  assert.ok(Math.abs(position - saved.segments.at(-1).start) < .05);
  const clipboard = await app.evaluate(({ clipboard }) => clipboard.readText());
  try {
    await page.getByRole('button', { name: '전체 복사', exact: true }).click();
    assert.equal(await app.evaluate(({ clipboard }) => clipboard.readText()), saved.segments.map(segment => `${segment.speaker ? `[${segment.speaker}] ` : ''}${segment.text}`).join('\n\n'));
  } finally { await app.evaluate(({ clipboard }, text) => clipboard.writeText(text), clipboard); }
  await app.evaluate(({ dialog }, file) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: file }); }, path.join(data, 'export.txt'));
  await page.getByRole('button', { name: '내보내기', exact: true }).click();
  await page.waitForTimeout(200); assert.ok((await readFile(path.join(data, 'export.txt'), 'utf8')).includes(saved.segments[0].text));
  await screenshot('live-saved.png');
  assert.equal(JSON.parse(await readFile(path.join(transcription, 'settings.json'), 'utf8')).model, 'small');
  assert.deepEqual((await page.evaluate(() => window.desktop.getLibrary())).notes.map(note => note.id), before.notes.map(note => note.id));
  assert.deepEqual(errors, []);
  await app.close(); app = await launch(); page = await app.firstWindow();await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].show()); page.setDefaultTimeout(60000);
  await page.getByRole('button', { name: 'Live GPU 검증 열기', exact: true }).click();
  await page.getByRole('button', { name: '녹음 재생', exact: true }).waitFor();
  assert.equal((await page.evaluate(() => window.desktop.live.getLibrary())).notes[0].id, saved.id);
  assert.ok(Math.abs(await page.evaluate(() => document.querySelector('[data-workspace="live"] audio').duration) - saved.seconds) < .01);
  await writeFile(path.join(data, 'result.json'), JSON.stringify({ device: state.device, model: state.model, seconds: saved.seconds, segments: saved.segments.length, errors, profile: data }, null, 2));
  console.log('PASS background navigation, Work queue isolation, pause/resume, final WAV/script bounds, playback/seek, copy/export, Work preferences, version and restart persistence');
  console.log('TEST_PROFILE', data);
} catch (error) {
  if (page) { console.log('LIVE_STATE', await page.evaluate(() => window.desktop.live.getState()).catch(() => null)); console.log('UI_ALERT', await page.getByRole('alert').allTextContents().catch(() => [])); await screenshot('failure.png').catch(() => {}); }
  console.log('TEST_PROFILE', data); throw error;
} finally {
  await app.evaluate(({ BrowserWindow }) => { for (const window of BrowserWindow.getAllWindows()) window.destroy(); }).catch(() => {});
  await app.close().catch(() => {});
}
