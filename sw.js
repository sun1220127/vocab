// 서비스 워커: 앱 파일을 캐시해서 오프라인에서도 열리게 함
// - 앱 파일: 네트워크 우선 (업데이트가 바로 반영되도록), 실패하면 캐시
// - Firebase SDK: 버전 고정 URL이라 캐시 우선
// 단어 데이터 자체의 오프라인 저장은 Firestore 오프라인 캐시가 담당합니다.

const CACHE = 'vocab-v1';
const SHELL = [
  './',
  './index.html',
  './config.js',
  './js/app.js',
  './js/store.js',
  './js/store-local.js',
  './js/store-firebase.js',
  './js/parse.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
];
const FIREBASE_PREFIX = 'https://www.gstatic.com/firebasejs/';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));
}

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await Promise.race([fetch(req), timeout(4000)]);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    if (req.mode === 'navigate') return cache.match('./index.html');
    throw new Error('offline');
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res && res.ok) cache.put(req, res.clone());
  return res;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) e.respondWith(networkFirst(req));
  else if (req.url.startsWith(FIREBASE_PREFIX)) e.respondWith(cacheFirst(req));
  // 그 외(Firestore 통신, 구글 로그인 등)는 건드리지 않음
});
