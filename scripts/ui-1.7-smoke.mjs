import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Library } from '../electron/library.cjs';

await mkdir('test-results',{recursive:true});
const profile = await mkdtemp(path.resolve('test-results/ui-1.7-'));
for (const workspace of ['library','live-library']) {
  const library = new Library(path.join(profile,workspace));
  await library.createFolder('강의'); await library.createFolder({name:'알고리즘',parent:'강의'});
  const {note} = await library.importAudio(path.resolve('.runtime/aux-models/four-speakers.wav'),'');
  await library.completeTranscription(note.id,{seconds:56.8606875,segments:[{start:1,end:3,text:'미리보기 영역은 텍스트를 선택할 수 있어요.',speaker:'A'},{start:4,end:6,text:'다른 사람이 말하면 화자 B로 표시합니다.',speaker:'B'}],model:'small',device:'cpu',compute_type:'int8',language:'ko'});
  await library.updateNote(note.id,{title:'카드 동작 검증'});
}
const env = {...process.env,SORINOTE_TEST:'1',SORINOTE_TEST_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;delete env.SORINOTE_DEV;
const app=await electron.launch({...(process.argv[2]?{executablePath:path.resolve(process.argv[2])}:{}),args:process.argv[2]?[]:['.'],env});
try {
  const page=await app.firstWindow();page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].show());
  const capture=async name=>{const bytes=await app.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'));await writeFile(path.join(profile,name),Buffer.from(bytes,'base64'));};
  async function checkLibrary(mode) {
    const scope=page.locator(`[data-workspace="${mode}"]`);
    await scope.getByRole('heading',{name:'홈',exact:true}).waitFor();
    await scope.locator('.home-page').getByRole('button',{name:'모두 보기',exact:true}).click();
    await scope.getByRole('button',{name:'카드 보기',exact:true}).click();
    const folders=await scope.locator('.folder-collection').boundingBox(),cards=await scope.locator('.recording-collection').boundingBox();assert.ok(cards.y>=folders.y+folders.height);
    await scope.locator('.note-preview p').first().click();assert.equal(await scope.locator('.note-card:visible').count(),1);
    await scope.locator('.note-card > .cell.date').click();
    await scope.getByRole('button',{name:'다시 변환하기',exact:true}).waitFor();
    assert.equal(await scope.locator('.speaker-badge').count(),2);
    const clipboard=await app.evaluate(({clipboard})=>clipboard.readText());
    try {await scope.getByRole('button',{name:'전체 복사',exact:true}).click();await scope.locator('.copy-confirmed').waitFor();assert.equal(await scope.locator('.toast').count(),0);assert.match(await app.evaluate(({clipboard})=>clipboard.readText()),/^\[A\]/);await capture(`${mode}-script-copy.png`);}finally{await app.evaluate(({clipboard},text)=>clipboard.writeText(text),clipboard);}
    await scope.getByRole('button',{name:'다시 변환하기',exact:true}).click();
    const environment=await page.evaluate(()=>window.desktop.getTranscriptionEnvironment());
    const presets=environment.models.filter(model=>model.preset);
    const external={id:'external-00000000-0000-0000-0000-000000000000',label:'medium',downloaded:true,external:true};
    await app.evaluate(({BrowserWindow},state)=>BrowserWindow.getAllWindows()[0].webContents.send('transcription:state',state),{...environment,models:[presets[0],external,...presets.slice(1)]});
    await page.getByRole('button',{name:'변환 모델',exact:true}).click();
    const popup=page.getByRole('menu',{name:'변환 모델',exact:true}),box=await popup.boundingBox();assert.ok(box.width<=320);assert.ok(box.x+box.width<=1280);
    assert.equal(await popup.locator('.menu-group-label').filter({hasText:'기본 모델'}).count(),1);
    assert.equal(await popup.locator('.menu-group-label').filter({hasText:'외부 모델'}).count(),1);
    await capture(`${mode}-model-menu.png`);await page.keyboard.press('Escape');await page.getByRole('button',{name:'닫기',exact:true}).click();
    await scope.getByRole('button',{name:/녹음 목록/}).click();
    await scope.getByRole('button',{name:'정렬',exact:true}).click();await page.getByRole('menuitemradio',{name:'이름순',exact:true}).click();
    await scope.getByRole('button',{name:'목록 보기',exact:true}).click();assert.equal(await scope.locator('.table-head').count(),1);await scope.getByRole('button',{name:'카드 보기',exact:true}).click();
    await capture(`${mode}-library.png`);
  }
  await checkLibrary('work');
  await page.getByRole('button',{name:'워크스페이스 선택',exact:true}).click();await page.getByRole('menuitemradio',{name:/^Live/}).click();
  await checkLibrary('live');
  await page.getByRole('button',{name:'새 Live 녹음',exact:true}).click();
  assert.equal(await page.locator('.live-model-hint').count(),0);
  await page.getByRole('button',{name:'Live 변환 모델',exact:true}).click();assert.ok((await page.getByRole('menu',{name:'Live 변환 모델',exact:true}).boundingBox()).width<=320);await capture('live-ready-menu.png');await page.keyboard.press('Escape');
  assert.deepEqual(errors,[]);console.log('PASS cards, excluded text, copy animation, speaker badges, bounded grouped model menus, matching Live library views/sort/folders');console.log('TEST_PROFILE',profile);
} finally {await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().forEach(w=>w.destroy())).catch(()=>{});await app.close();}
