import { useEffect, useRef, useState } from 'react';

// Render only visible previews, releasing the canvas when the drawer closes.
export default function PdfThumbnail({ pdf, number, active, open, onOpen }) {
  const root = useRef(null), canvas = useRef(null);
  const [visible, setVisible] = useState(false);
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
      canvas.current.width = Math.ceil(viewport.width);
      canvas.current.height = Math.ceil(viewport.height);
      render = page.render({ canvasContext: canvas.current.getContext('2d'), viewport });
      return render.promise;
    }).catch(() => {});
    return () => { canceled = true; render?.cancel(); };
  }, [pdf, number, open, visible]);
  return <button ref={root} aria-label={`${number}페이지`} aria-current={active ? 'page' : undefined} onClick={onOpen}><canvas ref={canvas}/><span>{number}</span></button>;
}
