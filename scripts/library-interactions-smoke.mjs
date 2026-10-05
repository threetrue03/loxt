import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { Library } from '../electron/library.cjs';

await mkdir('test-results', { recursive: true });
const data = await mkdtemp(path.resolve('test-results/library-interactions-ui-'));
const library = new Library(path.join(data, 'library')); await library.ready;
await library.createFolder('강의'); await library.createFolder({name:'요약',parent:'강의'});
const rate = 48000, wav = Buffer.alloc(44 + rate * 12 * 2);
wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);
for(let i=0;i<rate*12;i++) wav.writeInt16LE(Math.round(Math.sin(2*Math.PI*440*i/rate)*10000),44+i*2);
const source = path.join(data, 'input.wav'); await writeFile(source,wav);
const records=[];
for (const title of ['기록 하나','기록 둘','폴더 안의 기록']) {
  const {note} = await library.importAudio(source, title === '폴더 안의 기록' ? '강의' : '');
  await library.updateNote(note.id,{title}); records.push(note);
}
const env={...process.env,SORINOTE_TEST:'1',SORINOTE_TEST_DATA:data};delete env.ELECTRON_RUN_AS_NODE;delete env.SORINOTE_DEV;
const executablePath=process.argv.slice(2).find(argument=>argument.endsWith('.exe'));
const app=await electron.launch({...(executablePath?{executablePath:path.resolve(executablePath)}:{}),args:[...(executablePath?[]:['.']),'--use-fake-device-for-media-stream',`--use-file-for-fake-audio-capture=${source}`],env});
await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:0});});
try {
  const page=await app.firstWindow();await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].show());page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.getByRole('heading',{name:'홈',exact:true}).waitFor();
  const saved=async(check)=>{for(let i=0;i<150;i++){const value=await page.evaluate(()=>window.desktop.getLibrary());if(check(value))return value;await page.waitForTimeout(100);}throw Error('Library change timed out');};
  const capture=async name=>{await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await page.waitForTimeout(100);const bytes=await app.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].webContents.capturePage(undefined,{stayHidden:true,stayAwake:true})).toPNG().toString('base64'));await writeFile(path.join(data,name),Buffer.from(bytes,'base64'));};
  const headerBefore=await page.locator('.app-header .brand-logo').boundingBox();
  const toggleBefore=await page.locator('.app-header .sidebar-toggle').boundingBox();
  await page.getByRole('button',{name:'사이드바 접기',exact:true}).click();await page.waitForTimeout(300);
  assert.deepEqual(await page.locator('.app-header .brand-logo').boundingBox(),headerBefore);
  assert.deepEqual(await page.locator('.app-header .sidebar-toggle').boundingBox(),toggleBefore);
  assert.ok(toggleBefore.x+toggleBefore.width <= headerBefore.x);
  await page.getByRole('button',{name:'사이드바 펼치기',exact:true}).click();await page.waitForTimeout(300);
  await page.locator('.library-root').click();await page.getByRole('heading',{name:'내 보관함',exact:true}).waitFor();
  assert.equal(await page.locator('.note-card').count(),2);
  await page.getByRole('heading',{name:'내 보관함',exact:true}).dblclick();assert.equal(await page.getByLabel('폴더 이름 바꾸기').count(),0);
  await page.locator('.folder-card').filter({hasText:'강의'}).click();await page.locator('.folder-card').filter({hasText:'요약'}).click();
  await page.locator('.folder-breadcrumb').getByRole('button',{name:'내 보관함',exact:true}).click();
  assert.equal(await page.locator('.note-card').count(),2);
  await page.getByRole('button',{name:'새 폴더',exact:true}).click();assert.equal(await page.getByRole('dialog').count(),0);
  await page.getByLabel('새 폴더 이름',{exact:true}).press('Escape');assert.equal((await page.evaluate(()=>window.desktop.getLibrary())).folders.length,2);
  await page.locator('.folder-card').filter({hasText:'강의'}).click();
  await page.getByRole('button',{name:'새 폴더',exact:true}).click();
  await page.getByLabel('새 폴더 이름',{exact:true}).fill('연구');await page.getByLabel('새 폴더 이름',{exact:true}).press('Enter');
  const created=await saved(value=>value.folders.includes('연구'));assert.equal(created.folderParents['연구'],undefined);
  await page.getByRole('button',{name:'새로 추가하기',exact:true}).click();assert.equal(await page.getByRole('menu',{name:'새로 추가하기'}).getByRole('separator').count(),1);await page.keyboard.press('Escape');
  assert.ok(await page.locator('.note-card').first().evaluate(element=>parseFloat(getComputedStyle(element).borderTopWidth)>0&&parseFloat(getComputedStyle(element).borderTopWidth)<=1));
  for (const view of ['카드 보기','작은 카드 보기']) {
    await page.getByRole('button',{name:view,exact:true}).click();
    const folders=await page.locator('.folder-collection').boundingBox(), cards=await page.locator('.recording-collection').boundingBox();
    assert.ok(folders.y+folders.height<=cards.y); await capture(view==='카드 보기'?'separated-cards.png':'separated-compact.png');
  }
  // Select by area in list view, then move the whole selection to a sidebar folder.
  await page.getByRole('button',{name:'목록 보기',exact:true}).click();
  const box=await page.locator('.note-collection').boundingBox();const first=await page.locator('.note-card').first().boundingBox();const last=await page.locator('.note-card').last().boundingBox();
  await page.mouse.move(box.x+3,last.y+last.height+15);await page.mouse.down();await page.mouse.move(first.x+first.width-8,first.y+8,{steps:12});
  await page.locator('.selection-area').waitFor();assert.equal(await page.locator('.selection-area').count(),1);await capture('selection.png');await page.mouse.up();
  assert.equal(await page.locator('.note-card.is-selected').count(),2);
  const sourceBox=await page.locator('.note-open').first().boundingBox();const dest=await page.locator('.folders [data-folder-drop="강의"]').boundingBox();
  await page.mouse.move(sourceBox.x+65,sourceBox.y+15);await page.mouse.down();await page.waitForTimeout(330);await page.mouse.move(dest.x+60,dest.y+dest.height/2,{steps:10});await page.locator('.selection-drag').waitFor();await capture('drag.png');await page.mouse.up();
  await saved(value=>records.slice(0,2).every(note=>value.notes.find(item=>item.id===note.id).folder==='강의'));
  assert.equal(await page.locator('.note-card').count(),0);
  await page.getByRole('button',{name:'홈',exact:true}).click();await page.locator('.home-page').getByRole('button',{name:'모두 보기',exact:true}).click();await page.getByRole('button',{name:'카드 보기',exact:true}).click();
  // A normal click still opens a recording after the selection gesture.
  await page.getByRole('button',{name:'기록 하나 열기',exact:true}).click();await page.getByLabel('녹음 제목 변경',{exact:true}).waitFor();
  await page.locator('.sidebar-create').click();await page.getByLabel('녹음 제목',{exact:true}).fill('가');
  const title=page.getByLabel('녹음 제목',{exact:true}), short=await title.boundingBox();
  await title.fill('녹음 제목 길이 검사'); const long=await title.boundingBox(); assert.ok(long.width>short.width);
  await title.fill('아주 긴 제목 '.repeat(20)); assert.ok(await title.evaluate(el=>el.getBoundingClientRect().right<=innerWidth));
  assert.equal(await page.locator('.clock').textContent(),'00:00:00'); assert.equal(await page.getByText('녹음 준비',{exact:true}).count(),0);
  await title.fill('재개 검사'); await capture('work-ready.png');
  await page.getByRole('button',{name:'녹음 시작',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.error-message')||document.querySelector('.recording.is-recording'));if(await page.locator('.error-message').count())throw Error(await page.locator('.error-message').innerText());await page.waitForFunction(()=>document.querySelector('.clock').textContent.split(':').reduce((total,part)=>total*60+Number(part),0)>=2);
  if (process.argv.includes('--theme')) {
    const prior = await page.locator('.clock').textContent();
    await page.getByRole('button',{name:'설정',exact:true}).click();
    await page.getByRole('button',{name:'테마',exact:true}).click();
    await page.getByRole('menuitemradio',{name:'라이트 테마',exact:true}).click();
    await page.waitForFunction(()=>document.documentElement.dataset.theme==='light');
    await page.getByRole('button',{name:'녹음으로 돌아가기',exact:true}).click();
    await page.waitForFunction(previous=>document.querySelector('.clock').textContent>previous,prior);
    assert.equal(await page.locator('.recording.is-recording').count(),1);
    await capture('recording-theme-light.png');
    console.log('PASS theme change via General settings retains active MediaRecorder and increasing timer');
  }
  await page.getByRole('button',{name:'녹음 중단',exact:true}).click();await page.getByRole('dialog',{name:'변환하기'}).waitFor();assert.equal(await page.getByRole('button',{name:'버리기',exact:true}).count(),1);
  const discardBox=await page.getByRole('button',{name:'버리기',exact:true}).boundingBox(), convertBox=await page.getByRole('dialog').getByRole('button',{name:'변환하기',exact:true}).boundingBox(); assert.ok(discardBox.x<convertBox.x);
  const time=await page.locator('.clock').textContent();await page.getByRole('button',{name:'닫기',exact:true}).click();await page.getByRole('button',{name:'홈',exact:true}).click();await page.waitForTimeout(1000);
  await page.getByRole('button',{name:'녹음으로 돌아가기',exact:true}).click();assert.equal(await page.locator('.clock').textContent(),time);
  assert.ok(await page.getByRole('button',{name:'녹음 중단',exact:true}).isEnabled());await page.getByRole('button',{name:'녹음 계속',exact:true}).click();await page.waitForFunction(previous=>document.querySelector('.clock').textContent.split(':').reduce((total,part)=>total*60+Number(part),0)>previous,time.split(':').reduce((total,part)=>total*60+Number(part),0));
  const base=await page.evaluate(()=>window.desktop.getTranscriptionEnvironment());
  await app.evaluate(({ipcMain},base)=>{ipcMain.removeHandler('transcription:start');ipcMain.handle('transcription:start',()=>base);},base);
  await page.getByRole('button',{name:'녹음 중단',exact:true}).click();await capture('paused-conversion.png');
  await page.getByRole('dialog').getByRole('button',{name:'변환하기',exact:true}).click();await page.getByLabel('녹음 제목 변경',{exact:true}).waitFor();
  const finished=await saved(value=>value.notes.some(note=>note.title==='재개 검사'));const note=finished.notes.find(item=>item.title==='재개 검사');
  const audio=await page.evaluate(async id=>{const context=new AudioContext();try{const response=await fetch(`sorinote-audio://recording/${id}`);const buffer=await context.decodeAudioData(await response.arrayBuffer());return {duration:buffer.duration,peak:buffer.getChannelData(0).reduce((max,sample)=>Math.max(max,Math.abs(sample)),0)};}finally{await context.close();}},note.id);
  assert.ok(audio.duration>2&&Math.abs(audio.duration-note.seconds)<1);assert.ok(audio.peak>.01);
  await page.locator('.sidebar-create').click();await page.getByRole('button',{name:'녹음 시작',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.error-message')||document.querySelector('.recording.is-recording'));if(await page.locator('.error-message').count())throw Error(await page.locator('.error-message').innerText());await page.waitForFunction(()=>document.querySelector('.clock').textContent.split(':').reduce((total,part)=>total*60+Number(part),0)>=2);
  await page.getByRole('button',{name:'녹음 중단',exact:true}).click();await page.getByRole('button',{name:'버리기',exact:true}).click();await page.getByRole('heading',{name:'홈',exact:true}).waitFor();
  const remaining=await page.evaluate(()=>window.desktop.getLibrary());assert.equal(remaining.notes.length,4);assert.equal(await page.locator('.background-recording').count(),0);
  await page.waitForTimeout(2600);assert.equal(await page.locator('.toast').count(),0);
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(860,640));await capture('small-header.png');
  assert.equal(await page.locator('.main').evaluate(element=>element.scrollWidth>element.clientWidth),false);
  assert.deepEqual(errors,[]);console.log('PASS: fixed header, root breadcrumbs, inline root folder, marquee/group drag, pause/navigation/resume, actual audio finalisation, discard');console.log('TEST_PROFILE',data);
} catch (failure) {
  const page = await app.firstWindow();
  console.error('FAILURE_STATE', await page.evaluate(() => ({clocks:[...document.querySelectorAll('.clock')].map(el=>el.textContent), errors:[...document.querySelectorAll('.error-message')].map(el=>el.textContent), states:[...document.querySelectorAll('.record-state')].map(el=>el.textContent), buttons:[...document.querySelectorAll('.record-actions button')].map(el=>el.textContent)})));
  throw failure;
} finally {
  await app.evaluate(({BrowserWindow})=>{for(const window of BrowserWindow.getAllWindows())window.destroy();}).catch(()=>{});await app.close().catch(()=>{});
}
