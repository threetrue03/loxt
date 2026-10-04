import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Library } from '../electron/library.cjs';

// Sample documents exist only in this private QA profile, never in the app bundle.
await mkdir('test-results', { recursive: true });
const data = await mkdtemp(path.resolve('test-results/design-'));
const library = new Library(path.join(data, 'library'));
await library.ready;
await library.createFolder('디자인 테스트');
const rate = 16000;
const wav = Buffer.alloc(44 + rate * 12 * 2);
wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
const texts = [
  ['회의 기록', '이 문서는 디자인 확인을 위한 테스트 스크립트입니다. 실제 녹음에서 인식한 내용은 아닙니다.', '스크립트 줄을 누르면 해당 녹음 구간으로 이동합니다. 제목과 저장 폴더도 바꿀 수 있습니다.', '차분한 카드 안에서 전체 내용을 스크롤해 확인합니다. '.repeat(12)],
  ['강의 노트', '이 문서는 디자인 확인을 위한 테스트 전사문입니다.', '녹음은 문서처럼 모으고, 폴더를 만들어 정리합니다. 전사가 끝나면 목록에서 내용 일부를 바로 확인할 수 있습니다.', '카드 보기와 목록 보기를 전환해 원하는 방식으로 기록을 찾아보세요.'],
  ['새로운 음성 기록'],
];
const notes = [];
for (const [title, ...paragraphs] of texts) {
  const file = path.join(data, `${title}.wav`);
  await writeFile(file, wav);
  const { note } = await library.importAudio(file, '디자인 테스트');
  await library.updateNote(note.id, { seconds: 12 });
  if (paragraphs.length) await library.completeTranscription(note.id, {
    segments: paragraphs.map((text, i) => ({ start: i * 4, end: (i + 1) * 4, text })),
    seconds: 12, model: 'small', device: 'cpu', compute_type: 'int8', language: 'ko',
  });
  notes.push(note);
}
const env = { ...process.env, SORINOTE_TEST: '1', SORINOTE_TEST_DATA: data };
delete env.ELECTRON_RUN_AS_NODE; delete env.SORINOTE_DEV;
const app = await electron.launch({ args: ['.'], env });
const errors = [];
let keepOpen = false;
try {
  const page = await app.firstWindow();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));
  await page.getByRole('heading', { name: '홈', exact: true }).waitFor();
  await page.waitForFunction(() => !document.querySelector('.sidebar-create').disabled);
  await page.waitForFunction(() => document.querySelectorAll('.row').length === 3);
  async function capture(filename) {
    // Hidden native windows may still hold the previous compositor frame.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.waitForTimeout(100);
    const image = await app.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0].webContents.capturePage(undefined, { stayHidden: true, stayAwake: true })).toPNG().toString('base64'));
    await writeFile(path.join(data, filename), Buffer.from(image, 'base64'));
  }
  async function fits() {
    assert.equal(await page.evaluate(() => document.querySelector('.main').scrollWidth > document.querySelector('.main').clientWidth), false, 'The workspace must not scroll horizontally.');
  }
  await fits(); await capture('01-library.png');
  assert.equal(await page.locator('.topbar').count(), 0);
  assert.equal(await page.getByText(/내 PC에 (보관|저장)/).count(), 0);
  assert.equal(await page.locator('.list-footer').count(), 0);
  const preview = page.getByRole('region', { name: '회의 기록 스크립트 미리보기' });
  assert.ok(await preview.evaluate(element => element.scrollHeight > element.clientHeight));
  await preview.evaluate(element => { element.scrollTop = element.scrollHeight; });
  assert.ok(await preview.evaluate(element => element.scrollTop > 0));
  assert.equal(await page.locator('.note-card').first().evaluate(element => getComputedStyle(element).backgroundColor), 'rgb(43, 45, 44)');
  assert.match(await page.locator('.app').getAttribute('style'), /SUIT/);
  await page.getByRole('button', { name: '작은 카드 보기', exact: true }).click();
  assert.equal(await page.locator('.layout-compact .row').count(), 3);
  await capture('02-compact.png');
  await page.getByRole('button', { name: '목록 보기', exact: true }).click();
  await page.reload();
  await page.waitForFunction(() => document.querySelectorAll('.layout-list .row').length === 3);
  await page.evaluate(() => localStorage.setItem('sorinote.ui-preferences', JSON.stringify({ font: 'noto', autoTranscribe: false })));
  await page.reload();
  await page.waitForFunction(() => document.querySelectorAll('.layout-list .row').length === 3);
  assert.match(await page.locator('.app').getAttribute('style'), /SUIT/);
  await capture('03-list.png');
  await page.getByRole('button', { name: '카드 보기', exact: true }).click();
  await page.getByRole('button', { name: '회의 기록 열기', exact: true }).click();
  const region = page.getByRole('region', { name: '스크립트', exact: true });
  await region.waitFor();
  assert.equal(await page.locator('.segment').count(), 3);
  assert.equal(await page.locator('.detail-tabs:visible').getByRole('button', { name: '내보내기', exact: true }).count(), 1);
  assert.equal(await page.getByRole('button', { name: '녹음 장치 선택', exact: true }).count(), 0);
  await page.getByRole('button', { name: '00:04 구간 재생', exact: true }).click();
  await page.waitForFunction(() => Math.abs(document.querySelector('audio').currentTime - 4) < .1);
  assert.equal(Number(await page.getByLabel('재생 위치', { exact: true }).inputValue()), 4);
  assert.equal(await page.getByRole('button', { name: '전사하기', exact: true }).count(), 0);
  assert.ok(await page.locator('.workspace-player').evaluate(element => element.getBoundingClientRect().top) > await region.evaluate(element => element.getBoundingClientRect().top));
  await region.evaluate(element => { for (let i = 0; i < 30; i++) element.append(element.firstElementChild.cloneNode(true)); });
  assert.equal(await region.evaluate(element => element.scrollHeight > element.clientHeight), true);
  const playerTop = await page.locator('.workspace-player').evaluate(element => element.getBoundingClientRect().top);
  await region.evaluate(element => { element.scrollTop = element.scrollHeight; });
  assert.equal(await page.locator('.workspace-player').evaluate(element => element.getBoundingClientRect().top), playerTop);
  await region.evaluate(element => { while (element.children.length > 3) element.lastElementChild.remove(); element.scrollTop = 0; });
  await capture('04-transcript.png');
  await page.getByRole('button', { name: '다시 변환', exact: true }).click();
  await page.getByRole('dialog').waitFor();
  await page.getByRole('button', { name: '변환 모델', exact: true }).click();
  assert.ok(await page.getByRole('menu', { name: '변환 모델', exact: true }).getByRole('menuitemradio').count() >= 3);
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('dialog').getByRole('group', { name: '저장할 폴더' }).count(), 1);
  await capture('13-conversion-dialog.png');
  await page.getByRole('button', { name: '닫기', exact: true }).click();
  await page.getByRole('button', { name: '설정', exact: true }).click();
  await page.getByRole('heading', { name: '일반', exact: true }).waitFor();
  await page.getByRole('button', { name: '모델 보관함', exact: true }).click();
  await page.getByRole('heading', { name: '모델 보관함', exact: true }).waitFor();
  assert.equal(await page.locator('.model-row').count(), 3);
  assert.equal(await page.getByRole('button', { name: '저성능 모델 설치', exact: true }).count(), 1);
  assert.equal(await page.getByRole('button', { name: '외부 모델 불러오기', exact: true }).count(), 1);
  await fits(); await capture('05-settings.png');
  const initial = await page.evaluate(() => window.desktop.getTranscriptionEnvironment());
  await app.evaluate(({ ipcMain, BrowserWindow }, initial) => {
    let pending, attempt = 0;
    ipcMain.removeHandler('transcription:install-models'); ipcMain.removeHandler('transcription:cancel');
    ipcMain.handle('transcription:install-models', (_, names) => {
      if (++attempt === 2) return { ...initial, error: '다운로드 연결에 문제가 있습니다.' };
      return new Promise(resolve => { pending = resolve; BrowserWindow.getAllWindows()[0].webContents.send('transcription:state', { ...initial, busy: true, operation: 'download', stage: 'downloading', download: { model: names[0] }, progress: 37 }); });
    });
    ipcMain.handle('transcription:cancel', () => { const state = { ...initial, busy: false, operation: null, stage: 'idle', progress: null }; pending?.(state); return state; });
  }, initial);
  await page.getByRole('button', { name: '저성능 모델 설치', exact: true }).click();
  await page.getByRole('button', { name: '저성능 설치 진행', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: '저성능 설치 진행', exact: true }).textContent(), '37%');
  await capture('12-model-progress.png');
  await page.getByRole('button', { name: '저성능 설치 취소', exact: true }).click();
  await page.getByRole('button', { name: '저성능 모델 설치', exact: true }).click();
  await page.locator('.model-row-error').waitFor();
  assert.equal(await page.getByRole('button', { name: '저성능 모델 설치', exact: true }).textContent(), '재시도');
  await page.getByRole('button', { name: '일반', exact: true }).click();
  assert.equal(await page.getByText('LOXT는 모든 화면에서 SUIT를 사용합니다.', { exact: true }).count(), 0);
  await capture('10-general.png');
  await page.getByRole('button', { name: '← 보관함으로 돌아가기', exact: true }).click();
  await page.getByRole('button', { name: '새 녹음', exact: true }).click();
  await page.getByRole('textbox', { name: '녹음 제목', exact: true }).fill('제목에서 바로 수정');
  assert.equal(await page.locator('.record-fields').count(), 0);
  assert.equal(await page.getByRole('checkbox').count(), 0);
  assert.equal(await page.getByLabel('저장할 폴더', { exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: '내보내기', exact: true }).count(), 0);
  assert.ok(await page.getByRole('textbox', { name: '녹음 제목', exact: true }).evaluate(element => parseFloat(getComputedStyle(element).borderTopWidth) > 0));
  const mic = page.getByRole('button', { name: '녹음 장치 선택', exact: true });
  assert.ok(await mic.evaluate(element => { const group = element.closest('.record-start-group'); return Math.abs(element.getBoundingClientRect().width / group.getBoundingClientRect().width - .1) < .01; }), 'Record start button is split 9:1');
  await mic.click();
  assert.ok(await page.getByRole('menu', { name: '녹음 장치 선택' }).evaluate(element => element.getBoundingClientRect().bottom) < await mic.evaluate(element => element.getBoundingClientRect().top));
  await page.getByRole('menuitemradio', { name: /시스템 기본 마이크/ }).click();
  assert.ok(await page.locator('.bottom-controls').evaluate(element => element.getBoundingClientRect().top) > await page.locator('.transcript-frame').evaluate(element => element.getBoundingClientRect().top));
  await page.getByRole('button', { name: '설정', exact: true }).click();
  await page.getByRole('button', { name: '← 보관함으로 돌아가기', exact: true }).click();
  assert.equal(await page.getByRole('textbox', { name: '녹음 제목', exact: true }).inputValue(), '제목에서 바로 수정');
  await capture('06-recording.png');
  await page.getByRole('button', { name: '← 녹음 목록', exact: true }).click();
  const positions = () => page.locator('.sidebar button').evaluateAll(elements => elements.filter(element => ['새 녹음', '파일 불러오기', '홈', '최근 녹음', '휴지통', '설정'].includes(element.textContent.trim())).map(element => element.querySelector('svg').getBoundingClientRect().top));
  const expanded = await positions();
  assert.equal(await page.locator('.sidebar').evaluate(element => element.getBoundingClientRect().width), 224);
  await page.getByRole('button', { name: '사이드바 접기', exact: true }).click();
  await page.waitForTimeout(300);
  assert.equal(await page.locator('.sidebar').evaluate(element => element.getBoundingClientRect().width), 76);
  assert.deepEqual(await positions(), expanded, 'Sidebar icons retain their vertical position');
  await fits(); await capture('07-collapsed.png');
  await page.getByRole('button', { name: '사이드바 펼치기', exact: true }).click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: '디자인 테스트', exact: true }).first().click();
  assert.equal(await page.locator('.heading-title .add-note').count(), 0);
  assert.ok(await page.locator('.folder-breadcrumb').evaluate(element => parseFloat(getComputedStyle(element).borderTopWidth) > 0));
  await page.getByRole('button', { name: '새로 추가하기', exact: true }).click();
  await page.getByRole('menuitem', { name: '폴더', exact: true }).click();
  await page.getByLabel('새 폴더 이름', { exact: true }).fill('하위 기록');
  await page.getByLabel('새 폴더 이름', { exact: true }).press('Enter');
  await page.locator('.folder-card').filter({hasText:'하위 기록'}).click();
  await page.getByRole('heading', { name: '하위 기록', exact: true }).waitFor();
  assert.equal((await page.evaluate(() => window.desktop.getLibrary())).folderParents['디자인 테스트/하위 기록'], '디자인 테스트');
  await page.getByRole('navigation', { name: '폴더 경로' }).getByRole('button', { name: '디자인 테스트', exact: true }).click();
  await page.locator('.folder-card').filter({ hasText: '하위 기록' }).waitFor();
  await page.getByRole('button', { name: '홈', exact: true }).click();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(860, 640));
  await fits(); await capture('08-small-window.png');
  await page.getByRole('button', { name: '설정', exact: true }).click();
  await fits(); await capture('09-small-settings.png');
  await page.getByRole('button', { name: '← 보관함으로 돌아가기', exact: true }).click();
  await page.getByRole('button', { name: '새 녹음', exact: true }).click();
  await fits(); await capture('11-small-recording.png');
  assert.equal(await page.locator('.workspace').evaluate(element => element.scrollHeight > element.clientHeight), false);
  await page.getByRole('button', { name: '← 녹음 목록', exact: true }).click();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 900));
  assert.deepEqual(errors, []);
  console.log('PASS: dark scrollable cards, nested folders, full-row seeking, conditional export, upward microphone menu, General settings, 224px animated sidebar with fixed icon positions, 860px layout');
  console.log('TEST_PROFILE', data);
  if (process.argv.includes('--show')) {
    await app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      window.setTitle('LOXT · 디자인 테스트 (별도 보관함)');
      window.show(); window.focus();
    });
    keepOpen = true;
    console.log('PREVIEW_READY');
    await app.waitForEvent('close', { timeout: 0 });
  }
} finally { if (!keepOpen) await app.close(); }
