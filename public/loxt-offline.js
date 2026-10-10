import {collectDrafts,downloadDrafts,recordingDrafts,downloadRecording} from './recovery-drafts.js';
import {connectionURL} from './recovery-address.js';
const error=document.getElementById('error');
document.getElementById('retry').onclick=()=>location.replace('/web.html');
document.getElementById('count').textContent=`이 브라우저에 ${collectDrafts().documents.length}개 메모·필기 초안이 남아 있습니다.`;
document.getElementById('drafts').onclick=()=>{downloadDrafts();};
document.querySelector('form').onsubmit=event=>{event.preventDefault();try{const {first}=connectionURL(document.getElementById('address').value);if(new URL(first).origin!==location.origin&&!document.getElementById('backup').checked)throw Error('새 주소로 이동하기 전에 필요한 초안 사본을 먼저 보관해 주세요.');location.assign(first);}catch(e){error.textContent=e.message;}};
recordingDrafts().then(records=>{for(const record of records){const row=document.createElement('div'),label=document.createElement('span'),button=document.createElement('button');label.textContent=record.title||'녹음 초안';button.textContent='녹음 원본 받기';button.onclick=()=>downloadRecording(record.key).catch(e=>{error.textContent=e.message;});row.append(label,button);document.getElementById('recordings').append(row);}}).catch(e=>{error.textContent=e.message;});
