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
const { LibraryLocation } = require('./library-location.cjs');
const { LibraryActions } = require('./library-actions.cjs');
const { BrowserTabs } = require('./browser-tabs.cjs');
let libraryLocation, libraryActions, browserTabs, deviceServer, relocating = false;

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
    if (relocating) { event.preventDefault(); return; }
    const changingData = youtube?.hasJobs || (live?.busy && live.state.stage !== 'ready') || conversions?.hasJobs || transcriber?.requestId || (transcriber?.busy && !['detect', 'live'].includes(transcriber.operation));
    if (!library?.sessions.size && !workspaceLibraries?.live.sessions.size && !changingData) {
      if (memoCloseAllowed) return;
      event.preventDefault(); if (memoClosing) return; memoClosing = true;
      try {
        const token = require('node:crypto').randomUUID();
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => { memoFlushReply = null; reject(new Error('메모 저장 응답이 없습니다. 메모를 다시 열어 저장 상태를 확인해 주세요.')); }, 10000);
          memoFlushReply = value => { if (value?.token !== token) return; clearTimeout(timeout); memoFlushReply = null; value.error ? reject(new Error(value.error)) : resolve(); };
          mainWindow.webContents.send('memos:flush', token);
        });
        await Promise.all([library.flushIndex(), workspaceLibraries.live.flushIndex()]); memoCloseAllowed = true; mainWindow.close();
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
    if (relocating && !['browser:command', 'appearance:get', 'preferences:get'].includes(channel)) throw new Error('보관함 이전 중입니다. 완료 후 다시 시도해 주세요.');
    return require('./sync-trace.cjs').run(require('node:crypto').randomUUID(),channel,()=>work(payload)).then(result=>require('../shared/library-summary.cjs').lightResult(result.value));
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
handle('devices:diagnostics',()=>deviceServer?.diagnostics?.()||{transport:'WebSocket',connections:[],recentRequests:[]});
handle('devices:copy-diagnostics',()=>{clipboard.writeText(JSON.stringify(deviceServer?.diagnostics?.()||{},null,2));return true;});
handle('pdf:preview-ink',payload=>deviceServer?.preview?.(payload,'desktop')||false);
handle('pdf:changes',payload=>pdfFor(payload.workspace).changes(payload));
handle('memos:changes',payload=>memoFor(payload.id).changes(payload));
handle('devices:state', () => deviceServer?.snapshot() || {enabled:false,running:false});
handle('devices:configure', enabled => deviceServer.configure(enabled));
handle('devices:qr', () => deviceServer.newQR());
handle('devices:copy', async payload => {
  const address=await deviceServer.copyAddress(payload?.kind,payload?.index ?? 0);
  for(let attempt=0;attempt<4;attempt++) {
    try {
      await clipboard.writeText(address);
      if(await clipboard.readText()===address)return true;
    } catch { /* A temporarily busy clipboard can be retried. */ }
    await new Promise(resolve=>setTimeout(resolve,80));
  }
  throw new Error('주소를 복사하지 못했습니다. 잠시 후 다시 시도해 주세요.');
});
handle('devices:approve', payload => deviceServer.approve(payload.id,payload.allow));
handle('devices:revoke', id => deviceServer.revoke(id));
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
handle('library:list', () => library.listSummary());
handle('library:detail', p => workspaceLibraries.get(p?.workspace).detail(p?.id));
handle('browser:command', payload => browserTabs?.command(payload));
handle('library:manage', async payload => {
  const store = workspaceLibraries.get(payload?.workspace);
  if (pendingMemoIds.size) throw new Error('메모 저장을 마친 뒤 기록을 변경해 주세요.');
  if (live?.busy && (payload.ids?.includes(live.state.id) || payload.folders?.some(f => live.state.folder === f || live.state.folder?.startsWith(f + '/')))) throw new Error('Live 녹음을 종료한 뒤 기록을 변경해 주세요.');
  return libraryActions[payload.workspace].run(payload);
});
handle('library:search', p => require('./library-search.cjs').searchLibrary(workspaceLibraries.get(p?.workspace),p));
handle('settings:library-root', () => ({ root: libraryLocation.root, changing: relocating }));
handle('settings:move-library', async () => {
  requireNoConversions(); if(deviceServer?.running)throw new Error('내 기기 연결을 끈 뒤 저장 위치를 변경해 주세요.'); if (pendingMemoIds.size || library.sessions.size || workspaceLibraries.live.sessions.size || youtube?.hasJobs) throw new Error('녹음·메모 저장·변환을 마친 뒤 저장 위치를 변경해 주세요.');
  const chosen = await dialog.showOpenDialog(mainWindow, { title: 'LOXT 보관함 저장 위치', properties: ['openDirectory', 'createDirectory'] });
  if (chosen.canceled) return { canceled: true };
  requireNoConversions(); if (pendingMemoIds.size || library.sessions.size || workspaceLibraries.live.sessions.size || youtube?.hasJobs || relocating) throw new Error('작업을 마친 뒤 저장 위치를 변경해 주세요.');
  relocating = true;
  try {
    await library.enqueue(() => workspaceLibraries.live.enqueue(() => libraryLocation.change(chosen.filePaths[0], { work: library, live: workspaceLibraries.live })));
    settingsSupport.cache = null;
    return { root: libraryLocation.root };
  } finally { relocating = false; }
});
function memoFor(id) {
  const stores = ['work', 'live'].map(mode => workspaceLibraries.get(mode)).filter(store => store.data.notes.some(note => note.id === id) || store.sessions.has(id));
  if (stores.length !== 1) throw new Error('메모의 보관함을 확인해 주세요.');
  return new Memos(stores[0]);
}
const pdfFor = workspace => new (require('./pdfs.cjs').PDFs)(workspaceLibraries.get(workspace));
handle('library:detach-audio',payload=>{const id=payload.id;if(pendingMemoIds.has(id)||conversions.snapshot().queue.some(job=>job.id===id)||live?.busy&&live.state.id===id)throw Error('녹음·변환·메모 저장을 마친 뒤 원본을 삭제해 주세요.');return workspaceLibraries.get(payload.workspace).detachAudio(id);});
handle('pdf:create',p=>pdfFor(p.workspace).create(p.folder||''));
handle('pdf:info',p=>pdfFor(p.workspace).info(p.id));
handle('pdf:prepare-index',p=>pdfFor(p.workspace).prepareIndex(p.id));
handle('pdf:import', async payload => {
  if (payload?.bytes) return pdfFor(payload.workspace).import(payload.bytes,payload.name,payload.folder || '');
  const result=await dialog.showOpenDialog(mainWindow,{title:'PDF 불러오기',properties:['openFile'],filters:[{name:'PDF',extensions:['pdf']}]});
  if(result.canceled)return {canceled:true};
  const file=result.filePaths[0], bytes=await require('node:fs/promises').readFile(file);
  return pdfFor(payload.workspace).import(bytes,path.basename(file),payload.folder || '');
});
handle('pdf:search-index', p=>pdfFor(p.workspace).searchIndex(p.id));
handle('pdf:index', payload=>pdfFor(payload.workspace).index(payload));
handle('pdf:get', payload => pdfFor(payload.workspace).read(payload.id));
handle('pdf:save', payload => pdfFor(payload.workspace).save(payload));
handle('pdf:bytes', payload => require('node:fs/promises').readFile(pdfFor(payload.workspace).file(payload.id)));
handle('pdf:export', async payload => {
  const pdf=pdfFor(payload.workspace), note=pdf.note(payload.id);
  const result=await dialog.showSaveDialog(mainWindow,{title:'PDF 내보내기',defaultPath:note.title+'.pdf',filters:[{name:'PDF',extensions:['pdf']}]});
  if(result.canceled)return {canceled:true};
  const bytes=await pdf.export(payload.id,payload.annotated,path.join(__dirname,'../dist/pdf-font.ttf'));
  const temp=result.filePath+'.'+require('node:crypto').randomUUID()+'.part';
  await require('node:fs/promises').writeFile(temp,bytes);await require('node:fs/promises').rename(temp,result.filePath);return {canceled:false};
});
handle('memos:create', value => (value && typeof value === 'object' ? new Memos(workspaceLibraries.get(value.workspace)).create(value.folder || '') : memos.create(value || '')));
handle('library:export-folder', payload => require('./folder-export.cjs').exportFolder(payload, {library:workspaceLibraries.get(payload?.workspace), dialog, mainWindow}));
handle('memos:get', id => memoFor(id).read(id));
handle('memos:save', payload => memoFor(payload?.id).save(payload));
handle('memos:attach', payload => memoFor(payload?.id).attach(payload));
handle('memos:copy', async text => { if (typeof text !== 'string' || text.length > 5_000_000) throw new Error('복사할 내용을 확인해 주세요.'); await clipboard.writeText(text); return true; });
handle('memos:export', payload => exportMemo(payload, { memos: memoFor(payload?.id), dialog, BrowserWindow, mainWindow }));
handle('memos:link', async payload => {
  const url = typeof payload === 'string' ? payload : payload?.url;
  if (typeof url !== 'string' || url.length > 4000) throw new Error('주소를 확인해 주세요.');
  if (url.startsWith('loxt-asset:')) { const asset = await memoFor(new URL(url).pathname.split('/')[1]).asset(url); const name = typeof payload?.name === 'string' ? payload.name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim().slice(0, 120) : ''; const result = await dialog.showSaveDialog(mainWindow, { title: '첨부파일 저장', defaultPath: name || asset.name }); if (!result.canceled && result.filePath) await require('node:fs/promises').copyFile(asset.filename, result.filePath); }
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
    case 'list': return store.listSummary();
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
    case 'update-note': return store.updateNote(payload.id, payload.changes || {}, payload.changes?.expected);
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
handle('library:update-note', payload => { if (payload?.changes?.deleted && pendingMemoIds.has(payload.id)) throw new Error('메모 저장을 마친 뒤 휴지통으로 이동해 주세요.'); return library.updateNote(payload?.id, payload?.changes || {},payload?.changes?.expected); });
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
  const format = payload.format || 'txt';
  if (!['txt','pdf'].includes(format)) throw new Error('내보내기 형식을 확인해 주세요.');
  const filename = payload.title.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').slice(0, 120) || '스크립트';
  const result = await dialog.showSaveDialog(mainWindow, {
    title: '스크립트 저장', defaultPath: `${filename}.${format}`,
    filters: [{ name: format === 'pdf' ? 'PDF' : '텍스트 파일', extensions: [format] }],
  });
  if (result.canceled || !result.filePath) return { canceled: true };
  if (format === 'pdf') {
    const escape = value => value.replace(/[&<>]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[char]));
    const html = await require('./memo-export.cjs').documentHTML({id:'', title:payload.title, html:'<p>' + escape(payload.text).replace(/\n/g, '<br>') + '</p>'}, null);
    await require('./pdf-export.cjs').printPDF(html, result.filePath, BrowserWindow);
  } else await writeFile(result.filePath, '\ufeff' + payload.text, 'utf8');
  return { canceled: false };
});

