import Icon from './Icon.jsx';
import { settingsTabs } from './uiPreferences.js';
import { useSettings } from './SettingsProvider.jsx';
export default function SettingsSidebar() {
  const { tab, setTab, closeSettings } = useSettings();
  return <><button className="back settings-return" aria-label="← 돌아가기" onClick={closeSettings}>←<span className="label"> 돌아가기</span></button><div className="settings-sidebar-title">설정</div><nav className="nav settings-nav" aria-label="설정 메뉴">{settingsTabs.map(([id, title, icon]) => <button key={id} className={tab === id ? 'active' : ''} aria-current={tab === id ? 'page' : undefined} aria-label={title} title={title} onClick={() => setTab(id)}><Icon name={icon}/><span className="label">{title}</span></button>)}</nav></>;
}
