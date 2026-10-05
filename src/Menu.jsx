import { DialogContext } from './DialogContext.js';
import { useContext, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export default function Menu({ label, trigger, children, className = '', disabled = false, upward = false }) {
  const dialog = useContext(DialogContext);
  const [open, setOpen] = useState(false);
  const root = useRef(null), button = useRef(null), panel = useRef(null);
  useLayoutEffect(() => {
    if (!open) return;
    const popup = panel.current;
    const place = () => {
      const anchor = button.current.getBoundingClientRect();
      if (className.includes('custom-select')) popup.style.width = `${Math.min(innerWidth - 16, Math.max(180, Math.min(320, anchor.width)))}px`;
      const box = popup.getBoundingClientRect();
      popup.style.left = `${Math.max(8, Math.min(anchor.left, innerWidth - box.width - 8))}px`;
      const below = anchor.bottom + 6, above = anchor.top - box.height - 6;
      popup.style.top = `${Math.max(8, Math.min((upward || below + box.height > innerHeight - 8) && above >= 8 ? above : below, innerHeight - box.height - 8))}px`;
    };
    function outside(event) { if (!root.current.contains(event.target) && !popup.contains(event.target)) setOpen(false); }
    function keys(event) {
      if (event.key === 'Escape') { event.preventDefault(); setOpen(false); button.current.focus(); }
      if (event.key === 'Tab') {
        setOpen(false);
        if (dialog?.current) {
          event.preventDefault();
          const items = [...dialog.current.querySelectorAll('button,input,select,[tabindex="0"]')].filter(item => !item.disabled && !popup.contains(item) && item.getClientRects().length);
          const index = items.indexOf(button.current);
          items[(index + (event.shiftKey ? -1 : 1) + items.length) % items.length]?.focus();
        } else button.current?.focus();
      }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      const items = [...popup.querySelectorAll('[role^="menuitem"]')].filter(item => !item.disabled);
      if (!items.length) return;
      event.preventDefault();
      const index = items.indexOf(document.activeElement);
      items[event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length].focus();
    }
    place(); const observer = new ResizeObserver(place); observer.observe(popup);
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', keys); window.addEventListener('resize', place);
    popup.querySelector('[aria-checked="true"], [role^="menuitem"]')?.focus();
    return () => { observer.disconnect(); document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', keys); window.removeEventListener('resize', place); };
  }, [open, upward]);
  function close() { setOpen(false); button.current?.focus(); }
  return <div ref={root} className={`menu-control ${className} ${upward ? 'menu-up' : ''}`}><button ref={button} className="menu-trigger" type="button" aria-label={label} aria-haspopup="menu" aria-expanded={open} disabled={disabled} onClick={() => setOpen(value => !value)} onKeyDown={event => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); } }}>{trigger}</button>{open ? createPortal(<div ref={panel} className={`menu-popover unified-menu ${className}`} role="menu" aria-label={label}>{children(close)}</div>, dialog?.current || document.body) : null}</div>;
}
