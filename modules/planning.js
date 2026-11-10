import {
	addMonths, dateInMonth, getDaysInMonth, getTransactionDate, isPaid, isTransfer, monthsBetween, stripInstallmentSuffix, sumAmounts, sumByType
} from './utils.js';
import { isCashExpense, isRealIncome } from './balance.js';
import { getInvoice } from './invoices.js';

export const ruleGroups = {
	needs: { label: 'Necessidades', target: 50, color: '#4371b8' },
	wants: { label: 'Desejos', target: 30, color: '#b35da4' },
	savings: { label: 'Poupança e investimentos', target: 20, color: '#13795b' }
};

export const defaultCategoryGroups = {
	'Alimentação': 'needs',
	'Moradia': 'needs',
	'Transporte': 'needs',
	'Estudo': 'needs',
	'Trabalho': 'needs',
	'Lazer': 'wants',
	'Jogos': 'wants',
	'Outros': 'wants',
	'Metas': 'savings'
};

export function getCategoryGroup(category, customGroups = {}) {
	return customGroups[category] || defaultCategoryGroups[category] || 'wants';
}

export function getInvestmentDate(investment) {
	return investment.createdAt?.slice(0, 10) || '';
}

export function getMonthItems(transactions, month) {
	// Balance adjustments fix the balance but are not real income/spending.
	return transactions.filter((transaction) => !isTransfer(transaction) && !transaction.adjustment && getTransactionDate(transaction).startsWith(month));
}

export function getMonthInvestments(investments, month) {
	return investments.filter((investment) => getInvestmentDate(investment).startsWith(month));
}

function getFirstDataMonth(ctx) {
	return ctx.transactions.map(getTransactionDate).filter(Boolean).sort()[0]?.slice(0, 7) || ctx.today.slice(0, 7);
}

export function getRegisteredIncome(ctx, month) {
	return sumAmounts(getMonthItems(ctx.transactions, month).filter((item) => isRealIncome(item, ctx.accounts || [])));
}

// Reference income for planning: the informed monthly income, or what was actually received if higher.
// Using the larger value avoids counting the salary twice when it is also registered as an income.
export function getMonthIncome(ctx, month) {
	const base = month >= getFirstDataMonth(ctx) ? ctx.monthlyIncome : 0;
	return Math.max(base, getRegisteredIncome(ctx, month));
}

export function getMonthSpending(ctx, month) {
	return sumByType(getMonthItems(ctx.transactions, month), 'expense') + sumAmounts(getMonthInvestments(ctx.investments, month));
}

export function getMonthlyInvestmentPlan(investments) {
	return investments.reduce((total, investment) => {
		if (investment.frequency === 'Mensal') return total + investment.amount;
		if (investment.frequency === 'Semanal') return total + (investment.amount * 52) / 12;
		return total;
	}, 0);
}

// Average of everyday spending (not fixed bills, installments or goal savings) over the last 3 closed months.
export function getVariableSpendingAverage(ctx) {
	const currentMonth = ctx.today.slice(0, 7);
	const totals = [1, 2, 3].map((offset) => {
		const month = addMonths(currentMonth, -offset);
		return sumAmounts(getMonthItems(ctx.transactions, month)
			.filter((item) => item.type === 'expense' && !item.recurringId && !item.installment && item.category !== 'Metas'));
	}).filter((value) => value > 0);
	return totals.length ? totals.reduce((sum, value) => sum + value, 0) / totals.length : 0;
}

function getRecurringForMonth(ctx, month, type) {
	return sumAmounts(ctx.recurringItems.filter((item) => item.type === type && (item.lastGeneratedMonth || '') < month));
}

export function getScheduledForMonth(ctx, month) {
	const items = getMonthItems(ctx.transactions, month);
	const expenses = items.filter((item) => item.type === 'expense');
	return {
		installments: sumAmounts(expenses.filter((item) => item.installment)),
		otherExpenses: sumAmounts(expenses.filter((item) => !item.installment)),
		recurringExpenses: getRecurringForMonth(ctx, month, 'expense'),
		income: sumAmounts(items.filter((item) => isRealIncome(item, ctx.accounts || []))) + getRecurringForMonth(ctx, month, 'income')
	};
}

