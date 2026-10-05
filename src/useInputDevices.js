import { useCallback, useEffect, useRef, useState } from 'react';
export default function useInputDevices(enabled) {
  const [state, setState] = useState({ devices: [], loading: true, error: '', restricted: false });
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const current = ++generation.current; setState(value => ({ ...value, loading: true, error: '' }));
    try {
      if (!navigator.mediaDevices) throw new Error('음성 장치 정보를 확인할 수 없습니다. 앱을 다시 실행해 주세요.');
      const list = await navigator.mediaDevices.enumerateDevices();
      const devices = list.filter(device => device.kind === 'audioinput' && !['default', 'communications'].includes(device.deviceId));
      if (current === generation.current) setState({ devices, loading: false, error: '', restricted: devices.some(device => !device.label) });
    } catch (error) { if (current === generation.current) setState(value => ({ ...value, loading: false, error: error.name === 'NotAllowedError' ? '음성 장치 정보 접근이 제한되었습니다. Windows 마이크 개인정보 설정을 확인해 주세요.' : '장치 목록을 확인하지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요.' })); }
  }, []);
  useEffect(() => {
    if (!enabled) return;
    refresh(); navigator.mediaDevices?.addEventListener('devicechange', refresh);
    return () => { ++generation.current; navigator.mediaDevices?.removeEventListener('devicechange', refresh); };
  }, [enabled, refresh]);
  return { ...state, refresh };
}
