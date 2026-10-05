import Icon from './Icon.jsx';
import { settingsTabs } from './uiPreferences.js';
import { useSettings } from './SettingsProvider.jsx';
export default function SettingsSidebar() {
  const { tab, setTab, closeSettings } = useSettings();
  return <><button className="back settings-return" onClick={closeSettings}>← 돌아가기</button><div className="settings-sidebar-title">설정</div><nav className="nav settings-nav" aria-label="설정 메뉴">{settingsTabs.map(([id, title, icon]) => <button key={id} className={tab === id ? 'active' : ''} aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}><Icon name={icon}/>{title}</button>)}</nav></>;
}
