const types = {
  folder: {key:'folder',label:'폴더',icon:'folder'},
  recording: {key:'recording',label:'녹음',icon:'mic'},
  audio: {key:'audio',label:'녹음 원본',icon:'mic'},
  script: {key:'script',label:'스크립트',icon:'file'},
  memo: {key:'memo',label:'메모',icon:'file'},
  drawing: {key:'drawing',label:'그리기',icon:'pen'},
  pdf: {key:'pdf',label:'PDF',icon:'file'},
};
export function fileType(item = {}) {
  if(item.note)return fileType(item.note);
  if(item.kind==='folder'||item.type==='folder'||item.id?.startsWith('folder:'))return types.folder;
  if(item.kind==='memo')return types.memo;
  if(item.kind==='pdf')return item.documentType==='drawing'?types.drawing:types.pdf;
  if(item.kind==='audio')return types.audio;
  if(item.audioMissing)return types.script;
  return types.recording;
}
export function selectionDescription(items) {
  const counts=new Map();
  for(const item of items){const type=fileType(item);const entry=counts.get(type.key)||{...type,count:0};entry.count++;counts.set(type.key,entry);}
  if(items.length===1)return {label:`${items[0].title||fileType(items[0]).label} · ${fileType(items[0]).label}`,detail:''};
  const values=[...counts.values()];
  return {label:values.length===1?`${values[0].label} ${items.length}개`:`${items.length}개 항목`,detail:values.length>1?values.map(type=>`${type.label} ${type.count}`).join(' · '):''};
}
