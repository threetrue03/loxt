import {browserIdentity} from '../shared/browser-identity.js';
import {connectionURL} from '../shared/connection-url.js';
export async function requestApproval(address,{signal,onStatus=()=>{}}={}){
 const {first}=connectionURL(address,{requirePair:true}),url=new URL(first);
 if(url.origin!==location.origin)throw Error('새 주소로 이동하기 전에 초안 사본을 받아 주세요.');
 const check=new AbortController(),stop=()=>check.abort(),timer=setTimeout(stop,10000);signal?.addEventListener('abort',stop,{once:true});
 try{if(signal?.aborted)stop();const existing=await fetch('/api/session',{signal:check.signal,cache:'no-store'});if(signal?.aborted)throw new DOMException('연결 요청을 취소했습니다.','AbortError');if(existing.ok)return await existing.json();if(existing.status!==401)throw Error('PC 연결 상태를 확인하지 못했습니다.');}finally{clearTimeout(timer);signal?.removeEventListener('abort',stop);}
 const token=new URLSearchParams(url.hash.slice(1)).get('pair');onStatus('PC에서 이 기기의 연결을 승인해 주세요.');
 while(!signal?.aborted){
  const controller=new AbortController(),abort=()=>controller.abort(),timeout=setTimeout(abort,10000);signal?.addEventListener('abort',abort,{once:true});
  try{
   const response=await fetch('/api/pair',{method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({token,...browserIdentity(navigator)})});
   const value=await response.json();if(!response.ok)throw Error(value.error||'연결 요청을 확인해 주세요.');
   if(value.approved){const response=await fetch('/api/session',{signal:controller.signal,cache:'no-store'});if(!response.ok)throw Error('승인을 확인하지 못했습니다. 다시 확인해 주세요.');return response.json();}
  }finally{clearTimeout(timeout);signal?.removeEventListener('abort',abort);}
  await new Promise((resolve,reject)=>{const abort=()=>{clearTimeout(timer);reject(new DOMException('연결 요청을 취소했습니다.','AbortError'));};const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},3000);signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();});
 }
 throw new DOMException('연결 요청을 취소했습니다.','AbortError');
}
