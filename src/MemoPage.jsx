import useDocumentTitle from './useDocumentTitle.js';
import MemoHost from './MemoHost.jsx';
export default function MemoPage({ note, onUpdate, onBack }) {
  const {title,setTitle,saveTitle,error}=useDocumentTitle(note,onUpdate);
  return <section className="content workspace memo-workspace">{error ? <p className="error-message" role="alert">{error}</p> : null}<div className="memo-document"><MemoHost id={note.id} title={title || note.title} readOnly={note.deleted} onBack={onBack} documentHeader={<div className="document-identity"><input value={title} readOnly={note.deleted} maxLength={120} aria-label="메모 제목 변경" onChange={event=>setTitle(event.target.value)} onBlur={saveTitle} onKeyDown={event=>{if(event.key==='Enter')event.currentTarget.blur();}}/><span title={note.folder||'내 보관함'}>{note.folder||'내 보관함'}</span><span>{note.date}</span><span>메모</span></div>}/></div></section>;
}
