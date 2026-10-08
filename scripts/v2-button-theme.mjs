import { _electron as electron } from 'playwright';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {waveHeader} from '../electron/pcm-wave.cjs';
const out=path.resolve('test-results/v2-button-theme');await mkdir(out,{recursive:true});const profile=await mkdtemp(path.join(out,'profile-')),root=path.join(profile,'LOXT');
await mkdir(root);await writeFile(path.join(profile,'library-location.json'),JSON.stringify({version:1,root}));
const source=path.join(profile,'sample.wav');await writeFile(source,Buffer.concat([waveHeader(32000*60),Buffer.alloc(32000*60)]));
const env={...process.env,SORINOTE_TEST:'1',SORINOTE_TEST_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;delete env.SORINOTE_DEV;
let app;const results={profile,packaged:false,fixture:'Private profile and silent fake audio; actual theme switching and computed button styles. No GPU inference.',rows:[]};
try{
 const exe=process.argv.slice(2).find(v=>v.endsWith('.exe'));results.packaged=!!exe;app=await electron.launch({...(exe?{executablePath:exe}:{}),args:[...(exe?[]:['.']),'--use-fake-device-for-media-stream',`--use-file-for-fake-audio-capture=${source}`],env});
 const page=await app.firstWindow();page.setDefaultTimeout(12000);
 await app.evaluate(({BrowserWindow,dialog})=>{BrowserWindow.getAllWindows()[0].setSize(1440,900);BrowserWindow.getAllWindows()[0].show();dialog.showMessageBox=async()=>({response:0});});
 const work=page.locator('[data-workspace="work"]');await work.getByRole('heading',{name:'홈',exact:true}).waitFor();
 await work.locator('.home-start-action').filter({hasText:'새 녹음'}).click();
 const selector='[data-workspace="work"] .record-start-group>.primary',button=page.locator(selector);
 async function matrix(state){
  for(const theme of ['dark','light']){
   await page.evaluate(theme=>window.desktop.appearance.set(theme),theme);await page.waitForFunction(theme=>document.documentElement.dataset.theme===theme,theme);
   for(const interaction of ['default','hover','keyboard-focus']){
    await page.mouse.move(1400,80);await button.evaluate(el=>el.blur());
    if(interaction==='hover')await button.hover();
    if(interaction==='keyboard-focus'){
     await button.focus();await page.keyboard.press('Shift+Tab');await page.keyboard.press('Tab');
     assert.equal(await button.evaluate(el=>el===document.activeElement&&el.matches(':focus-visible')),true);
    }
    await page.waitForTimeout(100);
    const row=await button.evaluate(el=>{
     const c=getComputedStyle(el),group=el.parentElement,g=getComputedStyle(group),arrow=group.querySelector('.menu-trigger');
     let bg=c.backgroundColor,node=el;while(bg==='rgba(0, 0, 0, 0)'&&node.parentElement){node=node.parentElement;bg=getComputedStyle(node).backgroundColor;}
     const rgb=value=>value.match(/[\d.]+/g).slice(0,3).map(Number);
     const lum=value=>rgb(value).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
     const a=lum(c.color),b=lum(bg);const ac=arrow&&getComputedStyle(arrow);
     return {label:el.textContent,color:c.color,background:c.backgroundColor,effectiveBackground:bg,contrast:(Math.max(a,b)+.05)/(Math.min(a,b)+.05),outline:c.outline,outlineOffset:c.outlineOffset,borderRadius:c.borderRadius,groupRadius:g.borderRadius,disabled:el.disabled,focusVisible:el.matches(':focus-visible'),arrow:arrow?{disabled:arrow.disabled,color:ac.color,background:ac.backgroundColor,opacity:ac.opacity}:null};
    });
    const box=await work.locator('.record-actions').boundingBox();
    const bytes=await app.evaluate(async({BrowserWindow},box)=>(await BrowserWindow.getAllWindows()[0].webContents.capturePage({x:Math.floor(box.x-8),y:Math.floor(box.y-8),width:Math.ceil(box.width+16),height:Math.ceil(box.height+16)})).toPNG().toString('base64'),box);
    const file=`${state}-${theme}-${interaction}.png`;await writeFile(path.join(out,file),Buffer.from(bytes,'base64'));
    results.rows.push({state,theme,interaction,...row,file});console.log(state,theme,interaction,row.contrast.toFixed(2));
   }
  }
 }
 await matrix('ready');
 await work.getByRole('button',{name:'녹음 시작',exact:true}).click();await work.getByRole('button',{name:'녹음 중단',exact:true}).waitFor();
 await matrix('recording');
 await work.getByRole('button',{name:'일시정지',exact:true}).click();await matrix('paused');
 await work.getByRole('button',{name:'녹음 중단',exact:true}).click();await matrix('conversion-ready');
 await work.getByRole('button',{name:'변환하기',exact:true}).click();assert.equal(await page.getByRole('dialog').getByRole('button',{name:'버리기',exact:true}).count(),0);await page.getByRole('dialog').getByRole('button',{name:'닫기',exact:true}).click();await work.getByRole('button',{name:'버리기',exact:true}).click();await work.getByRole('heading',{name:'홈',exact:true}).waitFor();
 assert.ok(results.rows.every(row=>row.contrast>=4.5));results.complete=true;await app.close();app=null;
} catch(error){results.error=error.stack;throw error;} finally{await writeFile(path.join(out,'results.json'),JSON.stringify(results,null,2));if(app)await app.evaluate(({app})=>app.exit(0)).catch(()=>{});}