// Unpaid amount of every card invoice whose due date falls in the month.
export function getInvoicesDueInMonth(ctx, month, untilDate) {
	const lastDay = untilDate || dateInMonth(month, 31);
	let total = 0;
	(ctx.accounts || []).filter((account) => account.type === 'credit').forEach((card) => {
		for (let offset = -3; offset <= 1; offset += 1) {
			const invoice = getInvoice(card, addMonths(month, offset), ctx.transactions, ctx.today);
			const dueThisMonth = invoice.dueDate.startsWith(month) || (offset < 0 && invoice.status === 'overdue' && month === ctx.today.slice(0, 7));
			if (dueThisMonth && invoice.dueDate <= lastDay) total += invoice.remaining;
		}
	});
	return total;
}

// Money that will actually leave in a future month: cash bills, fixed expenses and card invoices due.
export function getCashOutflowForMonth(ctx, month) {
	const accounts = ctx.accounts || [];
	const cashExpenses = sumAmounts(getMonthItems(ctx.transactions, month).filter((item) => isCashExpense(item, accounts)));
	const recurring = getRecurringForMonth(ctx, month, 'expense');
	const invoices = getInvoicesDueInMonth(ctx, month);
	return { cashExpenses, recurring, invoices, total: cashExpenses + recurring + invoices };
}

function isVariableExpense(item) {
	return item.type === 'expense' && !item.recurringId && !item.installment && item.category !== 'Metas';
}

// Expected balance at the end of the current month, starting from the money available today.
export function getEndOfMonthForecast(ctx, currentBalance) {
	const accounts = ctx.accounts || [];
	const month = ctx.today.slice(0, 7);
	const day = Number(ctx.today.slice(8));
	const daysInMonth = getDaysInMonth(month);
	const endDate = dateInMonth(month, daysInMonth);
	const unsettled = (item) => !isPaid(item) || getTransactionDate(item) > ctx.today;
	const upcoming = ctx.transactions.filter((item) => !isTransfer(item) && unsettled(item) && getTransactionDate(item) <= endDate);
	const pendingIncome = sumAmounts(upcoming.filter((item) => isRealIncome(item, accounts)));
	const pendingExpenses = sumAmounts(upcoming.filter((item) => isCashExpense(item, accounts)));
	const invoicesDue = getInvoicesDueInMonth(ctx, month, endDate);
	const spentSoFar = sumAmounts(getMonthItems(ctx.transactions, month)
		.filter((item) => isVariableExpense(item) && isCashExpense(item, accounts) && !unsettled(item)));
	const dailyPace = day ? spentSoFar / day : 0;
	const paceRest = dailyPace * (daysInMonth - day);
	return {
		forecast: currentBalance + pendingIncome - pendingExpenses - invoicesDue - paceRest,
		pendingIncome, pendingExpenses, invoicesDue, paceRest, dailyPace
	};
}

// The first row is the current month (end-of-month balance); next months add their expected net cash flow.
export function buildForecast(ctx, endOfMonthBalance, currentBalance, monthCount = 6) {
	const currentMonth = ctx.today.slice(0, 7);
	const variable = getVariableSpendingAverage(ctx);
	const investmentPlan = getMonthlyInvestmentPlan(ctx.investments);
	let cumulative = endOfMonthBalance;
	const rows = [{
		month: currentMonth, isCurrent: true, income: getMonthIncome(ctx, currentMonth),
		committed: 0, variable: 0, investments: 0, net: endOfMonthBalance - currentBalance, cumulative
	}];
	for (let offset = 1; offset < monthCount; offset += 1) {
		const month = addMonths(currentMonth, offset);
		const scheduled = getScheduledForMonth(ctx, month);
		const income = Math.max(ctx.monthlyIncome, scheduled.income);
		const outflow = getCashOutflowForMonth(ctx, month);
		const net = income - outflow.total - variable - investmentPlan;
		cumulative += net;
		rows.push({ month, isCurrent: false, income, committed: outflow.total, invoices: outflow.invoices, variable, investments: investmentPlan, net, cumulative });
	}
	return rows;
}

