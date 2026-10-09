const dirty=new Map(),flushers=new Map();let installed=false;
export function documentPending(kind,ids){dirty.set(kind,ids);window.desktop?.memos?.pending([...new Set([...dirty.values()].flat())]);}
export function registerDocumentFlusher(kind,flush){flushers.set(kind,flush);if(!installed&&window.desktop?.memos){installed=true;window.desktop.memos.onFlush(async()=>{await Promise.all([...flushers.values()].map(fn=>fn()));});}}
