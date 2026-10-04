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

nativeTheme.themeSource = 'dark';
// Keep the existing library and models through the LOXT display-name migration.
app.setPath('userData', path.join(app.getPath('appData'), 'sorinote-desktop'));

protocol.registerSchemesAsPrivileged([{ scheme: 'sorinote-audio', privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true, corsEnabled: true } }]);

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
    if (!library?.sessions.size && !workspaceLibraries?.live.sessions.size && !changingData) return;
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
}
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
function requireNoConversions() { if (live?.busy || conversions.hasJobs) throw new Error('변환 작업을 마치거나 취소한 뒤 모델을 변경해 주세요.'); }
handle('transcription:prepare', () => { requireNoConversions(); return transcriber.prepare(); });
handle('transcription:start', payload => conversions.enqueue(payload));
handle('transcription:cancel', id => conversions.cancel(id));
handle('transcription:configure', value => { requireNoConversions(); return transcriber.configure(value); });
handle('transcription:delete-model', name => { requireNoConversions(); return transcriber.deleteModel(name); });
handle('transcription:install-models', names => { requireNoConversions(); return transcriber.installModels(names); });
handle('transcription:import-model', async () => {
  if (live?.busy || transcriber.busy || conversions.hasJobs) throw new Error('현재 작업을 마친 뒤 모델을 불러와 주세요.');
  const result = await dialog.showOpenDialog(mainWindow, { title: '외부 모델 불러오기', properties: ['openDirectory'] });
  if (result.canceled || !result.filePaths.length) return { canceled: true };
  requireNoConversions();
  return transcriber.importModel(result.filePaths[0]);
});
handle('library:list', () => library.list());
handle('live:state', () => live.snapshot());
handle('system-audio:start', () => { if (!systemAudioAllowed) throw new Error('컴퓨터 소리 녹음 권한을 먼저 요청해 주세요.'); return systemAudio.start(); });
handle('system-audio:stop', id => systemAudio.stop(id));
handle('live:prepare', options => live.prepare(options));
handle('live:start', options => live.start(options));
handle('live:append', payload => live.append(payload));
handle('live:pause', payload => live.pause(payload?.id, Boolean(payload?.paused)));
handle('live:finish', id => live.finish(id));
handle('workspace:library', payload => {
  if (payload?.workspace !== 'live') throw new Error('지원하지 않는 워크스페이스입니다.');
  const store = workspaceLibraries.get(payload?.workspace);
  if (live?.busy && (payload?.id === live.state.id || payload?.ids?.includes(live.state.id)) && ['update-note', 'move-notes', 'restore-trash', 'delete-trash'].includes(payload?.action)) throw new Error('Live 녹음을 종료한 뒤 기록을 변경해 주세요.');
  switch (payload?.action) {
    case 'list': return store.list();
    case 'import': return dialog.showOpenDialog(mainWindow, { properties: ['openFile', 'multiSelections'], filters: [{ name: '오디오', extensions: ['wav','mp3','m4a','webm','ogg','flac','mp4'] }] }).then(async result => { if (result.canceled) return { canceled: true }; const imported = []; for (const filename of result.filePaths) imported.push((await store.importAudio(filename, payload.folder || '')).note); return { notes: imported, library: await store.list() }; });
    case 'create-folder': return store.createFolder({ name: payload.name, parent: payload.parent });
    case 'rename-folder': return store.renameFolder({ folder: payload.folder, name: payload.name });
    case 'delete-folder': return store.deleteFolder(payload.folder);
    case 'update-note': return store.updateNote(payload.id, payload.changes || {});
    case 'move-notes': return store.moveNotes({ ids: payload.ids, folder: payload.folder });
    case 'restore-trash': return store.restoreTrash(payload.ids);
    case 'delete-trash': return store.deleteTrash(payload.ids);
    case 'copy': return store.list().then(data => { const note = data.notes.find(note => note.id === payload.id); if (!note?.done) throw new Error('복사할 스크립트가 없습니다.'); clipboard.writeText(note.segments.map(segment => `${segment.speaker ? `[${segment.speaker}] ` : ''}${segment.text}`).join('\n\n')); });
    case 'open': return shell.openPath(store.root);
    default: throw new Error('지원하지 않는 보관함 작업입니다.');
  }
});
handle('library:folder', payload => library.createFolder(payload));
handle('library:rename-folder', payload => library.renameFolder(payload));
handle('library:delete-folder', async folder => {
  const data = await library.list(), subtree = library.folderSubtree(folder);
  if (conversions.snapshot().queue.some(job => data.notes.some(note => note.id === job.id && subtree.has(note.folder)))) throw new Error('이 폴더의 변환을 마치거나 취소한 뒤 삭제해 주세요.');
  return library.deleteFolder(folder);
});
handle('library:restore-trash', ids => library.restoreTrash(ids));
handle('library:delete-trash', async ids => {
  if (conversions.snapshot().queue.some(job => ids?.includes(job.id))) throw new Error('변환을 마치거나 취소한 뒤 삭제해 주세요.');
  return library.deleteTrash(ids);
});
handle('transcript:copy', async id => {
  const note = (await library.list()).notes.find(note => note.id === id);
  if (!note?.done || ['queued', 'transcribing'].includes(note.status)) throw new Error('변환이 끝난 스크립트만 복사할 수 있습니다.');
  clipboard.writeText(note.segments.map(segment => `${segment.speaker ? `[${segment.speaker}] ` : ''}${segment.text}`).join('\n\n'));
  return true;
});
handle('library:update-note', payload => library.updateNote(payload?.id, payload?.changes || {}));
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
  nativeTheme.themeSource = appearance.theme;
  workspaceLibraries = new WorkspaceLibraries(app.getPath('userData'));
  library = workspaceLibraries.get('work');
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
  youtube = new YouTubeImports({ root: path.join(app.getPath('userData'), 'youtube-imports'), executable: app.isPackaged ? path.join(process.resourcesPath, 'youtube', 'yt-dlp.exe') : path.join(__dirname, '../.runtime/youtube/yt-dlp.exe'), library, queue: conversions, notify: state => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('youtube:state', state);
    refreshBlocker();
  } });
  systemAudio = new SystemAudio(transcriber.auxiliary, event => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('system-audio:state', event); });
  live = new LiveEngine(transcriber, conversions, workspaceLibraries.live, state => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('live:state', state);
    refreshBlocker();
  });
  protocol.handle('sorinote-audio', audioResponse);
  createWindow();
});
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('will-quit', () => { youtube?.shutdown(); systemAudio?.shutdown(); transcriber?.auxiliary.shutdown(); live?.shutdown(); conversions?.shutdown(); });
