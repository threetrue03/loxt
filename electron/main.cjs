const { app, BrowserWindow, ipcMain, Menu, dialog, protocol, shell, powerSaveBlocker, nativeTheme, desktopCapturer, clipboard } = require('electron');
const path = require('node:path');
const { writeFile } = require('node:fs/promises');
const { pathToFileURL } = require('node:url');
const { createReadStream } = require('node:fs');
const { stat } = require('node:fs/promises');
const { Readable } = require('node:stream');
const { WorkspaceLibraries } = require('./workspace-libraries.cjs');
const { Transcriber } = require('./transcriber.cjs');
const { ConversionQueue } = require('./conversion-queue.cjs');
const { LiveEngine } = require('./live-engine.cjs');
const { SystemAudio } = require('./system-audio.cjs');
const { YouTubeImports, youtubeUrl } = require('./youtube.cjs');
const { Appearance } = require('./appearance.cjs');
const { WorkspacePreferences } = require('./workspace-preferences.cjs');
const { SettingsSupport, diagnosticInfo } = require('./settings-support.cjs');
const { ModelActions } = require('./model-actions.cjs');

nativeTheme.themeSource = 'dark';
// Keep the existing library and models through the LOXT display-name migration.
app.setPath('userData', path.join(app.getPath('appData'), 'sorinote-desktop'));

protocol.registerSchemesAsPrivileged(['sorinote-audio','loxt-asset'].map(scheme => ({ scheme, privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true, corsEnabled: true } })));
const { Memos } = require('./memos.cjs');
const { exportMemo } = require('./memo-export.cjs');
let memos, memoPending = false, memoClosing = false, memoCloseAllowed = false, memoFlushReply;
let pendingMemoIds = new Set();
ipcMain.on('memos:pending', (event, value) => { if (isTrusted(event.senderFrame) && Array.isArray(value) && value.every(id => typeof id === 'string')) { pendingMemoIds = new Set(value); memoPending = pendingMemoIds.size > 0; } });
ipcMain.on('memos:flushed', (event, value) => { if (isTrusted(event.senderFrame)) memoFlushReply?.(value); });

const developmentUrl = !app.isPackaged && process.env.SORINOTE_DEV === '1'
  ? 'http://127.0.0.1:5173' : null;
const productionUrl = pathToFileURL(path.join(__dirname, '../dist/index.html')).href;
let mainWindow;
let library;
let workspaceLibraries;
let transcriber;
let conversions;
let live;
let systemAudio;
let youtube;
let appearance;
let preferences, settingsSupport, modelActions;
let lastSettingsNotice = '';
let systemAudioAllowed = false;
let blocker = null;
let microphoneAllowed = false;
let closingNotice = false;
if (process.env.SORINOTE_TEST === '1' && process.env.SORINOTE_TEST_DATA) {
  app.setPath('userData', path.resolve(process.env.SORINOTE_TEST_DATA));
}
const singleton = app.requestSingleInstanceLock();
if (!singleton) app.quit();
app.on('second-instance', () => { if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.show(); mainWindow.focus(); } });

