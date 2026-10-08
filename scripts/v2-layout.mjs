import {_electron as electron} from 'playwright';
import {mkdir,mkdtemp,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {Library} from '../electron/library.cjs';
import {Memos} from '../electron/memos.cjs';
import {waveHeader} from '../electron/pcm-wave.cjs';
const out=path.resolve('test-results/v2-layout');await mkdir(out,{recursive:true});const profile=await mkdtemp(path.join(out,'profile-')),root=path.join(profile,'LOXT');
await mkdir(root,{recursive:true});const audio=path.join(profile,'sample.wav');await writeFile(audio,Buffer.concat([waveHeader(32000*20),Buffer.alloc(32000*20)]));await writeFile(path.join(profile,'library-location.json'),JSON.stringify({version:1,root}));
for(const mode of ['work','live']){const library=new Library(path.join(root,mode==='work'?'work-library':'live-library'));await library.ready;await library.createFolder('회의');const record=(await library.importAudio(audio,'회의')).note;await library.updateNote(record.id,{title:'반응형 검증 녹음'});await library.completeTranscription(record.id,{seconds:20,segments:[{start:0,end:18,text:'UI 검증용 예시 문장입니다. 실제 추론 결과가 아닙니다.'}],model:'large-v3-turbo',device:'cpu',compute_type:'int8',language:'ko'});const memos=new Memos(library),{note}=await memos.create('회의');await library.updateNote(note.id,{title:'반응형 검증 메모'});await memos.save({id:note.id,revision:0,blocks:[{id:crypto.randomUUID(),type:'paragraph',props:{},content:[{type:'text',text:'반응형 검증용 비공개 메모입니다.',styles:{}}],children:[]}]});}
const env={...process.env,SORINOTE_TEST:'1',SORINOTE_TEST_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;delete env.SORINOTE_DEV;
const version=JSON.parse(await readFile('package.json','utf8')).version;
let app;const results={profile,version,fixture:'Private sample data, actual packaged UI, theme/resize/drag/zoom. No inference or user library access.',rows:[]};
try{
 const exe=process.argv.slice(2).find(v=>v.endsWith('.exe'));app=await electron.launch({...(exe?{executablePath:exe}:{}),args:exe?[]:['.'],env});const page=await app.firstWindow();page.setDefaultTimeout(12000);
 const main=()=>page.locator('.workspace-main .workspace-panel:not([hidden])');
 await app.evaluate(({BrowserWindow})=>{BrowserWindow.getAllWindows()[0].setSize(1440,900);BrowserWindow.getAllWindows()[0].show();});
 await main().getByRole('heading',{name:'홈',exact:true}).waitFor();
 async function reset(){await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.webContents.setZoomFactor(1);w.setSize(1440,900);});if(await page.locator('.panel-open').count())await page.locator('.side-dock').getByRole('button',{name:'패널 접기',exact:true}).click();await page.waitForTimeout(260);}
 async function capture(name){const bytes=await app.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'));await writeFile(path.join(out,name+'.png'),Buffer.from(bytes,'base64'));}
 async function survey(mode,theme,screen){
  for(const config of [{name:'full',width:1440,zoom:1,panel:false},{name:'small',width:860,zoom:1,panel:false},{name:'panel-small',width:860,zoom:1,panel:true},{name:'panel-drag',width:1440,zoom:1,panel:true,drag:true},{name:'zoom150-panel',width:1440,zoom:1.5,panel:true}]){
   await reset();await app.evaluate(({BrowserWindow},c)=>{const w=BrowserWindow.getAllWindows()[0];w.setSize(c.width,900);w.webContents.setZoomFactor(c.zoom);},config);await page.waitForTimeout(100);
   if(config.panel){await main().getByRole('button',{name:'패널 열기',exact:true}).click();await page.waitForTimeout(280);if(config.drag){const sep=page.getByRole('separator',{name:'새 탭 패널 너비',exact:true}),b=await sep.boundingBox();await page.mouse.move(b.x+b.width/2,b.y+20);await page.mouse.down();await page.mouse.move(380,b.y+20,{steps:6});await page.mouse.up();await page.waitForTimeout(280);}}
   const data=await main().evaluate(root=>{
    const rect=root.getBoundingClientRect();const view=root.querySelector('.main'),v=view?.getBoundingClientRect();
    const controls=[...root.querySelectorAll('.heading button,.heading input,.library-actions button,.script-actions button,.memo-toolbar button,.workspace-player button,.settings-panel button')].filter(el=>el.getClientRects().length).map(el=>{const b=el.getBoundingClientRect();return {text:el.getAttribute('aria-label')||el.textContent.trim(),x:b.x,right:b.right,width:b.width,height:b.height,clipped:b.x<rect.x-.5||b.right>rect.right+.5};});
    return {viewport:{width:innerWidth,height:innerHeight},workspace:{left:rect.x,right:rect.right,width:rect.width},main:view?{left:v.x,right:v.right,width:v.width,scrollWidth:view.scrollWidth,clientWidth:view.clientWidth,scrollLeft:view.scrollLeft}:null,controls,sideWidth:root.querySelector('.sidebar')?.getBoundingClientRect().width};
   });results.rows.push({mode,theme,screen,config:config.name,...data});console.log(mode,theme,screen,config.name,'width',data.workspace.width,'overflow',data.main?data.main.scrollWidth-data.main.clientWidth:0,'clipped',data.controls.filter(c=>c.clipped).map(c=>c.text).join('|'));
   if(config.name==='panel-drag'||config.name==='panel-small')await capture(`${mode}-${theme}-${screen}-${config.name}`);
  }
  await reset();
 }
 for(const mode of ['work','live']){
  if(mode==='live'){await main().getByRole('button',{name:'워크스페이스 선택',exact:true}).click();await page.getByRole('menuitemradio',{name:/^Live/}).click();}
  const library=await page.evaluate(mode=>mode==='work'?window.desktop.getLibrary():window.desktop.live.getLibrary(),mode),record=library.notes.find(n=>n.kind!=='memo'&&!n.deleted&&n.folder==='회의');
  for(const theme of ['dark','light']){
   
   await page.evaluate(t=>window.desktop.appearance.set(t),theme);await page.waitForFunction(t=>document.documentElement.dataset.theme===t,theme);
   await main().getByRole('button',{name:'홈',exact:true}).click();await survey(mode,theme,'home');
   await main().locator('.sidebar button[title="회의"]').click();
   for(const [screen,label] of [['folder-list','목록 보기'],['folder-card','카드 보기'],['folder-compact','작은 카드 보기']]){const button=main().getByRole('button',{name:label,exact:true});if(await button.count()){await button.click();await survey(mode,theme,screen);}}
   await main().getByRole('button',{name:record.title+' 열기',exact:true}).click();await main().getByRole('button',{name:'메모 열기',exact:true}).waitFor();
   if(mode==='work'&&theme==='light')results.exportSizes=await main().locator('.script-actions button').evaluateAll(els=>els.map(el=>({label:el.getAttribute('aria-label')||el.textContent.trim(),height:el.getBoundingClientRect().height,width:el.getBoundingClientRect().width,font:getComputedStyle(el).fontSize,padding:getComputedStyle(el).padding})));
   await survey(mode,theme,'script');await main().getByRole('button',{name:'메모 열기',exact:true}).click();await main().locator('.memo-panel .bn-editor').waitFor();await survey(mode,theme,'script-memo');
   await main().locator('.sidebar button[title="회의"]').click();await main().getByRole('button',{name:'반응형 검증 메모 열기',exact:true}).click();await main().locator('.bn-editor').waitFor();await survey(mode,theme,'memo');
   await main().getByRole('button',{name:'설정',exact:true}).click();await survey(mode,theme,'settings-general');await main().getByRole('navigation',{name:'설정 메뉴',exact:true}).getByRole('button',{name:'모델 보관함',exact:true}).click();await survey(mode,theme,'settings-models');await main().getByRole('button',{name:'← 돌아가기',exact:true}).click();
  }
 }
 await reset();await main().getByRole('button',{name:'워크스페이스 선택',exact:true}).click();await page.getByRole('menuitemradio',{name:/^Work/}).click();await main().getByRole('button',{name:'홈',exact:true}).click();await main().getByRole('button',{name:'YouTube 불러오기',exact:true}).click();await page.getByRole('dialog',{name:'YouTube 불러오기',exact:true}).waitFor();
 results.modal=await page.evaluate(()=>{const overlay=document.querySelector('.overlay'),header=document.querySelector('[data-workspace="work"] .app-header'),h=header.getBoundingClientRect();return {overlayZ:getComputedStyle(overlay).zIndex,headerZ:getComputedStyle(header).zIndex,headerHit:document.elementFromPoint(h.x+40,h.y+20)?.closest('.app-header')!==null,headerInert:header.closest('.workspace-panel').inert};});await capture('modal-logo-light');await page.getByRole('dialog').getByRole('button',{name:'닫기',exact:true}).click();results.clipped=results.rows.flatMap(row=>row.controls.filter(c=>c.clipped).map(control=>({mode:row.mode,theme:row.theme,screen:row.screen,config:row.config,control})));results.complete=true;
 await app.close();app=null;
}catch(error){results.error=error.stack;throw error;}finally{await writeFile(path.join(out,'results.json'),JSON.stringify(results,null,2));if(app)await app.evaluate(({app})=>app.exit(0)).catch(()=>{});}
