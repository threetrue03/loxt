import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon.jsx';
import {cleanError} from './SettingsProvider.jsx';
import { parentOf, folderName } from './FolderTree.jsx';
import {fileType} from '../shared/file-type.js';

function FolderPicker({ folders, parents, selected, onSelect }) {
  const initial = []; for (let node = selected; node && !initial.includes(node); node = parentOf(node, parents)) initial.push(node);
  const [expanded, setExpanded] = useState(initial);
  function branch(parent, depth = 0) {
    if (depth > 16) return null;
    return folders.filter(folder => parentOf(folder, parents) === parent).map(folder => {
      const children = folders.some(child => parentOf(child, parents) === folder), open = expanded.includes(folder);
      const toggle = () => setExpanded(value => open ? value.filter(item => item !== folder) : [...value, folder]);
      return <div role="treeitem" key={folder} tabIndex="0" aria-label={`${folder}로 이동`} aria-selected={selected === folder} aria-expanded={children ? open : undefined} onKeyDown={event => { if (event.target !== event.currentTarget) return; if (event.key === 'ArrowRight' && children && !open) { event.preventDefault(); toggle(); } if (event.key === 'ArrowLeft' && children && open) { event.preventDefault(); toggle(); } if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(folder); } }}><div className="move-folder-row" style={{ paddingLeft: depth * 12 }}><button className="move-disclosure" tabIndex="-1" aria-label={`${folderName(folder, parents)} ${open ? '접기' : '펼치기'}`} disabled={!children} onClick={toggle}><Icon name={open ? 'chevronDown' : 'chevronRight'}/></button><button className="move-folder-choice" tabIndex="-1" title={folder} onClick={() => onSelect(folder)}><Icon name="folder"/><span>{folderName(folder, parents)}</span>{selected === folder ? <span>✓</span> : null}</button></div>{children && open ? <div role="group">{branch(folder, depth + 1)}</div> : null}</div>;
    });
  }
  return <div className="move-folder-tree" role="tree" aria-label="이동할 폴더"><div role="treeitem" aria-selected={selected === ''} tabIndex="0" aria-label="폴더 지정 해제" onClick={() => onSelect('')} onKeyDown={event => { if (['Enter', ' '].includes(event.key)) { event.preventDefault(); onSelect(''); } }} className="move-root"><Icon name="folder"/>폴더 지정 해제{selected === '' ? ' ✓' : ''}</div>{branch('')}</div>;
}

