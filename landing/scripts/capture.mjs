import { _electron as electron } from 'playwright';
import { mkdir, mkdtemp, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { Library } from '../../electron/library.cjs';
import { Memos } from '../../electron/memos.cjs';
import { randomUUID } from 'node:crypto';
import { version } from '../release.mjs';
const root = path.resolve(import.meta.dirname, '../..'), assets = path.join(root, 'landing/public/assets');
await mkdir(assets, { recursive: true });
for (const name of ['LOXT-lockup-white.svg','LOXT-symbol-white.svg','LOXT-wordmark-white.svg']) await copyFile(path.join(root,'src/assets/brand',name),path.join(assets,name));
for (const name of ['SUIT-Variable.woff2','SUIT-LICENSE.txt']) await copyFile(path.join(root,'src/assets/fonts',name),path.join(assets,name));
await mkdir(path.join(root,'test-results'),{recursive:true});
const data = await mkdtemp(path.join(root,'test-results/landing-preview-'));
const rate=16000,seconds=90,wav=Buffer.alloc(44+rate*seconds*2);
wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);
const examples=[
 ['다음 주를 준비하는 제품 회의','회의/제품 디자인',['오늘은 지난주에 모은 의견을 바탕으로 다음 업데이트의 방향을 정리해 보겠습니다.','처음 사용하는 분들도 녹음에서 스크립트 확인까지 자연스럽게 이어갈 수 있도록 흐름을 단순하게 만들면 좋겠습니다.','보관함에서는 회의와 강의, 개인 메모를 폴더별로 구분하고 필요한 기록을 바로 찾을 수 있어야 합니다.','스크립트에서 문장을 선택하면 해당 부분을 다시 들을 수 있으니, 긴 녹음을 확인하는 데에도 도움이 되겠네요.','그럼 다음 주에는 수정된 화면을 함께 살펴보고, 사용 과정에서 불편한 점이 있는지 확인하겠습니다.']],
 ['생각을 정리하는 글쓰기','강의',['좋은 기록은 나중에 다시 찾고 이해할 수 있는 형태로 정리하는 것이 중요합니다.','오늘 강의에서는 핵심 문장을 찾고, 생각의 흐름에 따라 문단을 구성하는 방법을 알아보겠습니다.']],
 ['산책 중 떠오른 아이디어','아이디어',['목소리로 짧게 남긴 생각도 하나의 기록이 될 수 있습니다. 산책 중에 떠오른 아이디어를 모아 작은 프로젝트로 이어가 보면 어떨까요?','다음에는 주제별로 폴더를 나누고, 비슷한 생각들을 함께 읽어보면 좋겠습니다.']],
 ['새로운 프로젝트 킥오프','회의',['이번 프로젝트의 목표는 매일 쌓이는 기록을 더 쉽게 다시 꺼내보는 것입니다.','이번 주에는 사용 흐름을 정리하고 다음 회의에서 화면을 검토하겠습니다.']],
];
const liveExamples=[
 ['오늘의 팀 미팅','회의',['홈에서 바로 Live를 시작하면 말하는 동안 스크립트가 쌓입니다.','Work와 Live의 기록은 각각의 보관함에 저장되는 거죠?','네. 기존 녹음 파일은 Work로 정리하고, 지금 진행 중인 대화는 Live로 기록하면 됩니다.','회의가 끝나면 원본과 스크립트를 다시 확인해 보겠습니다.']],
 ['함께 읽는 디자인 노트','강의',['오늘은 화면의 여백과 읽기 쉬운 글자 배치를 함께 살펴보겠습니다.','좋은 기록은 다시 읽을 때도 생각의 흐름이 자연스럽게 이어집니다.']],
 ['퇴근 전 짧은 메모','아이디어',['내일 확인할 내용을 짧게 남겨 두겠습니다.','오늘 정리한 아이디어를 다음 회의에서 다시 살펴보면 좋겠습니다.']],
];
const input=path.join(data,'녹음 예시.wav');await writeFile(input,wav);
const records={};
for(const [mode,entries] of [['work',examples],['live',liveExamples]]){
 const library=new Library(path.join(data,mode==='work'?'library':'live-library'));await library.ready;
 for(const name of ['회의','강의','아이디어'])await library.createFolder(name);
 await library.createFolder({name:'제품 디자인',parent:'회의'});records[mode]=[];
 for(const [title,folder,texts]of entries){
  const {note}=await library.importAudio(input,folder);await library.updateNote(note.id,{title});
  await library.completeTranscription(note.id,{seconds,segments:texts.map((text,i)=>({start:i*12,end:i*12+10,text,speaker:mode==='work'&&folder!=='회의/제품 디자인'?'A':['A','B','C','B','A'][i]})),model:'large-v3-turbo',device:'cuda',compute_type:'int8_float16',language:'ko'});
  records[mode].push({...note,title});
 }
}
const workLibrary=new Library(path.join(data,'library'));await workLibrary.ready;const memos=new Memos(workLibrary);
const text=value=>[{type:'text',text:value,styles:{}}];
const block=(type,value,extra={})=>({id:randomUUID(),type,props:{},content:text(value),children:[],...extra});
const memoBlocks=[block('heading','다음 회의 준비',{props:{level:1}}),block('paragraph','녹음을 다시 듣고, 결정한 내용과 다음 할 일을 한 문서에 정리합니다.'),block('heading','이번에 결정한 내용',{props:{level:2}}),block('bulletListItem','새로 추가하기에서 녹음 없는 메모도 만들 수 있도록 합니다.'),block('bulletListItem','녹음 옆 메모 패널은 재생바를 유지하고 각각 스크롤합니다.'),block('checkListItem','다크·라이트 화면 검토',{props:{checked:true}}),block('checkListItem','다음 회의에서 사용 흐름 확인',{props:{checked:false}}),block('toggleListItem','검토할 질문',{children:[block('paragraph','스크립트와 메모를 함께 읽을 때 편집 공간이 충분한가요?')]}),{id:randomUUID(),type:'table',props:{},content:{type:'tableContent',rows:[{cells:[text('할 일'),text('상태')]},{cells:[text('화면 검토'),text('진행 중')]},{cells:[text('문서 정리'),text('완료')]}]},children:[]},block('paragraph','')];
const {note:memoNote}=await memos.create('회의/제품 디자인');await workLibrary.updateNote(memoNote.id,{title:'다음 업데이트를 위한 메모'});await memos.save({id:memoNote.id,revision:0,blocks:memoBlocks});records.work.push({...memoNote,title:'다음 업데이트를 위한 메모'});
await memos.save({id:records.work[0].id,revision:0,blocks:[block('heading','회의 중 남긴 메모',{props:{level:2}}),block('paragraph','00:12 · 처음 사용하는 사람에게도 자연스럽게 이어지는 흐름'),block('bulletListItem','녹음 → 변환 → 스크립트 확인을 한 화면에서'),block('bulletListItem','메모는 다시 변환해도 유지하기'),block('checkListItem','보관함의 폴더 구성 확인',{props:{checked:true}}),block('paragraph','다음 회의에서는 수정된 화면을 함께 확인합니다.')]});
const env={...process.env,SORINOTE_TEST:'1',SORINOTE_TEST_DATA:data};delete env.ELECTRON_RUN_AS_NODE;delete env.SORINOTE_DEV;
const app=await electron.launch({cwd:root,executablePath:path.join(root,'release/stage5/win-unpacked/LOXT.exe'),args:['--use-fake-device-for-media-stream',`--use-file-for-fake-audio-capture=${input}`],env});
const images=[];
try{
 const page=await app.firstWindow();page.setDefaultTimeout(20000);const info=await page.evaluate(()=>window.desktop.getAppInfo());assert.equal(info.version,version);
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await app.evaluate(({BrowserWindow,dialog})=>{const window=BrowserWindow.getAllWindows()[0];window.setSize(1440,900);window.show();dialog.showMessageBox=async()=>({response:0});});
 const scope=mode=>page.locator(`[data-workspace="${mode}"]`);
 const goHome=async mode=>{await scope(mode).getByRole('button',{name:'홈',exact:true}).click();await scope(mode).locator('.home-page').waitFor();};
 const capture=async(name,scenario,preserveFocus=false)=>{await page.evaluate(()=>document.fonts.ready);await page.locator('.toast:visible').waitFor({state:'hidden',timeout:4000});if(!preserveFocus)await page.evaluate(()=>document.activeElement?.blur());await page.mouse.move(1400,880);await page.waitForTimeout(350);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));const encoded=await app.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'));const bytes=Buffer.from(encoded,'base64');await writeFile(path.join(assets,name),bytes);images.push({file:name,width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20),scenario});};
 async function openRecent(mode){await scope(mode).locator('.home-page').getByRole('button',{name:'모두 보기',exact:true}).click();for(const note of records[mode].toReversed()){await scope(mode).getByRole('button',{name:`${note.title} 열기`,exact:true}).click();if(note.kind==='memo'){await scope(mode).locator('.memo-editor .bn-editor').waitFor();await scope(mode).getByRole('button',{name:'← 보관함',exact:true}).click();}else{await scope(mode).getByRole('region',{name:'스크립트',exact:true}).waitFor();await scope(mode).getByRole('button',{name:/녹음 목록/}).click();}}await goHome(mode);}
 await scope('work').getByRole('heading',{name:'홈',exact:true}).waitFor();await openRecent('work');
 await page.getByRole('button',{name:'워크스페이스 선택',exact:true}).click();await capture('workspace.png','workspace-menu');await page.keyboard.press('Escape');
 await scope('work').locator('.home-page').getByRole('button',{name:'모두 보기',exact:true}).click();await scope('work').getByRole('button',{name:'카드 보기',exact:true}).click();await capture('library.png','work-library');
 const first=records.work[0],last=records.work.filter(note=>note.kind!=='memo').at(-1);
 await scope('work').getByRole('button',{name:`${first.title} 열기`,exact:true}).click();await scope('work').getByRole('region',{name:'스크립트',exact:true}).waitFor();assert.equal(await scope('work').locator('.speaker-badge').count(),5);await capture('script.png','speaker-script');
 await scope('work').getByRole('button',{name:'메모 열기',exact:true}).click();await scope('work').locator('.memo-panel .bn-editor').waitFor();await capture('recording-memo.png','work-attached-memo');await scope('work').getByRole('button',{name:'메모 닫기',exact:true}).click();
 await scope('work').getByRole('button',{name:/녹음 목록/}).click();await scope('work').getByRole('button',{name:'목록 보기',exact:true}).click();
 await scope('work').getByRole('button',{name:'다음 업데이트를 위한 메모 열기',exact:true}).click();await scope('work').locator('.memo-editor .bn-editor').waitFor();await capture('memo.png','work-independent-memo');
 await scope('work').locator('.memo-editor [data-content-type="paragraph"] .bn-inline-content').first().click();await page.keyboard.press('Home');await page.keyboard.type('/');await page.getByRole('listbox').waitFor();await capture('memo-block-menu.png','work-memo-slash-menu',true);await page.keyboard.press('Escape');await page.keyboard.press('Backspace');await scope('work').getByRole('button',{name:'← 보관함',exact:true}).click();
 await scope('work').getByRole('button',{name:`${first.title} 열기`,exact:true}).click({modifiers:['Control']});await scope('work').getByRole('button',{name:`${last.title} 열기`,exact:true}).click({modifiers:['Control']});assert.equal(await scope('work').locator('.note-card.is-selected').count(),2);await capture('organize.png','multi-select');
 await scope('work').getByRole('button',{name:`${last.title} 관리`,exact:true}).click();await page.getByRole('menuitem',{name:'휴지통으로 이동',exact:true}).click();await scope('work').getByRole('button',{name:'휴지통',exact:true}).click();await scope('work').getByRole('checkbox',{name:`${last.title} 선택`,exact:true}).check();await capture('trash.png','trash-selection');
 await scope('work').locator('.sidebar-create').click();await scope('work').getByLabel('녹음 제목',{exact:true}).fill('다음 회의의 시작');await scope('work').getByRole('button',{name:'녹음 시작',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('[data-workspace="work"] .clock').textContent.split(':').reduce((sum,part)=>sum*60+Number(part),0)>=2);
 await scope('work').getByRole('button',{name:'녹음 중단',exact:true}).click();await page.getByRole('dialog',{name:'변환하기',exact:true}).waitFor();await page.getByRole('dialog').getByRole('button',{name:'회의',exact:true}).click();await capture('conversion.png','work-paused-conversion');
 await page.getByRole('button',{name:'닫기',exact:true}).click();await capture('recording.png','work-paused-recording');await scope('work').getByRole('button',{name:'녹음 중단',exact:true}).click();await page.getByRole('button',{name:'버리기',exact:true}).click();
 await scope('work').getByRole('button',{name:'설정',exact:true}).click();await scope('work').getByRole('navigation',{name:'설정 메뉴',exact:true}).getByRole('button',{name:'모델 보관함',exact:true}).click();await scope('work').locator('.model-row').first().waitFor();await capture('models.png','model-library');await scope('work').getByRole('button',{name:'← 돌아가기',exact:true}).click();
 await goHome('work');await scope('work').getByRole('button',{name:'YouTube 불러오기',exact:true}).click();
 await page.getByRole('dialog',{name:'YouTube 불러오기',exact:true}).waitFor();await capture('youtube.png','youtube-link-dialog');await page.getByRole('button',{name:'닫기',exact:true}).click();
 async function setTheme(theme){
  await scope('work').getByRole('button',{name:'설정',exact:true}).click();await scope('work').getByRole('navigation',{name:'설정 메뉴',exact:true}).getByRole('button',{name:'일반',exact:true}).click();
  await scope('work').getByRole('button',{name:'테마',exact:true}).click();await page.getByRole('menuitemradio',{name:theme==='light'?'라이트 테마':'다크 테마',exact:true}).click();
  await page.waitForFunction(theme=>document.documentElement.dataset.theme===theme,theme);
 }
 await setTheme('light');await scope('work').getByRole('button',{name:'테마',exact:true}).click();await capture('theme-settings.png','light-theme-settings');await page.keyboard.press('Escape');
 await scope('work').getByRole('button',{name:'← 돌아가기',exact:true}).click();await goHome('work');await capture('light-home.png','work-home-light');
 await scope('work').getByRole('button',{name:`${first.title} 열기`,exact:true}).click();await scope('work').getByRole('region',{name:'스크립트',exact:true}).waitFor();await capture('light-script.png','speaker-script-light');
 await scope('work').getByRole('button',{name:'메모 열기',exact:true}).click();await scope('work').locator('.memo-panel .bn-editor').waitFor();await capture('light-recording-memo.png','work-attached-memo-light');await scope('work').getByRole('button',{name:'메모 닫기',exact:true}).click();await scope('work').getByRole('button',{name:/녹음 목록/}).click();await scope('work').getByRole('button',{name:'다음 업데이트를 위한 메모 열기',exact:true}).click();await scope('work').locator('.memo-editor .bn-editor').waitFor();await capture('light-memo.png','work-independent-memo-light');
 await setTheme('dark');await scope('work').getByRole('button',{name:'← 돌아가기',exact:true}).click();await goHome('work');await capture('home.png','work-home');
 await page.getByRole('button',{name:'워크스페이스 선택',exact:true}).click();await page.getByRole('menuitemradio',{name:/^Live/}).click();await scope('live').locator('.home-page').waitFor();await openRecent('live');await capture('live-home.png','live-home');
 await scope('live').locator('.home-start-action').first().click();await scope('live').getByLabel('Live 녹음 제목',{exact:true}).fill('오늘의 팀 미팅');
 // UI example only: real renderer/audio capture with scripted Live events, without inference claims.
 const baseline=await page.evaluate(()=>window.desktop.getTranscriptionEnvironment());
 const exampleEnvironment={...baseline,models:baseline.models.map(model=>({...model,downloaded:model.preset?true:model.downloaded}))};
 await app.evaluate(({BrowserWindow,ipcMain},values)=>{
  const send=()=>BrowserWindow.getAllWindows()[0].webContents.send('live:state',global.landingLive);
  global.landingLive={stage:'idle',seconds:0,level:0,segments:[],preview:[]};
  for(const channel of ['live:state','live:prepare','live:start','live:append'])ipcMain.removeHandler(channel);
  ipcMain.handle('live:state',()=>global.landingLive);
  ipcMain.handle('live:prepare',()=>{global.landingLive={...global.landingLive,stage:'ready',model:'large-v3-turbo'};send();return global.landingLive;});
  ipcMain.handle('live:start',(_event,options)=>{global.landingLive={...global.landingLive,stage:'recording',id:'landing-example',title:options.title,seconds:62,level:.25,segments:values.segments,preview:values.preview};send();return global.landingLive;});
  ipcMain.handle('live:append',()=>global.landingLive);
  ipcMain.removeHandler('transcription:environment');ipcMain.handle('transcription:environment',()=>values.environment);
  BrowserWindow.getAllWindows()[0].webContents.send('transcription:state',values.environment);
 },{environment:exampleEnvironment,segments:liveExamples[0][2].map((text,i)=>({start:i*12,end:i*12+10,text,speaker:['A','B','A','B'][i]})),preview:[{start:58,end:62,text:'다음으로는 이번 주에 정리할 내용을 함께 살펴보겠습니다.',speaker:'A'}]});
 await scope('live').getByRole('button',{name:'Live 시작',exact:true}).click();await scope('live').getByRole('button',{name:'Live 종료',exact:true}).waitFor();
 await app.evaluate(({BrowserWindow},state)=>BrowserWindow.getAllWindows()[0].webContents.send('transcription:state',state),exampleEnvironment);
 await page.waitForFunction(()=>!document.querySelector('[data-workspace="live"] .live-model-select').textContent.includes('설치 필요'));
 await capture('live.png','live-scripted-example');
 assert.deepEqual(errors,[]);await writeFile(path.join(assets,'screenshots.json'),JSON.stringify({version:info.version,examples:true,liveInference:false,exampleAudio:'silent WAV and scripted transcript/speaker data; not accuracy or speed measurements',capturedAt:new Date().toISOString(),images},null,2));
 console.log('Captured LOXT',info.version,'using private sample profile:',data);console.log(JSON.stringify(images));
}finally{await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().forEach(window=>window.destroy())).catch(()=>{});await app.close().catch(()=>{});}
