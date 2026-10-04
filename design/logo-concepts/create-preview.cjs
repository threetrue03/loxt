const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const dir = __dirname;
const shapes = [
  `<g id="wave-to-page" fill="currentColor"><rect x="14" y="43" width="12" height="32" rx="6"/><rect x="34" y="25" width="12" height="68" rx="6"/><path d="M60 15h26a14 14 0 0 1 14 14v62a14 14 0 0 1-14 14H60a6 6 0 0 1-6-6V21a6 6 0 0 1 6-6Zm6 12v66h20a2 2 0 0 0 2-2V29a2 2 0 0 0-2-2Z"/></g>`,
  `<g id="sound-book" fill="none" stroke="currentColor" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"><path id="open-pages" d="M60 29C46 18 29 17 15 20v72c16-3 31-1 45 10 14-11 29-13 45-10V20c-14-3-31-2-45 9Z"/><path id="book-spine" d="M60 29v73"/><path id="left-wave" d="M32 44v25M46 35v43"/><path id="right-wave" d="M74 35v43M88 44v25"/></g>`,
  `<g id="sound-to-lines" fill="currentColor"><rect id="short-wave" x="13" y="45" width="11" height="30" rx="5.5"/><rect id="tall-wave" x="32" y="22" width="11" height="76" rx="5.5"/><path id="upper-record" d="M56 27a5.5 5.5 0 0 1 11 0v12h34a5.5 5.5 0 0 1 0 11H61.5a5.5 5.5 0 0 1-5.5-5.5Z"/><rect id="middle-record" x="56" y="60" width="51" height="11" rx="5.5"/><rect id="lower-record" x="56" y="81" width="36" height="11" rx="5.5"/></g>`
];
const names = ['파형의 페이지', '소리를 담는 책', '소리에서 글줄로'];
const descriptions = ['기존 파형의 마지막 막대를 문서의 윤곽으로 확장했습니다.', '책의 펼쳐진 면과 파형이 하나의 보관 심볼을 이룹니다.', '세로 파형이 가로 글줄로 이어지며 전사를 표현합니다.'];
function svg(i, color, lockup = false) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${lockup ? 440 : 120}" height="120" viewBox="0 0 ${lockup ? 440 : 120} 120" role="img" aria-label="소리노트 ${names[i]}"><title>소리노트 — ${names[i]}</title><g id="symbol" color="${color}">${shapes[i]}</g>${lockup ? `<g id="wordmark"><text x="148" y="77" fill="${color}" font-family="Malgun Gothic, sans-serif" font-size="52" font-weight="700" letter-spacing="-2">소리노트</text></g>` : ''}</svg>`;
}
for (let i = 0; i < 3; i++) {
  fs.writeFileSync(path.join(dir, `concept-${i+1}-symbol.svg`), svg(i, '#5C5547'));
  fs.writeFileSync(path.join(dir, `concept-${i+1}-lockup.svg`), svg(i, '#5C5547', true));
}
const html = `<!doctype html><html lang="ko"><meta charset="utf-8"><title>소리노트 로고 시안</title><style>*{box-sizing:border-box}body{margin:0;background:#f5f4f0;color:#292a2a;font-family:'Malgun Gothic',sans-serif}.sheet{width:1440px;padding:52px 54px 40px}header{display:flex;justify-content:space-between;align-items:end;margin-bottom:34px}h1{font-size:32px;letter-spacing:-1px;margin:8px 0}header p{font-size:13px;color:#74746d}.eyebrow{font-size:12px;letter-spacing:3px;color:#5c5547}.columns{display:grid;grid-template-columns:repeat(3,1fr);gap:22px}.card{background:#fdfdfc;border:1px solid #deded5;border-radius:18px;overflow:hidden}.dark{height:260px;background:#1e1e1e;display:flex;align-items:center;justify-content:center}.dark svg{width:150px;height:150px}.light{height:160px;display:flex;align-items:center;justify-content:center;padding:24px}.light svg{width:320px;height:auto}.info{padding:22px;border-top:1px solid #e7e6df;height:154px}.info small{font-size:11px;color:#87877f;letter-spacing:2px}.info h2{font-size:21px;margin:10px 0}.info p{font-size:13px;line-height:1.8;margin:0;color:#77776e}.test{display:flex;align-items:center;gap:18px;padding:18px 22px;background:#eeeee7;border-top:1px solid #deded5}.test span{font-size:11px;color:#74746d;margin-right:auto}.tile{display:flex;align-items:center;justify-content:center;background:#d9d1bd;border-radius:8px;width:40px;height:40px}.tile svg{width:30px;height:30px}footer{margin-top:28px;display:flex;justify-content:space-between;font-size:12px;color:#74746d}</style><div class="sheet"><header><div><div class="eyebrow">SORINOTE / LOGO EXPLORATIONS</div><h1>소리를 남기고, 기록을 보관하다.</h1></div><p>벡터 시안 01–03 · 기존 UI 색상 기반</p></header><div class="columns">${shapes.map((_,i)=>`<article class="card"><div class="dark">${svg(i,'#D9D1BD')}</div><div class="light">${svg(i,'#5C5547',true)}</div><div class="info"><small>CONCEPT 0${i+1}</small><h2>${names[i]}</h2><p>${descriptions[i]}</p></div><div class="test"><span>작은 크기 확인 · 16 / 24 / 앱 아이콘</span><div style="width:16px;height:16px">${svg(i,'#5C5547').replace('width="120" height="120"','width="16" height="16"')}</div><div style="width:24px;height:24px">${svg(i,'#5C5547').replace('width="120" height="120"','width="24" height="24"')}</div><div class="tile">${svg(i,'#5C5547')}</div></div></article>`).join('')}</div><footer><span>CHARCOAL #1E1E1E · SAND #D9D1BD · INK #5C5547</span><span>서체: 맑은 고딕 Bold · SVG 도형별 편집 가능</span></footer></div></html>`;
fs.writeFileSync(path.join(dir,'preview.html'),html);
fs.writeFileSync(path.join(dir,'README.md'),'# 소리노트 로고 시안\n\npreview.png는 비교용 시안입니다. concept-1/2/3-symbol.svg는 심볼, lockup.svg는 가로형 로고입니다. Figma 캔버스로 SVG 파일을 드래그하여 편집할 수 있습니다. 모든 심볼은 실제 벡터이며 이미지가 삽입되지 않았습니다.\n\n색상: #1E1E1E / #D9D1BD / #5C5547. 글꼴: 맑은 고딕(Malgun Gothic) Bold. 현재 가로형 SVG는 편집 가능한 text를 사용합니다. 선택 후 최종본에 글자 패스 버전, 투명 PNG, 배경별 변형과 Windows 아이콘을 제작합니다.\n');
(async()=>{
 let browser;
 for (const options of [{channel:'msedge'},{channel:'chrome'},{}]) {try {browser=await chromium.launch({headless:true,...options});break;}catch{}}
 if (!browser) throw new Error('미리보기 브라우저를 실행하지 못했습니다.');
 const page=await browser.newPage({viewport:{width:1440,height:860},deviceScaleFactor:1.5});
 await page.setContent(html);await page.evaluate(()=>document.fonts.ready);
 await page.screenshot({path:path.join(dir,'preview.png'),fullPage:true});
 await browser.close();console.log('Created 6 editable SVG concepts and preview.png');
})();
