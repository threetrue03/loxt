import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { blockElement, memoOutline } from './memoNavigation.js';

export default function MemoOutline({ blocks, root, scroll, onClose, id, closing = false }) {
  const candidate = useMemo(() => memoOutline(blocks), [blocks]);
  const signature = JSON.stringify(candidate.flat.map(item => [item.id, item.level, item.title, item.parents]));
  // Body typing does not replace the tree or reconnect heading observers.
  const { roots, flat } = useMemo(() => candidate, [signature]);
  const [collapsed, setCollapsed] = useState(new Set()), [current, setCurrent] = useState(''), [narrow, setNarrow] = useState(true), [notice, setNotice] = useState('');
  const close = useRef(null);
  useEffect(() => { if (!closing) close.current?.focus(); }, [closing]);
  useEffect(() => { const size = new ResizeObserver(() => setNarrow(root.current.clientWidth < 680)); size.observe(root.current); setNarrow(root.current.clientWidth < 680); return () => size.disconnect(); }, [root]);
  useEffect(() => {
    const observer = new IntersectionObserver(entries => { const shown = entries.filter(entry => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top); if (shown.length) setCurrent(shown[0].target.closest('[data-id]')?.getAttribute('data-id') || ''); }, { root: scroll.current, rootMargin: '0px 0px -65% 0px' });
    const headings = new Map([...root.current.querySelectorAll('.bn-editor h1,.bn-editor h2,.bn-editor h3,.bn-editor h4')].map(element => [element.closest('[data-id]')?.getAttribute('data-id'), element]));
    for (const item of flat) { const element = headings.get(item.id); if (element) observer.observe(element); }
    return () => observer.disconnect();
  }, [flat, root, scroll]);
  function jump(item) {
    const editorRoot = root.current.querySelector('.bn-editor');
    for (const parentId of item.parents) {
      const parent = blockElement(editorRoot, parentId);
      const toggle = [...parent?.querySelectorAll('.bn-toggle-wrapper[data-show-children="false"]') || []].find(element => element.closest('[data-id]')?.getAttribute('data-id') === parentId);
      toggle?.querySelector('.bn-toggle-button')?.click();
    }
    const target = blockElement(editorRoot, item.id)?.querySelector('h1,h2,h3,h4');
    if (!target) { setNotice('제목이 변경되었습니다. 최신 목차를 확인해 주세요.'); return; }
    setNotice(''); setCurrent(item.id);
    const top = target.getBoundingClientRect().top - scroll.current.getBoundingClientRect().top + scroll.current.scrollTop;
    scroll.current.scrollTo({ top: Math.max(0, top - 16), behavior: 'auto' });
    target.setAttribute('tabindex', '-1'); target.focus({ preventScroll: true });
    if (narrow) onClose(false);
  }
  function tree(items) { return <ul>{items.map(item => <li key={item.id}><div className="memo-outline-row">{item.children.length ? <button className="memo-outline-disclosure" aria-label={`${item.title} ${collapsed.has(item.id) ? '펼치기' : '접기'}`} aria-expanded={!collapsed.has(item.id)} onClick={() => setCollapsed(previous => { const next = new Set(previous); next.has(item.id) ? next.delete(item.id) : next.add(item.id); return next; })}><Icon name={collapsed.has(item.id) ? 'chevronRight' : 'chevronDown'}/></button> : <span className="memo-outline-disclosure"/>}<button className="memo-outline-title" title={item.title} aria-current={current === item.id ? 'location' : undefined} onClick={() => jump(item)}>{item.title}</button></div>{item.children.length && !collapsed.has(item.id) ? tree(item.children) : null}</li>)}</ul>; }
  return <aside id={id} inert={closing || undefined} className={`memo-outline ${narrow ? 'memo-outline-overlay' : ''} ${closing ? 'memo-outline-closing' : ''}`} aria-label="메모 목차" onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); } }}><div className="memo-outline-heading"><strong>목차</strong><button ref={close} aria-label="목차 닫기" onClick={() => onClose()}><Icon name="close"/></button></div><nav aria-label="메모 제목 목록">{flat.length ? tree(roots) : <p className="hint">제목을 추가하면 목차가 표시됩니다.</p>}</nav>{notice ? <p className="hint" role="status">{notice}</p> : null}</aside>;
}
