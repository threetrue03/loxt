import Icon from './Icon.jsx';
import InlineName from './InlineName.jsx';

export default function FolderCard({ name, folder, creating, editing, onOpen, onMenu, onRename, onCancelRename, itemId, selected }) {
  const Tag = editing ? 'div' : 'button';
  return <Tag className={`folder-card ${selected ? 'is-selected' : ''}`} data-note-id={itemId} data-folder-drop={creating ? undefined : folder} onClick={editing ? undefined : onOpen} onContextMenu={event => { if(onMenu) { event.stopPropagation(); onMenu(event, true); } }} onKeyDown={event => { if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) onMenu?.(event, false); }}><Icon name="folder"/>{editing ? <InlineName value={name} label={creating ? '새 폴더 이름' : '폴더 이름 바꾸기'} allowEmptyCancel={creating} maxLength={80} onSave={onRename} onCancel={onCancelRename}/> : <span>{name}</span>}<Icon name="chevronRight"/></Tag>;
}
