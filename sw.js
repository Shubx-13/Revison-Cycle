const CACHE = 'ipmat-study-quest-v7';
const FILES = ['./', './START-HERE.html', './index.html', './log.html', './calendar.html', './insights.html', './quotes.html', './setup.html', './app.css', './app.js', './supabase-config.js', './manifest.webmanifest', './quest-icon.svg'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => event.respondWith(caches.match(event.request).then(hit => hit || fetch(event.request))));
