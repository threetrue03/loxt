const dirty=new Map(),flushers=new Map();let installed=false;
export function documentPending(kind,ids){dirty.set(kind,ids);const all=[...new Set([...dirty.values()].flat())];window.desktop?.memos?.pending(all);window.dispatchEvent(new CustomEvent('loxt:document-pending',{detail:{count:all.length}}));}
export function pendingDocumentCount(){return new Set([...dirty.values()].flat()).size;}
export function registerDocumentFlusher(kind,flush){flushers.set(kind,flush);if(!installed&&window.desktop?.memos){installed=true;window.desktop.memos.onFlush(async()=>{await Promise.all([...flushers.values()].map(fn=>fn()));});}}
