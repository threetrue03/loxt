import useFullNote from './useFullNote.js';
import {refreshLibrary,subscribeLibrary} from './LibraryView.jsx';
import PdfHost from './PdfHost.jsx';
import MobileNavigation, { MobileLibraryTools } from './MobileNavigation.jsx';
import { serializeTranscript } from '../shared/transcript.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import LibraryView from './LibraryView.jsx';
import InlineName from './InlineName.jsx';
import { NewTabButton } from './PanelTabs.jsx';
import useLibrarySelection from './useLibrarySelection.jsx';
import WorkspaceMenu from './WorkspaceMenu.jsx';
import NoteCard from './NoteCard.jsx';
import MemoPage from './MemoPage.jsx';
import { MemoSaveNotice } from './MemoHost.jsx';
import HomePage from './HomePage.jsx';
import useRecentNotes from './useRecentNotes.js';
import Modal from './Modal.jsx';
import Menu from './Menu.jsx';
import Select from './Select.jsx';
import TaskPanel from './TaskPanel.jsx';
import YouTubeDialog, { YouTubeProgress } from './YouTubeDialog.jsx';
import useSidebarShortcut from './useSidebarShortcut.js';
import FolderTree, { folderName as leafName, parentOf } from './FolderTree.jsx';
import FolderBreadcrumb from './FolderBreadcrumb.jsx';
import FolderCard from './FolderCard.jsx';
import ActionMenu from './ActionMenu.jsx';
import { fonts, taskLabel } from './uiPreferences.js';
import NoteDetail from './NoteDetail.jsx';
import SettingsPage from './SettingsPage.jsx';
import SettingsSidebar from './SettingsSidebar.jsx';
import { useSettings } from './SettingsProvider.jsx';
import { formatTime, folderStorageKey, loadFolders } from './data.js';

const filterNames = { all: '홈', library: '모든 기록', recent: '최근 기록', trash: '휴지통', '': '내 보관함' };

