import { useState } from 'react';
import Icon from './Icon.jsx';

export const parentOf = (folder, parents) => Object.hasOwn(parents, folder) ? parents[folder] : '';
export const folderName = (folder, parents) => parentOf(folder, parents) ? folder.slice(parentOf(folder, parents).length + 1) : folder;
export default function FolderTree({ folders, parents, selected, onOpen, onMenu }) {
  const [closed, setClosed] = useState([]);
  function rows(parent, depth = 0, visited = []) {
    if (depth > 16) return null;
    return folders.filter(folder => parentOf(folder, parents) === parent && !visited.includes(folder)).map(folder => {
      const children = folders.some(item => parentOf(item, parents) === folder);
      const expanded = !closed.includes(folder);
      return <div key={folder}><div className="folder-node" style={{ paddingLeft: depth * 12 }}><button className="folder-disclosure" aria-label={`${folderName(folder, parents)} ${expanded ? '접기' : '펼치기'}`} aria-expanded={children ? expanded : undefined} disabled={!children} onClick={() => setClosed(value => expanded ? [...value, folder] : value.filter(item => item !== folder))}><Icon name={expanded ? 'chevronDown' : 'chevronRight'}/></button><button data-folder-drop={folder} className={selected === folder ? 'active' : ''} title={folder} onClick={() => onOpen(folder)} onContextMenu={event => onMenu(event, folder, true)} onKeyDown={event => { if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) onMenu(event, folder, false); }}><Icon name="folder"/><span>{folderName(folder, parents)}</span></button></div>{children && expanded ? rows(folder, depth + 1, [...visited, folder]) : null}</div>;
    });
  }
  return <div className="folders">{folders.length ? rows('') : <p className="folder-empty">폴더를 만들어 녹음을 정리하세요.</p>}</div>;
}
