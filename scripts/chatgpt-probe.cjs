// Isolated, interactive compatibility probe. Never reads credentials or cookies.
const { app, BrowserWindow, WebContentsView } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const root = path.resolve('test-results/chatgpt-probe');
fs.mkdirSync(root, { recursive: true });
const log = (...value) => fs.appendFileSync(path.join(root, 'probe.log'), value.join(' ') + '\n');
process.stdout.on('error', () => {}); process.stderr.on('error', () => {});
app.setPath('userData', path.join(root, 'profile'));
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1000, height: 760, title: 'LOXT · ChatGPT 호환성 테스트', webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
  const view = new WebContentsView({ webPreferences: { partition: 'persist:loxt-browser-probe', sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true } });
  win.contentView.addChildView(view);
  const bounds = () => { const [width, height] = win.getContentSize(); view.setBounds({ x: 0, y: 0, width, height }); };
  bounds(); win.on('resize', bounds);
  view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  view.webContents.on('did-finish-load', () => log('PAGE_LOADED', view.webContents.getTitle()));
  view.webContents.on('did-fail-load', (_e, code, description) => log('LOAD_FAILED', code, description));
  win.on('closed', () => { if (!view.webContents.isDestroyed()) view.webContents.close(); });
  await view.webContents.loadURL('https://chatgpt.com').catch(() => {});
  setTimeout(async () => {
    if (view.webContents.isDestroyed()) return;
    fs.writeFileSync(path.join(root, 'access.json'), JSON.stringify({ at: new Date().toISOString(), title: view.webContents.getTitle(), version: process.versions.electron, login: 'Requires direct user confirmation; not inspected.' }, null, 2));
    // Interactive probe never captures the login screen or account content.
  }, 12000);
});
app.on('window-all-closed', () => app.quit());
