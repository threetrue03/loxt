import Select from './Select.jsx';
import { useTheme } from './ThemeProvider.jsx';

export default function ThemeSetting() {
  const { theme, pending, error, changeTheme } = useTheme();
  return <section className="settings-section theme-setting"><h2>테마</h2><Select className="preference-select" label="테마" value={theme} disabled={pending} onChange={changeTheme} options={[{ value: 'dark', label: '다크 테마' }, { value: 'light', label: '라이트 테마' }]}/>{error ? <p className="error-message" role="alert">{error}</p> : null}</section>;
}
