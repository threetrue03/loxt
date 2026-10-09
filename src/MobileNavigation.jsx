import Icon from './Icon.jsx';

export default function MobileNavigation({ filter, settings, hidden, onNavigate, onSettings }) {
  if (!window.desktop.remote || hidden) return null;
  const current = settings ? 'settings' : filter === 'all' ? 'all' : filter === 'recent' ? 'recent' : 'library';
  return <nav className="mobile-navigation" aria-label="모바일 탐색">
    {[['all', 'home', '홈'], ['library', 'folder', '보관함'], ['settings', 'settings', '설정']].map(([id, icon, title]) =>
      <button key={id} type="button" aria-current={current === id ? 'page' : undefined} onClick={() => id === 'settings' ? onSettings() : onNavigate(id === 'library' ? '' : id)}><Icon name={icon}/><span>{title}</span></button>
    )}
  </nav>;
}

export function MobileLibraryTools({ onTrash }) {
  return window.desktop.remote ? <div className="mobile-library-tools"><button className="secondary" onClick={onTrash}><Icon name="trash"/>휴지통</button></div> : null;
}