export default function App({ onRecordingActivity, workspaceActive = true, liveActive = false, onWorkspaceChange, onBackgroundChange }) {
  const [notes, setNotes] = useState([]);
  const [folders, setFolders] = useState([]);
  const [folderParents, setFolderParents] = useState({});
  const [draftOpen, setDraftOpen] = useState(false);
  const [draftFolder, setDraftFolder] = useState('');
  const [filter, setFilter] = useState('all');
  const sharedSettings = useSettings();
  const { open: settingsOpen, tab: settingsTab } = sharedSettings;
  const [pageView, setPageView] = useState('list');
  const view = settingsOpen ? 'settings' : pageView;
  function setView(value) { if (value === 'settings') sharedSettings.openSettings(); else { sharedSettings.closeSettings(); setPageView(value); } }
  const [draftKey, setDraftKey] = useState(0);
  const preferences = { ...sharedSettings.preferences.work, font: 'suit', autoTranscribe: true };
  const layout = sharedSettings.preferences.work.layout;
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [settingsReturn, setSettingsReturn] = useState('list');
  const [selectedId, setSelectedId] = useState(null);
  const [sort, setSort] = useState('date');
  const [modal, setModal] = useState(null);
  const [creatingFolder, setCreatingFolder] = useState(null);
  const [sidebarCreating, setSidebarCreating] = useState(false);
  const [sidebarParent, setSidebarParent] = useState('');
  const [actionMenu, setActionMenu] = useState(null);
  const [renaming, setRenaming] = useState(null);
  useSidebarShortcut(workspaceActive,setSidebarCollapsed);
  const [trashSelection, setTrashSelection] = useState([]);
  const [trashWorking, setTrashWorking] = useState(false);
  const [notice, setNotice] = useState('');
  const [appInfo, setAppInfo] = useState(null);
  const [storagePath, setStoragePath] = useState('');
  const [recovery, setRecovery] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(()=>onRecordingActivity?.(busy),[busy,onRecordingActivity]);
  const [environment, setEnvironment] = useState(null);
  const [imports, setImports] = useState([]);
  const backgroundEnvironment = { ...environment, queue: [...(environment?.queue || []), ...imports] };
  useEffect(() => { onBackgroundChange?.(Boolean((busy && draftOpen) || environment?.queue?.length || environment?.task || imports.length)); }, [busy, draftOpen, environment, imports.length, onBackgroundChange]);
  useEffect(() => { if (!workspaceActive) { setModal(null); setActionMenu(null); setCreatingFolder(null); setRenaming(null); } }, [workspaceActive]);
  const toastTimer = useRef(null);
  const selected = useFullNote(notes.find(n => n.id === selectedId),'work');
  const { recent, remember } = useRecentNotes('work', notes);
  function openNote(id) { remember(id); setSelectedId(id); setView('workspace'); }
  const closeModal = useCallback(() => setModal(null), []);
  const closeActionMenu = useCallback(() => setActionMenu(null), []);
  const libraryRevision = useRef(-1);
  const applyLibrary = useCallback(data => { if (data.revision != null && data.revision < libraryRevision.current) return; libraryRevision.current = data.revision ?? libraryRevision.current; setNotes(data.notes); setFolders(data.folders); setFolderParents(data.folderParents || {}); setStoragePath(data.storagePath); setRecovery(data.recovery); }, []);
  useEffect(() => {
    if (!window.desktop?.youtube) return;
    let active = true;
    const receive = state => {
      if (!active) return;
      setImports(state.jobs);
      if (state.completed) {
        refreshLibrary('work').then(data => { if (active) applyLibrary(data); }).catch(() => {});
        if (state.completed.error) toast(state.completed.error);
      }
    };
    const unsubscribe = window.desktop.youtube.onState(receive);
    window.desktop.youtube.getState().then(receive).catch(() => {});
    return () => { active = false; unsubscribe(); };
  }, [applyLibrary]);
  function openBackgroundJob(id) { if (id.startsWith('youtube-')) setModal({ type: 'youtube-progress' }); else openNote(id); }
  async function cancelBackgroundJob(id) {
    if (!id.startsWith('youtube-')) return cancelTranscription(id);
    try { await window.desktop.youtube.cancel(id); } catch (error) { toast(error.message); }
  }

  useEffect(() => {
    let active = true;
    async function initialize() {
      if (!window.desktop) return;
      try {
        const [info, initial] = await Promise.all([window.desktop.getAppInfo(), refreshLibrary('work')]);
        if (!active) return;
        let data = initial;
        // 1단계에서 사용자가 만든 폴더만 실제 보관함으로 옮깁니다.
        for (const folder of loadFolders()) {
          if (!active) return;
          if (!data.folders.includes(folder)) data = await window.desktop.createFolder(folder);
        }
        localStorage.removeItem(folderStorageKey);
        if (!active) return;
        setAppInfo(info); applyLibrary(data); setLoaded(true);
        if (data.notes.some(n => n.recovered && !n.deleted)) toast('중단된 녹음의 저장된 부분을 복구했습니다. 원본을 재생해 확인해 주세요.');
      } catch { if (active) toast('보관함을 읽지 못했습니다. 원본 파일을 확인하고 앱을 다시 실행해 주세요.'); }
    }
    initialize();
    return () => { active = false; };
  }, [applyLibrary]);
  useEffect(() => () => clearTimeout(toastTimer.current), []);
  useEffect(() => {
    if (!window.desktop) return;
    let active = true;
    const receive = state => {
      if (!active) return;
      setEnvironment(state);
    };
    const unsubscribe = window.desktop.onTranscriptionState(receive);
    const offLibrary=subscribeLibrary('work',data=>{if(active)applyLibrary(data);});
    window.desktop.getTranscriptionEnvironment().then(receive).catch(() => { if (active) toast('변환 환경을 확인하지 못했습니다. 설정에서 다시 확인해 주세요.'); });
    return () => { active = false; unsubscribe(); offLibrary(); };
  }, [applyLibrary]);
  async function checkEnvironment() {
    try { setEnvironment(await window.desktop.getTranscriptionEnvironment()); }
    catch { toast('변환 환경을 확인하지 못했습니다.'); }
  }
  async function configureEnvironment(settings) {
    try { setEnvironment(await window.desktop.configureTranscription({ model: settings.model, device: 'auto' })); }
    catch (error) { toast(error.message); }
  }
  async function deleteModel(name) {
    try { setEnvironment(await window.desktop.deleteTranscriptionModel(name)); }
    catch (error) { toast(error.message); }
  }
  async function installModels(names) {
    try { const next = await window.desktop.installTranscriptionModels(names); setEnvironment(next); return next; }
    catch (error) { toast(error.message); throw error; }
  }
  async function cancelTranscription(id) {
    try { setEnvironment(await window.desktop.cancelTranscription(typeof id === 'string' ? id : undefined)); }
    catch { toast('작업을 취소하지 못했습니다. 다시 시도해 주세요.'); }
  }
  async function startTranscription(id, options) {
    try { setEnvironment(await window.desktop.startTranscription(id, options)); applyLibrary(await refreshLibrary('work')); }
    catch (error) { toast(error.message); }
  }
  function toast(message) {
    setNotice({ text: message, id: performance.now() }); clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setNotice(''), 3000);
  }
  function navigate(nextFilter) {
    setFilter(nextFilter); setView('list'); setCreatingFolder(null); setRenaming(null); setActionMenu(null); setTrashSelection([]);
  }
  function openActions(event, target, context) {
    event.preventDefault(); event.stopPropagation();
    if (!context && actionMenu?.type === target.type && actionMenu.id === target.id) { setActionMenu(null); return; }
    const trigger = event.currentTarget;
    const box = trigger.getBoundingClientRect();
    setActionMenu({ ...target, x: context ? event.clientX : Math.max(8, box.right - 250), y: context ? event.clientY : box.bottom + 6, trigger });
  }
  function openFolderMenu(event, folder, context) { openActions(event, { type: 'folder', id: folder }, context); }
  function beginRename(target) {
    if (target.type === 'folder' && (view !== 'list' || filter !== target.id)) navigate(parentOf(target.id, folderParents) || '');
    setRenaming({ type: target.type, id: target.id });
  }
  async function renameFolder(folder, name) {
    const result = await window.desktop.renameFolder(folder, name);
    applyLibrary(result.library);
    const remap = value => Object.hasOwn(result.renamed, value) ? result.renamed[value] : value;
    setFilter(remap); setDraftFolder(remap);
    toast('폴더 이름을 변경했습니다.');
  }
  async function changeNoteFromMenu(id, changes) {
    if (!(await updateNote(id, changes))) throw new Error('변경을 저장하지 못했습니다. 다시 시도해 주세요.');
  }
  async function removeFolder(folder) {
    setTrashWorking(true);
    try {
      const result = await window.desktop.manageLibrary({workspace:'work',action:'trash',ids:[],folders:[folder]}); applyLibrary(result);
      if (filter === folder || filter.startsWith(folder + '/')) navigate('');
      if (draftFolder === folder || draftFolder.startsWith(folder + '/')) setDraftFolder('');
      closeModal(); toast('폴더를 삭제하고 녹음을 휴지통으로 옮겼습니다.');
    } catch (error) { toast(error.message); } finally { setTrashWorking(false); }
  }
  async function processTrash(ids, permanent = false) {
    if (trashWorking || !ids.length) return;
    setTrashWorking(true);
    try {
      applyLibrary(await (permanent ? window.desktop.deleteTrash(ids) : window.desktop.restoreTrash(ids)));
      setTrashSelection([]); closeModal(); toast(permanent ? '선택한 녹음을 영구 삭제했습니다.' : '선택한 녹음을 복구했습니다.');
    } catch (error) { toast(error.message); } finally { setTrashWorking(false); }
  }
  async function copyTranscript() { await window.desktop.copyTranscript(selected.id); }
  async function updateNote(id, change) {
    try { applyLibrary(await window.desktop.updateNote(id, change)); return true; }
    catch { toast('변경을 저장하지 못했습니다. 저장 공간과 권한을 확인해 주세요.'); return false; }
  }
  function openSettings(tab = 'general') {
    sharedSettings.openSettings(typeof tab === 'string' ? tab : 'general');
    setSettingsReturn(view === 'settings' ? settingsReturn : view);

  }
  async function changePreferences(change) { return sharedSettings.change('work', change); }
  async function openStorage() {
    try { if (await window.desktop.openLibrary()) toast('저장 폴더를 열지 못했습니다.'); }
    catch { toast('저장 폴더를 열지 못했습니다.'); }
  }
  function changeLayout(value) { return sharedSettings.change('work', { layout: value }); }
  useEffect(() => { const open = event => { if(event.detail.mode === 'work') { newRecording(); if (!draftOpen) setDraftFolder(event.detail.folder || ''); } }; window.addEventListener('loxt:open-recording',open); return () => window.removeEventListener('loxt:open-recording',open); }, [draftOpen, sharedSettings.ready,busy]);
  function newRecording() {
    if (busy) return;
    if (!sharedSettings.ready) { toast('설정을 확인한 뒤 다시 시작해 주세요.'); return; }
    if (draftOpen) { setSelectedId(null); setView('workspace'); return; }
    setDraftFolder(folders.includes(filter) ? filter : ''); setDraftOpen(true); setSelectedId(null); setDraftKey(value => value + 1); setView('workspace');
  }
  async function finishRecording(result, options) {
    applyLibrary(result.library);
    if (options?.review) return;
    applyLibrary(await window.desktop.updateNote(result.note.id, { folder: options.folder, title: options.title || result.note.title }));
    setDraftOpen(false); openNote(result.note.id);
    await startTranscription(result.note.id, { model: options.model });
  }
  async function convertSelected(options) {
    applyLibrary(await window.desktop.updateNote(selected.id, { folder: options.folder }));
    setEnvironment(await window.desktop.startTranscription(selected.id, { model: options.model }));
  }
  async function importModel() {
    try { const result = await window.desktop.importTranscriptionModel(); if (!result.canceled) setEnvironment(result); }
    catch (error) { toast(error.message); }
  }
  async function importAudio() {
    if (busy) return;
    setBusy(true);
    try {
      const result = await window.desktop.importAudio(folders.includes(filter) ? filter : '');
      if (result.canceled) return;
      applyLibrary(result.library); openNote(result.note.id);
      toast('원본 파일을 보관함에 복사했습니다.');
    } catch { toast('파일을 불러오지 못했습니다. 파일 형식과 저장 공간을 확인해 주세요.'); }
    finally { setBusy(false); }
  }
  async function exportTranscript(format = 'txt') {
    if (!selected.done) { toast('스크립트가 없습니다.'); return; }
    const text = serializeTranscript(selected.segments, { time: true, title: selected.title });
    try {
      if (window.desktop) {
        const result = await window.desktop.exportTranscript({ title: selected.title, text, format });
        if (!result.canceled) toast('스크립트를 저장했습니다.');
      } else {
        const url = URL.createObjectURL(new Blob(['\ufeff' + text], { type: 'text/plain;charset=utf-8' }));
        const link = document.createElement('a'); link.href = url; link.download = selected.title.replace(/[\\/:*?"<>|]/g, '_') + '.txt'; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch { toast('스크립트를 저장하지 못했습니다. 저장 위치와 권한을 확인해 주세요.'); }
  }
  function createFolderInline(parent = '') {
    navigate(parent); setCreatingFolder(parent);
  }
  async function newMemo() {
    try {
      const result = await window.desktop.memos.create(folders.includes(filter) ? filter : '');
      applyLibrary(result.library); openNote(result.note.id);
    } catch (error) { toast(error.message); }
  }
  async function saveNewFolder(name) {
    applyLibrary(await window.desktop.createFolder(name, creatingFolder));
    setCreatingFolder(null); toast('폴더를 만들었습니다.');
  }
  async function moveSelected(ids, folder) {
    try {
      applyLibrary(await window.desktop.moveNotes(ids, folder));
      selection.clear(); toast(`${ids.length}개 기록을 이동했습니다.`);
    } catch (error) { toast(error.message); }
  }
  function discardDraft(library) {
    applyLibrary(library); setBusy(false); setDraftOpen(false);
    navigate(filter); toast('녹음을 버렸습니다.');
  }

  const label = Object.hasOwn(filterNames, filter) ? filterNames[filter] : leafName(filter, folderParents);
  const children = ['recent', 'trash'].includes(filter) ? [] : folders.filter(folder => parentOf(folder, folderParents) === (folders.includes(filter) ? filter : ''));
  let visible = notes.filter(n => (filter === 'trash' ? n.deleted : !n.deleted) && (filter === '' ? !n.folder : Object.hasOwn(filterNames, filter) || n.folder === filter));
  visible.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  if (filter === 'recent') visible = visible.slice(0, 5);
  if (sort === 'title') visible = [...visible].sort((a, b) => a.title.localeCompare(b.title, 'ko'));
  const selectedTrash = trashSelection.filter(id => visible.some(note => note.id === id));

  const selection = useLibrarySelection({ visible, enabled: workspaceActive && !['all', 'trash'].includes(filter) && view === 'list', onMove: moveSelected, scope: `${filter}:${view}` });

  return <div data-library-workspace="work" className={`app ${sidebarCollapsed && view !== 'settings' ? 'sidebar-collapsed' : ''} ${view === 'settings' ? 'settings-view' : ''}`} style={{ fontFamily: fonts.find(font => font.id === preferences.font).family }}>
    <header className="app-header"><WorkspaceMenu value="work" onChange={onWorkspaceChange}/><NewTabButton/></header>
    <aside className="sidebar">{view === 'settings' ? <>
      <SettingsSidebar/>
    </> : <>
      <div className="brand"><button className="sidebar-toggle" title="사이드바 열기·닫기 · Ctrl + Shift + S" onClick={() => setSidebarCollapsed(value => !value)} aria-label={sidebarCollapsed ? '사이드바 펼치기' : '사이드바 접기'} aria-expanded={!sidebarCollapsed}><Icon name="sidebar"/><span className="label">사이드바 닫기</span></button></div>
      <button className="primary sidebar-create" onClick={newRecording} disabled={!loaded || busy}><Icon name="mic"/><span className="label">새 녹음</span></button>
      <button className="upload" disabled={!loaded || busy} onClick={importAudio}><Icon name="upload"/><span className="label">파일 불러오기</span></button>
      {!window.desktop.remote && <button className="upload" disabled={!loaded} onClick={() => setModal({ type: 'youtube' })} title="YouTube 불러오기"><Icon name="youtube"/><span className="label">YouTube 불러오기</span></button>}
      <nav className="nav" aria-label="녹음 목록">{[['all', 'home'], ['recent', 'clock'], ['trash', 'trash']].map(([key, icon]) => <button key={key} className={filter === key && view === 'list' ? 'active' : ''} onClick={() => navigate(key)} title={filterNames[key]}><Icon name={icon}/><span className="label">{filterNames[key]}</span></button>)}</nav>
      <div className="folder-heading">폴더<button aria-label="새 폴더" disabled={!loaded} onClick={() => { setSidebarCollapsed(false); setSidebarParent(folders.includes(filter) ? filter : ''); setSidebarCreating(true); }}><Icon name="plus"/></button></div>
      <button data-folder-drop="" className={`library-root ${filter === '' && view === 'list' ? 'active' : ''}`} onClick={() => navigate('')} title="내 보관함"><Icon name="folder"/><span className="label">내 보관함</span></button>{sidebarCreating && !sidebarParent ? <div className="sidebar-inline-folder"><Icon name="folder"/><InlineName value="" label="새 폴더 이름" allowEmptyCancel maxLength={80} onSave={async name => { applyLibrary(await window.desktop.createFolder(name,sidebarParent)); setSidebarCreating(false); }} onCancel={() => setSidebarCreating(false)}/></div> : null}<FolderTree creatingParent={sidebarCreating ? sidebarParent : undefined} draft={<div className="sidebar-inline-folder"><Icon name="folder"/><InlineName value="" label="새 폴더 이름" allowEmptyCancel maxLength={80} onSave={async name => { applyLibrary(await window.desktop.createFolder(name,sidebarParent)); setSidebarCreating(false); }} onCancel={() => setSidebarCreating(false)}/></div>} folders={folders} parents={folderParents} selected={view === 'list' ? filter : ''} onOpen={navigate} onMenu={openFolderMenu}/>
    </>}
      <div className="sidebar-bottom">{liveActive ? <button className="background-recording" onClick={() => onWorkspaceChange('live', 'recording')}><Icon name="mic"/><span className="label">Live 녹음으로 돌아가기</span></button> : null}{busy && draftOpen ? <button className="background-recording" onClick={() => { setSelectedId(null); setView('workspace'); }}><Icon name="mic"/><span className="label">녹음으로 돌아가기</span></button> : null}<TaskPanel active={workspaceActive} environment={backgroundEnvironment} notes={notes} onCancel={cancelBackgroundJob} onOpen={openBackgroundJob}/>{view !== 'settings' ? <button className="settings" onClick={openSettings} title="설정"><Icon name="settings"/><span className="label">설정</span></button> : null}</div>
    </aside>
    <main className="main">{view === 'list' && !['all','recent','trash'].includes(filter) ? <MobileLibraryTools onTrash={() => navigate('trash')}/> : null}{recovery ? <p className="recovery-message" role="status">보관함 목록을 {recovery.backup ? "백업과 녹음 메타데이터" : "녹음 메타데이터"}로 복구했습니다. {recovery.skipped ? `${recovery.skipped}개 항목은 읽지 못해 복구에서 제외했습니다. 원본 파일은 보존됩니다. ` : ""}{!recovery.backup ? "빈 폴더 등 메타데이터에 없는 정보는 복구되지 않을 수 있습니다." : "백업 시점 이후의 빈 폴더 변경은 확인이 필요합니다."}<button className="secondary" onClick={() => setRecovery(null)}>확인</button></p> : null}

      {view === 'list' && filter === 'all' ? <HomePage mode="work" loaded={loaded} busy={busy} notes={notes} folders={folders} parents={folderParents} recent={recent} jobs={backgroundEnvironment.queue.filter(job => !job.workspace || job.workspace === 'work')} recording={busy && draftOpen ? { title: 'Work 녹음', status: '녹음으로 돌아가 계속 기록하세요.', onOpen: () => { setSelectedId(null); setView('workspace'); } } : null} onRecord={newRecording} onImport={importAudio} onYouTube={() => setModal({type:'youtube'})} onMemo={newMemo} onFolder={() => createFolderInline('')} onLibrary={() => navigate('library')} onRoot={() => navigate('')} onJob={openBackgroundJob}
        renderNote={note => <NoteCard key={note.id} note={note} onOpen={() => openNote(note.id)} onMenu={(event, context) => openActions(event, { type: 'note', id: note.id, folder: note.folder, deleted: note.deleted }, context)} editing={renaming?.type === 'note' && renaming.id === note.id} onRename={title => changeNoteFromMenu(note.id, { title })} onCancelRename={() => setRenaming(null)}/>}
        renderFolder={folder => <FolderCard key={folder} folder={folder} name={leafName(folder, folderParents)} onOpen={() => navigate(folder)} onMenu={(event, context) => openFolderMenu(event, folder, context)}/>}
      /> : view === 'list' ? <LibraryView recordingBusy={busy} mode="work" renameTarget={renaming} onRenameEnd={() => setRenaming(null)} folder={filter} active={workspaceActive} onNavigate={navigate} onOpen={openNote} onRecord={(_mode,folder) => { newRecording(); if (!draftOpen) setDraftFolder(folder); }} onImport={importAudio} onYouTube={() => setModal({type:'youtube'})}/> : null}
      {draftOpen ? <div className="workspace-host" hidden={view !== 'workspace' || selectedId !== null}><NoteDetail workspaceActive={workspaceActive} note={null} environment={environment} folders={folders} folderParents={folderParents} initialFolder={draftFolder} onFinish={finishRecording} onDiscard={discardDraft} onBusy={setBusy} onNotice={toast} preferences={preferences} onPreferences={changePreferences} draftKey={draftKey} onBack={() => navigate(filter)}/></div> : null}
      {selected && (view === 'workspace' || (view === 'settings' && pageView === 'workspace')) ? <div className="workspace-host" hidden={view !== 'workspace'}>{selected.kind === 'pdf' ? <PdfHost note={selected} mode="work" onBack={() => navigate(filter)} onUpdate={change => updateNote(selected.id,change)}/> : selected.kind === 'memo' ? <MemoPage key={selected.id} note={selected} onBack={() => navigate(filter)} onUpdate={change => updateNote(selected.id, change)}/> : <NoteDetail workspaceActive={workspaceActive} note={selected} environment={environment} folders={folders} folderParents={folderParents} onCopy={copyTranscript} onConvert={convertSelected} onCancel={() => cancelTranscription(selected.id)} onBack={() => navigate(filter)} onUpdate={change => updateNote(selected.id, change)} onExport={exportTranscript}/>}</div> : null}
      {view === 'settings' ? <SettingsPage mode="work"/> : null}
    </main>
    <MobileNavigation filter={filter} settings={settingsOpen} hidden={view === 'workspace'} onNavigate={navigate} onSettings={() => openSettings()}/>
    {modal?.type === 'trash-confirm' ? <Modal title="휴지통으로 이동" onClose={closeModal}><p className="hint">{modal.ids.length}개 기록을 휴지통으로 이동할까요?</p><button className="primary danger" disabled={trashWorking} onClick={async()=>{try { applyLibrary(await window.desktop.manageLibrary({workspace:'work',action:'trash',ids:modal.ids,folders:[]}));closeModal(); } catch(error){toast(error.message);}}}>휴지통으로 이동</button></Modal>:null}
    {actionMenu ? <ActionMenu target={actionMenu} folders={folders} parents={folderParents} onClose={closeActionMenu} onRename={beginRename} onMove={async (id,folder) => applyLibrary(await window.desktop.manageLibrary({workspace:'work',action:'move',ids:[id],folders:[],folder}))} onTrash={(id,deleted) => deleted ? setModal({type:'trash-confirm',ids:[id]}) : processTrash([id])} onDeleteFolder={folder => setModal({type:'delete-folder',folder})}/> : null}
    {modal?.type === 'delete-folder' ? <Modal title="폴더 삭제" onClose={() => { if (!trashWorking) closeModal(); }}><p className="hint">{modal.folder} 및 하위 폴더를 삭제합니다. 폴더 안의 녹음과 메모는 휴지통으로 이동하며, 복구하면 내 보관함에 저장됩니다.</p><button className="primary full-width danger" disabled={trashWorking} onClick={() => removeFolder(modal.folder)}>{trashWorking ? '처리 중…' : '폴더 삭제'}</button></Modal> : null}
    {modal?.type === 'delete-trash' ? <Modal title={modal.all ? '휴지통 모두 비우기' : '기록 영구 삭제'} onClose={() => { if (!trashWorking) closeModal(); }}><p className="hint">{modal.ids.length}개의 기록과 메모·첨부파일을 영구 삭제합니다. 삭제 후에는 복구할 수 없습니다.</p><button className="primary full-width danger" disabled={trashWorking} onClick={() => processTrash(modal.ids,true)}>{trashWorking ? '삭제 중…' : '영구 삭제'}</button></Modal> : null}
    {modal?.type === 'youtube' ? <YouTubeDialog folders={folders} parents={folderParents} initialFolder={folders.includes(filter) ? filter : ''} environment={environment} onClose={closeModal} onStarted={() => { closeModal(); toast('음성을 가져온 뒤 선택한 모델로 변환합니다.'); }}/> : null}
    {modal?.type === 'youtube-progress' ? <YouTubeProgress jobs={imports} onClose={closeModal} onCancel={cancelBackgroundJob}/> : null}
    {selection.visual}
    <MemoSaveNotice onOpen={openNote}/>
    {notice ? <div key={notice.id} className="toast" role="status" title={notice.text} aria-label={notice.text}>{notice.text.length > 46 ? `${notice.text.slice(0, 45)}…` : notice.text}</div> : null}
  </div>;
}