export function buildCommitments(ctx, monthCount = 6) {
	const currentMonth = ctx.today.slice(0, 7);
	const months = Array.from({ length: monthCount }, (_, index) => {
		const month = addMonths(currentMonth, index + 1);
		const scheduled = getScheduledForMonth(ctx, month);
		const income = Math.max(ctx.monthlyIncome, scheduled.income);
		const total = scheduled.installments + scheduled.otherExpenses + scheduled.recurringExpenses;
		return { month, ...scheduled, total, income, percent: income ? (total / income) * 100 : 0 };
	});
	const groups = new Map();
	ctx.transactions.forEach((transaction) => {
		if (!transaction.installment || transaction.type !== 'expense') return;
		const date = getTransactionDate(transaction);
		const group = groups.get(transaction.installment.groupId) || {
			description: stripInstallmentSuffix(transaction.description),
			total: transaction.installment.total,
			remainingCount: 0,
			remainingAmount: 0,
			monthly: transaction.amount,
			lastMonth: ''
		};
		if (date.slice(0, 7) > currentMonth) {
			group.remainingCount += 1;
			group.remainingAmount += transaction.amount;
		}
		if (date.slice(0, 7) > group.lastMonth) group.lastMonth = date.slice(0, 7);
		groups.set(transaction.installment.groupId, group);
	});
	const installmentGroups = [...groups.values()]
		.filter((group) => group.remainingCount > 0)
		.sort((first, second) => first.lastMonth.localeCompare(second.lastMonth));
	return { months, installmentGroups, remainingInstallments: sumAmounts(installmentGroups.map((group) => ({ amount: group.remainingAmount }))) };
}

export function buildRule503020(ctx, month) {
	const income = getMonthIncome(ctx, month);
	const totals = { needs: 0, wants: 0, savings: sumAmounts(getMonthInvestments(ctx.investments, month)) };
	getMonthItems(ctx.transactions, month).filter((item) => item.type === 'expense').forEach((item) => {
		totals[getCategoryGroup(item.category, ctx.categoryGroups)] += item.amount;
	});
	return Object.entries(ruleGroups).map(([key, group]) => ({
		key,
		...group,
		amount: totals[key],
		percent: income ? (totals[key] / income) * 100 : 0,
		ideal: income * (group.target / 100)
	}));
}

export function getReserveMonths(ctx) {
	const month = ctx.today.slice(0, 7);
	const livingExpenses = (monthKey) => sumAmounts(getMonthItems(ctx.transactions, monthKey)
		.filter((item) => item.type === 'expense' && item.category !== 'Metas'));
	const previousTotals = [1, 2, 3].map((offset) => livingExpenses(addMonths(month, -offset))).filter((value) => value > 0);
	const averageExpenses = previousTotals.length
		? previousTotals.reduce((sum, value) => sum + value, 0) / previousTotals.length
		: livingExpenses(month);
	const reserve = sumAmounts(ctx.investments) + ctx.goals.reduce((sum, goal) => sum + Number(goal.currentAmount || 0), 0);
	return averageExpenses ? reserve / averageExpenses : 0;
}

