import {preventPageZoom} from '../shared/web-gestures.js';
preventPageZoom();
import { connectWeb } from './webAdapter.js';
import { connectionURL } from '../shared/connection-url.js';
import './styles.css';
import './v2.css';
import './web.css';

const root = document.getElementById('root');
let generation = 0, pollTimer = null, controller = null, connected = false;
function cancelAttempt() {
  generation++; clearTimeout(pollTimer); controller?.abort(); controller = null;
  return generation;
}
async function session() {
  const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),10000);try{const res=await fetch('/api/session',{signal:abort.signal});return res.ok?await res.json():null;}finally{clearTimeout(timer);}
}
async function launch() {
  const current = cancelAttempt();
  let state = null, unavailable = false;
  try { state = await session(); } catch { unavailable = true; }
  if (current !== generation) return;
  if (state) {
    history.replaceState(null, '', location.pathname);
    await connectWeb(state); await import('./main.jsx'); connected = true; return;
  }
  const token = new URLSearchParams(location.hash.slice(1)).get('pair');
  root.innerHTML = `<main class="web-connect"><img src="/brand/LOXT-lockup-white.svg" alt="LOXT" width="150"><h1>내 PC에 연결</h1><p role="status"></p>
    <form class="web-connect-form"><label for="connection-address">연결 주소 다시 입력</label><input id="connection-address" type="text" inputmode="url" autocomplete="off" spellcheck="false" placeholder="PC에서 복사한 연결 주소" aria-describedby="connection-help"><p id="connection-help" class="hint">PC의 처음 연결하기 → 연결 주소 복사로 받은 주소를 붙여넣으세요. 인증서 신뢰와 PC 승인이 필요합니다.</p><p id="connection-error" class="error-message" role="alert" hidden></p><button type="submit" class="primary">이 주소로 연결</button></form>
    <button type="button" class="secondary web-connect-retry">다시 확인</button></main>`;
  const status = root.querySelector('[role=status]'), input = root.querySelector('input'), error = root.querySelector('[role=alert]');
  root.querySelector('form').onsubmit = event => {
    event.preventDefault();
    try {
      const { first } = connectionURL(input.value, { requirePair: true });
      error.hidden = true; input.removeAttribute('aria-invalid');
      cancelAttempt();
      if (first === location.href) launch().catch(showFailure);
      else location.assign(first);
    } catch (e) {
      error.textContent = e.message; error.hidden = false;
      input.setAttribute('aria-invalid', 'true'); input.setAttribute('aria-describedby', 'connection-help connection-error'); input.focus();
    }
  };
  input.oninput = () => { error.hidden = true; input.removeAttribute('aria-invalid'); input.setAttribute('aria-describedby', 'connection-help'); };
  root.querySelector('.web-connect-retry').onclick = () => launch().catch(showFailure);
  if (!token) {
    status.textContent = unavailable ? 'PC에 연결하지 못했습니다. 연결 서버와 Wi-Fi를 확인하거나 새 연결 주소를 입력하세요.' : '아직 이 브라우저가 승인되지 않았습니다. 새 연결 주소를 입력해 연결을 요청하세요.';
    return;
  }
  status.textContent = 'PC에서 이 기기의 연결을 승인해 주세요.';
  async function pair() {
    if (current !== generation) return;
    controller = new AbortController();
    const timeout=setTimeout(()=>controller?.abort(),10000);
    try {
      const res = await fetch('/api/pair', { method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, name: /iPad/.test(navigator.userAgent) ? '아이패드' : /iPhone/.test(navigator.userAgent) ? '아이폰' : '웹 기기' }) });
      const value = await res.json();
      if (current !== generation) return;
      if (value.approved) { history.replaceState(null, '', location.pathname); launch().catch(showFailure); return; }
      if (!res.ok) { status.textContent = value.error; return; }
      pollTimer = setTimeout(pair, 3000);
    } catch (e) {
      if (current !== generation) return;
      status.textContent = 'PC와 같은 Wi-Fi인지, LOXT가 실행 중인지 확인하고 다시 확인하거나 새 연결 주소를 입력하세요.';
    }finally{clearTimeout(timeout);}
  }
  pair();
}
function showFailure(error) {
  const status = root.querySelector('[role=status]');
  if (status) status.textContent = '연결을 시작하지 못했습니다. ' + error.message;
  else root.textContent = '연결을 시작하지 못했습니다. ' + error.message;
}
window.addEventListener('pagehide', cancelAttempt);
window.addEventListener('hashchange', () => { if (!connected) launch().catch(showFailure); });
launch().catch(showFailure);