function isTrusted(frame) {
  if (!frame || frame !== mainWindow?.webContents.mainFrame) return false;
  return developmentUrl
    ? new URL(frame.url).origin === developmentUrl
    : frame.url === productionUrl;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280, height: 880, minWidth: 860, minHeight: 640,
    title: 'LOXT', backgroundColor: appearance.theme === 'light' ? '#F6F6F4' : '#1e1e1e', show: false,
    icon: path.join(__dirname, '../dist/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
      backgroundThrottling: false,
    },
  });
  Menu.setApplicationMenu(null);
  let windowReady = false, landingDone = process.env.SORINOTE_TEST === '1' && process.env.SORINOTE_SPLASH_TEST !== '1';
  const showWindow = () => { if (windowReady && landingDone && process.env.SORINOTE_TEST !== '1' && !mainWindow.isDestroyed()) mainWindow.show(); };
  mainWindow.once('ready-to-show', () => { windowReady = true; showWindow(); });
  if (!landingDone) {
    const landing = new BrowserWindow({ width: 420, height: 190, frame: false, transparent: true, resizable: false, minimizable: false, maximizable: false, skipTaskbar: true, focusable: false, show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
    landing.center();
    landing.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    landing.webContents.on('will-navigate', event => event.preventDefault());
    landing.once('closed', () => { landingDone = true; showWindow(); });
    landing.webContents.once('did-finish-load', () => { landing.showInactive(); setTimeout(() => { if (!landing.isDestroyed()) landing.close(); }, 1500); });
    landing.loadFile(path.join(__dirname, '../dist/splash.html'), { query: { theme: appearance.theme } }).catch(() => { if (!landing.isDestroyed()) landing.close(); });
  }
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== (developmentUrl || productionUrl)) event.preventDefault();
  });
  const session = mainWindow.webContents.session;
  session.setDisplayMediaRequestHandler(async (request, callback) => {
    if (!isTrusted(request.frame) || !request.userGesture || !request.audioRequested || process.platform !== 'win32') { callback({}); return; }
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } });
      if (!sources.length || !isTrusted(request.frame)) { callback({}); return; }
      systemAudioAllowed = true; callback({ video: sources[0], audio: 'loopback' });
    } catch { callback({}); }
  });
  session.setPermissionCheckHandler((contents, permission, _origin, details) =>
    contents === mainWindow.webContents && isTrusted(contents.mainFrame)
    && (permission === 'display-capture' || (permission === 'media' && details.mediaType !== 'video')));
  session.setPermissionRequestHandler(async (contents, permission, callback, details) => {
    if (permission === 'display-capture') { callback(contents === mainWindow.webContents && isTrusted(contents.mainFrame)); return; }
    // Chromium reports display capture as media with an empty mediaTypes list.
    // The display handler additionally requires a user gesture and grants only Windows loopback.
    if (permission === 'media' && details.mediaTypes?.length === 0) { callback(contents === mainWindow.webContents && isTrusted(contents.mainFrame)); return; }
    const allowed = contents === mainWindow.webContents && isTrusted(contents.mainFrame)
      && permission === 'media' && details.mediaTypes?.includes('audio') && !details.mediaTypes.includes('video');
    if (!allowed) { callback(false); return; }
    if (!microphoneAllowed) {
      try {
        const result = await dialog.showMessageBox(mainWindow, { type: 'question', title: '마이크 사용', message: 'LOXT에서 마이크를 사용하도록 허용할까요?', detail: '음성은 이 PC에 저장됩니다.', buttons: ['허용', '취소'], defaultId: 0, cancelId: 1 });
        microphoneAllowed = result.response === 0;
      } catch { callback(false); return; }
    }
    callback(microphoneAllowed);
  });
  mainWindow.on('close', async event => {
    const changingData = youtube?.hasJobs || (live?.busy && live.state.stage !== 'ready') || conversions?.hasJobs || transcriber?.requestId || (transcriber?.busy && !['detect', 'live'].includes(transcriber.operation));
    if (!library?.sessions.size && !workspaceLibraries?.live.sessions.size && !changingData) {
      if (memoCloseAllowed || !memoPending) return;
      event.preventDefault(); if (memoClosing) return; memoClosing = true;
      try {
        const token = require('node:crypto').randomUUID();
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => { memoFlushReply = null; reject(new Error('메모 저장 응답이 없습니다. 메모를 다시 열어 저장 상태를 확인해 주세요.')); }, 10000);
          memoFlushReply = value => { if (value?.token !== token) return; clearTimeout(timeout); memoFlushReply = null; value.error ? reject(new Error(value.error)) : resolve(); };
          mainWindow.webContents.send('memos:flush', token);
        });
        await library.queue; memoCloseAllowed = true; mainWindow.close();
      } catch (error) { await dialog.showMessageBox(mainWindow, { type: 'error', title: '메모 저장 실패', message: error.message, detail: '작성 내용을 유지했습니다. 메모에서 다시 시도한 뒤 닫아 주세요.', buttons: ['돌아가기'] }); }
      finally { memoClosing = false; }
      return;
    }
    event.preventDefault();
    if (closingNotice) return;
    closingNotice = true;
    try { await dialog.showMessageBox(mainWindow, { type: 'info', title: '작업 진행 중', message: library?.sessions.size ? '녹음을 종료하고 저장을 마친 뒤 앱을 닫아 주세요.' : '변환 작업을 마치거나 취소한 뒤 앱을 닫아 주세요.', buttons: ['확인'] }); }
    catch { /* window is already destroyed */ }
    closingNotice = false;
  });
  if (developmentUrl) mainWindow.loadURL(developmentUrl);
  else mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
}

