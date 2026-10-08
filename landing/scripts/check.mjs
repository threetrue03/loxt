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
await page.locator('#memos').screenshot({path:new URL('memos-desktop.png',root).pathname.replace(/^\/([A-Z]:)/,'$1')});await page.locator('.memo-documents').screenshot({path:new URL('documents-desktop.png',root).pathname.replace(/^\/([A-Z]:)/,'$1')});
await page.getByText('녹음 없이 메모만 만들 수 있나요?',{exact:true}).click();await page.getByText('Work·Live 보관함의 새로 추가하기 → 새 메모에서 시작하세요.',{exact:false}).waitFor();
await page.getByText('접힌 사이드바는 어떻게 다시 여나요?',{exact:true}).click();await page.getByText('1.14.1에서 버튼이 사라지던 문제를 수정했으며',{exact:false}).waitFor();
const themes=page.getByRole('group',{name:'앱 테마 미리보기',exact:true});
await themes.getByRole('button',{name:'라이트 테마',exact:true}).click();
assert.equal(await themes.getByRole('button',{name:'라이트 테마',exact:true}).getAttribute('aria-pressed'),'true');
assert.match(await page.locator('#theme-preview img').getAttribute('src'),/light-home\.png$/);
await page.locator('#theme-preview img').evaluate(image=>image.decode());
await page.locator('.themes').screenshot({path:new URL('themes-light-desktop.png',root).pathname.replace(/^\/([A-Z]:)/,'$1')});
await themes.getByRole('button',{name:'다크 테마',exact:true}).click();
assert.equal(await themes.getByRole('button',{name:'라이트 테마',exact:true}).getAttribute('aria-pressed'),'false');
assert.match(await page.locator('#theme-preview img').getAttribute('src'),/\/home\.png$/);
await page.getByText('YouTube 링크도 스크립트로 만들 수 있나요?',{exact:true}).click();
await page.getByText('Shorts·재생목록·실시간 방송·비공개·로그인이 필요한 영상은 지원하지 않습니다.',{exact:false}).waitFor();
await page.getByText('테마는 어떻게 바꾸나요?',{exact:true}).click();
await page.getByText('설정 → 일반 → 테마에서 다크 테마 또는 라이트 테마를 선택하세요.',{exact:false}).waitFor();
for(const width of [390,768,1440]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
await page.setViewportSize({width:390,height:844});await page.evaluate(()=>{document.activeElement?.blur();window.getSelection()?.removeAllRanges();});await page.screenshot({path:new URL('mobile.png',root).pathname.replace(/^\/([A-Z]:)/,'$1'),fullPage:true});
const expected=download;
const downloads=page.getByRole('link',{name:'Windows용 다운로드',exact:true});assert.equal(await downloads.count(),2);for(const link of await downloads.all())assert.equal(await link.getAttribute('href'),expected);assert.equal(await page.locator('.release').filter({hasText:`v${version}`}).count(),2);assert.equal(await page.locator('select').count(),0);
await page.getByText('컴퓨터에서 재생되는 소리도 녹음할 수 있나요?',{exact:true}).click();await page.getByText('네. 녹음 시작 버튼 옆의 장치 메뉴에서 컴퓨터 소리를 선택하세요.',{exact:false}).waitFor();
const captures=await page.request.get(new URL('assets/screenshots.json',base).href);const manifest=await captures.json();assert.equal(manifest.version,version);assert.equal(manifest.examples,true);assert.equal(manifest.images.length,27);await page.getByText('녹음을 중단해도 다시 이어서 녹음할 수 있나요?',{exact:true}).click();await page.getByText('네. Work의 녹음 중단은 일시정지입니다.',{exact:false}).waitFor();await page.getByText('중단하면 버튼이 변환하기로 바뀌며 창은 바로 열리지 않습니다.',{exact:false}).waitFor();assert.equal(manifest.liveInference,false);for(const scenario of ['work-sidebar-collapsed','live-sidebar-collapsed','work-home','live-scripted-example','work-home-light','work-script-light','light-theme-settings','youtube-link-dialog','work-attached-memo','work-independent-memo','work-memo-slash-menu','work-independent-memo-light','work-home-folder-panel','storage-location-settings','live-scripted-example-with-memo','work-recording-with-memo-fake-microphone','work-paused-recording','work-paused-conversion','script-txt-pdf-export-menu'])assert.ok(manifest.images.some(image=>image.scenario===scenario));await page.getByRole('heading',{name:/파일을 정리할 때는 Work/}).waitFor();await page.getByText('Work와 Live는 어떻게 다른가요?',{exact:true}).click();await page.getByText('각 모드의 녹음·폴더·메모는 따로 보관됩니다.',{exact:false}).waitFor();assert.equal((await page.locator('body').innerText()).includes('상단 로고를 누르면 홈으로'),false);assert.deepEqual(errors,[]);console.log('PASS: desktop/mobile layout, current-version app images, theme preview switching, YouTube/theme/memo FAQ, new memo sections, release download links, no runtime errors');
}finally{await browser.close();}

