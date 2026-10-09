const fs=require('node:fs/promises'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {Memos,plainText}=require('./memos.cjs'),{PDFs}=require('./pdfs.cjs');
function webServices({libraries,actions,conversions,preferences,root,dist,BrowserWindow,isBusy,getLiveState,onRecordingChange}){
 const exports=new Map(),recordings=new Map(),clientActions=new Map();
 const exportRoot=path.resolve(root),previewRoot=path.join(root,'pdf-previews');let previewReady;
 async function preparePreviews(){await fs.mkdir(previewRoot,{recursive:true});if((await fs.lstat(previewRoot)).isSymbolicLink())throw Error('PDF 캐시 경로를 확인해 주세요.');for(const name of await fs.readdir(previewRoot)){if(!/^[a-f0-9-]{36}\.(png|jpg)$/.test(name))continue;const file=path.join(previewRoot,name);if((await fs.lstat(file)).isFile())await fs.unlink(file).catch(()=>{});}}
 async function pruneExports(){let count=[...exports.values()].filter(v=>v.preview).length;for(const [id,value] of exports){if(value.expires<Date.now()||exports.size>=64||value.preview&&count>=8){exports.delete(id);if(value.preview)count--;await fs.unlink(value.filename).catch(()=>{});}}}

 function store(mode){return libraries.get(mode);}
 function locate(id){const stores=['work','live'].map(store).filter(s=>s.data.notes.some(n=>n.id===id)||s.sessions.has(id));if(stores.length!==1)throw new Error('문서를 찾지 못했습니다.');return stores[0];}
 async function output(ext,work,preview=false){const id=randomUUID(),file=path.join(preview?previewRoot:root,id+ext);await fs.mkdir(root,{recursive:true});if(preview)await(previewReady ||= preparePreviews());await pruneExports();await work(file);exports.set(id,{filename:file,preview,name:'LOXT-'+new Date().toISOString().slice(0,10)+ext,expires:Date.now()+(preview?120000:86400000),mime:{'.pdf':'application/pdf','.zip':'application/zip','.txt':'text/plain; charset=utf-8','.md':'text/markdown; charset=utf-8','.html':'text/html; charset=utf-8'}[ext]});return {download:'/file/export/'+id};}
 async function rpc(method,p={},context={}){
  if(method==='client.error'){if(!['pdf.load','pdf.render'].includes(p.scope)||typeof p.stack!=='string')throw Error('진단 형식을 확인해 주세요.');await fs.mkdir(root,{recursive:true});const file=path.join(root,'client-errors.json');let errors=[];try{errors=JSON.parse(await fs.readFile(file,'utf8'));}catch{}errors.push({time:new Date().toISOString(),scope:p.scope,version:String(p.version||'').slice(0,40),stack:p.stack.slice(0,5000)});await require('./library.cjs').atomicJson(file,errors.slice(-30));return true;}
  if(method==='appInfo')return {version:require('../package.json').version,desktop:false,platform:'web',updateMethod:'연결한 PC의 LOXT 버전'};
  if(method==='liveState')return getLiveState();
  if(method==='environment'){const state=await conversions.environment();if(conversions.engine?.modelList){state.models=await conversions.engine.modelList();state.modelsChecked=true;}return state;}
  if(method==='preferences')return {...preferences.snapshot(),migrated:true};
  if(method==='search')return require('./library-search.cjs').searchLibrary(store(p.workspace),p);
  if(method==='manage'){if(isBusy?.(p))throw new Error('현재 작업을 마친 뒤 변경해 주세요.');const key=context.device+':'+p.workspace;if(!clientActions.has(key))clientActions.set(key,new (require('./library-actions.cjs').LibraryActions)(store(p.workspace)));return clientActions.get(key).run(p);}
  if(method.startsWith('library.')){const s=store(p.workspace);switch(method){case 'library.detail':return s.detail(p.id);case 'library.list':{const data=await s.listSummary();delete data.storagePath;return data;}case 'library.createFolder':return s.createFolder({name:p.name,parent:p.parent||''});case 'library.renameFolder':return s.renameFolder({folder:p.folder,name:p.name});case 'library.deleteFolder':if(isBusy?.(p))throw new Error('PC 작업을 마친 뒤 삭제해 주세요.');return s.deleteFolder(p.folder);case 'library.update':if(p.changes?.deleted&&isBusy?.({...p,ids:[p.id]}))throw new Error('PC 작업을 마친 뒤 삭제해 주세요.');return s.updateNote(p.id,p.changes,p.changes?.expected||p.expected);case 'library.restore':return s.restoreTrash(p.ids);case 'library.delete':if(isBusy?.(p))throw new Error('현재 작업을 마친 뒤 삭제해 주세요.');return s.deleteTrash(p.ids);case 'library.move':return s.moveNotes({ids:p.ids,folder:p.folder});}}
  if(method==='convert'){if(p.workspace!=='work')throw new Error('모바일 신규 변환은 Work에서 사용해 주세요.');const env=await conversions.environment();if(!env.models?.some(m=>m.id===p.model&&m.downloaded))throw new Error('PC에 설치된 모델을 선택해 주세요.');return conversions.enqueue({id:p.id,workspace:'work',model:p.model});}
  if(method==='cancel'){const note=locate(p.id).data.notes.find(n=>n.id===p.id);if(!note)throw new Error('작업을 찾지 못했습니다.');return conversions.cancel(p.id);}
  if(method==='memo.create')return new Memos(store(p.workspace)).create(p.folder||'');
  if(method==='memo.get')return new Memos(locate(p.id)).read(p.id);
  if(method==='memo.save')return new Memos(locate(p.id)).save(p);
  if(method==='memo.attach')return new Memos(locate(p.id)).attach({...p,bytes:new Uint8Array(p.bytes)});
  if(method==='memo.export'){
   const memos=new Memos(locate(p.id));if(!['md','html','pdf'].includes(p.format))throw new Error('내보내기 형식을 확인해 주세요.');
   if(p.format==='pdf')return output('.pdf',file=>require('./memo-export.cjs').exportMemo(p,{memos,BrowserWindow,dialog:{showSaveDialog:async()=>({filePath:file})}}));
   return output('.zip',async file=>{const dir=await fs.mkdtemp(path.join(exportRoot,'memo-'));try{const name=String(p.title||'메모').replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').slice(0,120)+'.'+p.format;const target=path.join(dir,name);await require('./memo-export.cjs').exportMemo(p,{memos,BrowserWindow,dialog:{showSaveDialog:async()=>({filePath:target})}});const zip=new (require('yazl').ZipFile)();const walk=async base=>{for(const item of await fs.readdir(base,{withFileTypes:true})){const abs=path.join(base,item.name);if(item.isDirectory())await walk(abs);else if(item.isFile())zip.addFile(abs,path.relative(dir,abs).split(path.sep).join('/'));}};await walk(dir);await new Promise((resolve,reject)=>{const stream=require('node:fs').createWriteStream(file);stream.on('close',resolve);stream.on('error',reject);zip.outputStream.on('error',reject);zip.outputStream.pipe(stream);zip.end();});}finally{if(path.dirname(path.resolve(dir))===exportRoot)await fs.rm(dir,{recursive:true,force:true});}});
  }
  if(method==='pdf.create')return new PDFs(store(p.workspace)).create(p.folder||'');
  if(method==='pdf.info')return new PDFs(store(p.workspace)).info(p.id);
  if(method==='pdf.page')return new PDFs(store(p.workspace)).page(p.id,p.page);
  if(method==='pdf.outline')return new PDFs(store(p.workspace)).outline(p.id);
  if(method==='pdf.destination')return new PDFs(store(p.workspace)).destination(p.id,p.dest);
  if(method==='pdf.prepareIndex')return new PDFs(store(p.workspace)).prepareIndex(p.id);
  if(method==='pdf.preview'){const value=await new PDFs(store(p.workspace)).preview(p.id,p.page,p.scale);const image=await output('.'+value.format,file=>fs.writeFile(file,value.bytes),true);const item=exports.get(image.download.split('/').at(-1));item.name=null;item.mime=value.format==='jpg'?'image/jpeg':'image/png';return {...image,width:value.width,height:value.height};}
  if(method==='pdf.index')return new PDFs(store(p.workspace)).index(p);
  if(method==='pdf.searchIndex')return new PDFs(store(p.workspace)).searchIndex(p.id);
  if(method==='pdf.get')return new PDFs(store(p.workspace)).read(p.id);
  if(method==='pdf.save')return new PDFs(store(p.workspace)).save(p);
  if(method==='pdf.import')return new PDFs(store(p.workspace)).import(new Uint8Array(p.bytes),p.name,p.folder||'');
  if(method==='pdf.export')return output('.pdf',async file=>fs.writeFile(file,await new PDFs(store(p.workspace)).export(p.id,p.annotated,path.join(dist,'pdf-font.ttf'))));
  if(method==='folder.export')return output('.zip',file=>require('./folder-export.cjs').exportFolder(p,{library:store(p.workspace),dialog:{showSaveDialog:async()=>({filePath:file})}}));
  if(method==='script.export'){if(!['txt','pdf'].includes(p.format)||typeof p.text!=='string'||p.text.length>5_000_000)throw new Error('내보낼 내용을 확인해 주세요.');return output('.'+p.format,async file=>{if(p.format==='txt')return fs.writeFile(file,'\ufeff'+p.text);const escape=require('./memo-export.cjs').cleanHTML;await require('./pdf-export.cjs').printPDF(`<html><meta charset="utf-8"><body style="font-family:'Malgun Gothic';white-space:pre-wrap">${escape(p.text.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'))}</body></html>`,file,BrowserWindow);});}
  if(method==='record.recover'){
   if(recordings.get(p.previousId)===context.device){const storeWork=store('work');await storeWork.finishRecording({id:p.previousId,seconds:Number(p.seconds)||0});recordings.delete(p.previousId);onRecordingChange?.();}
   return rpc('audio.import',{workspace:'work',folder:'',name:p.name,bytes:p.bytes},context);
  }
  if(method==='audio.import'){const ext=path.extname(p.name||'').toLowerCase();if(!['.wav','.mp3','.m4a','.webm','.ogg','.flac','.mp4','.aac'].includes(ext))throw new Error('지원하는 음성 파일을 선택해 주세요.');await fs.mkdir(root,{recursive:true});const file=path.join(root,randomUUID()+ext);await fs.writeFile(file,new Uint8Array(p.bytes),{flag:'wx'});try{const result=await store(p.workspace).importAudio(file,p.folder||'');result.library=await store(p.workspace).updateNote(result.note.id,{title:path.basename(p.name,ext)});result.note=result.library.notes.find(n=>n.id===result.note.id);result.notes=[result.note];return result;}finally{await fs.unlink(file);}}
  if(method==='record.discard-saved')return store('work').discardRecording(p.id);
  if(method==='record.begin'){const value=await store('work').beginRecording(p);recordings.set(value.id,context.device);onRecordingChange?.();return value;}
  if(method.startsWith('record.')){if(recordings.get(p.id)!==context.device)throw new Error('다른 기기의 진행 중인 녹음입니다.');const s=store('work');switch(method){case 'record.append':return s.appendRecording({...p,bytes:new Uint8Array(p.bytes)});case 'record.checkpoint':return s.checkpointRecording(p);case 'record.finish':{const result=await s.finishRecording(p);recordings.delete(p.id);onRecordingChange?.();return result;}case 'record.abandon':{await s.abandonRecording(p.id);recordings.delete(p.id);onRecordingChange?.();return s.list();}case 'record.discard':{await s.discardRecording(p.id);recordings.delete(p.id);onRecordingChange?.();return s.list();}}}
  if(method==='record.discard-saved'){return store('work').discardRecording(p.id);}
  throw new Error('웹에서 지원하지 않는 기능입니다. PC 앱에서 사용해 주세요.');
 }
 async function asset(url){const [type,mode,id,name,...rest]=url.pathname.slice('/file/'.length).split('/');if(rest.length)throw new Error('파일 주소를 확인해 주세요.');if(type==='export'){const value=exports.get(mode);if(!value||value.expires<Date.now())throw new Error('다운로드가 만료되었습니다. 다시 내보내 주세요.');return value;}const s=store(mode);const note=s.data.notes.find(n=>n.id===id&&!n.deleted);if(!note)throw new Error('파일이 삭제되었거나 존재하지 않습니다.');if(type==='pdf')return {filename:new PDFs(s).file(id),mime:'application/pdf'};if(type==='audio')return s.getAudio(id);if(type==='memo')return new Memos(s).asset(`loxt-asset://memo/${id}/${name}`);throw new Error('파일 주소를 확인해 주세요.');}
 return {rpc:async(...args)=>require('../shared/library-summary.cjs').lightResult(await rpc(...args)),asset};
}
module.exports={webServices};
