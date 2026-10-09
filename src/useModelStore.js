import { useCallback, useEffect, useRef, useState } from 'react';
import { cleanError } from './SettingsProvider.jsx';

export default function useModelStore() {
  const [data, setData] = useState(null), [environment, setEnvironment] = useState(null), [error, setError] = useState(''), [loading, setLoading] = useState(false);
  const generation = useRef(0), mounted = useRef(false), modelSignature = useRef('');
  const reload = useCallback(async (force = false, offline = false) => {
    const request = ++generation.current;
    setLoading(true);
    try {
      const value = await window.desktop.modelStore.list({ force, offline });
      if (mounted.current && request === generation.current) { setData(value); setError(value.error || ''); }
    } catch (failure) { if (mounted.current && request === generation.current) setError(cleanError(failure)); }
    finally { if (mounted.current && request === generation.current) setLoading(false); }
  }, []);
  useEffect(() => {
    mounted.current = true;
    const refresh = () => reload(false, true);
    const off = window.desktop.modelStore.onChange(refresh);
    const receive = value => {
      if (!mounted.current) return;
      setEnvironment(value);
      const signature=JSON.stringify(value.models?.map(model=>[model.id,model.downloaded,model.alias,model.roles]));
      if(modelSignature.current && signature!==modelSignature.current)reload(false,true);
      modelSignature.current=signature;
    };
    const offEnvironment = window.desktop.onTranscriptionState(receive);
    window.desktop.getTranscriptionEnvironment().then(receive).catch(() => {});
    reload(false, true).then(() => { if (mounted.current) reload(); });
    return () => { mounted.current = false; ++generation.current; off(); offEnvironment(); };
  }, [reload]);
  return { data, environment, error, loading, reload };
}
