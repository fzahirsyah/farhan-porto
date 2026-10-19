// Offline shell for the crew app (works when served over https or localhost; file:// pages cannot register service workers).
const CACHE='es-crew-v1';const FILES=['index.html','crew.css','js/app.js','../shared/css/base.css','../shared/lib/sql-wasm.bundle.js','../shared/core/format.js','../shared/core/schema.js','../shared/core/db.js','../shared/core/auth.js','../shared/core/numbering.js','../shared/core/ledger.js','../shared/core/config.js','../shared/core/tickets.js','../shared/core/biz.js','../shared/ui/components.js','../shared/ui/theme.js'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;e.respondWith(fetch(e.request).then(r=>{const cp=r.clone();caches.open(CACHE).then(c=>c.put(e.request,cp));return r}).catch(()=>caches.match(e.request)))});
