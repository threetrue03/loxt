import Icon from './Icon.jsx';
import InlineName from './InlineName.jsx';
import { formatTime } from './data.js';

export default function NoteCard({ note, selected, onOpen, onMenu, editing, onRename, onCancelRename, selectable, checked, onCheck, selectionDisabled }) {
  const status = note.status === 'queued' ? '대기 중' : note.status === 'transcribing' ? '변환 중' : note.status === 'failed' ? '변환 실패' : note.status === 'cancelled' ? '취소됨' : note.done ? '변환 완료' : '변환 대기';
  const tone = note.status === 'failed' ? 'failed' : ['queued', 'transcribing'].includes(note.status) ? 'working' : note.done ? 'done' : 'wait';
  const OpenTag = editing ? 'div' : 'button';
  return <article data-note-id={note.id} className={`row note-card ${note.done ? 'transcribed' : 'untranscribed'} ${selected ? 'is-selected' : ''}`} onClick={event => { if (!editing && !event.target.closest('button,input,label,.note-preview,.inline-name')) onOpen(event); }} onContextMenu={event => onMenu(event, true)} onKeyDown={event => { if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) onMenu(event, false); }}>
    {selectable ? <label className="note-selection" onContextMenu={event => event.stopPropagation()}><input type="checkbox" aria-label={`${note.title} 선택`} checked={checked} disabled={selectionDisabled} onChange={event => onCheck(event.target.checked)}/></label> : null}
    <div className="note">
    <OpenTag className="note-open" onClick={editing ? undefined : onOpen} aria-label={editing ? undefined : `${note.title} 열기`}>
      <div className="file-icon"><Icon name={note.done ? 'file' : 'mic'}/></div>
      <div className="note-summary">
        <div className="note-title">{editing ? <InlineName value={note.title} label="녹음 이름 바꾸기" onSave={onRename} onCancel={onCancelRename}/> : note.title}</div>
        <div className="note-folder"><Icon name="folder"/><span>{note.folder || '내 보관함'}</span>{note.recovered ? <span className="recovered-label">복구된 녹음</span> : null}</div>
      </div>
    </OpenTag>
      <div className="note-preview" role="region" aria-label={`${note.title} 스크립트 미리보기`} tabIndex={note.segments.length ? 0 : undefined}>
        {!['queued','transcribing'].includes(note.status) && note.segments.length ? note.segments.map((segment, i) => <div className="preview-segment" key={i}><span>{formatTime(segment.start)}</span><p>{segment.text}</p></div>) : <div className="preview-empty"><Icon name="mic"/><strong>{note.done ? '인식된 음성이 없습니다' : '음성을 기록했습니다'}</strong><p>{note.done ? '원본 녹음을 재생해 확인하세요.' : '변환하면 이곳에 내용이 표시됩니다.'}</p></div>}
      </div>
    </div>
    <span className="cell date">{note.date}</span>
    <span className="cell duration"><Icon name="clock"/>{note.duration}</span>
    <span className={`status ${tone}`}>{status}</span>
    <button className="more" aria-label={`${note.title} 관리`} aria-haspopup="menu" onClick={event => onMenu(event, false)}><Icon name="more"/></button>
  </article>;
}
