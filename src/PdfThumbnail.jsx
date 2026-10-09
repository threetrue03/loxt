import { useEffect, useRef, useState } from 'react';
import PdfInkObject from './PdfInkObject.jsx';

// Render only visible previews, releasing the canvas when the drawer closes.
export default function PdfThumbnail({ pdf, number, active, open, onOpen, objects = [] }) {
  const root = useRef(null), canvas = useRef(null);
  const [visible, setVisible] = useState(false), [viewport, setViewport] = useState(null);
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { root: root.current.parentElement, rootMargin: '100px' });
    observer.observe(root.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!open || !visible) return;
    let canceled = false, render;
    pdf.getPage(number).then(page => {
      if (canceled) return;
      const viewport = page.getViewport({ scale: 72 / page.getViewport({ scale: 1 }).width });
      setViewport(viewport);
      canvas.current.width = Math.ceil(viewport.width);
      canvas.current.height = Math.ceil(viewport.height);
      render = page.render({ canvasContext: canvas.current.getContext('2d'), viewport });
      return render.promise;
    }).catch(() => {});
    return () => { canceled = true; render?.cancel(); };
  }, [pdf, number, open, visible]);
  return <button ref={root} aria-label={`${number}페이지`} aria-current={active ? 'page' : undefined} onClick={onOpen}><div className="pdf-thumbnail-sheet"><canvas ref={canvas}/>{viewport&&visible&&open&&objects.length?<svg aria-hidden="true" width={viewport.width} height={viewport.height}>{objects.map(o=><PdfInkObject key={o.id} object={o} viewport={viewport}/>)}</svg>:null}</div><span>{number}</span></button>;
}
