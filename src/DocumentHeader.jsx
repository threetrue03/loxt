import Icon from './Icon.jsx';
import DocumentMetadata from './DocumentMetadata.jsx';
export default function DocumentHeader({onBack,status,title,onTitle,onSave,readOnly,folder,date,extra,label='문서 제목'}){
 return <div className="document-toolbar recording-document-toolbar"><button className="document-back" aria-label="보관함으로 돌아가기" title="보관함으로 돌아가기" onClick={async()=>{if(await onSave?.()!==false)onBack();}}><Icon name="back"/></button><span className="memo-save-status" role="status">{status}</span><div className="document-identity"><input aria-label={label} value={title} maxLength={120} readOnly={readOnly} onChange={event=>onTitle(event.target.value)} onBlur={onSave} onKeyDown={event=>{if(event.key==='Enter')event.currentTarget.blur();}}/><DocumentMetadata folder={folder} date={date} extra={extra}/></div></div>;
}
