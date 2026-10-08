import { lazy, Suspense } from 'react';
const PdfPage=lazy(()=>import('./PdfPage.jsx'));
export default function PdfHost(props){return <Suspense fallback={<div className="empty" role="status">PDF를 불러오는 중…</div>}><PdfPage key={`${props.mode}:${props.note.id}`} {...props}/></Suspense>;}
