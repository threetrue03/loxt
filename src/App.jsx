import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import useLibrarySelection from './useLibrarySelection.jsx';
import WorkspaceMenu from './WorkspaceMenu.jsx';
import NoteCard from './NoteCard.jsx';
import HomePage from './HomePage.jsx';
import useRecentNotes from './useRecentNotes.js';
import Modal from './Modal.jsx';
import Menu from './Menu.jsx';
import Select from './Select.jsx';
import TaskPanel from './TaskPanel.jsx';
import YouTubeDialog, { YouTubeProgress } from './YouTubeDialog.jsx';
import FolderTree, { folderName as leafName, parentOf } from './FolderTree.jsx';
import FolderBreadcrumb from './FolderBreadcrumb.jsx';
import FolderCard from './FolderCard.jsx';
import ActionMenu from './ActionMenu.jsx';
import { fonts, loadPreferences, settingsTabs, taskLabel } from './uiPreferences.js';
import NoteDetail from './NoteDetail.jsx';
import TranscriptionSettings from './TranscriptionSettings.jsx';
import { formatTime, folderStorageKey, loadFolders } from './data.js';

const filterNames = { all: '홈', library: '모든 기록', recent: '최근 녹음', trash: '휴지통', '': '내 보관함' };

export default function App({ workspaceActive = true, liveActive = false, onWorkspaceChange, onBackgroundChange }) {
  const [notes, setNotes] = useState([]);
  const [folders, setFolders] = useState([]);
  const [folderParents, setFolderParents] = useState({});
  const [draftOpen, setDraftOpen] = useState(false);
  const [draftFolder, setDraftFolder] = useState('');
  const [filter, setFilter] = useState('all');
  const [view, setView] = useState('list');
  const [draftKey, setDraftKey] = useState(0);
  const [preferences, setPreferences] = useState(loadPreferences);
  const [settingsTab, setSettingsTab] = useState('general');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [settingsReturn, setSettingsReturn] = useState('list');
  const [layout, setLayout] = useState(() => {
    try { const value = localStorage.getItem('sorinote.library-layout'); return ['cards', 'compact', 'list'].includes(value) ? value : 'cards'; }
    catch { return 'cards'; }
  });
  const [selectedId, setSelectedId] = useState(null);
  const [sort, setSort] = useState('date');
  const [modal, setModal] = useState(null);
  const [creatingFolder, setCreatingFolder] = useState(null);
  const [actionMenu, setActionMenu] = useState(null);
  const [renaming, setRenaming] = useState(null);
  const [trashSelection, setTrashSelection] = useState([]);
  const [trashWorking, setTrashWorking] = useState(false);
  const [notice, setNotice] = useState('');
  const [appInfo, setAppInfo] = useState(null);
  const [storagePath, setStoragePath] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [environment, setEnvironment] = useState(null);
  const [imports, setImports] = useState([]);
  const backgroundEnvironment = { ...environment, queue: [...(environment?.queue || []), ...imports] };
  useEffect(() => { onBackgroundChange?.(Boolean((busy && draftOpen) || environment?.queue?.length || environment?.task || imports.length)); }, [busy, draftOpen, environment, imports.length, onBackgroundChange]);
  useEffect(() => { if (!workspaceActive) { setModal(null); setActionMenu(null); setCreatingFolder(null); setRenaming(null); } }, [workspaceActive]);
  const previousTask = useRef(null);
  const previousStage = useRef('idle');
  const previousQueue = useRef('');
  const toastTimer = useRef(null);
  const selected = notes.find(n => n.id === selectedId);
  const { recent, remember } = useRecentNotes('work', notes);
  function openNote(id) { remember(id); setSelectedId(id); setView('workspace'); }
  const closeModal = useCallback(() => setModal(null), []);
  const closeActionMenu = useCallback(() => setActionMenu(null), []);
  const applyLibrary = useCallback(data => { setNotes(data.notes); setFolders(data.folders); setFolderParents(data.folderParents || {}); setStoragePath(data.storagePath); }, []);
  useEffect(() => {
    if (!window.desktop?.youtube) return;
    let active = true;
    const receive = state => {
      if (!active) return;
      setImports(state.jobs);
      if (state.completed) {
        window.desktop.getLibrary().then(data => { if (active) applyLibrary(data); }).catch(() => {});
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
        const [info, initial] = await Promise.all([window.desktop.getAppInfo(), window.desktop.getLibrary()]);
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
      if (((state.task?.id || null) !== previousTask.current)
        || (previousStage.current !== 'idle' && state.stage === 'idle') || previousQueue.current !== JSON.stringify(state.queue || [])) {
        window.desktop.getLibrary().then(data => { if (active) applyLibrary(data); }).catch(() => {});
      }
      previousTask.current = state.task?.id || null; previousStage.current = state.stage;
      previousQueue.current = JSON.stringify(state.queue || []);
    };
    const unsubscribe = window.desktop.onTranscriptionState(receive);
    window.desktop.getTranscriptionEnvironment().then(receive).catch(() => { if (active) toast('변환 환경을 확인하지 못했습니다. 설정에서 다시 확인해 주세요.'); });
    return () => { active = false; unsubscribe(); };
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
    try { setEnvironment(await window.desktop.startTranscription(id, options)); applyLibrary(await window.desktop.getLibrary()); }
    catch (error) { toast(error.message); }
  }
  function toast(message) {
    setNotice({ text: message, id: performance.now() }); clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setNotice(''), 2500);
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
      const result = await window.desktop.deleteFolder(folder); applyLibrary(result.library);
      if (result.removed.includes(filter)) navigate('');
      if (result.removed.includes(draftFolder)) setDraftFolder('');
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
    setSettingsTab(typeof tab === 'string' ? tab : 'general');
    setSettingsReturn(view === 'settings' ? settingsReturn : view);
    setView('settings');
  }
  function changePreferences(change) {
    setPreferences(previous => {
      const next = { ...previous, ...change };
      try { localStorage.setItem('sorinote.ui-preferences', JSON.stringify(next)); } catch { /* session only */ }
      return next;
    });
  }
  async function openStorage() {
    try { if (await window.desktop.openLibrary()) toast('저장 폴더를 열지 못했습니다.'); }
    catch { toast('저장 폴더를 열지 못했습니다.'); }
  }
  function changeLayout(value) {
    setLayout(value);
    try { localStorage.setItem('sorinote.library-layout', value); } catch { /* 읽기 전용 저장소에서는 이번 실행에만 적용합니다. */ }
  }
  function newRecording() {
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
  async function exportTranscript() {
    if (!selected.done) { toast('스크립트가 없습니다.'); return; }
    const text = selected.title + '\n\n' + selected.segments.map(s => `${formatTime(s.start)} ${s.text}`).join('\n\n');
    try {
      if (window.desktop) {
        const result = await window.desktop.exportTranscript({ title: selected.title, text });
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
  async function saveNewFolder(name) {
    applyLibrary(await window.desktop.createFolder(name, creatingFolder));
    setCreatingFolder(null); toast('폴더를 만들었습니다.');
  }
  async function moveSelected(ids, folder) {
    try {
      applyLibrary(await window.desktop.moveNotes(ids, folder));
      selection.clear(); toast(`${ids.length}개 녹음을 이동했습니다.`);
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

  return <div className={`app ${sidebarCollapsed && view !== 'settings' ? 'sidebar-collapsed' : ''} ${view === 'settings' ? 'settings-view' : ''}`} style={{ fontFamily: fonts.find(font => font.id === preferences.font).family }}>
    <header className="app-header"><button className="sidebar-toggle" onClick={() => setSidebarCollapsed(value => !value)} disabled={view === 'settings'} aria-label={sidebarCollapsed ? '사이드바 펼치기' : '사이드바 접기'} aria-expanded={view === 'settings' || !sidebarCollapsed}><Icon name="sidebar"/></button><WorkspaceMenu value="work" onChange={onWorkspaceChange}/></header>
    <aside className="sidebar">{view === 'settings' ? <>
      <button className="back settings-return" onClick={() => setView(settingsReturn)}>← 보관함으로 돌아가기</button><div className="settings-sidebar-title">설정</div><nav className="nav settings-nav" aria-label="설정 메뉴">{settingsTabs.map(([id, title, icon]) => <button key={id} className={settingsTab === id ? 'active' : ''} onClick={() => setSettingsTab(id)}><Icon name={icon}/>{title}</button>)}</nav>
    </> : <>
      <div className="brand"><span className="label">내 보관함</span></div>
      <button className="primary sidebar-create" onClick={newRecording} disabled={!loaded}><Icon name="mic"/><span className="label">새 녹음</span></button>
      <button className="upload" disabled={!loaded || busy} onClick={importAudio}><Icon name="upload"/><span className="label">파일 불러오기</span></button>
      <button className="upload" disabled={!loaded} onClick={() => setModal({ type: 'youtube' })} title="YouTube 불러오기"><Icon name="youtube"/><span className="label">YouTube 불러오기</span></button>
      <nav className="nav" aria-label="녹음 목록">{[['all', 'home'], ['recent', 'clock'], ['trash', 'trash']].map(([key, icon]) => <button key={key} className={filter === key && view === 'list' ? 'active' : ''} onClick={() => navigate(key)} title={filterNames[key]}><Icon name={icon}/><span className="label">{filterNames[key]}</span></button>)}</nav>
      <div className="folder-heading">폴더<button aria-label="새 폴더" disabled={!loaded} onClick={() => createFolderInline('')}><Icon name="plus"/></button></div>
      <button data-folder-drop="" className={`library-root ${filter === '' && view === 'list' ? 'active' : ''}`} onClick={() => navigate('')} title="내 보관함"><Icon name="folder"/><span className="label">내 보관함</span></button><FolderTree folders={folders} parents={folderParents} selected={view === 'list' ? filter : ''} onOpen={navigate} onMenu={openFolderMenu}/>
    </>}
      <div className="sidebar-bottom">{liveActive ? <button className="background-recording" onClick={() => onWorkspaceChange('live', 'recording')}><Icon name="mic"/><span className="label">Live 녹음으로 돌아가기</span></button> : null}{busy && draftOpen ? <button className="background-recording" onClick={() => { setSelectedId(null); setView('workspace'); }}><Icon name="mic"/><span className="label">녹음으로 돌아가기</span></button> : null}<TaskPanel active={workspaceActive} environment={backgroundEnvironment} notes={notes} onCancel={cancelBackgroundJob} onOpen={openBackgroundJob}/>{view !== 'settings' ? <button className="settings" onClick={openSettings} title="설정"><Icon name="settings"/><span className="label">설정</span></button> : null}</div>
    </aside>
    <main className="main">
      {view === 'settings' ? <header className="topbar"><span className="settings-breadcrumb">설정 / {settingsTabs.find(item => item[0] === settingsTab)?.[1]}</span></header> : null}
      {view === 'list' && filter === 'all' ? <HomePage mode="work" loaded={loaded} busy={busy} notes={notes} folders={folders} parents={folderParents} recent={recent} jobs={backgroundEnvironment.queue.filter(job => !job.workspace || job.workspace === 'work')} recording={busy && draftOpen ? { title: 'Work 녹음', status: '녹음으로 돌아가 계속 기록하세요.', onOpen: () => { setSelectedId(null); setView('workspace'); } } : null} onRecord={newRecording} onImport={importAudio} onLibrary={() => navigate('library')} onRoot={() => navigate('')} onJob={openBackgroundJob}
        renderNote={note => <NoteCard key={note.id} note={note} onOpen={() => openNote(note.id)} onMenu={(event, context) => openActions(event, { type: 'note', id: note.id, folder: note.folder, deleted: note.deleted }, context)} editing={renaming?.type === 'note' && renaming.id === note.id} onRename={title => changeNoteFromMenu(note.id, { title })} onCancelRename={() => setRenaming(null)}/>}
        renderFolder={folder => <FolderCard key={folder} folder={folder} name={leafName(folder, folderParents)} onOpen={() => navigate(folder)} onMenu={(event, context) => openFolderMenu(event, folder, context)}/>}
      /> : view === 'list' ? <section className="content library-page">
        <div className="heading library-heading"><div className="heading-title">{filter === '' || folders.includes(filter) ? <FolderBreadcrumb folder={filter} parents={folderParents} onOpen={navigate} editing={renaming?.type === 'folder' && renaming.id === filter} onRename={name => renameFolder(filter, name)} onCancelRename={() => setRenaming(null)} onStartRename={() => beginRename({ type: 'folder', id: filter })} onMenu={(event, context) => openFolderMenu(event, filter, context)}/> : <h1>{label}</h1>}</div><div className="library-actions"><Select className="sort-select" label="정렬" value={sort} onChange={setSort} options={[{value:"date",label:"최신순"},{value:"title",label:"이름순"}]}/>{filter === 'trash' ? <div className="trash-actions"><label className="trash-select-all"><input type="checkbox" aria-label="휴지통 모두 선택" checked={visible.length > 0 && selectedTrash.length === visible.length} disabled={!visible.length || trashWorking} onChange={event => setTrashSelection(event.target.checked ? visible.map(note => note.id) : [])}/>모두 선택</label><button className="secondary" disabled={!selectedTrash.length || trashWorking} onClick={() => processTrash(selectedTrash)}>복구</button><button className="secondary danger" disabled={!selectedTrash.length || trashWorking} onClick={() => setModal({type:'delete-trash',ids:selectedTrash})}>삭제</button><button className="secondary danger" disabled={!visible.length || trashWorking} onClick={() => setModal({type:'delete-trash',ids:visible.map(note => note.id),all:true})}>모두 비우기</button></div> : <Menu label="새로 추가하기" trigger={<><Icon name="plus"/><span>새로 추가하기</span><Icon name="chevronDown"/></>} disabled={!loaded} className="add-menu">{close => <><button role="menuitem" onClick={() => { close(); createFolderInline(folders.includes(filter) ? filter : ''); }}><Icon name="folder"/>폴더</button><div className="action-menu-divider" role="separator"/><button role="menuitem" onClick={() => { close(); newRecording(); }}><Icon name="mic"/>새 녹음</button><button role="menuitem" disabled={busy} onClick={() => { close(); importAudio(); }}><Icon name="upload"/>불러오기</button></>}</Menu>}<div className="view-switch" role="group" aria-label="보관함 보기">{[['cards', 'grid', '카드 보기'], ['compact', 'compact', '작은 카드 보기'], ['list', 'list', '목록 보기']].map(([value, icon, name]) => <button key={value} aria-label={name} title={name} aria-pressed={layout === value} onClick={() => changeLayout(value)}><Icon name={icon}/></button>)}</div></div></div>
        <div className={`note-collection layout-${layout}`} {...selection.handlers}>
          <div className="folder-collection">{creatingFolder !== null ? <FolderCard key="new-folder" name="" creating editing onRename={saveNewFolder} onCancelRename={() => setCreatingFolder(null)}/> : null}
          {children.map(folder => <FolderCard key={folder} folder={folder} name={leafName(folder, folderParents)} onOpen={() => navigate(folder)} onMenu={(event, context) => openFolderMenu(event, folder, context)} editing={renaming?.type === 'folder' && renaming.id === folder} onRename={name => renameFolder(folder, name)} onCancelRename={() => setRenaming(null)}/>)}
          </div><div className="recording-collection">{layout === 'list' && visible.length ? <div className="table-head"><span>녹음 제목</span><span className="date">녹음 날짜</span><span className="duration">녹음 길이</span><span>변환 상태</span><span/></div> : null}
          {visible.length ? visible.map(note => <NoteCard key={note.id} note={note} selected={selection.ids.includes(note.id)} selectable={filter === 'trash'} checked={selectedTrash.includes(note.id)} selectionDisabled={trashWorking} onCheck={checked => setTrashSelection(ids => checked ? [...new Set([...ids,note.id])] : ids.filter(id => id !== note.id))} onOpen={event => selection.open(event, note, () => openNote(note.id))} onMenu={(event, context) => openActions(event, { type: 'note', id: note.id, folder: note.folder, deleted: note.deleted }, context)} editing={renaming?.type === 'note' && renaming.id === note.id} onRename={title => changeNoteFromMenu(note.id, { title })} onCancelRename={() => setRenaming(null)}/>) : children.length || creatingFolder !== null ? null : <div className="empty library-empty"><span className="empty-icon"><Icon name={filter === 'trash' ? 'trash' : 'file'}/></span><h2>{filter === 'trash' ? '휴지통이 비어 있습니다' : '첫 녹음을 남겨보세요'}</h2><p>{filter === 'trash' ? '휴지통으로 옮긴 녹음이 여기에 표시됩니다.' : '목소리로 남긴 기록을 문서처럼 모아보세요.'}</p>{filter !== 'trash' ? <button className="secondary" onClick={importAudio} disabled={!loaded || busy}><Icon name="upload"/>오디오 파일 불러오기</button> : null}</div>}
        </div></div>
      </section> : null}
      {draftOpen ? <div className="workspace-host" hidden={view !== 'workspace' || selectedId !== null}><NoteDetail workspaceActive={workspaceActive} note={null} environment={environment} folders={folders} folderParents={folderParents} initialFolder={draftFolder} onFinish={finishRecording} onDiscard={discardDraft} onBusy={setBusy} onNotice={toast} preferences={preferences} onPreferences={changePreferences} draftKey={draftKey} onBack={() => navigate(filter)}/></div> : null}
      {selected && (view === 'workspace' || (view === 'settings' && settingsReturn === 'workspace')) ? <div className="workspace-host" hidden={view !== 'workspace'}><NoteDetail workspaceActive={workspaceActive} note={selected} environment={environment} folders={folders} folderParents={folderParents} onCopy={copyTranscript} onConvert={convertSelected} onCancel={() => cancelTranscription(selected.id)} onBack={() => navigate(filter)} onUpdate={change => updateNote(selected.id, change)} onExport={exportTranscript}/></div> : null}
      {view === 'settings' ? <TranscriptionSettings tab={settingsTab} environment={environment} appInfo={appInfo} storagePath={storagePath} preferences={preferences} onPreferences={changePreferences} layout={layout} onLayout={changeLayout} onCheck={checkEnvironment} onConfigure={configureEnvironment} onImport={importModel} onInstall={installModels} onDelete={deleteModel} onCancel={cancelTranscription} onOpenStorage={openStorage}/> : null}
    </main>
    {actionMenu ? <ActionMenu target={actionMenu} folders={folders} parents={folderParents} onClose={closeActionMenu} onRename={beginRename} onMove={(id, folder) => changeNoteFromMenu(id, { folder })} onTrash={(id, deleted) => deleted ? changeNoteFromMenu(id, { deleted }) : processTrash([id])} onDeleteFolder={folder => setModal({type:'delete-folder',folder})}/> : null}
    {modal?.type === 'delete-folder' ? <Modal title="폴더 삭제" onClose={() => { if (!trashWorking) closeModal(); }}><p className="hint">{modal.folder} 및 하위 폴더를 삭제합니다. 폴더 안의 녹음은 휴지통으로 이동하며, 복구하면 내 보관함에 저장됩니다.</p><button className="primary full-width danger" disabled={trashWorking} onClick={() => removeFolder(modal.folder)}>{trashWorking ? '처리 중…' : '폴더 삭제'}</button></Modal> : null}
    {modal?.type === 'delete-trash' ? <Modal title={modal.all ? '휴지통 모두 비우기' : '녹음 영구 삭제'} onClose={() => { if (!trashWorking) closeModal(); }}><p className="hint">{modal.ids.length}개의 녹음 원본과 스크립트를 영구 삭제합니다. 삭제 후에는 복구할 수 없습니다.</p><button className="primary full-width danger" disabled={trashWorking} onClick={() => processTrash(modal.ids,true)}>{trashWorking ? '삭제 중…' : '영구 삭제'}</button></Modal> : null}
    {modal?.type === 'youtube' ? <YouTubeDialog folders={folders} parents={folderParents} initialFolder={folders.includes(filter) ? filter : ''} environment={environment} onClose={closeModal} onStarted={() => { closeModal(); toast('음성을 가져온 뒤 선택한 모델로 변환합니다.'); }}/> : null}
    {modal?.type === 'youtube-progress' ? <YouTubeProgress jobs={imports} onClose={closeModal} onCancel={cancelBackgroundJob}/> : null}
    {selection.visual}
    {notice ? <div key={notice.id} className="toast" role="status" title={notice.text} aria-label={notice.text}>{notice.text.length > 46 ? `${notice.text.slice(0, 45)}…` : notice.text}</div> : null}
  </div>;
}
