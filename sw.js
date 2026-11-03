const CACHE_NAME = 'naverdathi-v1';
const APP_FILES = [
	'./',
	'./index.html',
	'./style.css',
	'./script.js',
	'./manifest.webmanifest',
	'./icon-192.png',
	'./icon-512.png',
	'./Logo%20site%20Naverdathi.png.jpeg'
];

self.addEventListener('install', (event) => {
	event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_FILES)));
	self.skipWaiting();
});

self.addEventListener('activate', (event) => {
	event.waitUntil(caches.keys()
		.then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
		.then(() => self.clients.claim()));
});

// Network first so updates show up immediately; cache is only the offline fallback.
// Firebase and other external requests are never cached.
self.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
	event.respondWith(fetch(request)
		.then((response) => {
			if (response.ok) {
				const copy = response.clone();
				caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
			}
			return response;
		})
		.catch(() => caches.match(request).then((cached) => cached || caches.match('./index.html'))));
});
