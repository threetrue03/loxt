const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { randomUUID } = require('node:crypto');

// Print a sanitized, self-contained document only after its assets have loaded.
async function printPDF(html, destination, BrowserWindow) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'loxt-pdf-'));
  const filename = path.join(directory, 'document.html');
  const partial = destination + '.' + randomUUID() + '.part';
  let preview;
  try {
    await fs.writeFile(filename, html.replace(/<details(?:\s[^>]*)?>/g, '<details open>'));
    preview = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
    preview.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    await preview.loadFile(filename);
    await preview.webContents.executeJavaScript(`Promise.race([
      (async () => { await document.fonts.ready; await Promise.all([...document.images].map(image => image.decode())); })(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('PDF 글꼴·이미지 로딩 시간 초과')), 10000))
    ])`);
    const bytes = await preview.webContents.printToPDF({ printBackground: true, pageSize: 'A4', margins: { top: .6, bottom: .6, left: .6, right: .6 } });
    if (!bytes.length) throw new Error('PDF를 생성하지 못했습니다.');
    await fs.writeFile(partial, bytes, { flag: 'wx' });
    await fs.rename(partial, destination);
  } finally {
    preview?.destroy();
    await fs.unlink(partial).catch(() => {});
    await fs.unlink(filename).catch(() => {});
    await fs.rmdir(directory).catch(() => {});
  }
}
module.exports = { printPDF };
