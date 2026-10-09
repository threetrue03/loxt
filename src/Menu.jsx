import {menuKey} from './useMenuKeyboard.js';
import { DialogContext } from './DialogContext.js';
import { useContext, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export default function Menu({ label, trigger, children, className = '', disabled = false, upward = false, shortcut }) {
  const dialog = useContext(DialogContext);
  const [open, setOpen] = useState(false);
  const root = useRef(null), button = useRef(null), panel = useRef(null);
  useLayoutEffect(() => {
    if (!open) return;
    const popup = panel.current;
    const place = () => {
      if (!button.current || !popup?.isConnected) return;
      const anchor = button.current.getBoundingClientRect();
      if (className.includes('custom-select')) popup.style.width = `${Math.min(innerWidth - 16, Math.max(180, Math.min(320, anchor.width)))}px`;
      const box = popup.getBoundingClientRect();
      popup.style.left = `${Math.max(8, Math.min(anchor.left, innerWidth - box.width - 8))}px`;
      const below = anchor.bottom + 6, above = anchor.top - box.height - 6;
      popup.style.top = `${Math.max(8, Math.min((upward || below + box.height > innerHeight - 8) && above >= 8 ? above : below, innerHeight - box.height - 8))}px`;
    };
    function outside(event) { if (root.current && !root.current.contains(event.target) && !popup.contains(event.target)) setOpen(false); }
    function keys(event) {
      const numeric=popup.querySelector(`[data-shortcut-key="${event.key}"]`);if(numeric&&!event.altKey){event.preventDefault();event.stopPropagation();numeric.click();return;}
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); button.current.focus(); return; }
      if (event.key === 'Tab') {
        setOpen(false);
        if (dialog?.current) {
          event.preventDefault();
          const items = [...dialog.current.querySelectorAll('button,input,select,[tabindex="0"]')].filter(item => !item.disabled && !popup.contains(item) && item.getClientRects().length);
          const index = items.indexOf(button.current);
          items[(index + (event.shiftKey ? -1 : 1) + items.length) % items.length]?.focus();
        } else button.current?.focus();
        return;
      }
      menuKey(event,popup,()=>setOpen(false),()=>button.current?.focus());
    }
    place(); const observer = new ResizeObserver(place); observer.observe(popup);
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', keys); window.addEventListener('resize', place);
    popup.querySelector('[aria-checked="true"], [role^="menuitem"]')?.focus();
    return () => { observer.disconnect(); document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', keys); window.removeEventListener('resize', place); };
  }, [open, upward]);
  function close() { setOpen(false); button.current?.focus(); }
  return <div ref={root} className={`menu-control ${className} ${upward ? 'menu-up' : ''}`}><button ref={button} className="menu-trigger" type="button" aria-label={label} title={shortcut?`${label} · ${shortcut}`:label} aria-haspopup="menu" aria-expanded={open} disabled={disabled} onClick={() => setOpen(value => !value)} onKeyDown={event => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); } }}>{trigger}</button>{open ? createPortal(<div ref={panel} className={`menu-popover unified-menu ${className}`} role="menu" aria-label={label}>{children(close)}</div>, root.current?.closest('.document-fullscreen') || dialog?.current || document.body) : null}</div>;
}
