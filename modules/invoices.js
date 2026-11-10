import { addMonths, dateInMonth, getTransactionDate, isTransfer, sumAmounts } from './utils.js';

export const invoiceStatusLabels = {
	open: 'Aberta',
	closed: 'Fechada',
	paid: 'Paga',
	overdue: 'Atrasada'
};

function getClosingDay(card) {
	return Number(card.closingDay) || 1;
}

function getDueDay(card) {
	return Number(card.dueDay) || 10;
}

// An invoice is identified by the month in which it closes (YYYY-MM).
export function getInvoiceMonth(card, date) {
	const month = date.slice(0, 7);
	return date > dateInMonth(month, getClosingDay(card)) ? addMonths(month, 1) : month;
}

// Payments made before invoices existed have no invoiceMonth: they settle the last invoice closed before the payment.
export function getPaymentInvoiceMonth(card, payment) {
	if (payment.invoiceMonth) return payment.invoiceMonth;
	return addMonths(getInvoiceMonth(card, getTransactionDate(payment)), -1);
}

export function getInvoiceDates(card, invoiceMonth) {
	const closingDay = getClosingDay(card);
	const dueDay = getDueDay(card);
	return {
		startAfter: dateInMonth(addMonths(invoiceMonth, -1), closingDay),
		closingDate: dateInMonth(invoiceMonth, closingDay),
		dueDate: dateInMonth(dueDay > closingDay ? invoiceMonth : addMonths(invoiceMonth, 1), dueDay)
	};
}

export function getInvoice(card, invoiceMonth, transactions, today) {
	const { startAfter, closingDate, dueDate } = getInvoiceDates(card, invoiceMonth);
	const items = transactions
		.filter((transaction) => !isTransfer(transaction) && transaction.accountId === card.id)
		.filter((transaction) => {
			const date = getTransactionDate(transaction);
			return date > startAfter && date <= closingDate;
		})
		.sort((first, second) => getTransactionDate(first).localeCompare(getTransactionDate(second)));
	const charges = sumAmounts(items.filter((item) => item.type === 'expense'));
	// Income on a card means a refund/chargeback, which lowers the invoice.
	const refunds = sumAmounts(items.filter((item) => item.type === 'income'));
	const total = Math.max(0, charges - refunds);
	const payments = transactions.filter((transaction) => isTransfer(transaction)
		&& transaction.toAccountId === card.id && getPaymentInvoiceMonth(card, transaction) === invoiceMonth);
	const paid = sumAmounts(payments);
	const remaining = Math.max(0, Math.round((total - paid) * 100) / 100);
	let status;
	// Paying early settles the invoice right away; new purchases reopen it.
	if (total > 0 && remaining <= 0) status = 'paid';
	else if (today <= closingDate) status = 'open';
	else if (remaining <= 0) status = 'paid';
	else if (today > dueDate) status = 'overdue';
	else status = 'closed';
	return { month: invoiceMonth, items, total, paid, remaining, status, closingDate, dueDate, payments };
}

export function getCardUsage(card, transactions) {
	const cardItems = transactions.filter((transaction) => !isTransfer(transaction) && transaction.accountId === card.id);
	const charges = sumAmounts(cardItems.filter((item) => item.type === 'expense'));
	const refunds = sumAmounts(cardItems.filter((item) => item.type === 'income'));
	const payments = sumAmounts(transactions.filter((transaction) => isTransfer(transaction) && transaction.toAccountId === card.id));
	const used = Math.max(0, charges - refunds - payments);
	const limit = Number(card.limit) || 0;
	return { used, limit, available: limit - used, percent: limit ? (used / limit) * 100 : 0 };
}

export function getCardSummary(card, transactions, today) {
	const currentInvoice = getInvoice(card, getInvoiceMonth(card, today), transactions, today);
	return { ...getCardUsage(card, transactions), invoice: currentInvoice.total, dueDate: currentInvoice.dueDate, currentInvoice };
}

// Invoices that already closed and still need attention (closed or overdue), oldest first.
export function getPendingInvoices(card, transactions, today, lookbackMonths = 6) {
	const currentMonth = getInvoiceMonth(card, today);
	const result = [];
	for (let offset = lookbackMonths; offset >= 1; offset -= 1) {
		const invoice = getInvoice(card, addMonths(currentMonth, -offset), transactions, today);
		if (invoice.status === 'closed' || invoice.status === 'overdue') result.push(invoice);
	}
	return result;
}
