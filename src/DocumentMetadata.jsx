import Icon from './Icon.jsx';
import PdfProperties from './PdfProperties.jsx';
export default function DocumentMetadata({folder,date,extra}){
 const location=folder||'내 보관함';
 return <><span className="document-meta-inline" title={location}>{location}</span>{date?<span className="document-meta-inline">{date}</span>:null}{extra?<span className="document-meta-inline">{extra}</span>:null}<span className="document-meta-menu"><PdfProperties label="문서 정보" className="document-metadata-popup" trigger={<Icon name="more"/>}><dl><dt>파일 경로</dt><dd>{location}</dd>{date?<><dt>날짜</dt><dd>{date}</dd></>:null}{extra?<><dt>문서</dt><dd>{extra}</dd></>:null}</dl></PdfProperties></span></>;
}
