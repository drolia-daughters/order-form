// Sentire Command Center — minimal service worker.
// Its only job is to make the app installable (a desktop icon). It does NOT cache pages,
// so you always get the latest version from GitHub — no stale screens.
importScripts('share_handler.js');   // 1.5.0: invoices shared from WhatsApp
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', function () { /* pass through to the network, no caching */ });
