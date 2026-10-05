const { contextBridge, ipcRenderer } = require('electron');
const liveLibrary = (action, payload = {}) => ipcRenderer.invoke('workspace:library', { ...payload, workspace: 'live', action });
const initialTheme = ipcRenderer.sendSync('appearance:initial');
// The preload can run before <html> exists. Set its theme as soon as it is
// inserted, before CSS paints, rather than waiting for the React bundle.
if (document.documentElement) document.documentElement.dataset.theme = initialTheme;
else {
  const themeObserver = new MutationObserver(() => {
    if (!document.documentElement) return;
    document.documentElement.dataset.theme = initialTheme;
    themeObserver.disconnect();
  });
  themeObserver.observe(document, { childList: true });
}

contextBridge.exposeInMainWorld('desktop', Object.freeze({
  preferences: Object.freeze({
    get: () => ipcRenderer.invoke('preferences:get'), migrate: legacy => ipcRenderer.invoke('preferences:migrate', legacy),
    set: (mode, change) => ipcRenderer.invoke('preferences:set', { mode, change }),
    onChange: callback => { const listener = (_event, state) => callback(state); ipcRenderer.on('preferences:changed', listener); return () => ipcRenderer.removeListener('preferences:changed', listener); },
  }),
  settings: Object.freeze({
    get: () => ipcRenderer.invoke('settings:state'), storage: force => ipcRenderer.invoke('settings:storage', force), verify: model => ipcRenderer.invoke('settings:verify', model),
    location: (id, copy = false) => ipcRenderer.invoke('settings:location', { id, copy }),
    log: () => ipcRenderer.invoke('settings:log'), diagnostics: () => ipcRenderer.invoke('settings:diagnostics'), link: id => ipcRenderer.invoke('settings:link', id),
    onChange: callback => { const listener = (_event, state) => callback(state); ipcRenderer.on('settings:changed', listener); return () => ipcRenderer.removeListener('settings:changed', listener); },
  }),
  appearance: Object.freeze({
    initial: initialTheme,
    get: () => ipcRenderer.invoke('appearance:get'),
    set: theme => ipcRenderer.invoke('appearance:set', theme),
    onChange: callback => { const listener = (_event, state) => callback(state); ipcRenderer.on('appearance:changed', listener); return () => ipcRenderer.removeListener('appearance:changed', listener); },
  }),
  youtube: Object.freeze({
    inspect: url => ipcRenderer.invoke('youtube:inspect', url),
    cancelInspect: () => ipcRenderer.invoke('youtube:cancel-inspect'),
    start: options => ipcRenderer.invoke('youtube:start', options),
    getState: () => ipcRenderer.invoke('youtube:state'),
    cancel: id => ipcRenderer.invoke('youtube:cancel', id),
    openSource: id => ipcRenderer.invoke('youtube:open-source', id),
    onState: callback => { const listener = (_event, state) => callback(state); ipcRenderer.on('youtube:state', listener); return () => ipcRenderer.removeListener('youtube:state', listener); },
  }),
  systemAudio: Object.freeze({ cancelPending: () => ipcRenderer.invoke('system-audio:cancel-pending'), start: () => ipcRenderer.invoke('system-audio:start'), stop: id => ipcRenderer.invoke('system-audio:stop',id), onState: callback => { const listener=(_event,state)=>callback(state);ipcRenderer.on('system-audio:state',listener);return()=>ipcRenderer.removeListener('system-audio:state',listener); } }),
  live: Object.freeze({
    getState: () => ipcRenderer.invoke('live:state'),
    onMeter: callback => { const listener = (_event, value) => callback(value); ipcRenderer.on('live:meter', listener); return () => ipcRenderer.removeListener('live:meter', listener); },
    onPatch: callback => { const listener = (_event, value) => callback(value); ipcRenderer.on('live:patch', listener); return () => ipcRenderer.removeListener('live:patch', listener); },
    prepare: options => ipcRenderer.invoke('live:prepare', options),
    start: options => ipcRenderer.invoke('live:start', options),
    append: payload => ipcRenderer.invoke('live:append', payload),
    pause: (id, paused) => ipcRenderer.invoke('live:pause', { id, paused }),
    finish: id => ipcRenderer.invoke('live:finish', id),
    copyTranscript: id => liveLibrary('copy', { id }),
    onState: callback => { const listener = (_event, state) => callback(state); ipcRenderer.on('live:state', listener); return () => ipcRenderer.removeListener('live:state', listener); },
    getLibrary: () => liveLibrary('list'),
    importAudio: folder => liveLibrary('import', { folder }),
    retryImport: batch => liveLibrary('retry-import', { batch }),
    convert: (id, model) => ipcRenderer.invoke('transcription:start', { id, model, workspace: 'live' }),
    createFolder: (name, parent = '') => liveLibrary('create-folder', { name, parent }),
    renameFolder: (folder, name) => liveLibrary('rename-folder', { folder, name }),
    deleteFolder: folder => liveLibrary('delete-folder', { folder }),
    updateNote: (id, changes) => liveLibrary('update-note', { id, changes }),
    moveNotes: (ids, folder) => liveLibrary('move-notes', { ids, folder }),
    restoreTrash: ids => liveLibrary('restore-trash', { ids }),
    deleteTrash: ids => liveLibrary('delete-trash', { ids }),
    openLibrary: () => liveLibrary('open'),
  }),
  retrySpeakers: (id, workspace) => ipcRenderer.invoke('transcription:retry-speakers', { id, workspace }),
  onLibraryChange: callback => { const listener = (_event, value) => callback(value); ipcRenderer.on('library:changed', listener); return () => ipcRenderer.removeListener('library:changed', listener); },
  getAppInfo: () => ipcRenderer.invoke('app:info'),
  getLibrary: () => ipcRenderer.invoke('library:list'),
  createFolder: (name, parent = '') => ipcRenderer.invoke('library:folder', { name, parent }),
  renameFolder: (folder, name) => ipcRenderer.invoke('library:rename-folder', { folder, name }),
  deleteFolder: folder => ipcRenderer.invoke('library:delete-folder', folder),
  restoreTrash: ids => ipcRenderer.invoke('library:restore-trash', ids),
  deleteTrash: ids => ipcRenderer.invoke('library:delete-trash', ids),
  copyTranscript: id => ipcRenderer.invoke('transcript:copy', id),
  updateNote: (id, changes) => ipcRenderer.invoke('library:update-note', { id, changes }),
  moveNotes: (ids, folder) => ipcRenderer.invoke('library:move-notes', { ids, folder }),
  discardRecording: id => ipcRenderer.invoke('recording:discard', id),
  openLibrary: () => ipcRenderer.invoke('library:open'),
  beginRecording: (payload) => ipcRenderer.invoke('recording:begin', payload),
  appendRecording: (payload) => ipcRenderer.invoke('recording:append', payload),
  checkpointRecording: (payload) => ipcRenderer.invoke('recording:checkpoint', payload),
  finishRecording: (payload) => ipcRenderer.invoke('recording:finish', payload),
  abandonRecording: (id) => ipcRenderer.invoke('recording:abandon', id),
  importAudio: (folder) => ipcRenderer.invoke('audio:import', { folder }),
  exportTranscript: (payload) => ipcRenderer.invoke('transcript:export', payload),
  getTranscriptionEnvironment: () => ipcRenderer.invoke('transcription:environment'),
  prepareTranscription: () => ipcRenderer.invoke('transcription:prepare'),
  startTranscription: (id, options) => ipcRenderer.invoke('transcription:start', options ? { id, ...options } : id),
  cancelTranscription: (id) => ipcRenderer.invoke('transcription:cancel', id),
  configureTranscription: (settings) => ipcRenderer.invoke('transcription:configure', settings),
  deleteTranscriptionModel: (name) => ipcRenderer.invoke('transcription:delete-model', name),
  installTranscriptionModels: (names) => ipcRenderer.invoke('transcription:install-models', names),
  importTranscriptionModel: () => ipcRenderer.invoke('transcription:import-model'),
  onTranscriptionState: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('transcription:state', listener);
    return () => ipcRenderer.removeListener('transcription:state', listener);
  },
}));
