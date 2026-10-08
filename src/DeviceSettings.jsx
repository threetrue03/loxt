import { useEffect, useRef, useState } from 'react';
import { cleanError } from './SettingsProvider.jsx';

export default function DeviceSettings() {
  const [state, setState] = useState(null), [working, setWorking] = useState(false), [error, setError] = useState(''), [copied, setCopied] = useState('');
  const timer = useRef(null), busy = useRef(false);
  useEffect(() => {
    let active = true;
    window.desktop.devices.get().then(value => { if (active) setState(value); }).catch(e => { if (active) setError(cleanError(e)); });
    const off = window.desktop.devices.onState(value => { if (active) setState(value); });
    return () => { active = false; off(); clearTimeout(timer.current); };
  }, []);
  async function act(fn) {
    if (busy.current) return;
    busy.current = true; setWorking(true); setError('');
    try { await fn(); setState(await window.desktop.devices.get()); }
    catch (e) { setError(cleanError(e)); }
    finally { busy.current = false; setWorking(false); }
  }
  function copy(kind, index = 0) {
    const key = `${kind}:${index}`;
    return act(async () => {
      await window.desktop.devices.copy(kind, index);
      clearTimeout(timer.current); setCopied(key);
      timer.current = setTimeout(() => setCopied(''), 2000);
    });
  }
  function copyButton(kind, index, label) {
    return <button className="secondary" disabled={working || !state?.running} onClick={() => copy(kind, index)}>{copied === `${kind}:${index}` ? '복사됨' : label}</button>;
  }
  return <section className="settings-section device-settings">
    <div className="settings-row"><div><h2>같은 Wi-Fi에서 연결 허용</h2><p className="hint">승인한 아이패드·아이폰에서 이 PC의 보관함을 사용합니다.</p></div><button className="secondary" role="switch" aria-checked={state?.enabled || false} disabled={!state || working} onClick={() => act(() => window.desktop.devices.configure(!state.enabled))}>{working ? '연결 준비 중…' : state?.enabled ? '켜짐' : '꺼짐'}</button></div>
    {(error || state?.error) ? <p role="alert" className="error-message">{error || state.error}</p> : null}
    {state?.enabled ? <>
      <p role="status">{state.running ? '연결 서버 실행 중' : '연결 서버 중지됨'}</p>
      {state.running ? <>
        <h3>처음 연결하기</h3>
        <p className="hint">인증서를 설치·신뢰한 뒤 QR을 스캔하거나 연결 주소를 여세요. 주소와 QR은 5분간 유효하며, 이 PC에서 승인이 필요합니다.</p>
        <div className="settings-row"><span>새 기기 연결 · QR과 같은 주소</span>{copyButton('pair', 0, '연결 주소 복사')}</div>
        {state.qr ? <img width="180" height="180" src={state.qr} alt="LOXT 기기 연결 QR"/> : null}
        <button className="secondary" disabled={working} onClick={() => act(() => window.desktop.devices.qr())}>새 QR 생성</button>
        <h3>승인한 기기에서 다시 열기</h3>
        <p className="hint">이 주소는 기존 승인을 가진 브라우저에서 사용합니다. 처음 연결하는 기기는 위의 연결 주소를 사용하세요.</p>
        {state.addresses.map((address, index) => <div className="settings-row" key={address}><code>{address}</code>{copyButton('reconnect', index, '재접속 주소 복사')}</div>)}
      </> : <p className="hint">연결을 다시 켠 뒤 새 주소를 사용하세요.</p>}
      <details><summary>처음 연결하는 방법</summary><ol><li>PC와 모바일을 같은 Wi-Fi에 연결합니다.</li><li>아래 초기 설정 주소에서 공개 인증서를 내려받습니다. 인증서 지문을 이 화면과 비교하세요.</li><li>아이폰·아이패드 설정에서 인증서를 설치하고 일반 → 정보 → 인증서 신뢰 설정에서 이 PC의 LOXT 인증서를 신뢰합니다.</li><li>이 화면의 QR 또는 연결 주소를 열고 아래 연결 요청을 승인합니다.</li></ol>
        {state.bootstrap.map((address, index) => <div className="settings-row" key={address}><code>{address}</code>{copyButton('bootstrap', index, '초기 설정 주소 복사')}</div>)}
        <p className="hint">인증서 지문: {state.fingerprint}</p><p className="hint">인증서 만료: {state.certificateExpires?.slice(0, 10)}{state.certificateRenewed ? ' · 인증서가 갱신되었습니다. 모바일에 새 인증서를 설치하고 신뢰해 주세요.' : ''}</p>
        <p className="hint">연결되지 않으면 Windows 방화벽의 LOXT Private 네트워크 허용과 공유기의 기기 간 통신 설정을 확인하세요. PC가 꺼지거나 앱이 종료되면 연결도 종료됩니다. 연결을 그만 사용할 때 모바일에 설치한 LOXT 인증서를 제거할 수 있습니다.</p>
      </details>
    </> : null}
    {state?.pending.map(request => <div className="settings-row" key={request.id}><span>{request.name} · 연결 요청</span><div><button className="secondary" disabled={working} onClick={() => act(() => window.desktop.devices.approve(request.id, false))}>거절</button><button className="primary" disabled={working} onClick={() => act(() => window.desktop.devices.approve(request.id, true))}>승인</button></div></div>)}
    <h2>연결된 기기</h2>{!state?.devices.length ? <p className="hint">연결된 기기가 없습니다.</p> : state.devices.map(device => <div className="settings-row" key={device.id}><div>{device.name}<p className="hint">{device.lastSeen}</p></div><button className="secondary danger" disabled={working} onClick={() => act(() => window.desktop.devices.revoke(device.id))}>연결 해제</button></div>)}
  </section>;
}
