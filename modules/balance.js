import { getTransactionDate, isPaid, isTransfer, sumAmounts } from './utils.js';

// Money only counts once it has actually moved: paid, dated today or earlier.
function isSettled(transaction, today) {
	return isPaid(transaction) && getTransactionDate(transaction) <= today;
}

function isCreditCard(accounts, accountId) {
	return accounts.find((account) => account.id === accountId)?.type === 'credit';
}

// Entries without an account (or whose account was deleted) form a "loose cash" pool.
function isPoolAccount(accounts, accountId) {
	return !accountId || !accounts.some((account) => account.id === accountId);
}

export function getAccountBalance(account, transactions, today) {
	return transactions.reduce((balance, transaction) => {
		if (!isSettled(transaction, today)) return balance;
		if (isTransfer(transaction)) {
			if (transaction.toAccountId === account.id) return balance + transaction.amount;
			if (transaction.fromAccountId === account.id) return balance - transaction.amount;
			return balance;
		}
		if (transaction.accountId !== account.id) return balance;
		return balance + (transaction.type === 'income' ? transaction.amount : -transaction.amount);
	}, Number(account.initialBalance) || 0);
}

export function getLooseBalance(accounts, transactions, today) {
	return transactions.reduce((balance, transaction) => {
		if (!isSettled(transaction, today)) return balance;
		if (isTransfer(transaction)) {
			let change = 0;
			if (isPoolAccount(accounts, transaction.toAccountId)) change += transaction.amount;
			if (isPoolAccount(accounts, transaction.fromAccountId)) change -= transaction.amount;
			return balance + change;
		}
		if (!isPoolAccount(accounts, transaction.accountId)) return balance;
		return balance + (transaction.type === 'income' ? transaction.amount : -transaction.amount);
	}, 0);
}

// Available money = cash accounts + loose entries − investments.
// Credit card purchases only consume the card limit; money leaves when the invoice is paid.
export function getAvailableBalance({ accounts, transactions, investments, today }) {
	const cashAccounts = accounts.filter((account) => account.type !== 'credit');
	const accountsTotal = cashAccounts.reduce((total, account) => total + getAccountBalance(account, transactions, today), 0);
	const loose = getLooseBalance(accounts, transactions, today);
	return {
		total: accountsTotal + loose - sumAmounts(investments),
		accountsTotal,
		loose,
		invested: sumAmounts(investments)
	};
}

// Incomes that really are income (refunds on a credit card only reduce the invoice).
export function isRealIncome(transaction, accounts) {
	return transaction.type === 'income' && !isCreditCard(accounts, transaction.accountId);
}

export function isCashExpense(transaction, accounts) {
	return transaction.type === 'expense' && !isCreditCard(accounts, transaction.accountId);
}
