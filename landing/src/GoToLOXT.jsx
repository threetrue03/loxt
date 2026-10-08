import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { connectionKey, connectionURL, savedConnection } from './connection.mjs';

const Connection = createContext(null);
export function ConnectionProvider({ children }) {
  const [address, setAddress] = useState(savedConnection), [input, setInput] = useState(''), [error, setError] = useState('');
  const dialog = useRef(null), field = useRef(null);
  useEffect(() => {
    const update = event => { if (event.key === connectionKey) setAddress(savedConnection()); };
    window.addEventListener('storage', update);
    return () => window.removeEventListener('storage', update);
  }, []);
  function configure() { setInput(address); setError(''); dialog.current.showModal(); field.current.focus(); }
  function go(event) { if (!address) { event.preventDefault(); configure(); } }
  function submit(event) {
    event.preventDefault();
    try {
      const link = connectionURL(input);
      // Only retain the reconnect address. A five-minute pairing token stays transient.
      try { localStorage.setItem(connectionKey, link.base); } catch { /* Navigation still works without persistent storage. */ }
      setAddress(link.base); window.location.assign(link.first);
    } catch (e) { setError(e.message); field.current.focus(); }
  }
  function remove() { try { localStorage.removeItem(connectionKey); } catch {} setAddress(''); setInput(''); setError(''); field.current.focus(); }
  return <Connection.Provider value={{ address, go, configure }}>{children}
    <dialog className="connection-dialog" ref={dialog} aria-labelledby="connection-title" onClick={event => { if (event.target === event.currentTarget) { const box = event.currentTarget.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.current.close(); } }}>
      <div className="connection-heading"><h2 id="connection-title">내 PC의 LOXT로 가기</h2><button type="button" aria-label="연결 창 닫기" onClick={() => dialog.current.close()}>×</button></div>
      <p>PC의 LOXT에서 설정 → 내 기기 연결을 켜고, ‘연결 주소 복사’를 눌러 아래에 붙여넣으세요.</p>
      <form onSubmit={submit}><label htmlFor="connection-address">LOXT 연결 주소</label><input ref={field} id="connection-address" type="text" inputMode="url" autoComplete="off" spellCheck="false" value={input} placeholder="PC에서 복사한 HTTPS 주소" onChange={event => { setInput(event.target.value); setError(''); }} aria-invalid={Boolean(error)} aria-describedby={error ? 'connection-error' : 'connection-help'}/>
        {error ? <p id="connection-error" className="connection-error" role="alert">{error}</p> : null}
        <p id="connection-help">같은 Wi-Fi에 연결하고 PC 앱을 실행해 두세요. 처음 접속하는 기기는 인증서 설치·신뢰와 PC의 승인이 필요합니다. 승인된 브라우저는 재접속 주소를 사용할 수 있습니다.</p>
        <div className="connection-actions">{address ? <button type="button" className="connection-remove" onClick={remove}>주소 지우기</button> : null}<button type="submit" className="download">LOXT로 이동 ↗</button></div>
      </form><p className="connection-privacy">재접속 주소만 이 브라우저에 저장합니다. PC 주소가 바뀌거나 연결 승인이 만료되면 새 연결 주소를 등록하세요.</p>
    </dialog>
  </Connection.Provider>;
}

export default function GoToLOXT({ installed = false }) {
  const { address, go, configure } = useContext(Connection);
  if (!installed) return <a className="nav-download" href={address || '#connection'} onClick={go}>LOXT로 가기 <span aria-hidden="true">↗</span></a>;
  return <div className="installed-link"><a href={address || '#connection'} onClick={go}>이미 설치하셨다면 LOXT로 이동해보세요. ↗</a>{address ? <button type="button" onClick={configure}>연결 주소 변경</button> : null}</div>;
}
