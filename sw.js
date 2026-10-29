/* Camp Office PWA service worker.
   Deliberately tiny: it does NOT cache pages, scripts or data, so every upload to GitHub shows up
   immediately and nobody is ever stuck on an old version. It only keeps one small "no connection"
   page so the installed app shows a friendly message instead of the browser's dinosaur when offline. */
var CACHE = 'camp-office-pwa-v2';
var OFFLINE_URL = '/offline.html';

self.addEventListener('install', function(event){
  event.waitUntil(
    caches.open(CACHE).then(function(c){ return c.addAll([OFFLINE_URL, '/icon-192.png']); }).then(function(){ return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(event){
  event.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){ return k !== CACHE; }).map(function(k){ return caches.delete(k); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(event){
  var req = event.request;
  if(req.mode === 'navigate'){
    event.respondWith(fetch(req).catch(function(){ return caches.match(OFFLINE_URL); }));
  }
  /* everything else: not intercepted, the browser fetches it normally */
});
