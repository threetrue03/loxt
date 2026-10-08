// Interactive verification against the packaged app. Authentication is manual.
// No credentials, cookies, ChatGPT page contents or account screenshots are collected.
import { _electron as electron } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root=path.resolve('test-results/chatgpt-1.14.0');
const profile=path.join(root,'profile');
await mkdir(profile,{recursive:true});
const env={...process.env,SORINOTE_TEST:'1',SORINOTE_TEST_DATA:profile};
delete env.ELECTRON_RUN_AS_NODE;delete env.SORINOTE_DEV;
const executablePath=path.resolve('release/stage5/win-unpacked/LOXT.exe');
let app;
const result={version:'1.14.0',profile,packagedApp:true,login:'pending manual verification',message:'pending manual verification',restartLogin:'pending manual verification'};
const save=()=>writeFile(path.join(root,'results.json'),JSON.stringify(result,null,2));
async function launch(restart=false) {
 app=await electron.launch({executablePath,args:[],env});
 const page=await app.firstWindow();page.setDefaultTimeout(15000);
 await page.getByRole('heading',{name:'홈',exact:true}).waitFor();
 const info=await page.evaluate(()=>window.desktop.getAppInfo());
 if(info.version!=='1.14.0')throw new Error('Packaged version is not 1.14.0');
 await app.evaluate(({BrowserWindow})=>{const win=BrowserWindow.getAllWindows()[0];win.setSize(1400,900);win.setTitle('LOXT 1.14.0 · ChatGPT 검증');win.show();});
 if(restart) await page.keyboard.press('Control+1');
 else {
  await page.getByRole('button',{name:'새 탭',exact:true}).click();
  const dock=page.locator('.side-dock');
  await dock.getByRole('button',{name:'브라우저',exact:true}).click();
  await dock.getByRole('textbox',{name:'웹 주소 또는 검색어'}).fill('https://chatgpt.com/');
  await dock.getByRole('textbox',{name:'웹 주소 또는 검색어'}).press('Enter');
 }
 result.stage=restart?'restarted-awaiting-user':'awaiting-login';await save();
}
try {
 await launch();
 let previous='';
 while(true) {
  const command=await readFile(path.join(root,'command.json'),'utf8').then(JSON.parse).catch(()=>null);
  if(command?.id && command.id!==previous) {
   previous=command.id;
   if(command.action==='restart') {await app.close();await launch(true);}
   if(command.action==='record') {for(const key of ['login','message','restartLogin'])if(typeof command[key]==='string')result[key]=command[key];await save();}
   if(command.action==='stop')break;
  }
  await new Promise(resolve=>setTimeout(resolve,1000));
 }
} catch(error) {result.stage='failed';result.error=String(error.message);await save();process.exitCode=1;}
finally {await app?.close().catch(()=>{});}
