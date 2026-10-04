import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// Pointer capture keeps selection and dragging alive when the pointer leaves a card.
export default function useLibrarySelection({ visible, enabled, onMove, scope }) {
  const container = useRef(null), gesture = useRef(null), suppress = useRef(false);
  const [ids, setIds] = useState([]), [overlay, setOverlay] = useState(null);
  const selection = useRef(ids); selection.current = ids;
  const move = useRef(onMove); move.current = onMove;
  useEffect(() => { cancel(); setIds([]); }, [scope]);
  useEffect(() => { setIds(previous => previous.filter(id => visible.some(note => note.id === id))); }, [visible.map(note => note.id).join('|')]);
  useEffect(() => () => { clearTimeout(gesture.current?.timer); cancelAnimationFrame(gesture.current?.frame); gesture.current?.target?.classList.remove('drop-target'); }, []);
  function cancel() {
    const item = gesture.current;
    clearTimeout(item?.timer); cancelAnimationFrame(item?.frame); item?.target?.classList.remove('drop-target');
    gesture.current = null; setOverlay(null);
  }
  function down(event) {
    if (!enabled || event.button !== 0 || event.target.closest('input, .inline-name, .note-preview, .more, .folder-card, .table-head, label')) return;
    const card = event.target.closest('[data-note-id]');
    if (!card && event.target.closest('button')) return;
    const host = container.current.closest('.main');
    const item = { x: event.clientX, y: event.clientY, px: event.clientX, py: event.clientY, id: card?.dataset.noteId, mode: card ? 'pending' : 'area', base: event.ctrlKey || event.metaKey ? selection.current : [], target: null, pointer: event.pointerId, host, scrollStart: host.scrollTop };
    gesture.current = item;
    const capture = card ? event.target.closest('.note-open') || card : event.currentTarget;
    capture.setPointerCapture(event.pointerId);
    if (card) item.timer = setTimeout(() => {
      if (gesture.current !== item) return;
      item.mode = 'drag'; item.ids = selection.current.includes(item.id) ? selection.current : [item.id];
      container.current?.setPointerCapture(item.pointer);
      setIds(item.ids); suppress.current = true;
      update(item.px, item.py);
    }, 280);
    else { event.preventDefault(); setIds(item.base); }
    function scroll() {
      if (gesture.current !== item) return;
      const box = host.getBoundingClientRect();
      if (['area', 'drag'].includes(item.mode) && item.px >= box.left && item.px <= box.right && item.py >= box.top && item.py <= box.bottom) {
        const step = item.py < box.top + 32 ? -10 : item.py > box.bottom - 32 ? 10 : 0;
        const previous = host.scrollTop; host.scrollTop += step;
        if (host.scrollTop !== previous) update(item.px, item.py);
      }
      item.frame = requestAnimationFrame(scroll);
    }
    item.frame = requestAnimationFrame(scroll);
  }
  function update(x, y) {
    const item = gesture.current; if (!item) return;
    item.px = x; item.py = y;
    if (item.mode === 'pending') {
      // A normal scroll before the hold threshold must not unexpectedly move a file.
      if (Math.hypot(x - item.x, y - item.y) > 8) { clearTimeout(item.timer); item.mode = 'idle'; }
      return;
    }
    if (item.mode === 'area') {
      const bounds = container.current.getBoundingClientRect();
      const anchorY = item.y - (item.host.scrollTop - item.scrollStart);
      const left = Math.max(bounds.left, Math.min(item.x, x)), top = Math.max(bounds.top, Math.min(anchorY, y));
      const right = Math.min(bounds.right, Math.max(item.x, x)), bottom = Math.min(bounds.bottom, Math.max(anchorY, y));
      const hit = [...container.current.querySelectorAll('[data-note-id]')].filter(card => {
        const box = card.getBoundingClientRect(); return box.left < right && box.right > left && box.top < bottom && box.bottom > top;
      }).map(card => card.dataset.noteId);
      setIds([...new Set([...item.base, ...hit])]);
      const clippedTop = Math.max(top, item.host.getBoundingClientRect().top);
      setOverlay({ mode: 'area', left, top: clippedTop, width: Math.max(0, right - left), height: Math.max(0, Math.min(innerHeight, bottom) - clippedTop) });
      if (Math.hypot(x - item.x, y - item.y) > 4) suppress.current = true;
    } else if (item.mode === 'drag') {
      const target = document.elementFromPoint(x, y)?.closest('[data-folder-drop]');
      if (item.target !== target) { item.target?.classList.remove('drop-target'); target?.classList.add('drop-target'); item.target = target; }
      setOverlay({ mode: 'drag', left: x + 14, top: y + 14, count: item.ids.length, title: visible.find(note => note.id === item.id)?.title });
    }
  }
  function up(event) {
    const item = gesture.current; if (!item) return;
    if (item.mode === 'drag') {
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-folder-drop]');
      if (target && Math.hypot(event.clientX - item.x, event.clientY - item.y) > 5) move.current(item.ids, target.getAttribute('data-folder-drop'));
    }
    cancel();
    // The synthesized click belongs to this gesture, not the next user action.
    setTimeout(() => { suppress.current = false; }, 0);
  }
  function open(event, note, callback) {
    if (event.ctrlKey || event.metaKey || event.shiftKey) {
      event.preventDefault();
      setIds(previous => {
        if (event.shiftKey && previous.length) {
          const start = visible.findIndex(item => item.id === previous.at(-1)), end = visible.findIndex(item => item.id === note.id);
          return [...new Set([...previous, ...visible.slice(Math.min(start, end), Math.max(start, end) + 1).map(item => item.id)])];
        }
        return previous.includes(note.id) ? previous.filter(id => id !== note.id) : [...previous, note.id];
      });
    } else { setIds([]); callback(); }
  }
  const handlers = {
    ref: container, tabIndex: 0,
    onPointerDown: down, onPointerMove: event => update(event.clientX, event.clientY), onPointerUp: up,
    onPointerCancel: cancel,
    onClickCapture: event => { if (suppress.current) { event.preventDefault(); event.stopPropagation(); } },
    onKeyDown: event => {
      if (!enabled || event.target.closest('input,textarea')) return;
      if (event.key === 'Escape') { cancel(); setIds([]); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') { event.preventDefault(); setIds(visible.map(note => note.id)); }
    },
  };
  const visual = overlay ? createPortal(overlay.mode === 'area'
    ? <div className="selection-area" style={overlay} aria-hidden="true"/>
    : <div className="selection-drag" style={{ left: overlay.left, top: overlay.top }} aria-hidden="true">{overlay.count > 1 ? `${overlay.count}개 녹음` : overlay.title}</div>, document.body) : null;
  return { ids, handlers, visual, open, clear: () => setIds([]) };
}