ipcMain.handle('app:info', (event) => {
  if (!isTrusted(event.senderFrame)) throw new Error('허용되지 않은 요청입니다.');
  return { version: app.getVersion(), platform: process.platform, desktop: true, updateMethod: '새 설치 파일을 실행하면 앱을 업데이트합니다. 기존 녹음·스크립트·설정은 유지됩니다.' };
});

function handle(channel, work) {
  ipcMain.handle(channel, (event, payload) => {
    if (!isTrusted(event.senderFrame)) throw new Error('허용되지 않은 요청입니다.');
    return work(payload);
  });
}
function refreshBlocker() {
  const active = library.sessions.size || youtube?.hasJobs || live?.busy || conversions?.hasJobs || ['prepare', 'transcribe', 'download'].includes(transcriber?.operation);
  if (active && blocker === null) blocker = powerSaveBlocker.start('prevent-app-suspension');
  if (!active && blocker !== null) { powerSaveBlocker.stop(blocker); blocker = null; }
  publishSettings();
}
function modelLockReason() {
  if (library?.sessions.size) return '녹음을 마친 뒤 모델을 변경할 수 있어요.';
  if (live?.busy) return 'Live 작업을 마치거나 취소한 뒤 모델을 변경할 수 있어요.';
  if (conversions?.hasJobs) return '변환 작업을 마치거나 취소한 뒤 모델을 변경할 수 있어요.';
  if (transcriber?.busy) return '현재 준비·모델 작업을 마친 뒤 변경할 수 있어요.';
  return '';
}
function settingsState() { return { ...modelActions?.snapshot(), lockReason: modelLockReason() }; }
function publishSettings() {
  const state = settingsState(), text = JSON.stringify(state);
  if (text === lastSettingsNotice) return;
  lastSettingsNotice = text;
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('settings:changed', state);
}
handle('preferences:get', () => preferences.snapshot());
handle('preferences:migrate', legacy => preferences.migrate(legacy));
handle('preferences:set', async payload => {
  if (Object.hasOwn(payload?.change || {}, 'model')) {
    requireNoConversions();
    const model = (await transcriber.modelList()).find(item => item.id === payload.change.model);
    if (!model?.downloaded) throw new Error('설치된 모델을 선택해 주세요.');
    requireNoConversions();
    return modelActions.run('default', model.id, () => preferences.set(payload.mode, payload.change), payload.mode);
  }
  return preferences.set(payload?.mode, payload?.change);
});
handle('settings:state', () => settingsState());
handle('settings:verify', model => { requireNoConversions(); return modelActions.run('verify', model, async () => { await transcriber.configure({ model, device: 'auto' }, { persist: false }); return transcriber.prepare(); }); });
handle('settings:storage', force => settingsSupport.storage(Boolean(force)));
handle('settings:location', async payload => {
  const location = settingsSupport.locations()[payload?.id];
  if (!location) throw new Error('저장 위치를 확인해 주세요.');
  if (payload.copy) { clipboard.writeText(location); return; }
  const error = await shell.openPath(location); if (error) throw new Error('저장 폴더를 열지 못했습니다. 설치 상태와 폴더 접근 권한을 확인해 주세요.');
});
handle('settings:log', async () => { const error = await shell.openPath(await settingsSupport.existingLog()); if (error) throw new Error('로그 파일을 열지 못했습니다. 파일 접근 권한을 확인해 주세요.'); });
handle('settings:diagnostics', () => { clipboard.writeText(diagnosticInfo(app.getVersion(), conversions.snapshot(), preferences.snapshot())); });
handle('settings:link', async id => {
  const urls = { releases: 'https://github.com/threetrue03/loxt/releases', changes: 'https://github.com/threetrue03/loxt/releases', license: 'https://github.com/threetrue03/loxt/blob/main/LICENSE', notices: 'https://github.com/threetrue03/loxt/blob/main/build/THIRD-PARTY-NOTICES.md' };
  if (!urls[id]) throw new Error('링크를 확인해 주세요.'); await shell.openExternal(urls[id]);
});
// This read-only startup value is available before the renderer's first frame.
ipcMain.on('appearance:initial', event => { event.returnValue = event.sender === mainWindow?.webContents ? appearance?.theme || 'dark' : 'dark'; });
handle('appearance:get', () => appearance.snapshot());
handle('appearance:set', async theme => {
  const state = await appearance.set(theme);
  nativeTheme.themeSource = state.theme;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setBackgroundColor(state.theme === 'light' ? '#F6F6F4' : '#1e1e1e');
    mainWindow.webContents.send('appearance:changed', state);
  }
  return state;
});
handle('transcription:environment', () => conversions.environment());
function requireNoConversions() { const reason = modelLockReason(); if (reason || modelActions?.pending) throw new Error(reason || '현재 모델 작업을 마친 뒤 다시 시도해 주세요.'); }
handle('transcription:prepare', () => { requireNoConversions(); return transcriber.prepare(); });
handle('transcription:start', payload => conversions.enqueue(payload));
handle('transcription:cancel', id => conversions.cancel(id));
handle('transcription:retry-speakers', payload => { requireNoConversions(); return transcriber.retrySpeakers(payload.id, workspaceLibraries.get(payload.workspace)); });
handle('transcription:configure', value => { requireNoConversions(); return transcriber.configure(value); });
handle('transcription:delete-model', name => { requireNoConversions(); return modelActions.run('delete', name, () => transcriber.deleteModel(name)); });
handle('transcription:install-models', names => { requireNoConversions(); return modelActions.run('install', Array.isArray(names) ? names[0] : 'models', () => transcriber.installModels(names)); });
handle('transcription:import-model', async () => {
  requireNoConversions();
  return modelActions.run('import', 'import', async () => {
    const result = await dialog.showOpenDialog(mainWindow, { title: '외부 모델 불러오기', properties: ['openDirectory'] });
    if (result.canceled || !result.filePaths.length) return { canceled: true };
    const reason = modelLockReason(); if (reason) throw new Error(reason);
    return transcriber.importModel(result.filePaths[0]);
  });
});
handle('library:list', () => library.list());
handle('memos:create', folder => memos.create(folder || ''));
handle('memos:get', id => memos.read(id));
handle('memos:save', payload => memos.save(payload));
handle('memos:attach', payload => memos.attach(payload));
handle('memos:copy', async text => { if (typeof text !== 'string' || text.length > 5_000_000) throw new Error('복사할 내용을 확인해 주세요.'); await clipboard.writeText(text); return true; });
handle('memos:export', payload => exportMemo(payload, { memos, dialog, BrowserWindow, mainWindow }));
handle('memos:link', async payload => {
  const url = typeof payload === 'string' ? payload : payload?.url;
  if (typeof url !== 'string' || url.length > 4000) throw new Error('주소를 확인해 주세요.');
  if (url.startsWith('loxt-asset:')) { const asset = await memos.asset(url); const name = typeof payload?.name === 'string' ? payload.name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim().slice(0, 120) : ''; const result = await dialog.showSaveDialog(mainWindow, { title: '첨부파일 저장', defaultPath: name || asset.name }); if (!result.canceled && result.filePath) await require('node:fs/promises').copyFile(asset.filename, result.filePath); }
  else if (/^https?:\/\//i.test(url) || /^mailto:/i.test(url)) await shell.openExternal(url);
  else throw new Error('웹 주소 또는 이메일 링크만 열 수 있습니다.');
});
handle('live:state', () => live.snapshot());
handle('system-audio:start', () => { if (!systemAudioAllowed) throw new Error('컴퓨터 소리 녹음 권한을 먼저 요청해 주세요.'); return systemAudio.start(); });
handle('system-audio:cancel-pending', () => systemAudio.cancelPending());
handle('system-audio:stop', id => systemAudio.stop(id));
handle('live:prepare', options => live.prepare(options));
handle('live:start', options => live.start(options));
handle('live:append', payload => live.append(payload));
handle('live:pause', payload => live.pause(payload?.id, Boolean(payload?.paused)));
handle('live:finish', id => live.finish(id));
const liveImportFailures = new Map();
async function importLiveFiles(store, files, folder) {
  const notes = [], errors = [], failed = [];
  for (const filename of files) {
    try { notes.push((await store.importAudio(filename, folder)).note); }
    catch (error) { failed.push(filename); errors.push({ filename: path.basename(filename), message: error.message }); }
  }
  const batch = failed.length ? require('node:crypto').randomUUID() : null;
  if (batch) { if (liveImportFailures.size >= 20) liveImportFailures.delete(liveImportFailures.keys().next().value); liveImportFailures.set(batch, { files: failed, folder }); }
  return { notes, errors, batch, library: await store.list() };
}
handle('workspace:library', payload => {
  if (payload?.workspace !== 'live') throw new Error('지원하지 않는 워크스페이스입니다.');
  const store = workspaceLibraries.get(payload?.workspace);
  if (live?.busy && (payload?.id === live.state.id || payload?.ids?.includes(live.state.id)) && ['update-note', 'move-notes', 'restore-trash', 'delete-trash'].includes(payload?.action)) throw new Error('Live 녹음을 종료한 뒤 기록을 변경해 주세요.');
  switch (payload?.action) {
    case 'list': return store.list();
    case 'import': return dialog.showOpenDialog(mainWindow, { properties: ['openFile', 'multiSelections'], filters: [{ name: '오디오', extensions: ['wav','mp3','m4a','webm','ogg','flac','mp4'] }] }).then(result => result.canceled ? { canceled: true } : importLiveFiles(store, result.filePaths, payload.folder || ''));
    case 'retry-import': {
      const pending = liveImportFailures.get(payload.batch);
      if (!pending) throw new Error('재시도할 파일이 없습니다.');
      liveImportFailures.delete(payload.batch);
      return importLiveFiles(store, pending.files, pending.folder);
    }
    case 'create-folder': return store.createFolder({ name: payload.name, parent: payload.parent });
    case 'rename-folder': return store.renameFolder({ folder: payload.folder, name: payload.name });
    case 'delete-folder': return store.deleteFolder(payload.folder);
    case 'update-note': return store.updateNote(payload.id, payload.changes || {});
    case 'move-notes': return store.moveNotes({ ids: payload.ids, folder: payload.folder });
    case 'restore-trash': return store.restoreTrash(payload.ids);
    case 'delete-trash': return store.deleteTrash(payload.ids);
    case 'copy': return store.list().then(async data => { const note = data.notes.find(note => note.id === payload.id); if (!note?.done) throw new Error('복사할 스크립트가 없습니다.'); clipboard.writeText((await import('../shared/transcript.js')).serializeTranscript(note.segments)); });
    case 'open': return shell.openPath(store.root);
    default: throw new Error('지원하지 않는 보관함 작업입니다.');
  }
});
handle('library:folder', payload => library.createFolder(payload));
handle('library:rename-folder', payload => library.renameFolder(payload));
handle('library:delete-folder', async folder => {
  const data = await library.list(), subtree = library.folderSubtree(folder);
  if (data.notes.some(note => pendingMemoIds.has(note.id) && subtree.has(note.folder))) throw new Error('폴더 안의 메모 저장을 마친 뒤 삭제해 주세요.');
  if (conversions.snapshot().queue.some(job => data.notes.some(note => note.id === job.id && subtree.has(note.folder)))) throw new Error('이 폴더의 변환을 마치거나 취소한 뒤 삭제해 주세요.');
  return library.deleteFolder(folder);
});
handle('library:restore-trash', ids => library.restoreTrash(ids));
handle('library:delete-trash', async ids => {
  if (ids?.some(id => pendingMemoIds.has(id))) throw new Error('작성 중인 메모를 저장한 뒤 삭제해 주세요.');
  if (conversions.snapshot().queue.some(job => ids?.includes(job.id))) throw new Error('변환을 마치거나 취소한 뒤 삭제해 주세요.');
  return library.deleteTrash(ids);
});
handle('transcript:copy', async id => {
  const note = (await library.list()).notes.find(note => note.id === id);
  if (!note?.done || ['queued', 'transcribing'].includes(note.status)) throw new Error('변환이 끝난 스크립트만 복사할 수 있습니다.');
  clipboard.writeText((await import('../shared/transcript.js')).serializeTranscript(note.segments));
  return true;
});
handle('library:update-note', payload => { if (payload?.changes?.deleted && pendingMemoIds.has(payload.id)) throw new Error('메모 저장을 마친 뒤 휴지통으로 이동해 주세요.'); return library.updateNote(payload?.id, payload?.changes || {}); });
handle('library:move-notes', payload => library.moveNotes(payload));
handle('recording:discard', async id => {
  if (conversions.snapshot().queue.some(job => job.id === id)) throw new Error('변환 중인 녹음은 버릴 수 없습니다.');
  try { return await library.discardRecording(id); } finally { refreshBlocker(); }
});
handle('library:open', () => shell.openPath(library.root));
handle('recording:begin', async payload => { const result = await library.beginRecording(payload); refreshBlocker(); return result; });
handle('recording:append', payload => library.appendRecording(payload));
handle('recording:checkpoint', payload => library.checkpointRecording(payload));
handle('recording:finish', async payload => { const result = await library.finishRecording(payload); refreshBlocker(); return result; });
handle('recording:abandon', async id => { await library.abandonRecording(id); refreshBlocker(); });
handle('audio:import', async payload => {
  const result = await dialog.showOpenDialog(mainWindow, { title: '녹음 파일 불러오기', properties: ['openFile'], filters: [{ name: '오디오 파일', extensions: ['webm', 'wav', 'mp3', 'm4a', 'aac', 'ogg', 'flac', 'mp4'] }] });
  if (result.canceled || !result.filePaths.length) return { canceled: true };
  return { canceled: false, ...await library.importAudio(result.filePaths[0], payload?.folder || '') };
});
handle('youtube:inspect', url => youtube.inspect(url));
handle('youtube:cancel-inspect', () => youtube.cancelInspect());
handle('youtube:start', payload => youtube.start(payload));
handle('youtube:state', () => youtube.snapshot());
handle('youtube:cancel', id => youtube.cancel(id));
handle('youtube:open-source', async id => {
  const note = (await library.list()).notes.find(item => item.id === id);
  if (note?.source?.type !== 'youtube') throw new Error('YouTube 원본을 찾지 못했습니다.');
  await shell.openExternal(youtubeUrl(note.source.url));
});

async function audioResponse(request) {
  const origin = request.headers.get('origin') || (developmentUrl || 'file://');
  const allowedOrigin = ['null', 'file://', developmentUrl].includes(origin);
  const cors = { ...(allowedOrigin ? { 'Access-Control-Allow-Origin': origin } : {}), 'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS', 'Access-Control-Allow-Headers': 'Range' };
  try {
    const url = new URL(request.url);
    if (!['recording', 'live'].includes(url.hostname)) return new Response(null, { status: 404, headers: cors });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 404, headers: cors });
    const id = url.pathname.slice(1);
    const audio = await workspaceLibraries.get(url.hostname === 'live' ? 'live' : 'work').getAudio(id);
    const size = (await stat(audio.filename)).size;
    const headers = { ...cors, 'Content-Type': audio.mime, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' };
    let start = 0, end = size - 1, status = 200;
    const range = request.headers.get('range');
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match || (!match[1] && !match[2])) return new Response(null, { status: 416, headers: { ...cors, 'Content-Range': `bytes */${size}` } });
      if (!match[1]) start = Math.max(0, size - Number(match[2]));
      else { start = Number(match[1]); if (match[2]) end = Math.min(end, Number(match[2])); }
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) return new Response(null, { status: 416, headers: { ...cors, 'Content-Range': `bytes */${size}` } });
      headers['Content-Range'] = `bytes ${start}-${end}/${size}`; status = 206;
    }
    headers['Content-Length'] = String(end - start + 1);
    const stream = request.method === 'HEAD' ? null : Readable.toWeb(createReadStream(audio.filename, { start, end }));
    return new Response(stream, { status, headers });
  } catch { return new Response(null, { status: 404, headers: cors }); }
}

