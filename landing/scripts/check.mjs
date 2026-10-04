import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { version, brandExpansion, download } from '../release.mjs';
import { mkdir } from 'node:fs/promises';
const base=process.argv[2] || 'http://127.0.0.1:5180/';
const root=new URL('../../test-results/landing/',import.meta.url);await mkdir(root,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
try{const page=await browser.newPage({viewport:{width:1440,height:1050}});const errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(base);await page.evaluate(()=>document.fonts.ready);await page.getByRole('heading',{level:1}).waitFor();await page.getByText(brandExpansion,{exact:true}).waitFor();
await page.locator('img').evaluateAll(images=>Promise.all(images.map(img=>{img.loading='eager';return img.decode();})));
assert.ok(await page.locator('img').evaluateAll(images=>images.every(img=>img.complete&&img.naturalWidth>0)));
await page.evaluate(()=>window.getSelection()?.removeAllRanges());
await page.screenshot({path:new URL('hero-desktop.png',root).pathname.replace(/^\/([A-Z]:)/,'$1')});
await page.screenshot({path:new URL('desktop.png',root).pathname.replace(/^\/([A-Z]:)/,'$1'),fullPage:true});
await page.locator('#workspaces').screenshot({path:new URL('workspaces-desktop.png',root).pathname.replace(/^\/([A-Z]:)/,'$1')});await page.locator('.live-workflow').screenshot({path:new URL('live-desktop.png',root).pathname.replace(/^\/([A-Z]:)/,'$1')});await page.getByText('NVIDIA GPU가 없어도 사용할 수 있나요?',{exact:true}).click();assert.ok(await page.locator('details[open]').count());
for(const width of [390,768,1440]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
await page.setViewportSize({width:390,height:844});await page.evaluate(()=>{document.activeElement?.blur();window.getSelection()?.removeAllRanges();});await page.screenshot({path:new URL('mobile.png',root).pathname.replace(/^\/([A-Z]:)/,'$1'),fullPage:true});
const expected=download;
const downloads=page.getByRole('link',{name:'Windows용 다운로드',exact:true});assert.equal(await downloads.count(),2);for(const link of await downloads.all())assert.equal(await link.getAttribute('href'),expected);assert.equal(await page.locator('.release').filter({hasText:`v${version}`}).count(),2);assert.equal(await page.locator('select').count(),0);
await page.getByText('컴퓨터에서 재생되는 소리도 녹음할 수 있나요?',{exact:true}).click();await page.getByText('네. 녹음 시작 버튼 옆의 장치 메뉴에서 컴퓨터 소리를 선택하세요.',{exact:false}).waitFor();
const captures=await page.request.get(new URL('assets/screenshots.json',base).href);const manifest=await captures.json();assert.equal(manifest.version,version);assert.equal(manifest.examples,true);assert.equal(manifest.images.length,11);await page.getByText('녹음을 중단해도 다시 이어서 녹음할 수 있나요?',{exact:true}).click();await page.getByText('네. Work의 녹음 중단은 일시정지입니다.',{exact:false}).waitFor();assert.equal(manifest.liveInference,false);assert.ok(manifest.images.some(image=>image.scenario==='work-home'));assert.ok(manifest.images.some(image=>image.scenario==='live-scripted-example'));await page.getByRole('heading',{name:/파일을 정리할 때는 Work/}).waitFor();await page.getByText('Work와 Live는 어떻게 다른가요?',{exact:true}).click();await page.getByText('각 모드의 녹음·폴더·최근 열람 이력은 따로 보관됩니다.',{exact:false}).waitFor();assert.equal((await page.locator('body').innerText()).includes('상단 로고를 누르면 홈으로'),false);assert.deepEqual(errors,[]);console.log('PASS: desktop/mobile layout, real app images, FAQ, current release download links and system audio FAQ, no runtime errors');
}finally{await browser.close();}

