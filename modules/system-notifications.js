const ALERTS_CACHE = 'naverdathi-alerts';
const SCHEDULE_URL = './__scheduled-alerts.json';

export function systemNotificationsSupported() {
	return 'Notification' in window && 'serviceWorker' in navigator;
}

export async function requestSystemNotifications() {
	if (!systemNotificationsSupported()) return 'unsupported';
	const permission = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
	if (permission === 'granted') await registerPeriodicCheck();
	return permission;
}

export async function showSystemNotification(message, tag) {
	if (!systemNotificationsSupported() || Notification.permission !== 'granted') return;
	try {
		const registration = await navigator.serviceWorker.ready;
		await registration.showNotification('NAVERDATHI', {
			body: message,
			tag,
			icon: 'icon-192.png',
			badge: 'icon-192.png'
		});
	} catch (error) {
		console.error('Erro ao exibir notificação do sistema:', error);
	}
}

// Periodic Background Sync lets the service worker check due dates while the app is closed
// (supported by Chromium browsers when the site is installed as an app).
export async function registerPeriodicCheck() {
	try {
		const registration = await navigator.serviceWorker.ready;
		if (!('periodicSync' in registration)) return false;
		const status = await navigator.permissions.query({ name: 'periodic-background-sync' }).catch(() => null);
		if (status && status.state !== 'granted') return false;
		await registration.periodicSync.register('naverdathi-alerts', { minInterval: 6 * 60 * 60 * 1000 });
		return true;
	} catch (error) {
		console.warn('Verificação em segundo plano indisponível:', error);
		return false;
	}
}

export async function saveScheduledAlerts(alerts) {
	if (!('caches' in window)) return;
	try {
		const cache = await caches.open(ALERTS_CACHE);
		await cache.put(SCHEDULE_URL, new Response(JSON.stringify({ updatedAt: new Date().toISOString(), alerts }), {
			headers: { 'Content-Type': 'application/json' }
		}));
	} catch (error) {
		console.error('Erro ao salvar alertas agendados:', error);
	}
}

export async function clearScheduledAlerts() {
	if ('caches' in window) await caches.delete(ALERTS_CACHE).catch(() => {});
}
