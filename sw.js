const CACHE_NAME = 'naverdathi-v4';
const RUNTIME_CACHE = 'naverdathi-runtime-v1';
const ALERTS_CACHE = 'naverdathi-alerts';
const SCHEDULE_URL = './__scheduled-alerts.json';
const SHOWN_URL = './__shown-alerts.json';
const APP_FILES = [
	'./',
	'./index.html',
	'./style.css',
	'./script.js',
	'./modules/utils.js',
	'./modules/balance.js',
	'./modules/import.js',
	'./modules/invoices.js',
	'./modules/quick-entry.js',
	'./modules/planning.js',
	'./modules/receipts.js',
	'./modules/system-notifications.js',
	'./manifest.webmanifest',
	'./icon-192.png',
	'./icon-512.png',
	'./Logo%20site%20Naverdathi.png.jpeg'
];
// Versioned third-party files (Firebase SDK, fonts) never change, so they can be served from cache when offline.
const CACHEABLE_ORIGINS = ['https://www.gstatic.com', 'https://fonts.googleapis.com', 'https://fonts.gstatic.com'];

self.addEventListener('install', (event) => {
	event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_FILES)));
	self.skipWaiting();
});

self.addEventListener('activate', (event) => {
	const keep = [CACHE_NAME, RUNTIME_CACHE, ALERTS_CACHE];
	event.waitUntil(caches.keys()
		.then((keys) => Promise.all(keys.filter((key) => !keep.includes(key)).map((key) => caches.delete(key))))
		.then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET') return;
	const url = new URL(request.url);
	if (CACHEABLE_ORIGINS.includes(url.origin)) {
		if (url.origin === 'https://www.gstatic.com' && !url.pathname.startsWith('/firebasejs/')) return;
		event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => {
			if (response.ok || response.type === 'opaque') {
				const copy = response.clone();
				caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
			}
			return response;
		})));
		return;
	}
	// Firebase API calls and other external requests are never cached.
	if (url.origin !== self.location.origin) return;
	// Network first so updates show up immediately; cache is only the offline fallback.
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

function getToday() {
	const date = new Date();
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

async function readJson(cache, url, fallback) {
	const response = await cache.match(url);
	if (!response) return fallback;
	try {
		return await response.json();
	} catch {
		return fallback;
	}
}

// The page stores upcoming due dates; this shows them even when the site is closed.
async function checkScheduledAlerts() {
	const cache = await caches.open(ALERTS_CACHE);
	const schedule = await readJson(cache, SCHEDULE_URL, { alerts: [] });
	const shown = await readJson(cache, SHOWN_URL, {});
	const today = getToday();
	const due = (schedule.alerts || []).filter((alert) => alert.fireOn <= today && alert.until >= today && !shown[alert.key]);
	for (const alert of due) {
		await self.registration.showNotification('NAVERDATHI', { body: alert.message, tag: alert.key, icon: 'icon-192.png', badge: 'icon-192.png' });
		shown[alert.key] = today;
	}
	await cache.put(SHOWN_URL, new Response(JSON.stringify(shown), { headers: { 'Content-Type': 'application/json' } }));
}

self.addEventListener('periodicsync', (event) => {
	if (event.tag === 'naverdathi-alerts') event.waitUntil(checkScheduledAlerts());
});

self.addEventListener('message', (event) => {
	if (event.data === 'check-alerts') event.waitUntil(checkScheduledAlerts());
});

self.addEventListener('notificationclick', (event) => {
	event.notification.close();
	event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
		const client = clients.find((item) => new URL(item.url).origin === self.location.origin);
		if (client) return client.focus();
		return self.clients.openWindow('./#contas-a-pagar');
	}));
});
