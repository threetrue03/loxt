import { lazy, Suspense, useEffect, useState } from 'react';
import { memoErrors, subscribeMemoErrors } from './memoStore.js';
const MemoEditor = lazy(() => import('./MemoEditor.jsx'));
export default function MemoHost(props) {
  return <Suspense fallback={<div className="memo-loading" role="status">메모를 불러오는 중…</div>}><MemoEditor key={props.id} {...props}/></Suspense>;
}
export function MemoSaveNotice({ onOpen }) {
  const [errors, setErrors] = useState(memoErrors);
  useEffect(() => subscribeMemoErrors(() => setErrors(memoErrors())), []);
  return errors.length ? <div className="memo-save-notice error-message" role="alert">메모를 저장하지 못했습니다. 작성 내용은 앱에서 유지 중입니다.<button className="secondary" onClick={() => onOpen(errors[0].id)}>메모로 돌아가기</button></div> : null;
}
