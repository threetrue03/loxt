import Icon from './Icon.jsx';
import Menu from './Menu.jsx';
import Brand from './Brand.jsx';

export default function WorkspaceMenu({ value, onChange }) {
  return <Menu label="워크스페이스 선택" className="workspace-menu" trigger={<><span className="workspace-brand"><Brand/><small className="workspace-mode">{value === 'live' ? 'Live' : 'Work'}</small></span><Icon name="chevronDown"/></>}>
    {close => <>{[
      ['work', 'Work', '녹음과 파일을 스크립트로 정리하세요.'],
      ['live', 'Live', '실시간으로 스크립트를 이어갑니다.'],
    ].map(([id, title, description]) => <button role="menuitemradio" aria-checked={value === id} key={id} onClick={() => { close(); onChange(id); }}><span className="workspace-option"><strong>{title}</strong><span>{description}</span></span>{value === id ? <span className="menu-check">✓</span> : null}</button>)}</>}
  </Menu>;
}
