const fs = require('node:fs/promises');
const path = require('node:path');
const sanitize = require('sanitize-html');
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
const assetPattern = /loxt-asset:\/\/memo\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.[a-z0-9]{1,12}/g;
function cleanHTML(html) {
  return sanitize(html, {
    allowedTags: [...sanitize.defaults.allowedTags, 'img','details','summary','input','math','semantics','annotation','mrow','mi','mn','mo','mtext','msup','msub','msubsup','mfrac','msqrt','mroot','mtable','mtr','mtd','mover','munder','munderover','mspace','menclose','mstyle'],
    allowedAttributes: { '*': ['style','class'], a:['href','title'], img:['src','alt','width','height'], input:['type','checked','disabled'], details:['open'], math:['xmlns','display'], annotation:['encoding'] },
    allowedSchemes: ['http','https','mailto','loxt-asset'], allowedSchemesByTag: { img: ['loxt-asset','data'] }, allowProtocolRelative: false,
    allowedStyles: { '*': { color: [/^(#[a-f\d]{3,8}|rgb\([\d ,]+\)|[a-z]+)$/i], 'background-color': [/^(#[a-f\d]{3,8}|rgb\([\d ,]+\)|[a-z]+)$/i], 'text-align': [/^(left|center|right)$/], 'font-weight': [/^(bold|[1-9]00)$/], 'text-decoration': [/^(underline|line-through)$/] } },
    transformTags: { input: (_tagName, attribs) => ({ tagName: 'input', attribs: { type: 'checkbox', disabled: 'disabled', ...(Object.hasOwn(attribs, 'checked') ? { checked: 'checked' } : {}) } }), a: (tagName, attribs) => ({ tagName, attribs: { ...attribs, rel: 'noopener noreferrer' } }) },
  });
}
async function documentHTML(payload, memos, embedImages = true) {
  let body = cleanHTML(payload.html);
  for (const url of new Set(body.match(assetPattern) || [])) {
    const asset = await memos.asset(url);
    if (asset.id !== payload.id) throw new Error('다른 문서의 첨부파일은 내보낼 수 없습니다.');
    if (embedImages && asset.mime.startsWith('image/')) body = body.split(url).join(`data:${asset.mime};base64,${(await fs.readFile(asset.filename)).toString('base64')}`);
  }
  let fontCSS = '';
  try { const dir = path.join(__dirname, '../dist/assets'), file = (await fs.readdir(dir)).find(name => /^SUIT-Variable.*\.woff2$/.test(name)); if (file) fontCSS = `@font-face{font-family:SUIT;src:url(data:font/woff2;base64,${(await fs.readFile(path.join(dir,file))).toString('base64')}) format('woff2');font-weight:100 900}`; } catch { /* System Korean font fallback when running backend-only tests. */ }
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; base-uri 'none'"><title>${escape(payload.title)}</title><style>${fontCSS}body{font-family:SUIT,'Malgun Gothic',sans-serif;margin:40px auto;padding:0 24px;max-width:900px;color:#202020;line-height:1.7;overflow-wrap:anywhere}h1,h2,h3{line-height:1.3}img{max-width:100%;height:auto}table{width:100%;border-collapse:collapse}td,th{border:1px solid #ccc;padding:8px}pre{white-space:pre-wrap;background:#f4f4f2;padding:16px}blockquote{border-left:3px solid #ccc;padding-left:16px}a{color:#25608c}math{font-size:1.15em}details{margin:12px 0}@media print{body{margin:0;padding:0}img,table,pre{break-inside:avoid}details{display:block}}</style></head><body><h1>${escape(payload.title)}</h1>${body}</body></html>`;
}
async function exportMemo(payload, { memos, dialog, BrowserWindow, mainWindow }) {
  if (!payload || !['md','html','pdf'].includes(payload.format) || typeof payload.title !== 'string' || payload.title.length > 160 || typeof payload.html !== 'string' || payload.html.length > 10_000_000 || typeof payload.markdown !== 'string' || payload.markdown.length > 10_000_000) throw new Error('내보내기 내용을 확인해 주세요.');
  await memos.read(payload.id);
  const name = payload.title.replace(/[\\/:*?"<>|\x00-\x1f]/g,'_') || '메모';
  const result = await dialog.showSaveDialog(mainWindow, { title: '메모 내보내기', defaultPath: `${name}.${payload.format}`, filters: [{ name: payload.format.toUpperCase(), extensions: [payload.format] }] });
  if (result.canceled || !result.filePath) return { canceled: true };
  let text = payload.format === 'md' ? payload.markdown : await documentHTML(payload, memos);
  if (payload.format !== 'md') text = text.replace('</style>', 'li>p,summary>p{display:inline;margin:0}li:has(>input){list-style:none}li>input{margin-right:.4em}td p,th p{margin:0}li>details{display:inline-block;vertical-align:top;margin:0}details>p{margin:6px 0}</style>');
  if (payload.format !== 'pdf') {
    // Export only assets referenced in this document, alongside the portable document.
    for (const url of new Set(text.match(assetPattern) || [])) {
      const asset = await memos.asset(url); if (asset.id !== payload.id) throw new Error('다른 문서의 첨부파일은 내보낼 수 없습니다.');
      const folder = path.basename(result.filePath) + '.assets';
      await fs.mkdir(path.join(path.dirname(result.filePath), folder), { recursive: true });
      await fs.copyFile(asset.filename, path.join(path.dirname(result.filePath), folder, asset.name));
      text = text.split(url).join(`${encodeURIComponent(folder)}/${asset.name}`);
    }
    await fs.writeFile(result.filePath, '\ufeff' + text, 'utf8');
  } else {
    text = text.replace(/<details(?:\s[^>]*)?>/g, '<details open>');
    const temporary = await fs.mkdtemp(path.join(require('node:os').tmpdir(), 'loxt-memo-export-'));
    const preview = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, javascript: false } });
    try {
      preview.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      const filename = path.join(temporary, 'document.html'); await fs.writeFile(filename, text);
      await preview.loadFile(filename);
      await fs.writeFile(result.filePath, await preview.webContents.printToPDF({ printBackground: true, pageSize: 'A4', margins: { top: .6, bottom: .6, left: .6, right: .6 } }));
    } finally { preview.destroy(); await fs.unlink(path.join(temporary, 'document.html')).catch(() => {}); await fs.rmdir(temporary).catch(() => {}); }
  }
  return { canceled: false };
}
module.exports = { exportMemo, cleanHTML, documentHTML };
