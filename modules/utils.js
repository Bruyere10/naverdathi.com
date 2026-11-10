export const currencyFormatter = new Intl.NumberFormat('pt-BR', {
	style: 'currency',
	currency: 'BRL'
});

export function toDateKey(date) {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function getToday() {
	return toDateKey(new Date());
}

export function getCurrentMonth() {
	return getToday().slice(0, 7);
}

export function addMonths(monthKey, amount) {
	const [year, month] = monthKey.split('-').map(Number);
	return toDateKey(new Date(year, month - 1 + amount, 1)).slice(0, 7);
}

export function addDays(dateKey, amount) {
	const date = new Date(`${dateKey}T12:00:00`);
	date.setDate(date.getDate() + amount);
	return toDateKey(date);
}

export function monthsBetween(fromMonth, toMonth) {
	const [fromYear, fromMonthNumber] = fromMonth.split('-').map(Number);
	const [toYear, toMonthNumber] = toMonth.split('-').map(Number);
	return (toYear - fromYear) * 12 + (toMonthNumber - fromMonthNumber);
}

export function getDaysInMonth(monthKey) {
	const [year, month] = monthKey.split('-').map(Number);
	return new Date(year, month, 0).getDate();
}

export function dateInMonth(monthKey, day) {
	return `${monthKey}-${String(Math.min(day, getDaysInMonth(monthKey))).padStart(2, '0')}`;
}

export function daysBetween(fromDate, toDate) {
	return Math.round((new Date(`${toDate}T12:00:00`) - new Date(`${fromDate}T12:00:00`)) / 86400000);
}

export function formatMonthLabel(monthKey) {
	const label = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date(`${monthKey}-01T12:00:00`));
	return label.charAt(0).toUpperCase() + label.slice(1);
}

export function formatShortMonth(monthKey) {
	return new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(new Date(`${monthKey}-01T12:00:00`)).replace('.', '');
}

export function formatTransactionDate(isoDate) {
	if (!isoDate) return 'Agora';
	// Plain YYYY-MM-DD strings are parsed as UTC, which would shift the day in Brazil.
	const date = isoDate.length === 10 ? new Date(`${isoDate}T12:00:00`) : new Date(isoDate);
	return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' })
		.format(date)
		.replace('.', '');
}

export function normalizeText(text) {
	return String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function sumAmounts(items) {
	return items.reduce((total, item) => total + Number(item.amount || 0), 0);
}

export function sumByType(items, type) {
	return sumAmounts(items.filter((item) => item.type === type));
}

export function isPaid(transaction) {
	return transaction.status !== 'pending';
}

export function isTransfer(transaction) {
	return transaction.type === 'transfer';
}

export function getTransactionDate(transaction) {
	return transaction.transactionDate || transaction.createdAt?.slice(0, 10) || '';
}

export function parseTags(value) {
	return [...new Set(value.split(',').map((tag) => tag.trim().replace(/^#/, '').slice(0, 20)).filter(Boolean))].slice(0, 8);
}

export function clampDay(value, fallback) {
	return Math.min(31, Math.max(1, Math.floor(Number(value)) || fallback));
}

export function roundMoney(value) {
	return Math.round(value * 100) / 100;
}

export function stripInstallmentSuffix(description) {
	return String(description || '').replace(/ \(\d+\/\d+\)$/, '');
}