export function buildRetrospective(ctx, month) {
	const previousMonth = addMonths(month, -1);
	const items = getMonthItems(ctx.transactions, month);
	const expenses = items.filter((item) => item.type === 'expense');
	const income = getMonthIncome(ctx, month);
	const invested = sumAmounts(getMonthInvestments(ctx.investments, month));
	const spent = sumAmounts(expenses);
	const saved = income - spent - invested;
	const categoryTotals = (monthKey) => {
		const totals = new Map();
		getMonthItems(ctx.transactions, monthKey).filter((item) => item.type === 'expense').forEach((item) => {
			totals.set(item.category, (totals.get(item.category) || 0) + item.amount);
		});
		return totals;
	};
	const currentTotals = categoryTotals(month);
	const previousTotals = categoryTotals(previousMonth);
	const categories = [...currentTotals]
		.map(([name, value]) => ({ name, value, previous: previousTotals.get(name) || 0 }))
		.sort((first, second) => second.value - first.value);
	const changes = [...new Set([...currentTotals.keys(), ...previousTotals.keys()])]
		.map((name) => ({ name, value: currentTotals.get(name) || 0, previous: previousTotals.get(name) || 0 }))
		.map((item) => ({ ...item, difference: item.value - item.previous }))
		.filter((item) => item.previous > 0 || item.value > 0);
	const biggestIncrease = changes.filter((item) => item.difference > 0).sort((first, second) => second.difference - first.difference)[0];
	const biggestDecrease = changes.filter((item) => item.difference < 0).sort((first, second) => first.difference - second.difference)[0];
	const spendingDays = new Set(expenses.map((item) => getTransactionDate(item)));
	const lastDay = month === ctx.today.slice(0, 7)
		? Number(ctx.today.slice(8))
		: new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
	const previousSpent = sumByType(getMonthItems(ctx.transactions, previousMonth), 'expense');
	return {
		month,
		income,
		spent,
		invested,
		saved,
		savingsRate: income ? (saved / income) * 100 : 0,
		count: items.length,
		categories,
		biggestExpense: expenses.reduce((largest, item) => (!largest || item.amount > largest.amount ? item : largest), null),
		biggestIncrease,
		biggestDecrease,
		noSpendDays: Math.max(0, lastDay - [...spendingDays].filter((date) => Number(date.slice(8)) <= lastDay).length),
		previousSpent,
		spentChange: previousSpent ? ((spent - previousSpent) / previousSpent) * 100 : null,
		goalSavings: sumAmounts(expenses.filter((item) => item.category === 'Metas')),
		pendingCount: expenses.filter((item) => !isPaid(item)).length
	};
}

export function hasMonthActivity(ctx, month) {
	return getMonthItems(ctx.transactions, month).length > 0 || getMonthInvestments(ctx.investments, month).length > 0;
}

// Consecutive closed months (going back from last month) in which spending stayed within income.
export function getBudgetStreak(ctx) {
	const currentMonth = ctx.today.slice(0, 7);
	const firstMonth = getFirstDataMonth(ctx);
	let streak = 0;
	for (let offset = 1; offset <= 120; offset += 1) {
		const month = addMonths(currentMonth, -offset);
		if (month < firstMonth || !hasMonthActivity(ctx, month)) break;
		if (getMonthSpending(ctx, month) > getMonthIncome(ctx, month)) break;
		streak += 1;
	}
	return streak;
}

function respectedCategoryLimits(ctx, month) {
	const limits = Object.entries(ctx.categoryBudgets || {}).filter(([, limit]) => Number(limit) > 0);
	if (!limits.length || !hasMonthActivity(ctx, month)) return false;
	const expenses = getMonthItems(ctx.transactions, month).filter((item) => item.type === 'expense');
	return limits.every(([category, limit]) => sumAmounts(expenses.filter((item) => item.category === category)) <= Number(limit));
}

