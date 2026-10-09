import {getFullNote} from './useFullNote.js';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import InlineName from './InlineName.jsx';
import { formatTime } from './data.js';

export default function NoteCard({ note, selected, onOpen, onMenu, editing, onRename, onCancelRename, selectable, checked, onCheck, selectionDisabled, layout = 'cards' }) {
  const root = useRef(null), previewState = useRef({ limit: 0, top: 0 }), focusPending = useRef(false);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(entries => {
      const shown = entries.some(entry => entry.isIntersecting);
      const selection = window.getSelection();
      if (!shown && (root.current.contains(document.activeElement) || root.current.contains(selection?.anchorNode))) return;
      setInView(shown);
    }, { rootMargin: '240px' });
    observer.observe(root.current); return () => observer.disconnect();
  }, []);
  const rendered = inView || editing;
  useLayoutEffect(() => { if (rendered && focusPending.current) { focusPending.current = false; root.current.querySelector('.note-open')?.focus(); } }, [rendered]);
  const status = note.kind === 'audio' ? '녹음 원본' : note.audioMissing ? '스크립트' : note.kind === 'pdf' ? 'PDF' : note.kind === 'memo' ? '메모' : note.status === 'queued' ? '대기 중' : note.status === 'transcribing' ? '변환 중' : note.status === 'failed' ? '변환 실패' : note.status === 'partial' ? '화자 분석 실패' : note.status === 'cancelled' ? '취소됨' : note.done ? '변환 완료' : '변환 대기';
  const tone = note.status === 'failed' ? 'failed' : ['queued', 'transcribing'].includes(note.status) ? 'working' : note.done ? 'done' : 'wait';
  const OpenTag = editing ? 'div' : 'button';
  return <article ref={root} tabIndex={rendered ? undefined : 0} aria-label={note.title} onFocus={event => { if (event.target === root.current) { focusPending.current = true; setInView(true); } }} data-note-id={note.id} className={`row note-card ${note.done ? 'transcribed' : 'untranscribed'} ${selected ? 'is-selected' : ''}`} onClick={event => { if (!editing && !event.target.closest('button,input,label,.note-preview,.inline-name')) onOpen(event); }} onContextMenu={event => onMenu(event, true)} onKeyDown={event => { if (event.target === root.current && ['Enter',' '].includes(event.key) && !editing) { event.preventDefault(); onOpen(event); } if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) onMenu(event, false); }}>
    {rendered ? <>
    {selectable ? <label className="note-selection" onContextMenu={event => event.stopPropagation()}><input type="checkbox" aria-label={`${note.title} 선택`} checked={checked} disabled={selectionDisabled} onChange={event => onCheck(event.target.checked)}/></label> : null}
    <div className="note">
    <OpenTag className="note-open" onClick={editing ? undefined : onOpen} aria-label={editing ? undefined : `${note.title} 열기`}>
      <div className="file-icon"><Icon name={note.documentType==='drawing'?'pen':note.done?'file':'mic'}/></div>
      <div className="note-summary">
        <div className="note-title">{editing ? <InlineName value={note.title} label={note.kind === 'memo' ? '메모 이름 바꾸기' : '녹음 이름 바꾸기'} onSave={onRename} onCancel={onCancelRename}/> : note.title}</div>
        <div className="note-folder"><Icon name="folder"/><span>{note.folder || '내 보관함'}</span>{note.kind==='audio'?<span>녹음 원본만</span>:null}{note.recovered ? <span className="recovered-label">복구된 녹음</span> : null}</div>
      </div>
    </OpenTag>
      {layout !== 'list' ? <ScriptPreview note={note} saved={previewState}/> : null}
    </div>
    <span className="cell date">{note.date}</span>
    <span className="cell duration">{note.kind === 'pdf' ? `${note.pages}쪽` : note.kind === 'memo' ? '—' : <><Icon name="clock"/>{note.duration}</>}</span>
    {layout === 'list' || (note.kind !== 'memo' && !note.done) || ['failed','partial','queued','transcribing'].includes(note.status) ? <span className={`status ${tone}`}>{status}</span> : null}
    <button className="more" aria-label={`${note.title} 관리`} aria-haspopup="menu" onClick={event => onMenu(event, false)}><Icon name="more"/></button>
    </> : null}
  </article>;
}

function ScriptPreview({ note, saved }) {
  const region = useRef(null);
  const [limit, setLimit] = useState(saved.current.limit);
  useEffect(() => {
    region.current.scrollTop = saved.current.top;
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { setLimit(value => Math.max(value, 8)); observer.disconnect(); } }, { rootMargin: '160px' });
    observer.observe(region.current); return () => observer.disconnect();
  }, []);
  useEffect(() => { saved.current.limit = limit; }, [limit]);
  const [full,setFull]=useState(null),[loading,setLoading]=useState(false),[error,setError]=useState('');
  const segments = full?.id===note.id&&full.updatedRevision===note.updatedRevision?full.segments:note.segments||[];
  async function more(){if(loading)return;if(note._summary&&segments.length<(note.segmentCount||0)){setLoading(true);try{setFull(await getFullNote(note,region.current.closest('[data-workspace]')?.dataset.workspace||'work'));setLimit(v=>v+12);}catch(e){setError(e.message);}finally{setLoading(false);}}else setLimit(value=>Math.min(segments.length,value+12));}
  return <div ref={region} className="note-preview" role="region" aria-label={`${note.title} ${note.kind === 'memo' ? '메모' : '스크립트'} 미리보기`} tabIndex={note.kind === 'memo' || segments.length ? 0 : undefined} onFocus={() => setLimit(value => Math.max(value, 8))} onScroll={event => { const element = event.currentTarget; saved.current.top = element.scrollTop; if (element.scrollHeight - element.scrollTop - element.clientHeight < 60) more(); }}>
    {note.kind === 'pdf' ? <p className="memo-preview">{note.pdfPreview || `PDF · ${note.pages}쪽`}</p> : note.kind === 'memo' ? <p className="memo-preview">{note.memoPreview || '메모를 열어 내용을 작성하세요.'}</p> : !['queued','transcribing'].includes(note.status) && segments.length ? <>{segments.slice(0, limit).map((segment, i) => <div className="preview-segment" key={i}><span>{formatTime(segment.start)}</span><p>{segment.text}</p></div>)}{limit < (note.segmentCount||segments.length) ? <button className="preview-more secondary" disabled={loading} onClick={more}>{loading?"불러오는 중…":"스크립트 더 보기"}</button> : null}{error?<p role="alert">{error}</p>:null}</> : <div className="preview-empty"><Icon name="mic"/><strong>{note.done ? '인식된 음성이 없습니다' : '음성을 기록했습니다'}</strong><p>{note.done ? '원본 녹음을 재생해 확인하세요.' : '변환하면 이곳에 내용이 표시됩니다.'}</p></div>}
  </div>;
}
