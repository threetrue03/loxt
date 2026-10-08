import PdfHost from './PdfHost.jsx';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon.jsx';
import { flushMemos } from './memoStore.js';
import Select from './Select.jsx';
import Menu from './Menu.jsx';
import Modal from './Modal.jsx';
import NoteCard from './NoteCard.jsx';
import FolderCard from './FolderCard.jsx';
import FolderBreadcrumb from './FolderBreadcrumb.jsx';
import ActionMenu from './ActionMenu.jsx';
import { folderName, parentOf } from './FolderTree.jsx';
import useLibrarySelection from './useLibrarySelection.jsx';
import NoteDetail from './NoteDetail.jsx';
import MemoPage from './MemoPage.jsx';
import YouTubeDialog from './YouTubeDialog.jsx';
import { useSettings } from './SettingsProvider.jsx';
import { serializeTranscript } from '../shared/transcript.js';

export function libraryApi(mode) { return mode === 'live' ? window.desktop.live : window.desktop; }
const lists = new Map(), listeners = new Map(), pending = new Map(); let subscribed = false;
export async function refreshLibrary(mode) {
  if (pending.has(mode)) return pending.get(mode);
  const request = libraryApi(mode).getLibrary().then(data => { if ((lists.get(mode)?.revision ?? -1) <= (data.revision ?? 0)) { lists.set(mode, data); listeners.get(mode)?.forEach(fn => fn(data)); } return data; }).finally(() => pending.delete(mode));
  pending.set(mode, request); return request;
}
export function useLibraryData(mode) {
  const [data, setData] = useState(() => lists.get(mode) || { notes: [], folders: [], folderParents: {} });
  const [error, setError] = useState('');
  useEffect(() => {
    if (!subscribed) { subscribed = true; window.desktop.onLibraryChange(event => { refreshLibrary(event.workspace).catch(() => {}); }); }
    if (!listeners.has(mode)) listeners.set(mode, new Set()); listeners.get(mode).add(setData);
    refreshLibrary(mode).catch(e => setError(e.message));
    return () => listeners.get(mode).delete(setData);
  }, [mode]);
  return { data, error };
}
const filterNames = { library: '모든 기록', recent: '최근 기록', trash: '휴지통' };
export default function LibraryView({ mode, folder: controlled, onNavigate, onOpen, onRecord, onImport, onYouTube, renameTarget, onRenameEnd, state = {}, onState, active = true }) {
  const { data, error: loadError } = useLibraryData(mode), api = libraryApi(mode), settings = useSettings();
  const [local, setLocal] = useState(state), [creating, setCreating] = useState(false), [renaming, setRenaming] = useState(null), [menu, setMenu] = useState(null), [addMenu, setAddMenu] = useState(null), [modal, setModal] = useState(null), [working, setWorking] = useState(false), [error, setError] = useState('');
  const [environment, setEnvironment] = useState(null), [matched, setMatched] = useState(null), [queryBusy, setQueryBusy] = useState(false);
  const root = useRef(null), search = useRef(null), request = useRef(0), management = useRef(Promise.resolve()), localRef = useRef(local); localRef.current = local;
  const folder = controlled ?? local.folder ?? '', query = local.query || '', field = local.field || 'both', sort = local.sort || 'date', layout = local.layout || settings.preferences[mode].layout;
  const selected = data.notes.find(n => n.id === local.id), special = Object.hasOwn(filterNames, folder);
  const change = values => setLocal(previous => ({ ...previous, ...values }));
  useEffect(() => { onState?.({ ...local, title: selected?.title }); }, [local, selected?.title]);
  useEffect(() => { if (renameTarget) setRenaming(renameTarget); }, [renameTarget]);
  useEffect(() => { const el = root.current; if (el) el.scrollTop = state.scroll || 0; }, []);
  useEffect(()=>{
    if(!selected || !root.current)return;
    const restored=new WeakSet();
    const restore=()=>{for(const element of root.current?.querySelectorAll('.transcript,.memo-scroll') || []){if(restored.has(element))continue;restored.add(element);element.scrollTop=element.classList.contains('transcript') ? localRef.current.scriptScroll || 0 : localRef.current.memoScroll || 0;}};
    const observer=new MutationObserver(restore);observer.observe(root.current,{childList:true,subtree:true});restore();return()=>observer.disconnect();
  },[selected?.id]);
  useEffect(() => { if (!special && folder && !data.folders.includes(folder) && data.revision != null) { navigate(''); } }, [data.folders.join('|')]);
  useEffect(() => { window.desktop.getTranscriptionEnvironment().then(setEnvironment).catch(() => {}); return window.desktop.onTranscriptionState(setEnvironment); }, []);
  useEffect(() => {
    const token = ++request.current;
    if (!query.trim() || special) { setMatched(null); setQueryBusy(false); return; }
    setQueryBusy(true);
    const timer = setTimeout(() => window.desktop.searchLibrary({ workspace: mode, folder, query, field }).then(ids => { if (token === request.current) { setMatched(ids); setQueryBusy(false); } }).catch(e => { if (token === request.current) { setError(e.message); setQueryBusy(false); } }), 180);
    return () => { clearTimeout(timer); ++request.current; };
  }, [query, field, folder, mode, data.revision]);
  useEffect(() => { if (!addMenu) return; const close = e => { if (!e.target.closest('.empty-space-menu')) setAddMenu(null); }; const keys = e => { if (e.key === 'Escape') setAddMenu(null); }; document.addEventListener('pointerdown', close); document.addEventListener('keydown', keys); return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', keys); }; }, [addMenu]);
  function navigate(next) { change({ folder: next, id: null, query: '', scroll: 0 }); setCreating(false); setRenaming(null); onNavigate?.(next); }
  function open(id) { if (onOpen) onOpen(id); else change({ id }); }
  async function run(task) { if (working) return; setWorking(true); setError(''); try { const result = await task(); await refreshLibrary(mode); return result; } catch(e) { setError(e.message); } finally { setWorking(false); } }
  async function manage(action, ids = [], folders = [], destination = '') {
    const task=management.current.catch(()=>{}).then(()=>window.desktop.manageLibrary({workspace:mode,action,ids,folders,folder:destination}));
    management.current=task;setWorking(true);setError('');
    try { const result=await task;await refreshLibrary(mode);return result; } catch(error){setError(error.message);}finally{if(management.current===task)setWorking(false);}
  }
  async function importPDF() { const result=await run(()=>window.desktop.pdf.import({workspace:mode,folder:special ? '' : folder})); if(result?.note)open(result.note.id); }
  async function newMemo() { const result = await run(() => window.desktop.memos.create(special ? '' : folder, mode)); if (result?.note) open(result.note.id); }
  async function importFiles() {
    if(onImport) { onImport();return; }
    const result=await run(()=>api.importAudio(special ? '' : folder));
    if(!result || result.canceled)return;
    if(result.errors?.length)setError(result.errors.map(item=>`${item.filename}: ${item.message}`).join('\n'));
    if(mode==='live')for(const note of result.notes || [])await run(()=>api.convert(note.id,settings.preferences.live.model));
    else if(result.notes?.length)open(result.notes[0].id);
  }
  async function create(name) { const result = await run(() => api.createFolder(name, special ? '' : folder)); if (!result) throw new Error('폴더를 만들지 못했습니다.'); setCreating(false); }
  async function rename(target, name) { const result = await run(() => target.type === 'folder' ? api.renameFolder(target.id, name) : api.updateNote(target.id, { title: name })); if (!result) throw new Error('이름을 저장하지 못했습니다.'); if (result.renamed?.[folder]) navigate(result.renamed[folder]); setRenaming(null); onRenameEnd?.(); }
  function actions(event, target, context) { event.preventDefault(); event.stopPropagation(); const box = event.currentTarget.getBoundingClientRect(); setMenu({ ...target, trigger: event.currentTarget, x: context ? event.clientX : box.left, y: context ? event.clientY : box.bottom + 4 }); }
  const children = ['recent', 'trash'].includes(folder) ? [] : data.folders.filter(f => parentOf(f, data.folderParents) === (special ? '' : folder)).filter(f => !query || field !== 'content' && folderName(f, data.folderParents).toLocaleLowerCase('ko').includes(query.toLocaleLowerCase('ko')));
  let notes = data.notes.filter(n => (folder === 'trash' ? n.deleted : !n.deleted) && (special || n.folder === folder));
  notes.sort((a,b) => sort === 'title' ? a.title.localeCompare(b.title,'ko') : (b.createdAt || '').localeCompare(a.createdAt || ''));
  if (folder === 'recent') notes = notes.slice(0,5);
  if (query && !special) notes = notes.filter(n => matched?.includes(n.id));
  const items = [...children.map(f => ({ id: 'folder:' + f, title: folderName(f,data.folderParents) })), ...notes];
  const selection = useLibrarySelection({ visible: items, enabled: active && !selected, scope: `${mode}:${folder}:${local.id || ''}`, onMove: (ids, target) => move(ids, target) });
  function split(ids) { return { ids: ids.filter(id => !id.startsWith('folder:')), folders: ids.filter(id => id.startsWith('folder:')).map(id => id.slice(7)) }; }
  async function move(ids, target) { const values = split(ids); if (await manage('move',values.ids,values.folders,target)) selection.clear(); }
  function trash(ids) { const values = split(ids); if (ids.length) setModal({ action:'trash', ...values }); }
  function keys(event) {
    if (!active || event.target.closest('.memo-editor')) return;
    const ctrl = event.ctrlKey || event.metaKey, key = event.key.toLowerCase();
    if (ctrl && key === 'f' && !selected) { event.preventDefault(); event.stopPropagation(); search.current?.focus(); return; }
    if (event.target.closest('input,textarea,[contenteditable=true]') || selected || event.target.closest('[role=menu],.modal')) return;
    if (ctrl && key === 'a') { event.preventDefault(); event.stopPropagation(); selection.selectAll(); }
    if (ctrl && key === 'z') { event.preventDefault(); event.stopPropagation(); manage(event.shiftKey ? 'redo' : 'undo'); }
    if (event.key === 'Delete') { event.preventDefault(); trash(selection.ids); }
  }
  async function dropFiles(event) {
    const files = [...event.dataTransfer.files];
    if (!files.length) return;
    event.preventDefault(); event.stopPropagation();
    if (folder === 'trash' || selected) return;
    for (const file of files) {
      if (!file.name.toLowerCase().endsWith('.pdf')) { setError('PDF 파일을 넣어 주세요. 음성은 불러오기를 사용해 주세요.'); continue; }
      await run(async () => window.desktop.pdf.import({ workspace: mode, folder: special ? '' : folder, name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) }));
    }
  }
  const addItems = close => <><button role="menuitem" onClick={() => { close(); setCreating(true); }}><Icon name="folder"/>폴더</button><div className="action-menu-divider" role="separator"/>{!(mode === 'live' && window.desktop.remote) && <button role="menuitem" onClick={() => { close(); onRecord?.(mode, special ? '' : folder); }}><Icon name="mic"/>새 녹음</button>}<button role="menuitem" onClick={() => { close(); newMemo(); }}><Icon name="file"/>새 메모</button>{!(mode === "live" && window.desktop.remote) && <button role="menuitem" onClick={() => { close(); importFiles(); }}><Icon name="upload"/>불러오기</button>}<button role="menuitem" onClick={() => { close(); importPDF(); }}><Icon name="file"/>PDF 불러오기</button>{mode === 'work' && !window.desktop.remote ? <button role="menuitem" onClick={() => { close(); if(onYouTube)onYouTube(folder);else setModal({action:'youtube'}); }}><Icon name="youtube"/>YouTube 불러오기</button> : null}</>;
  return <div ref={root} className="library-view main" tabIndex={-1} data-library-workspace={mode} onDragOverCapture={event=>{if(event.dataTransfer.types.includes("Files")){event.preventDefault();event.stopPropagation();}}} onDropCapture={dropFiles} onScrollCapture={event => { if(event.target.classList.contains('transcript'))change({scriptScroll:event.target.scrollTop});else if(event.target.classList.contains('memo-scroll'))change({memoScroll:event.target.scrollTop}); }} onKeyDown={keys} onScroll={event => { if (event.target === root.current) change({ scroll: event.currentTarget.scrollTop }); }}>
    {selected ? selected.kind === 'pdf' ? <PdfHost note={selected} mode={mode} onBack={() => change({id:null})} onUpdate={changes => run(() => api.updateNote(selected.id,changes)).then(Boolean)}/> : selected.kind === 'memo' ? <MemoPage note={selected} onBack={() => change({id:null})} onUpdate={changes => run(() => api.updateNote(selected.id,changes)).then(Boolean)}/> : <NoteDetail note={selected} audioHost={mode === 'live' ? 'live' : 'recording'} workspaceActive={active} folders={data.folders} folderParents={data.folderParents} environment={environment} onBack={() => change({id:null})} onUpdate={changes => run(() => api.updateNote(selected.id,changes)).then(Boolean)} onCopy={() => mode === 'live' ? api.copyTranscript(selected.id) : window.desktop.copyTranscript(selected.id)} onExport={(format = 'txt') => window.desktop.exportTranscript({ format,format,title:selected.title,text:serializeTranscript(selected.segments,{time:true,title:selected.title}) })} onCancel={() => window.desktop.cancelTranscription(selected.id)} onConvert={options => window.desktop.startTranscription(selected.id,{workspace:mode,model:options.model})}/> : <section className="content library-page" onContextMenu={event => { if (folder === 'trash' || event.target.closest('button,input,[data-note-id],.inline-name,.memo-editor')) return; event.preventDefault(); setAddMenu({x:Math.max(8,Math.min(event.clientX,innerWidth-250)),y:Math.max(8,Math.min(event.clientY,innerHeight-270))}); }}>
      <div className="heading library-heading"><div className="heading-title">{special ? <h1>{filterNames[folder]}</h1> : <FolderBreadcrumb folder={folder} parents={data.folderParents} onOpen={navigate} editing={renaming?.type === 'folder' && renaming.id === folder} onRename={name => rename(renaming,name)} onCancelRename={() => {setRenaming(null);onRenameEnd?.();}} onStartRename={() => setRenaming({type:'folder',id:folder})} onMenu={(e,c) => actions(e,{type:'folder',id:folder},c)}/>}</div>
        {!special ? <div className="library-search"><Select label="검색 범위" value={field} onChange={value => change({field:value})} options={[{value:'title',label:'제목'},{value:'content',label:'내용'},{value:'both',label:'제목+내용'}]}/><input ref={search} aria-label="현재 폴더 검색" placeholder="현재 폴더에서 찾기" value={query} maxLength={500} onChange={e => change({query:e.target.value})}/>{query ? <button aria-label="검색 해제" onClick={() => change({query:''})}><Icon name="close"/></button> : null}</div> : null}
        <div className="library-actions">{!special ? <button className="secondary" disabled={working} onClick={() => run(async () => { await flushMemos(); return window.desktop.exportFolder({workspace:mode,folder}); })}><Icon name="download"/>폴더 내보내기</button> : null}<Select className="sort-select" label="정렬" value={sort} onChange={value => change({sort:value})} options={[{value:'date',label:'최신순'},{value:'title',label:'이름순'}]}/>{folder === 'trash' ? <div className="trash-actions"><button className="secondary" onClick={selection.selectAll}>모두 선택</button><button className="secondary" disabled={!selection.ids.length || working} onClick={() => run(() => api.restoreTrash(selection.ids)).then(() => selection.clear())}>복구</button><button className="secondary danger" disabled={!selection.ids.length || working} onClick={() => setModal({action:'permanent',ids:selection.ids,folders:[]})}>삭제</button><button className="secondary danger" disabled={!notes.length || working} onClick={() => setModal({action:'permanent',ids:notes.map(n=>n.id),folders:[]})}>모두 비우기</button></div> : <Menu label="새로 추가하기" className="add-menu" trigger={<><Icon name="plus"/><span>새로 추가하기</span><Icon name="chevronDown"/></>}>{addItems}</Menu>}<div className="view-switch" role="group" aria-label="보관함 보기">{[['cards','grid','카드 보기'],['compact','compact','작은 카드 보기'],['list','list','목록 보기']].map(([value,icon,label])=><button key={value} aria-label={label} aria-pressed={layout===value} onClick={()=>change({layout:value})}><Icon name={icon}/></button>)}</div></div>
      </div>
      {loadError || error ? <p className="error-message" role="alert">{loadError || error}</p> : null}{queryBusy ? <p className="hint" role="status">검색 중…</p> : null}
      <div className={`note-collection layout-${layout}`} {...selection.handlers}><div className="folder-collection">{creating ? <FolderCard creating editing name="" onRename={create} onCancelRename={()=>setCreating(false)}/> : null}{children.map(f=><FolderCard key={f} folder={f} itemId={'folder:'+f} selected={selection.ids.includes('folder:'+f)} name={folderName(f,data.folderParents)} onOpen={e=>selection.open(e,{id:'folder:'+f},()=>navigate(f))} editing={renaming?.id===f} onRename={name=>rename({type:'folder',id:f},name)} onCancelRename={()=>{setRenaming(null);onRenameEnd?.();}} onMenu={(e,c)=>actions(e,{type:'folder',id:f},c)}/>)}</div><div className="recording-collection">{layout==='list' && notes.length ? <div className="table-head"><span>기록 제목</span><span>작성 날짜</span><span>녹음 길이</span><span>변환 상태</span><span/></div>:null}{notes.map(n=><NoteCard key={n.id} note={n} layout={layout} selected={selection.ids.includes(n.id)} selectable={folder==='trash'} checked={selection.ids.includes(n.id)} onCheck={value=>selection.toggle(n.id,value)} selectionDisabled={working} editing={renaming?.id===n.id} onRename={name=>rename({type:'note',id:n.id},name)} onCancelRename={()=>{setRenaming(null);onRenameEnd?.();}} onOpen={e=>selection.open(e,n,()=>open(n.id))} onMenu={(e,c)=>actions(e,{type:'note',id:n.id,folder:n.folder,deleted:n.deleted},c)}/>)}</div>{!notes.length && !children.length && !creating ? <div className="empty library-empty"><Icon name="folder"/><h2>{query ? '검색 결과가 없습니다' : folder==='trash' ? '휴지통이 비어 있습니다' : '보관함이 비어 있습니다'}</h2></div>:null}</div>
    </section>}
    {menu ? <ActionMenu target={menu} folders={data.folders} parents={data.folderParents} onClose={()=>setMenu(null)} onRename={target=>setRenaming(target)} onMove={(id,destination)=>manage('move',[id],[],destination)} onTrash={(id,deleted)=>{ if(deleted) trash([id]);else run(()=>api.restoreTrash([id])); }} onDeleteFolder={f=>trash(['folder:'+f])}/> : null}
    {addMenu ? createPortal(<div className="action-menu empty-space-menu" role="menu" aria-label="새로 추가하기" style={{left:addMenu.x,top:addMenu.y}}>{addItems(()=>setAddMenu(null))}</div>,document.body):null}
    {modal?.action === 'youtube' ? <YouTubeDialog folders={data.folders} parents={data.folderParents} initialFolder={special ? '' : folder} environment={environment} onClose={() => setModal(null)} onStarted={() => setModal(null)}/> : null}
    {modal && modal.action !== 'youtube' ? <Modal title={modal.action==='permanent' ? '기록 영구 삭제' : '휴지통으로 이동'} onClose={()=>{if(!working)setModal(null);}}><p className="hint">{modal.ids.length + modal.folders.length}개 항목{modal.folders.length ? '과 하위 기록' : ''}을 {modal.action==='permanent' ? '영구 삭제합니다. 복구할 수 없습니다.' : '휴지통으로 이동할까요?'}</p><div className="conversion-actions"><button className="secondary" disabled={working} onClick={()=>setModal(null)}>취소</button><button className="primary danger" disabled={working} onClick={async()=>{const result=modal.action==='permanent' ? await run(()=>api.deleteTrash(modal.ids)) : await manage('trash',modal.ids,modal.folders);if(result){setModal(null);selection.clear();}}}>{working?'처리 중…':modal.action==='permanent'?'영구 삭제':'휴지통으로 이동'}</button></div>{error?<p role="alert" className="error-message">{error}</p>:null}</Modal>:null}
    {selection.visual}
  </div>;
}
