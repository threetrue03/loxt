import { useEffect, useRef } from 'react';

export default function Modal({ title, onClose, children }) {
  const ref = useRef(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    ref.current.querySelector('input,button,select')?.focus();
    function keydown(event) {
      if (event.target.closest('.unified-menu')) return;
      if (event.key === 'Escape') close.current();
      if (event.key !== 'Tab') return;
      const items = [...ref.current.querySelectorAll('button,input,select')].filter(el => !el.disabled);
      const first = items[0], last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', keydown);
    return () => { document.removeEventListener('keydown', keydown); previous?.focus(); };
  }, []);
  return <div className="overlay" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={ref} className="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
      <div className="dialog-header"><h2 id="dialog-title">{title}</h2><button onClick={onClose} aria-label="닫기">✕</button></div>
      {children}
    </section>
  </div>;
}
