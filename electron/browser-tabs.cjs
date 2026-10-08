const { WebContentsView, session } = require('electron');
function browserUrl(value) {
  if (typeof value !== 'string' || value.length > 4000 || !value.trim()) throw new Error('주소 또는 검색어를 입력해 주세요.');
  const text = value.trim();
  if (/^[a-z][a-z0-9+.-]*:/i.test(text) && !/^https?:\/\//i.test(text)) throw new Error('HTTP 또는 HTTPS 웹 주소만 열 수 있습니다.');
  const candidate = /^https?:\/\//i.test(text) ? text : !/\s/.test(text) && /^[^/]+\.[^/]+/.test(text) ? 'https://' + text : 'https://www.google.com/search?q=' + encodeURIComponent(text);
  const url = new URL(candidate); if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('웹 주소를 확인해 주세요.'); return url.href;
}
function historyUrl(value) {
  try { const u=new URL(browserUrl(value)); if (/^(auth\.|accounts\.)/.test(u.hostname)) return u.origin + u.pathname;
    for (const key of [...u.searchParams.keys()]) if (/token|code|state|secret|password|assertion|ticket/i.test(key)) u.searchParams.delete(key);
    u.hash=''; return u.href;
  } catch { return ''; }
}
class BrowserTabs {
  constructor(win) {
    this.win = win; this.tabs = new Map(); this.active = null;
    const store = session.fromPartition('persist:loxt-browser');
    store.setPermissionCheckHandler(() => false); store.setPermissionRequestHandler((_w, _p, callback) => callback(false));
    store.setDisplayMediaRequestHandler((_r, callback) => callback({}));
    store.on('will-download', event => event.preventDefault());
    let flushed=false,flushing=false;
    win.on('close',event=>{
      if(event.defaultPrevented || flushed)return;
      event.preventDefault();if(flushing)return;flushing=true;
      Promise.all([store.cookies.flushStore(),store.flushStorageData()]).catch(()=>{}).finally(()=>{flushed=true;if(!win.isDestroyed())win.close();});
    });
    win.on('closed', () => this.closeAll());
  }
  emit(id, extra = {}) {
    const tab = this.tabs.get(id); if (!tab || this.win.isDestroyed() || tab.view.webContents.isDestroyed()) return;
    const wc = tab.view.webContents;
    // Do not publish auth redirect query strings into app logs or persistent history.
    const url = historyUrl(wc.getURL());
    const history = wc.navigationHistory.getAllEntries().map(entry=>({url:historyUrl(entry.url),title:entry.title})).filter(entry=>entry.url).slice(-50);
    this.win.webContents.send('browser:state', { id, url, history, historyIndex:Math.min(history.length-1,wc.navigationHistory.getActiveIndex()), title: wc.getTitle(), loading: wc.isLoading(), back: wc.navigationHistory.canGoBack(), forward: wc.navigationHistory.canGoForward(), error: tab.error || '', ...extra });
  }
  ensure(id) {
    if (typeof id !== 'string' || !/^[a-z0-9-]{1,80}$/i.test(id)) throw new Error('탭을 확인해 주세요.');
    if (this.tabs.has(id)) return this.tabs.get(id);
    const view = new WebContentsView({ webPreferences: { partition: 'persist:loxt-browser', sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true } });
    const tab = { view, error: '', scrollTimer:null }; this.tabs.set(id, tab);
    view.webContents.setWindowOpenHandler(({ url }) => {
      try { const safe = browserUrl(url); this.win.webContents.send('browser:new-tab', { url: safe }); } catch {}
      return { action: 'deny' };
    });
    for (const event of ['will-navigate', 'will-redirect']) view.webContents.on(event, (e, url) => { try { browserUrl(url); } catch { e.preventDefault(); tab.error = '지원하지 않는 주소입니다.'; this.emit(id); } });
    for (const event of ['did-start-loading', 'did-stop-loading', 'did-navigate', 'did-navigate-in-page', 'page-title-updated']) view.webContents.on(event, () => this.emit(id));
    view.webContents.on('did-finish-load',()=>{ if (tab.restoreScroll) { const position=tab.restoreScroll;tab.restoreScroll=null;view.webContents.executeJavaScript(`scrollTo(${position.x},${position.y})`).catch(()=>{}); } });
    tab.scrollTimer=setInterval(async()=>{ if(this.active!==id || view.webContents.isDestroyed() || view.webContents.isLoading())return;
      try { const scroll=await view.webContents.executeJavaScript('({x:scrollX,y:scrollY})'); if (Number.isFinite(scroll?.x)&&Number.isFinite(scroll?.y) && JSON.stringify(scroll)!==JSON.stringify(tab.scroll)) { tab.scroll=scroll;this.emit(id,{scroll}); } } catch {}
    },1500); tab.scrollTimer.unref();
    view.webContents.on('did-fail-load', (_e, code, _description, _url, main) => { if (main && code !== -3) { tab.error = `페이지를 열지 못했습니다 (${code}). 다시 시도해 주세요.`; this.emit(id); } });
    view.webContents.on('before-input-event', (e, input) => { if (input.type !== 'keyDown' || !input.control)return; if(!input.alt && !input.shift && input.key.toLowerCase()==='t') { e.preventDefault();if(!input.isAutoRepeat)this.win.webContents.send('browser:new-tab', {}); } else if(!input.alt && !input.shift && input.key.toLowerCase()==='w') { e.preventDefault();if(!input.isAutoRepeat)this.win.webContents.send('browser:close-tab'); } else if(/^[1-9]$/.test(input.key)) { e.preventDefault(); this.win.webContents.send('browser:shortcut', Number(input.key)); } });
    return tab;
  }
  async command(payload) {
    const { id, action } = payload || {};
    if (action === 'hide') { if (!id || id === this.active) this.hide(); return; }
    if (action === 'close') { this.close(id); return; }
    const tab = this.ensure(id), wc = tab.view.webContents;
    if (action === 'navigate') { try { const url=browserUrl(payload.url);tab.error = '';await wc.loadURL(url).catch(()=>{}); } catch(error) {tab.error=error.message;} }
    else if(action === 'restore') {
      const entries=(payload.history || []).slice(-50).map(entry=>({url:browserUrl(entry.url),title:String(entry.title||'').slice(0,500)}));
      if(payload.scroll && ['x','y'].every(key=>Number.isFinite(payload.scroll[key])&&payload.scroll[key]>=0))tab.restoreScroll=payload.scroll;
      if(entries.length) await wc.navigationHistory.restore({entries,activeIndex:Math.max(0,Math.min(entries.length-1,Number(payload.historyIndex)||0))}).catch(()=>{});
      else if(payload.url) await wc.loadURL(browserUrl(payload.url)).catch(()=>{});
    }
    else if (action === 'back' && wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
    else if (action === 'forward' && wc.navigationHistory.canGoForward()) wc.navigationHistory.goForward();
    else if (action === 'reload') { tab.error = ''; wc.reload(); }
    else if (action === 'show') {
      const b = payload.bounds, [width, height] = this.win.getContentSize();
      if (!b || !['x', 'y', 'width', 'height'].every(key => Number.isFinite(b[key]))) throw new Error('브라우저 영역을 확인해 주세요.');
      this.hide(); this.active = id; this.win.contentView.addChildView(tab.view);
      const x = Math.max(0, Math.round(b.x)), y = Math.max(0, Math.round(b.y));
      tab.view.setBounds({ x, y, width: Math.max(0, Math.min(width - x, Math.round(b.width))), height: Math.max(0, Math.min(height - y, Math.round(b.height))) });
      return;
    }
    this.emit(id);
  }
  hide() { if (this.active && this.tabs.has(this.active) && !this.win.isDestroyed()) this.win.contentView.removeChildView(this.tabs.get(this.active).view); this.active = null; }
  close(id) { if (this.active === id) this.hide(); const tab = this.tabs.get(id); if(tab)clearInterval(tab.scrollTimer); if (tab && !tab.view.webContents.isDestroyed()) tab.view.webContents.close(); this.tabs.delete(id); }
  closeAll() { for (const id of [...this.tabs.keys()]) this.close(id); }
}
module.exports = { BrowserTabs, browserUrl, historyUrl };
