import { useRef, useState } from 'react';
export default function ResizableDocuments({ open, children }) {
  const host = useRef(null), [width, setWidth] = useState(40), [dragging, setDragging] = useState(false);
  function move(event) {
    if (!dragging) return;
    const box = host.current.getBoundingClientRect();
    setWidth(Math.max(25, Math.min(70, (box.right - event.clientX) / box.width * 100)));
  }
  const [script, memo] = children;
  return <div ref={host} className={`detail-documents resizable-documents ${open ? 'memo-open' : ''} ${dragging ? 'is-resizing' : ''}`} style={{ '--memo-width': `${width}%` }}>
    {script}<div className="document-resizer" role="separator" aria-label="스크립트와 메모 너비" aria-orientation="vertical" aria-valuenow={width} aria-valuemin={25} aria-valuemax={70} tabIndex={open ? 0 : -1} onPointerDown={event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); setDragging(true); }} onPointerMove={move} onPointerUp={() => setDragging(false)} onPointerCancel={() => setDragging(false)} onKeyDown={event => { if (['ArrowLeft','ArrowRight'].includes(event.key)) { event.preventDefault(); setWidth(value => Math.max(25, Math.min(70, value + (event.key === 'ArrowLeft' ? 2 : -2)))); } }}/>{memo}
  </div>;
}
