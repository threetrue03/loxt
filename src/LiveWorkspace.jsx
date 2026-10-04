import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import WorkspaceMenu from './WorkspaceMenu.jsx';
import Menu from './Menu.jsx';
import Select from './Select.jsx';
import useLibrarySelection from './useLibrarySelection.jsx';
import Modal from './Modal.jsx';
import FolderTree, { folderName, parentOf } from './FolderTree.jsx';
import FolderBreadcrumb from './FolderBreadcrumb.jsx';
import FolderCard from './FolderCard.jsx';
import ActionMenu from './ActionMenu.jsx';
import LiveRecorder from './LiveRecorder.jsx';
import NoteDetail from './NoteDetail.jsx';
import NoteCard from './NoteCard.jsx';
import HomePage from './HomePage.jsx';
import ThemeSetting from './ThemeSetting.jsx';
import useRecentNotes from './useRecentNotes.js';
import { formatTime } from './data.js';

const names = { all: '홈', library: '모든 기록', recent: '최근 기록', trash: '휴지통', '': '내 보관함' };
export default function LiveWorkspace({ active, workActive, returnToRecording, onWorkspaceChange, onBackgroundChange }) {
  const [library, setLibrary] = useState({ notes: [], folders: [], folderParents: {}, storagePath: '' });
  const [loaded, setLoaded] = useState(false), [filter, setFilter] = useState('all');
  const [collapsed, setCollapsed] = useState(false), [settings, setSettings] = useState(false), [tab, setTab] = useState('general');
  const [creating, setCreating] = useState(null), [renaming, setRenaming] = useState(null);
  const [menu, setMenu] = useState(null), [modal, setModal] = useState(null), [selection, setSelection] = useState([]);
  const [working, setWorking] = useState(false), [notice, setNotice] = useState(null);
  const [liveState, setLiveState] = useState({ stage: 'idle', segments: [], preview: [], seconds: 0 });
  const [draft, setDraft] = useState(false), [recordView, setRecordView] = useState(false), [draftKey, setDraftKey] = useState(0), [draftFolder, setDraftFolder] = useState(''), [selectedId, setSelectedId] = useState(null);
  const [layout, setLayout] = useState(() => localStorage.getItem('loxt.live.layout') || 'cards'), [sort, setSort] = useState('date');
  const [environment, setEnvironment] = useState(null);
  useEffect(() => { const receive = value => { setEnvironment(value); window.desktop.live.getLibrary().then(setLibrary).catch(() => {}); }; window.desktop.getTranscriptionEnvironment().then(receive).catch(() => {}); return window.desktop.onTranscriptionState(receive); }, []);
  const liveBusy = !['idle', 'done', 'ready'].includes(liveState.stage);
  const selected = library.notes.find(note => note.id === selectedId);
  const { recent, remember } = useRecentNotes('live', library.notes);
  function openNote(id) { remember(id); setSettings(false); setSelectedId(id); setRecordView(true); }
  useEffect(() => { if (returnToRecording) { setSettings(false); setSelectedId(null); setRecordView(true); } }, [returnToRecording]);
  useEffect(() => { onBackgroundChange?.(liveBusy); }, [liveBusy, onBackgroundChange]);
  useEffect(() => {
    let mounted = true; const receive = value => { if (!mounted) return; setLiveState(value); if (value.stage === 'done') window.desktop.live.getLibrary().then(data => { if (mounted) setLibrary(data); }).catch(() => {}); };
    window.desktop.live.getState().then(receive).catch(() => {}); const off = window.desktop.live.onState(receive); return () => { mounted = false; off(); };
  }, []);
  const timer = useRef(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const { folders, folderParents: parents, notes } = library;
  function toast(text) { clearTimeout(timer.current); setNotice({ text, id: Date.now() }); timer.current = setTimeout(() => setNotice(null), 2500); }
  useEffect(() => {
    let mounted = true;
    window.desktop?.live.getLibrary().then(data => { if (mounted) { setLibrary(data); setLoaded(true); } }).catch(error => { if (mounted) toast(error.message); });
    return () => { mounted = false; clearTimeout(timer.current); };
  }, []);
  useEffect(() => { if (!active) { setMenu(null); setModal(null); setCreating(null); setRenaming(null); } }, [active]);
  function navigate(value) { setRecordView(false); setSelectedId(null); setFilter(value); setSettings(false); setCreating(null); setRenaming(null); setMenu(null); setSelection([]); }
  function openRecorder() { if (!draft) { setDraftFolder(folders.includes(filter) ? filter : ''); setLiveState({stage:'idle',segments:[],preview:[],seconds:0}); setDraftKey(value => value + 1); setDraft(true); } setSettings(false); setSelectedId(null); setRecordView(true); }
  function finishLive(result) { if (result.library) setLibrary(result.library); setDraft(false); if (result.note) openNote(result.note.id); else { setSelectedId(null); setRecordView(false); } }
  async function updateLiveNote(id, change) { setLibrary(await window.desktop.live.updateNote(id, change)); return true; }
  function newFolder(parent = '') { navigate(parent); setCreating(parent); }
  async function saveFolder(name) { setLibrary(await window.desktop.live.createFolder(name, creating)); setCreating(null); }
  async function renameFolder(folder, name) {
    const result = await window.desktop.live.renameFolder(folder, name);
    setLibrary(result.library); setFilter(value => result.renamed[value] || value); setRenaming(null);
  }
  function openMenu(event, folder, context) {
    event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect();
    setMenu({ type: 'folder', id: folder, trigger: event.currentTarget, x: context ? event.clientX : rect.left, y: context ? event.clientY : rect.bottom });
  }
  async function removeFolder(folder) {
    setWorking(true);
    try { setLibrary(await window.desktop.live.deleteFolder(folder)); navigate(''); setModal(null); }
    catch (error) { toast(error.message); }
    finally { setWorking(false); }
  }
  async function processTrash(ids, permanent = false) {
    setWorking(true);
    try { setLibrary(await (permanent ? window.desktop.live.deleteTrash(ids) : window.desktop.live.restoreTrash(ids))); setSelection([]); setModal(null); }
    catch (error) { toast(error.message); }
    finally { setWorking(false); }
  }
  const children = ['recent', 'trash'].includes(filter) ? [] : folders.filter(folder => parentOf(folder, parents) === (folders.includes(filter) ? filter : ''));
  const visible = notes.filter(note => (filter === 'trash' ? note.deleted : !note.deleted) && (filter === '' ? !note.folder : Object.hasOwn(names, filter) || note.folder === filter)).sort((a, b) => sort === 'title' ? a.title.localeCompare(b.title,'ko') : (b.createdAt || '').localeCompare(a.createdAt || ''));
  const shown = filter === 'recent' ? visible.slice(0, 5) : visible;
  const checked = selection.filter(id => shown.some(note => note.id === id));
  async function importAudio() {
    try { const result = await window.desktop.live.importAudio(folders.includes(filter) ? filter : ''); if (!result.canceled) { setLibrary(result.library); for (const note of result.notes) await window.desktop.live.convert(note.id, environment?.model || 'large-v3-turbo'); } }
    catch (error) { toast(error.message); }
  }
  async function moveSelected(ids, folder) { try { setLibrary(await window.desktop.live.moveNotes(ids,folder)); librarySelection.clear(); } catch (error) { toast(error.message); } }
  const librarySelection = useLibrarySelection({ visible: shown, enabled: active && !recordView && !settings && !['all', 'trash'].includes(filter), onMove: moveSelected, scope: `${filter}:${recordView}` });
  return <div className={`app live-app ${collapsed && !settings ? 'sidebar-collapsed' : ''} ${settings ? 'settings-view' : ''}`}>
    <header className="app-header"><button className="sidebar-toggle" disabled={settings} aria-label={collapsed ? '사이드바 펼치기' : '사이드바 접기'} aria-expanded={settings || !collapsed} onClick={() => setCollapsed(value => !value)}><Icon name="sidebar"/></button><WorkspaceMenu value="live" onChange={onWorkspaceChange}/></header>
    <aside className="sidebar">{settings ? <><button className="back settings-return" onClick={() => setSettings(false)}>← 보관함으로 돌아가기</button><div className="settings-sidebar-title">설정</div><nav className="nav settings-nav" aria-label="설정 메뉴">{[['general', '일반', 'settings'], ['storage', '저장 공간', 'folder']].map(([id, title, icon]) => <button className={tab === id ? 'active' : ''} key={id} onClick={() => setTab(id)}><Icon name={icon}/>{title}</button>)}</nav></> : <>
      <div className="brand"><span className="label">내 보관함</span></div>
      <button className="sidebar-create primary live-start" disabled={!loaded} onClick={openRecorder}><Icon name="mic"/><span className="label">새 Live 녹음</span></button>
      <button className="upload" disabled={!loaded} onClick={importAudio}><Icon name="upload"/><span className="label">파일 불러오기</span></button>
      <nav className="nav" aria-label="Live 기록 목록">{[['all', 'home'], ['recent', 'clock'], ['trash', 'trash']].map(([key, icon]) => <button key={key} className={filter === key ? 'active' : ''} onClick={() => navigate(key)} title={names[key]}><Icon name={icon}/><span className="label">{names[key]}</span></button>)}</nav>
      <div className="folder-heading">폴더<button aria-label="새 폴더" disabled={!loaded} onClick={() => newFolder('')}><Icon name="plus"/></button></div><button className={`library-root ${filter === '' ? 'active' : ''}`} onClick={() => navigate('')} title="내 보관함"><Icon name="folder"/><span className="label">내 보관함</span></button><FolderTree folders={folders} parents={parents} selected={filter} onOpen={navigate} onMenu={openMenu}/>
    </>}<div className="sidebar-bottom">{liveBusy ? <button className="background-recording" onClick={() => { setSettings(false); setSelectedId(null); setRecordView(true); }}><Icon name="mic"/><span className="label">Live 녹음으로 돌아가기</span></button> : null}{workActive ? <button className="background-recording" onClick={() => onWorkspaceChange('work')} title="Work 작업으로 돌아가기"><Icon name="clock"/><span className="label">Work 작업 진행 중</span></button> : null}{!settings ? <button className="settings" title="설정" onClick={() => { setTab('general'); setSettings(true); }}><Icon name="settings"/><span className="label">설정</span></button> : null}</div></aside>
    <main className="main">{settings ? <><header className="topbar"><span className="settings-breadcrumb">설정 / {tab === 'general' ? '일반' : '저장 공간'}</span></header><section className="content live-settings"><h1>{tab === 'general' ? '일반' : '저장 공간'}</h1>{tab === 'general' ? <><ThemeSetting/><h2>Live 워크스페이스</h2><p className="hint">2초마다 인식 중인 문장을 갱신하고, 잠깐 말을 멈추면 스크립트를 확정합니다. Work와 Live 기록은 별도로 보관됩니다.</p></> : <><h2>Live 보관함</h2><p className="hint live-storage-path">{library.storagePath}</p><button className="secondary" onClick={async () => { try { if (await window.desktop.live.openLibrary()) toast('저장 폴더를 열지 못했습니다.'); } catch (error) { toast(error.message); } }}><Icon name="folder"/>저장 위치 열기</button></>}</section></> : !recordView && filter === 'all' ? <HomePage mode="live" loaded={loaded} notes={notes} folders={folders} parents={parents} recent={recent} jobs={(environment?.queue || []).filter(job => job.workspace === 'live')} recording={liveBusy ? { title: liveState.title || 'Live 녹음', status: liveState.stage === 'recording' ? '실시간 스크립트를 기록하고 있습니다.' : liveState.stage === 'paused' ? '일시정지 중' : liveState.stage === 'preparing' ? '모델 준비 중' : '스크립트 처리 중', onOpen: openRecorder } : null} onRecord={openRecorder} onImport={importAudio} onLibrary={() => navigate('library')} onRoot={() => navigate('')} onJob={openNote}
      renderNote={note => <NoteCard key={note.id} note={note} onOpen={() => openNote(note.id)} editing={renaming === note.id} onRename={async title => { await updateLiveNote(note.id, { title }); setRenaming(null); }} onCancelRename={() => setRenaming(null)} onMenu={(event, context) => { event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect(); setMenu({ type: 'note', id: note.id, folder: note.folder, deleted: note.deleted, trigger: event.currentTarget, x: context ? event.clientX : rect.left, y: context ? event.clientY : rect.bottom }); }}/>} renderFolder={folder => <FolderCard key={folder} folder={folder} name={folderName(folder, parents)} onOpen={() => navigate(folder)} onMenu={(event, context) => openMenu(event, folder, context)}/>}/>
    : !recordView ? <section className="content library-page">
      <div className="heading library-heading"><div className="heading-title">{filter === '' || folders.includes(filter) ? <FolderBreadcrumb folder={filter} parents={parents} onOpen={navigate} editing={renaming === filter} onRename={name => renameFolder(filter, name)} onCancelRename={() => setRenaming(null)} onStartRename={() => setRenaming(filter)} onMenu={(event, context) => openMenu(event, filter, context)}/> : <h1>{names[filter]}</h1>}</div><div className="library-actions"><Select className="sort-select" label="정렬" value={sort} onChange={setSort} options={[{value:"date",label:"최신순"},{value:"title",label:"이름순"}]}/>{filter === 'trash' ? <div className="trash-actions"><label className="trash-select-all"><input type="checkbox" aria-label="휴지통 모두 선택" checked={shown.length > 0 && checked.length === shown.length} disabled={!shown.length || working} onChange={event => setSelection(event.target.checked ? shown.map(note => note.id) : [])}/>모두 선택</label><button className="secondary" disabled={!checked.length || working} onClick={() => processTrash(checked)}>복구</button><button className="secondary danger" disabled={!checked.length || working} onClick={() => setModal({ type: 'trash', ids: checked })}>삭제</button><button className="secondary danger" disabled={!shown.length || working} onClick={() => setModal({ type: 'trash', ids: shown.map(note => note.id), all: true })}>모두 비우기</button></div> : <Menu label="새로 추가하기" className="add-menu" disabled={!loaded} trigger={<><Icon name="plus"/><span>새로 추가하기</span><Icon name="chevronDown"/></>}>{close => <><button role="menuitem" onClick={() => { close(); newFolder(folders.includes(filter) ? filter : ''); }}><Icon name="folder"/>폴더</button><div className="action-menu-divider" role="separator"/><button role="menuitem" onClick={() => { close(); openRecorder(); }}><Icon name="mic"/>새 녹음</button><button role="menuitem" onClick={() => { close(); importAudio(); }}><Icon name="upload"/>불러오기</button></>}</Menu>}<div className="view-switch" role="group" aria-label="보관함 보기">{[["cards","grid","카드 보기"],["compact","compact","작은 카드 보기"],["list","list","목록 보기"]].map(([value,icon,label]) => <button key={value} aria-label={label} title={label} aria-pressed={layout === value} onClick={() => { setLayout(value); localStorage.setItem("loxt.live.layout",value); }}><Icon name={icon}/></button>)}</div></div></div>
      <div className={`note-collection layout-${layout}`} {...librarySelection.handlers}><div className="folder-collection">{creating !== null ? <FolderCard creating editing name="" onRename={saveFolder} onCancelRename={() => setCreating(null)}/> : null}{children.map(folder => <FolderCard key={folder} folder={folder} name={folderName(folder, parents)} onOpen={() => navigate(folder)} onMenu={(event, context) => openMenu(event, folder, context)} editing={renaming === folder} onRename={name => renameFolder(folder, name)} onCancelRename={() => setRenaming(null)}/>)}
      </div><div className="recording-collection">{layout === "list" && shown.length ? <div className="table-head"><span>녹음 제목</span><span className="date">녹음 날짜</span><span className="duration">녹음 길이</span><span>변환 상태</span><span/></div> : null}
        {shown.map(note => <NoteCard key={note.id} note={note} editing={renaming === note.id} onRename={async title => { await updateLiveNote(note.id,{title}); setRenaming(null); }} onCancelRename={() => setRenaming(null)} selected={librarySelection.ids.includes(note.id)} selectable={filter === 'trash'} checked={checked.includes(note.id)} selectionDisabled={working} onCheck={value => setSelection(ids => value ? [...new Set([...ids,note.id])] : ids.filter(id => id !== note.id))} onOpen={event => librarySelection.open(event,note,() => openNote(note.id))} onMenu={(event, context) => { event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect(); setMenu({type:'note',id:note.id,folder:note.folder,deleted:note.deleted,trigger:event.currentTarget,x:context ? event.clientX : rect.left,y:context ? event.clientY : rect.bottom}); }}/>) }
        {!shown.length && !children.length && creating === null ? <div className="empty library-empty"><div className="empty-icon"><Icon name={filter === 'trash' ? 'trash' : 'mic'}/></div><h2>{filter === 'trash' ? '휴지통이 비어 있어요' : 'Live 워크스페이스'}</h2><p>{filter === 'trash' ? 'Live에서 삭제한 기록이 여기에 표시됩니다.' : '새 Live 녹음을 시작하면 실시간 스크립트가 이 보관함에 저장됩니다.'}</p></div> : null}
      </div></div>
    </section> : null}{draft ? <div className="workspace-host" hidden={!recordView || selectedId !== null || settings}><LiveRecorder key={draftKey} state={liveState} visible={active && recordView && selectedId === null && !settings} initialFolder={draftFolder} onFinish={finishLive} onBack={() => navigate(filter)} onNotice={toast}/></div> : null}{selected && recordView && !settings ? <NoteDetail audioHost="live" workspaceActive={active} note={selected} onBack={() => navigate(filter)} onUpdate={change => updateLiveNote(selected.id,change)} environment={environment} folders={folders} folderParents={parents} onCancel={() => window.desktop.cancelTranscription(selected.id)} onConvert={async options => { if (selected.folder !== options.folder) await updateLiveNote(selected.id,{folder:options.folder}); await window.desktop.live.convert(selected.id,options.model); }} onCopy={() => window.desktop.live.copyTranscript(selected.id)} onExport={async () => { try { await window.desktop.exportTranscript({title:selected.title,text:selected.segments.map(segment => `[${formatTime(segment.start)}] ${segment.speaker ? `[${segment.speaker}] ` : ''}${segment.text}`).join('\n\n')}); } catch(error) { toast(error.message); } }}/>:null}</main>
    {librarySelection.visual}
    {menu ? <ActionMenu target={menu} folders={folders} parents={parents} onClose={closeMenu} onRename={target => { if (target.type === 'note') { setRenaming(target.id); } else { navigate(target.id); setRenaming(target.id); } }} onMove={(id,folder) => updateLiveNote(id,{folder})} onTrash={(id,deleted) => deleted ? updateLiveNote(id,{deleted}) : processTrash([id])} onDeleteFolder={folder => setModal({ type: 'folder', folder })}/> : null}
    {modal ? <Modal title={modal.type === 'folder' ? '폴더 삭제' : modal.type === 'trash' ? modal.all ? '휴지통 모두 비우기' : '기록 영구 삭제' : modal.note.title} onClose={() => { if (!working) setModal(null); }}>{modal.type === 'script' ? <div className="live-script">{modal.note.segments?.map((segment, index) => <p key={index}>{segment.text}</p>)}</div> : <><p className="hint">{modal.type === 'folder' ? `${modal.folder} 및 하위 폴더를 삭제합니다. 폴더 안의 Live 기록은 휴지통으로 이동합니다.` : `${modal.ids.length}개의 Live 기록을 영구 삭제합니다. 삭제 후에는 복구할 수 없습니다.`}</p><button className="primary full-width danger" disabled={working} onClick={() => modal.type === 'folder' ? removeFolder(modal.folder) : processTrash(modal.ids, true)}>{working ? '처리 중…' : modal.type === 'folder' ? '폴더 삭제' : '영구 삭제'}</button></>}</Modal> : null}
    {notice ? <div className="toast" key={notice.id} role="status" title={notice.text}>{notice.text.length > 46 ? `${notice.text.slice(0, 45)}…` : notice.text}</div> : null}
  </div>;
}
