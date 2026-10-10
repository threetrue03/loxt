const CACHE='loxt-recovery-2.8.0';
const FILES=['/loxt-offline.html','/loxt-offline.js','/loxt-offline.css','/recovery-drafts.js','/recovery-address.js','/recovery-SUIT.woff2','/brand/LOXT-lockup-white.svg'];
// Only the public recovery shell is cached. Session/API/file/model responses and
// the application document are deliberately excluded from this cache.
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('loxt-recovery-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);if(url.origin!==self.location.origin||event.request.method!=='GET')return;
 if(event.request.mode==='navigate'&&['/','/web.html','/index.html'].includes(url.pathname)){
  event.respondWith(fetch(event.request).catch(()=>caches.match('/loxt-offline.html')));return;
 }
 if(FILES.includes(url.pathname))event.respondWith(fetch(event.request).catch(()=>caches.match(url.pathname)));
});