ipcMain.handle('transcript:export', async (event, payload) => {
  if (!isTrusted(event.senderFrame)) throw new Error('허용되지 않은 요청입니다.');
  if (!payload || typeof payload.title !== 'string' || typeof payload.text !== 'string'
    || payload.title.length > 300 || payload.text.length > 5_000_000) {
    throw new Error('내보내기 데이터가 올바르지 않습니다.');
  }
  const filename = payload.title.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').slice(0, 120) || '스크립트';
  const result = await dialog.showSaveDialog(mainWindow, {
    title: '스크립트 저장', defaultPath: `${filename}.txt`,
    filters: [{ name: '텍스트 파일', extensions: ['txt'] }],
  });
  if (result.canceled || !result.filePath) return { canceled: true };
  await writeFile(result.filePath, '\ufeff' + payload.text, 'utf8');
  return { canceled: false };
});

app.whenReady().then(() => {
  if (!singleton) return;
  appearance = new Appearance(path.join(app.getPath('userData'), 'appearance.json'));
  preferences = new WorkspacePreferences(app.getPath('userData'), value => mainWindow?.webContents.send('preferences:changed', value));
  settingsSupport = new SettingsSupport(app.getPath('userData'));
  modelActions = new ModelActions(app.getPath('userData'), publishSettings);
  nativeTheme.themeSource = appearance.theme;
  workspaceLibraries = new WorkspaceLibraries(app.getPath('userData'));
  library = workspaceLibraries.get('work');
  memos = new Memos(library);
  // 실패는 library:list에서 화면에 안내합니다. 초기화 실패로 원본을 덮어쓰지 않습니다.
  library.ready.catch(() => {});
  transcriber = new Transcriber({ root: path.join(app.getPath('userData'), 'transcription'),
    runtime: app.isPackaged ? path.join(process.resourcesPath, 'python-runtime') : path.join(__dirname, '../.runtime/python'), runtimeRequired: app.isPackaged,
    resources: app.isPackaged ? path.join(process.resourcesPath, 'python') : path.join(__dirname, '../python'),
    library, onChange: () => { conversions?.changed(); live?.environmentChanged(); } });
  conversions = new ConversionQueue(transcriber, library, state => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('transcription:state', state);
    refreshBlocker();
  });
  conversions.liveLibrary = workspaceLibraries.live;
  conversions.defaults = workspace => preferences.snapshot()[workspace].model;
  for (const workspace of ['work', 'live']) workspaceLibraries.get(workspace).onChange = revision => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('library:changed', { workspace, revision }); };
  youtube = new YouTubeImports({ root: path.join(app.getPath('userData'), 'youtube-imports'), executable: app.isPackaged ? path.join(process.resourcesPath, 'youtube', 'yt-dlp.exe') : path.join(__dirname, '../.runtime/youtube/yt-dlp.exe'), library, queue: conversions, notify: state => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('youtube:state', state);
    refreshBlocker();
  } });
  systemAudio = new SystemAudio(transcriber.auxiliary, event => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('system-audio:state', event); });
  live = new LiveEngine(transcriber, conversions, workspaceLibraries.live, state => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('live:state', state);
    refreshBlocker();
  }, event => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('live:meter', event); });
  live.notifyPatch = patch => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('live:patch', patch); };
  protocol.handle('sorinote-audio', audioResponse);
  protocol.handle('loxt-asset', async request => {
    try { const asset = await memos.asset(request.url); return new Response(request.method === 'HEAD' ? null : Readable.toWeb(createReadStream(asset.filename)), { headers: { 'Content-Type': asset.mime, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Access-Control-Allow-Origin': developmentUrl || 'null' } }); }
    catch { return new Response(null, { status: 404 }); }
  });
  createWindow();
});
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('will-quit', () => { youtube?.shutdown(); systemAudio?.shutdown(); transcriber?.auxiliary.shutdown(); live?.shutdown(); conversions?.shutdown(); });
