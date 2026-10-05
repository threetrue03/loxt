import Select from './Select.jsx';
import { useTheme } from './ThemeProvider.jsx';

export default function ThemeSetting() {
  const { theme, pending, error, changeTheme } = useTheme();
  return <section className="settings-section theme-setting settings-row"><div><h2>테마</h2><p className="hint">Work와 Live에 함께 적용됩니다.</p></div><Select className="preference-select" label="테마" value={theme} disabled={pending} onChange={changeTheme} options={[{ value: 'dark', label: '다크 테마' }, { value: 'light', label: '라이트 테마' }]}/>{error ? <p className="error-message" role="alert">{error}</p> : null}</section>;
}
