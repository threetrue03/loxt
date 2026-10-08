import {connectWeb} from './webAdapter.js';
import './styles.css';
import './v2.css';
import './web.css';
const root=document.getElementById('root');
async function session(){const res=await fetch('/api/session');if(!res.ok)return null;return res.json();}
async function launch(){const state=await session();if(state){await connectWeb(state);await import('./main.jsx');return;}const token=new URLSearchParams(location.hash.slice(1)).get('pair');root.innerHTML='<main class="web-connect"><img src="/brand/LOXT-lockup-white.svg" alt="LOXT" width="150"><h1>내 PC에 연결</h1><p role="status"></p><button class="secondary">다시 확인</button></main>';const status=root.querySelector('p');if(!token){status.textContent='처음 연결하는 기기는 PC의 LOXT → 설정 → 내 기기 연결에서 QR을 스캔하거나 새 연결 주소를 복사해 여세요. 인증서 신뢰와 PC 승인이 필요합니다.';root.querySelector('button').onclick=()=>location.reload();return;}status.textContent='PC에서 이 기기의 연결을 승인해 주세요.';const pair=async()=>{try{const res=await fetch('/api/pair',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,name:/iPad/.test(navigator.userAgent)?'아이패드':/iPhone/.test(navigator.userAgent)?'아이폰':'웹 기기'})});const value=await res.json();if(value.approved){history.replaceState(null,'',location.pathname);launch();return;}if(!res.ok){status.textContent=value.error;return;}setTimeout(pair,3000);}catch{status.textContent='PC와 같은 Wi-Fi인지, LOXT가 실행 중인지 확인해 주세요.';}};root.querySelector('button').onclick=pair;pair();}
launch().catch(error=>{root.textContent='연결을 시작하지 못했습니다. '+error.message;});
