import { createContext, useCallback, useContext, useEffect, useState } from 'react';

const initialTheme = window.desktop?.appearance?.initial === 'light' ? 'light' : 'dark';
// Apply before React renders, including menus rendered into document.body.
document.documentElement.dataset.theme = initialTheme;
const ThemeContext = createContext({ theme: initialTheme, pending: false, error: '', changeTheme: async () => {} });

export default function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(initialTheme);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const receive = useCallback(state => { document.documentElement.dataset.theme = state.theme; setTheme(state.theme); setError(state.error || ''); }, []);
  useEffect(() => {
    if (!window.desktop?.appearance) return;
    let mounted = true;
    const update = state => { if (mounted) receive(state); };
    const off = window.desktop.appearance.onChange(update);
    window.desktop.appearance.get().then(update).catch(() => { if (mounted) setError('테마 설정을 확인하지 못했습니다. 다시 선택해 주세요.'); });
    return () => { mounted = false; off(); };
  }, [receive]);
  async function changeTheme(value) {
    if (pending || !['dark', 'light'].includes(value)) return;
    const previous = theme; setPending(true); receive({ theme: value });
    try {
      if (window.desktop?.appearance) receive(await window.desktop.appearance.set(value));
    } catch { receive({ theme: previous, error: '테마를 저장하지 못했습니다. 저장 공간과 권한을 확인하고 다시 시도해 주세요.' }); }
    finally { setPending(false); }
  }
  return <ThemeContext.Provider value={{ theme, pending, error, changeTheme }}>{children}</ThemeContext.Provider>;
}
export const useTheme = () => useContext(ThemeContext);
