import { useEffect, useState } from 'react';
import MemoHost from './MemoHost.jsx';
export default function MemoPage({ note, onUpdate, onBack }) {
  const [title, setTitle] = useState(note.title), [error, setError] = useState('');
  useEffect(() => { setTitle(note.title); setError(''); }, [note.id]);
  const saveTitle = async () => {
    const value = title.trim() || note.title;
    if (value === note.title) { setTitle(value); return; }
    if (!(await onUpdate({ title: value }))) { setTitle(note.title); setError('제목을 저장하지 못했습니다. 다시 시도해 주세요.'); }
  };
  return <section className="content workspace memo-workspace"><div className="heading workspace-heading"><button className="back" onClick={onBack}>← 보관함</button><div className="workspace-title"><div className="detail-title memo-title"><input value={title} readOnly={note.deleted} maxLength={120} aria-label="메모 제목 변경" onChange={event => setTitle(event.target.value)} onBlur={saveTitle} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }}/></div><div className="detail-meta">{note.folder || '내 보관함'}　 /　 {note.date}　 /　 메모</div></div></div>{error ? <p className="error-message" role="alert">{error}</p> : null}<div className="memo-document"><MemoHost id={note.id} title={title || note.title} readOnly={note.deleted}/></div></section>;
}