app.whenReady().then(async () => {
  if (!singleton) return;
  appearance = new Appearance(path.join(app.getPath('userData'), 'appearance.json'));
  preferences = new WorkspacePreferences(app.getPath('userData'), value => mainWindow?.webContents.send('preferences:changed', value));
  settingsSupport = new SettingsSupport(app.getPath('userData'));
  modelActions = new ModelActions(app.getPath('userData'), publishSettings);
  nativeTheme.themeSource = appearance.theme;
  libraryLocation = new LibraryLocation(app.getPath('userData'), process.env.SORINOTE_TEST === '1' ? path.join(app.getPath('userData'), 'LOXT') : path.join(app.getPath('appData'), 'LOXT'));
  let root;
  try { root = await libraryLocation.initialize(); }
  catch (error) { await dialog.showMessageBox({ type: 'error', title: '보관함 이전 보류', message: error.message, detail: '기존 데이터는 그대로 유지합니다. 기존 보관함으로 시작합니다.' }); root = app.getPath('userData'); libraryLocation.root = root; }
  workspaceLibraries = new WorkspaceLibraries(app.getPath('userData'), root, root !== app.getPath('userData'));
  await Promise.all([workspaceLibraries.work.ready, workspaceLibraries.live.ready]);
  settingsSupport.libraries = workspaceLibraries;
  libraryActions = { work: new LibraryActions(workspaceLibraries.work), live: new LibraryActions(workspaceLibraries.live) };
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
    deviceServer?.event('transcription',state);
    refreshBlocker();
  });
  conversions.liveLibrary = workspaceLibraries.live;
  conversions.defaults = workspace => preferences.snapshot()[workspace].model;
  for (const workspace of ['work', 'live']) workspaceLibraries.get(workspace).onChange = (revision,change={}) => { const event={workspace,revision,...change};deviceServer?.event('library',event);if(mainWindow&&!mainWindow.isDestroyed())mainWindow.webContents.send('library:changed',event); };
  youtube = new YouTubeImports({ root: path.join(app.getPath('userData'), 'youtube-imports'), executable: app.isPackaged ? path.join(process.resourcesPath, 'youtube', 'yt-dlp.exe') : path.join(__dirname, '../.runtime/youtube/yt-dlp.exe'), library, queue: conversions, notify: state => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('youtube:state', state);
    refreshBlocker();
  } });
  systemAudio = new SystemAudio(transcriber.auxiliary, event => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('system-audio:state', event); });
  live = new LiveEngine(transcriber, conversions, workspaceLibraries.live, state => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('live:state', state);
    deviceServer?.event('live',state);
    refreshBlocker();
  }, event => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('live:meter', event); });
  live.notifyPatch = patch => { deviceServer?.event('live-patch',patch); if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('live:patch', patch); };
  protocol.handle('sorinote-audio', audioResponse);
  protocol.handle('loxt-asset', async request => {
    try { const asset = await memoFor(new URL(request.url).pathname.split('/')[1]).asset(request.url); return new Response(request.method === 'HEAD' ? null : Readable.toWeb(createReadStream(asset.filename)), { headers: { 'Content-Type': asset.mime, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Access-Control-Allow-Origin': developmentUrl || 'null' } }); }
    catch { return new Response(null, { status: 404 }); }
  });
  const {webServices}=require('./web-services.cjs');
  const web=webServices({libraries:{get:mode=>workspaceLibraries.get(mode)},actions:libraryActions,conversions,preferences,root:path.join(app.getPath('userData'),'web-exports'),dist:path.join(__dirname,'../dist'),BrowserWindow,onRecordingChange:refreshBlocker,getLiveState:()=>live.snapshot(),isBusy:payload => Boolean(pendingMemoIds.size || live?.busy && (payload.ids?.includes(live.state.id) || payload.id===live.state.id))});
  deviceServer=new (require('./device-server.cjs').DeviceServer)({root:path.join(app.getPath('userData'),'device-server'),dist:path.join(__dirname,'../dist'),...web,previewCheck:payload=>{const note=pdfFor(payload.workspace).note(payload.id,true);if(payload.object&&payload.object.page>note.pages)throw Error('PDF 페이지를 확인해 주세요.');},previewLocal:value=>{if(mainWindow&&!mainWindow.isDestroyed())mainWindow.webContents.send('pdf:preview-ink',value);},onState:state=>{if(mainWindow&&!mainWindow.isDestroyed())mainWindow.webContents.send('devices:state',state);}});
  await deviceServer.initialize().catch(error=>{deviceServer.lastError=error.message;});
  createWindow();
  browserTabs = new BrowserTabs(mainWindow);
});
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('will-quit', () => { require('./pdf-jobs.cjs').stopPDFJobs(); deviceServer?.stop().catch(()=>{}); youtube?.shutdown(); systemAudio?.shutdown(); transcriber?.auxiliary.shutdown(); live?.shutdown(); conversions?.shutdown(); });
