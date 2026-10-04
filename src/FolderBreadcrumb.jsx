import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import Menu from './Menu.jsx';
import InlineName from './InlineName.jsx';
import { folderName, parentOf } from './FolderTree.jsx';

export default function FolderBreadcrumb({ folder, parents, onOpen, editing, onRename, onCancelRename, onStartRename, onMenu }) {
  const path = [], visited = new Set();
  for (let current = folder; current && !visited.has(current); current = parentOf(current, parents)) {
    visited.add(current); path.unshift({ id: current, name: folderName(current, parents) });
  }
  const ancestors = path.slice(0, -1), current = path.at(-1);
  const pathKey = JSON.stringify(path);
  const root = useRef(null), measure = useRef(null);
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    const update = () => setCollapsed(measure.current.getBoundingClientRect().width > root.current.clientWidth - 16);
    const observer = new ResizeObserver(update);
    observer.observe(root.current); observer.observe(measure.current); update();
    let active = true;
    document.fonts.ready.then(() => { if (active) update(); });
    return () => { active = false; observer.disconnect(); };
  }, [pathKey]);
  const separator = <Icon name="chevronRight"/>;
  return <nav ref={root} className="folder-breadcrumb" aria-label="폴더 경로">
    {folder ? <><button className="breadcrumb-link" data-folder-drop="" onClick={() => onOpen('')}>내 보관함</button>{separator}</> : null}
    {collapsed && ancestors.length ? <><Menu key={pathKey} label="생략된 폴더 경로" trigger="…" className="breadcrumb-menu">{close => ancestors.map(item => <button role="menuitem" key={item.id} title={item.id} onClick={() => { close(); onOpen(item.id); }}><Icon name="folder"/><span>{item.name}</span></button>)}</Menu>{separator}</> : ancestors.map(item => <span className="breadcrumb-step" key={item.id}><button className="breadcrumb-link" title={item.id} onClick={() => onOpen(item.id)}>{item.name}</button>{separator}</span>)}
    {!folder ? <h1 className="folder-title" aria-current="page">내 보관함</h1> : editing ? <InlineName className="breadcrumb-edit" value={current?.name || folder} label="폴더 이름 바꾸기" maxLength={80} onSave={onRename} onCancel={onCancelRename}/> : <h1 className="folder-title" aria-current="page" tabIndex="0" title={`${folder} · 두 번 클릭하거나 F2로 이름 바꾸기`} onDoubleClick={onStartRename} onContextMenu={event => onMenu(event, true)} onKeyDown={event => { if (event.key === 'F2') { event.preventDefault(); onStartRename(); } if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) onMenu(event, false); }}>{current?.name || folder}</h1>}
    <span className="breadcrumb-measure-box" aria-hidden="true"><span ref={measure} className="breadcrumb-measure"><span className="breadcrumb-link">내 보관함</span>{separator}{ancestors.map(item => <span className="breadcrumb-step" key={item.id}><span className="breadcrumb-link">{item.name}</span>{separator}</span>)}<span className="breadcrumb-current">{current?.name || folder}</span></span></span>
  </nav>;
}
