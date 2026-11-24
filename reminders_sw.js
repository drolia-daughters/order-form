// Sentire Reminders — lets the page work as a phone app (home screen + Share from WhatsApp)
// and open even with a weak signal. Google data always comes fresh from the network.
importScripts('share_handler.js');   // 1.5.0: invoices shared from WhatsApp
const CACHE='sentire-reminders-v1';
const FILES=['reminders.html','reminders_agent.js','reminders.webmanifest','reminders-192.png','reminders-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).catch(()=>{}));self.skipWaiting();});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim();});
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);
  if(e.request.method!=='GET'||u.origin!==location.origin)return; // Google script calls go straight to the network
  e.respondWith(fetch(e.request).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy)).catch(()=>{});return r;}).catch(()=>caches.match(e.request,{ignoreSearch:true})));});
