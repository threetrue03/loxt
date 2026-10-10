import {validateDrafts} from '../public/recovery-drafts.js';
export async function restoreDraftCopies(file){
 if(file.size>20*1024*1024)throw Error('20 MB 이하의 초안 사본을 선택해 주세요. 녹음 원본은 별도로 불러와 주세요.');
 const docs=validateDrafts(JSON.parse(await file.text()),window.desktop.hostId),result={saved:0,failed:[]};
 for(const d of docs){try{await window.desktop.connection.restoreDraft(d);result.saved++;}catch(error){result.failed.push({id:d.id,error:error.message});}}
 return result;
}
