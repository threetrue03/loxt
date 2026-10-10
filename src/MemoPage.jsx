import useDocumentTitle from './useDocumentTitle.js';
import DocumentMetadata from './DocumentMetadata.jsx';
import MemoHost from './MemoHost.jsx';
export default function MemoPage({ note, onUpdate, onBack }) {
  const {title,setTitle,saveTitle,error,status:titleStatus}=useDocumentTitle(note,onUpdate);
  return <section className="content workspace memo-workspace">{error ? <p className="error-message" role="alert">{error}<button className="secondary" onClick={saveTitle}>제목 저장 재시도</button></p> : null}<div className="memo-document"><MemoHost titleStatus={titleStatus} id={note.id} title={title || note.title} readOnly={note.deleted} onBack={async()=>{if(await saveTitle()!==false)onBack();}} documentHeader={<div className="document-identity"><input value={title} readOnly={note.deleted} maxLength={120} aria-label="메모 제목 변경" onChange={event=>setTitle(event.target.value)} onBlur={saveTitle} onKeyDown={event=>{if(event.key==='Enter')event.currentTarget.blur();}}/><DocumentMetadata folder={note.folder} date={note.date} extra="메모"/></div>}/></div></section>;
}
