import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {MODELS} from '../electron/transcription-config.cjs';
const out=path.resolve('test-results/model-store-2.6.0');await mkdir(out,{recursive:true});
const profile=await mkdtemp(path.join(out,'profile-')),root=path.join(profile,'transcription');
await mkdir(path.join(root,'store-cache'),{recursive:true});
for(const id of ['small','medium','large-v3-turbo']){const dir=path.join(root,'models',id);await mkdir(dir,{recursive:true});for(const name of ['model.bin','config.json','tokenizer.json'])await writeFile(path.join(dir,name),'{}');}
await writeFile(path.join(root,'settings.json'),'{"model":"small","device":"auto"}');
await writeFile(path.join(root,'store-cache',createHash('sha256').update('featured').digest('hex')+'.json'),JSON.stringify({at:Date.now(),value:{models:MODELS.map(model=>({...model,name:model.repo.split('/')[1],provider:model.repo.split('/')[0],languages:['ko','en'],license:'mit',work:true,live:true,compatibility:'supported',compatibilityText:'설치 가능'}))}}));
const env={...process.env,SORINOTE_TEST:'1',SORINOTE_TEST_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;delete env.SORINOTE_DEV;
const exe=process.argv[2],launch=()=>electron.launch({...(exe?{executablePath:path.resolve(exe)}:{}),args:exe?[]:['.'],env});
let app=await launch(),page;const errors=[],result={profile,fixtures:'UI catalog and search are examples; dummy model files are not inference evidence'};
const panel=()=>page.locator('.workspace-panel:not([hidden])');
async function capture(name){await page.evaluate(()=>document.fonts.ready);const image=await app.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'));await writeFile(path.join(out,name+'.png'),Buffer.from(image,'base64'));}
async function mode(name){await panel().getByRole('button',{name:'워크스페이스 선택',exact:true}).click();await page.getByRole('menuitemradio',{name:new RegExp('^'+name)}).click();}
async function choice(label,name){await page.getByRole('dialog').getByRole('button',{name:label,exact:true}).click();await page.getByRole('menuitemradio',{name,exact:true}).click();}
try{
 page=await app.firstWindow();page.setDefaultTimeout(18000);page.on('pageerror',error=>errors.push(error.message));
 await app.evaluate(({BrowserWindow})=>{BrowserWindow.getAllWindows()[0].setSize(1360,900);BrowserWindow.getAllWindows()[0].show();});
 await panel().getByRole('button',{name:'모델 스토어 열기',exact:true}).waitFor();await capture('home-dark');
 await panel().getByRole('button',{name:'모델 스토어 열기',exact:true}).click();await panel().getByRole('heading',{name:'모델 스토어'}).waitFor();await panel().locator('.model-row').first().waitFor();
 assert.equal(await panel().locator('.model-row').count(),6);
 const medium=panel().locator('.model-entry').filter({has:page.locator('.store-model-name small', {hasText:'Systran/faster-whisper-medium'})});
 await medium.getByRole('button',{name:'관리',exact:true}).click();await choice('모델 역할','표준');await page.getByRole('textbox',{name:'모델 별명',exact:true}).fill('회의 모델');await page.getByRole('textbox',{name:'모델 태그',exact:true}).fill('회의, 한국어');await page.getByRole('checkbox',{name:'Work 기본 모델로 사용'}).check();await capture('roles-dialog');await page.getByRole('dialog').getByRole('button',{name:'저장',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
 await page.waitForFunction(async()=>(await window.desktop.preferences.get()).work.model==='medium');assert.equal((await page.evaluate(()=>window.desktop.preferences.get())).live.model,'large-v3-turbo');
 await medium.getByText('회의 모델',{exact:true}).waitFor();await capture('store-dark');result.workLiveIndependent=true;
 await mode('Live');await panel().getByRole('button',{name:'모델 스토어 열기',exact:true}).click();const liveMedium=panel().locator('.model-entry').filter({hasText:'Systran/faster-whisper-medium'});assert.match(await liveMedium.innerText(),/기타 모델/);result.otherRole=true;
 await app.evaluate(({ipcMain})=>{ipcMain.removeHandler('model-store:search');ipcMain.handle('model-store:search',async(_event,{query})=>{await new Promise(resolve=>setTimeout(resolve,query==='slow'?900:10));return {models:[{id:'search-'+query,name:query+'-model',repo:'example/'+query,provider:'example',description:'검색 UI 예시',compatibility:'unsupported',compatibilityText:'지원 예정',languages:['ko']}],nextCursor:null,checkedAt:Date.now()};});});
 await panel().getByRole('textbox',{name:'모델 검색',exact:true}).fill('slow');await page.waitForTimeout(450);await panel().getByRole('textbox',{name:'모델 검색',exact:true}).fill('new');await panel().getByText('new-model',{exact:true}).waitFor();await page.waitForTimeout(600);assert.equal(await panel().getByText('slow-model',{exact:true}).count(),0);assert.equal(await panel().getByRole('button').filter({hasText:/^지원 예정$/}).isDisabled(),true);result.staleSearchProtected=true;
 await panel().getByRole('textbox',{name:'모델 검색',exact:true}).fill('');
 await page.evaluate(()=>window.desktop.appearance.set('light'));await page.waitForFunction(()=>document.documentElement.dataset.theme==='light');await capture('store-light');
 for(const [width,height] of [[1000,780],[760,800],[480,850]]){await app.evaluate(({BrowserWindow},{width,height})=>{const window=BrowserWindow.getAllWindows()[0];window.setMinimumSize(400,500);window.setSize(width,height);},{width,height});await page.waitForTimeout(100);const overflow=await page.evaluate(()=>{const root=document.querySelector('.workspace-panel:not([hidden]) .model-store-page');return {width:root.clientWidth,scroll:root.scrollWidth};});assert.ok(overflow.scroll<=overflow.width+2,JSON.stringify(overflow));await capture('store-'+width);}
 result.responsive=true;
 await app.close();app=await launch();page=await app.firstWindow();await panel().getByRole('heading',{name:'홈',exact:true}).waitFor();const stored=JSON.parse(await readFile(path.join(root,'model-store.json'),'utf8'));assert.equal(stored.roles.work.standard,'medium');assert.equal(stored.roles.live.standard,'large-v3-turbo');assert.equal(stored.annotations.medium.alias,'회의 모델');result.restartPersistence=true;
 assert.deepEqual(errors,[]);await writeFile(path.join(out,'result.json'),JSON.stringify({...result,errors},null,2));console.log(JSON.stringify(result));
}finally{await app.close().catch(()=>{});}