export default function ActionMenu({ target, folders, parents, onClose, onRename, onMove, onTrash, onDeleteFolder }) {
  const root = useRef(null), sub = useRef(null), moveButton = useRef(null), [moving, setMoving] = useState(false), [pending, setPending] = useState(false), [error, setError] = useState(''),[details,setDetails]=useState(''),retry=useRef(null);
  useLayoutEffect(() => {
    if (!moving) return;
    const panel = sub.current;
    const place = () => { const anchor = moveButton.current.getBoundingClientRect(), parent = root.current.getBoundingClientRect(), box = panel.getBoundingClientRect(); panel.style.left = `${Math.max(8, Math.min(parent.right + box.width + 6 <= innerWidth - 8 ? parent.right + 6 : parent.left - box.width - 6, innerWidth - box.width - 8))}px`; panel.style.top = `${Math.max(8, Math.min(anchor.top, innerHeight - box.height - 8))}px`; };
    place(); const observer = new ResizeObserver(place); observer.observe(panel); panel.querySelector('[role="treeitem"]')?.focus();
    window.addEventListener('resize', place); return () => { observer.disconnect(); window.removeEventListener('resize', place); };
  }, [moving]);
  useLayoutEffect(() => {
    const panel = root.current;
    const place = () => { const box = panel.getBoundingClientRect(); panel.style.left = `${Math.max(8, Math.min(target.x, innerWidth - box.width - 8))}px`; panel.style.top = `${Math.max(8, Math.min(target.y, innerHeight - box.height - 8))}px`; };
    const observer = new ResizeObserver(place); observer.observe(panel); place();
    if (!moving && !panel.contains(document.activeElement)) panel.querySelector('[role="menuitem"]')?.focus();
    const outside = event => { if (!panel.contains(event.target) && !sub.current?.contains(event.target) && !(target.trigger?.matches('button.more') && target.trigger.contains(event.target))) onClose(); };
    const key = event => {
      if (event.key === 'Escape') { event.preventDefault(); if (moving) { setMoving(false); moveButton.current?.focus(); } else { onClose(); target.trigger?.focus(); } }
      if (event.key === 'ArrowRight' && document.activeElement === moveButton.current) { event.preventDefault(); setMoving(true); }
      if (event.key === 'ArrowLeft' && document.activeElement?.closest('.action-submenu') && !document.activeElement.hasAttribute('aria-expanded')) { event.preventDefault(); setMoving(false); moveButton.current?.focus(); }
      if (event.key === 'Tab') onClose();
      if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
      const items = [...(moving && sub.current ? sub.current : panel).querySelectorAll('[role="menuitem"],[role="treeitem"]')].filter(item => !item.disabled);
      event.preventDefault(); const index = items.indexOf(document.activeElement);
      items[event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length]?.focus();
    };
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', key); window.addEventListener('resize', place);
    return () => { observer.disconnect(); document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', key); window.removeEventListener('resize', place); };
  }, [target, onClose, moving]);
  async function action(work) {
    if (pending) return; setPending(true); setError('');
    retry.current=work;
    try { await work(); onClose(); } catch (error) { setError(cleanError(error));setDetails(error.message); } finally { setPending(false); }
  }
  const count=target.ids?.length || 1, plural=count>1,type=fileType(target),folderTrash=target.note?.kind==='folder';
  return createPortal(<><div ref={root} className="action-menu" role="menu" aria-label={`${type.label} 메뉴`} onContextMenu={event => event.preventDefault()} style={{ left: target.x, top: target.y }}><button role="menuitem" disabled={pending || plural || folderTrash} onClick={() => { onClose(); onRename(target); }}><Icon name="edit"/>이름 바꾸기</button>{target.type === 'note' || target.type === 'folder' || plural ? <><button ref={moveButton} role="menuitem" aria-haspopup="menu" aria-expanded={moving} disabled={pending || target.deleted} onClick={() => setMoving(value => !value)}><Icon name="folder"/>{plural ? `선택한 ${count}개 항목 이동` : "폴더 이동하기"}<Icon name="chevronRight"/></button><div className="action-menu-divider"/><button role="menuitem" disabled={pending} onClick={() => action(() => onTrash(target.id, !target.deleted))}><Icon name="trash"/>{target.deleted ? plural ? `선택한 ${count}개 항목 복원` : '복원' : plural ? `선택한 ${count}개 항목을 휴지통으로 이동` : '휴지통으로 이동'}</button></> : <><div className="action-menu-divider"/><button role="menuitem" className="danger" onClick={() => { onClose(); onDeleteFolder(target.id); }}><Icon name="trash"/>폴더 삭제</button></>}{error ? <div className="action-menu-error" role="alert"><p>{error}</p><button className="secondary" disabled={pending} onClick={()=>action(retry.current)}>다시 시도</button>{details!==error?<details><summary>오류 상세</summary><p>{details}</p></details>:null}</div> : null}</div>{moving ? <div ref={sub} className="action-menu action-submenu" role="menu" aria-label={plural ? `${count}개 항목을 이동할 위치` : "폴더 이동"} onContextMenu={event => event.preventDefault()}><div className="action-menu-caption">{plural ? `${count}개 항목을 이동할 위치` : "이동할 위치"}</div><FolderPicker folders={folders} parents={parents} selected={target.folder} onSelect={folder => action(() => onMove(target.id, folder))}/></div> : null}</>, document.body);
}
