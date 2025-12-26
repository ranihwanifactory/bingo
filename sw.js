
const CACHE_NAME = 'pangpang-bingo-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

self.addEventListener('fetch', (event) => {
  // NTFY SSE 및 Firebase Auth 관련 요청은 캐시하지 않음
  if (event.request.url.includes('ntfy.sh') || event.request.url.includes('googleapis')) {
    return;
  }
  
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
