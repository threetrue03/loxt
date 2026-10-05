import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
const Context = createContext(null);
const fallback = { work: { model: 'small', microphone: '', layout: 'cards' }, live: { model: 'large-v3-turbo', microphone: '', layout: 'cards' } };
export const cleanError = error => {
  const text = (error?.message || String(error)).replace(/^Error invoking remote method '[^']+': Error: /, '').split(/\n\s+at /)[0];
  if (/\b(EACCES|EPERM|EISDIR|ENOTDIR)\b/.test(text)) return '저장 폴더의 접근 권한과 파일 사용 상태를 확인한 뒤 다시 시도해 주세요.';
  if (/\bENOSPC\b/.test(text)) return '저장 공간이 부족합니다. 저장 드라이브의 여유 공간을 확인해 주세요.';
  return text.slice(-700);
};
export default function SettingsProvider({ children }) {
  const [preferences, setPreferences] = useState(fallback), [ready, setReady] = useState(false), [issues, setIssues] = useState({}), [pending, setPending] = useState({});
  const [operation, setOperation] = useState({}), [open, setOpen] = useState(false), [tab, setTab] = useState('general');
  const inFlight = useRef(new Set()), mounted = useRef(true);
  const apply = useCallback(next => { if (mounted.current) setPreferences(current => (next.revision || 0) >= (current.revision || 0) ? next : current); }, []);
  const reload = useCallback(async () => {
    try {
      const current = await window.desktop.preferences.get();
      let next = current;
      if (!current.migrated && !current.error) {
        let legacy = {};
        try { const work = JSON.parse(localStorage.getItem('sorinote.ui-preferences') || '{}'); legacy = { work: { microphone: work.microphone, layout: localStorage.getItem('sorinote.library-layout') }, live: { layout: localStorage.getItem('loxt.live.layout') } }; }
        catch { setIssues(value => ({ ...value, load: { text: '이전 화면 설정을 읽지 못했습니다. 원하는 설정을 다시 선택해 주세요.' } })); }
        next = await window.desktop.preferences.migrate(legacy);
      }
      if (!mounted.current) return; apply(next); setReady(true);
      setIssues(value => { const copy = { ...value }; if (next.error) copy.load = { text: next.error }; else delete copy.load; return copy; });
    } catch (error) { if (mounted.current) setIssues(value => ({ ...value, load: { text: cleanError(error) } })); }
  }, [apply]);
  useEffect(() => {
    let active = true; mounted.current = true;
    const off = window.desktop.preferences.onChange(value => { if (active) { apply(value); setReady(true); } });
    const offOperation = window.desktop.settings.onChange(value => { if (active) setOperation(value); });
    window.desktop.settings.get().then(value => { if (active) setOperation(value); }).catch(error => { if (active) setIssues(value => ({ ...value, load: { text: cleanError(error) } })); });
    reload(); return () => { active = false; mounted.current = false; off(); offOperation(); };
  }, [reload, apply]);
  const change = useCallback(async (mode, change) => {
    const key = mode + ':' + Object.keys(change).join(',');
    if (inFlight.current.has(key)) return false;
    inFlight.current.add(key); setPending(value => ({ ...value, [key]: true }));
    try {
      const next = await window.desktop.preferences.set(mode, change); apply(next);
      setIssues(value => { const copy = { ...value }; delete copy[key]; if (!next.error) delete copy.load; return copy; }); return true;
    } catch (error) { setIssues(value => ({ ...value, [key]: { text: '설정을 저장하지 못했습니다. ' + cleanError(error), mode, change } })); return false; }
    finally { inFlight.current.delete(key); setPending(value => ({ ...value, [key]: false })); }
  }, [apply]);
  return <Context.Provider value={{ preferences, ready, issues, pending, operation, change, reload, open, tab, setTab, openSettings: (initial = 'general') => { setTab(initial); setOpen(true); }, closeSettings: () => setOpen(false) }}>{children}</Context.Provider>;
}
export const useSettings = () => useContext(Context);