export function computeAchievements(ctx) {
	const currentMonth = ctx.today.slice(0, 7);
	const firstMonth = getFirstDataMonth(ctx);
	const closedMonths = Array.from({ length: Math.max(0, Math.min(36, monthsBetween(firstMonth, currentMonth))) }, (_, index) => addMonths(currentMonth, -(index + 1)));
	const streak = getBudgetStreak(ctx);
	const reserveMonths = getReserveMonths(ctx);
	const transactionCount = ctx.transactions.length;
	const bestSavingsRate = Math.max(0, ...closedMonths.filter((month) => hasMonthActivity(ctx, month)).map((month) => {
		const income = getMonthIncome(ctx, month);
		return income ? ((income - getMonthSpending(ctx, month)) / income) * 100 : 0;
	}));
	const completedGoals = ctx.goals.filter((goal) => Number(goal.currentAmount) >= Number(goal.targetAmount)).length;
	const progress = (value, target) => Math.min(100, Math.round((value / target) * 100));
	return [
		{ id: 'first-step', icon: '✦', title: 'Primeiro passo', description: 'Registre seu primeiro lançamento.', progress: progress(transactionCount, 1) },
		{ id: 'organized', icon: '▤', title: 'Organizado', description: 'Registre 50 lançamentos.', progress: progress(transactionCount, 50), detail: `${Math.min(50, transactionCount)}/50` },
		{ id: 'streak-1', icon: '◔', title: 'Mês no azul', description: 'Feche um mês gastando menos do que ganhou.', progress: progress(streak, 1) },
		{ id: 'streak-3', icon: '🔥', title: '3 meses no azul', description: '3 meses seguidos dentro do orçamento.', progress: progress(streak, 3), detail: `${Math.min(3, streak)}/3` },
		{ id: 'streak-6', icon: '🏆', title: 'Semestre no azul', description: '6 meses seguidos dentro do orçamento.', progress: progress(streak, 6), detail: `${Math.min(6, streak)}/6` },
		{ id: 'limits', icon: '◎', title: 'Dentro dos limites', description: 'Feche um mês respeitando todos os limites por categoria.', progress: closedMonths.some((month) => respectedCategoryLimits(ctx, month)) ? 100 : 0 },
		{ id: 'saver-20', icon: '↗', title: 'Poupador', description: 'Poupe 20% ou mais da renda em um mês fechado.', progress: progress(bestSavingsRate, 20) },
		{ id: 'investor', icon: '◈', title: 'Investidor', description: 'Registre seu primeiro aporte.', progress: progress(ctx.investments.length, 1) },
		{ id: 'goal-done', icon: '★', title: 'Meta batida', description: 'Conclua uma meta.', progress: progress(completedGoals, 1) },
		{ id: 'reserve-3', icon: '⛨', title: 'Colchão de segurança', description: 'Reserva que cobre 3 meses de despesas.', progress: progress(reserveMonths, 3) },
		{ id: 'reserve-6', icon: '🛡', title: 'Reserva completa', description: 'Reserva que cobre 6 meses de despesas.', progress: progress(reserveMonths, 6) }
	].map((achievement) => ({ ...achievement, unlocked: achievement.progress >= 100, streak }));
}

// Flags expenses at least twice the usual value for the category (needs some history to compare).
export function getUnusualSpending(ctx, transaction, excludeId) {
	if (transaction.type !== 'expense' || transaction.category === 'Metas') return null;
	const date = transaction.transactionDate;
	const start = new Date(`${date}T12:00:00`);
	start.setDate(start.getDate() - 90);
	const startKey = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
	const history = ctx.transactions.filter((item) => item.type === 'expense' && item.id !== excludeId && !item.adjustment
		&& item.category === transaction.category && !item.installment
		&& getTransactionDate(item) >= startKey && getTransactionDate(item) <= date);
	if (history.length < 3) return null;
	const average = sumAmounts(history) / history.length;
	if (transaction.amount >= average * 2 && transaction.amount - average >= 20) return { average, ratio: transaction.amount / average };
	return null;
}

export function getGoalExpectedProgress(goal, today) {
	if (!goal.deadline || !goal.createdAt) return null;
	const created = goal.createdAt.slice(0, 10);
	const total = (new Date(`${goal.deadline}T12:00:00`) - new Date(`${created}T12:00:00`)) / 86400000;
	if (total <= 0) return null;
	const elapsed = (new Date(`${today}T12:00:00`) - new Date(`${created}T12:00:00`)) / 86400000;
	return Math.min(1, Math.max(0, elapsed / total));
}
