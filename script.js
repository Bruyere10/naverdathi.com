import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
	createUserWithEmailAndPassword,
	EmailAuthProvider,
	GoogleAuthProvider,
	onAuthStateChanged,
	signInWithPopup,
	signInWithEmailAndPassword,
	signOut,
	sendPasswordResetEmail,
	confirmPasswordReset,
	updateProfile,
	reauthenticateWithCredential,
	reauthenticateWithPopup,
	verifyBeforeUpdateEmail
	,
	verifyPasswordResetCode
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
	collection,
	deleteDoc as firestoreDeleteDoc,
	doc,
	deleteField,
	getDoc,
	getFirestore,
	increment,
	initializeFirestore,
	onSnapshot,
	orderBy,
	persistentLocalCache,
	persistentMultipleTabManager,
	query,
	setDoc as firestoreSetDoc,
	updateDoc as firestoreUpdateDoc,
	writeBatch as firestoreWriteBatch
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import {
	addMonths, clampDay, currencyFormatter, dateInMonth, daysBetween, formatMonthLabel, formatShortMonth,
	formatTransactionDate, getCurrentMonth, getDaysInMonth, getToday, getTransactionDate, isPaid, isTransfer,
	normalizeText, parseTags, roundMoney, stripInstallmentSuffix, sumAmounts, sumByType, toDateKey
} from './modules/utils.js';
import { assignImportIds, escapeCsvText, parseCsv, parseOfx } from './modules/import.js';
import {
	getCardSummary, getInvoice, getInvoiceDates, getInvoiceMonth, getPendingInvoices, invoiceStatusLabels
} from './modules/invoices.js';
import { looksLikeSubscription, parseQuickEntry, suggestCategory } from './modules/quick-entry.js';
import {
	buildCommitments, buildForecast, buildRetrospective, buildRule503020, computeAchievements, defaultCategoryGroups,
	getBudgetStreak, getCategoryGroup, getEndOfMonthForecast, getGoalExpectedProgress, getMonthIncome, getUnusualSpending, ruleGroups
} from './modules/planning.js';
import { getAccountBalance as computeAccountBalance, getAvailableBalance, isRealIncome } from './modules/balance.js';
import { dataUrlToObjectUrl, prepareReceipt } from './modules/receipts.js';
import {
	clearScheduledAlerts, registerPeriodicCheck, requestSystemNotifications, saveScheduledAlerts,
	showSystemNotification, systemNotificationsSupported
} from './modules/system-notifications.js';

const firebaseConfig = {
	apiKey: 'AIzaSyC8Kv4HMGQg31A5_xXB4pQGowZw3L-MLb8',
	authDomain: 'controle-financeiro-ee6c5.firebaseapp.com',
	projectId: 'controle-financeiro-ee6c5',
	storageBucket: 'controle-financeiro-ee6c5.firebasestorage.app',
	messagingSenderId: '675509862812',
	appId: '1:675509862812:web:f8614472d264562aefc859'
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const database = createDatabase();

// Offline mode: data is cached on the device and writes are queued until the connection returns.
function createDatabase() {
	try {
		return initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
	} catch (error) {
		console.warn('Cache offline indisponível neste navegador:', error);
		return getFirestore(app);
	}
}

// While offline, Firestore only resolves writes after reaching the server, so the UI must not wait for them.
function persist(writePromise) {
	if (navigator.onLine) return writePromise;
	writePromise.catch((error) => console.error('Erro ao sincronizar alteração offline:', error));
	return Promise.resolve();
}

function setDoc(...args) {
	return persist(firestoreSetDoc(...args));
}

function updateDoc(...args) {
	return persist(firestoreUpdateDoc(...args));
}

function deleteDoc(...args) {
	return persist(firestoreDeleteDoc(...args));
}

async function addDoc(collectionReference, data) {
	const reference = doc(collectionReference);
	await setDoc(reference, data);
	return reference;
}

function writeBatch(firestore) {
	const batch = firestoreWriteBatch(firestore);
	const commit = batch.commit.bind(batch);
	batch.commit = () => persist(commit());
	return batch;
}
const googleProvider = new GoogleAuthProvider();
const authScreen = document.querySelector('#auth-screen');
const appShell = document.querySelector('#app-shell');
const authForm = document.querySelector('#auth-form');
const authModeToggle = document.querySelector('#auth-mode-toggle');
const authError = document.querySelector('#auth-error');
const salaryModal = document.querySelector('#salary-modal');
const salaryForm = document.querySelector('#salary-form');
const goalModal = document.querySelector('#goal-modal');
const goalForm = document.querySelector('#goal-form');
const goalsList = document.querySelector('#goals-list');
const notificationButton = document.querySelector('#notification-button');
const notificationPanel = document.querySelector('#notification-panel');
const notificationList = document.querySelector('#notification-list');
const notificationBadge = document.querySelector('#notification-badge');
const confirmationModal = document.querySelector('#confirmation-modal');
const confirmationMessage = document.querySelector('#confirmation-message');
const investmentModal = document.querySelector('#investment-modal');
const investmentForm = document.querySelector('#investment-form');
const investmentsList = document.querySelector('#investments-list');
const profileModal = document.querySelector('#profile-modal');
const profileForm = document.querySelector('#profile-form');
const profilePhotoInput = document.querySelector('#profile-photo-input');
const profilePhotoPreview = document.querySelector('#profile-photo-preview');
const emailChangeModal = document.querySelector('#email-change-modal');
const emailChangeForm = document.querySelector('#email-change-form');
const currentPasswordField = document.querySelector('#current-password-field');
const passwordResetModal = document.querySelector('#password-reset-modal');
const passwordResetForm = document.querySelector('#password-reset-form');
let isRegistrationMode = false;
let monthlyIncome = 0;
let stopTransactionListener;
let stopGoalListener;
let stopNotificationListener;
let stopInvestmentListener;
let notifications = [];
let investments = [];
let currentTransactions = [];
let editingTransactionId;
let editingGoalId;
let pendingDeletion;
let profilePhotoData = '';
let passwordResetCode = '';
let accounts = [];
let recurringItems = [];
let goalsData = [];
let categoryBudgets = {};
let customCategories = [];
let stopAccountListener;
let stopRecurringListener;
let editingAccountId;
let contributionGoal;
let pendingImport = [];
let isGeneratingRecurring = false;
const notifiedBills = new Set();
const defaultAlertSettings = {
	bills: true, billDays: 3, invoice: true, invoiceDays: 3, cardLimit: true, cardLimitPercent: 80,
	budget: true, forecast: true, unusual: true, goals: true, achievements: true, push: false
};
let debts = [];
let stopDebtListener;
let alertSettings = { ...defaultAlertSettings };
let sentAlerts = {};
let categoryGroups = {};
let invoiceView = { cardId: '', month: '' };
let calendarMonth = getCurrentMonth();
let selectedCalendarDate = getToday();
let categoryTouched = false;
let editingReceipt = null;
let removeEditingReceipt = false;
let alertTimer;
let lastForecastValue = 0;
let currentBalance = 0;
let debtDirection = 'receivable';
let toastTimer;
let toastAction;
const loadedCollections = new Set();
const defaultCategories = [
	{ name: 'Alimentação', icon: '⌁', color: '#d06d37' },
	{ name: 'Moradia', icon: '⌂', color: '#4371b8' },
	{ name: 'Transporte', icon: '↗', color: '#7a5cc2' },
	{ name: 'Lazer', icon: '✦', color: '#b35da4' },
	{ name: 'Estudo', icon: '✎', color: '#2f8f9d' },
	{ name: 'Jogos', icon: '◈', color: '#c2477a' },
	{ name: 'Trabalho', icon: '▣', color: '#177a59' },
	{ name: 'Metas', icon: '◎', color: '#39799f' },
	{ name: 'Outros', icon: '◇', color: '#8a958f' }
];
const accountTypeLabels = { checking: 'Conta corrente', savings: 'Poupança', cash: 'Dinheiro', credit: 'Cartão de crédito' };
const accountModal = document.querySelector('#account-modal');
const accountForm = document.querySelector('#account-form');
const budgetModal = document.querySelector('#budget-modal');
const budgetForm = document.querySelector('#budget-form');
const categoryModal = document.querySelector('#category-modal');
const categoryForm = document.querySelector('#category-form');
const contributionModal = document.querySelector('#contribution-modal');
const contributionForm = document.querySelector('#contribution-form');
const importModal = document.querySelector('#import-modal');
const importForm = document.querySelector('#import-form');
const importFileInput = document.querySelector('#import-file-input');
const invoiceModal = document.querySelector('#invoice-modal');
const alertSettingsModal = document.querySelector('#alert-settings-modal');
const alertSettingsForm = document.querySelector('#alert-settings-form');
const debtModal = document.querySelector('#debt-modal');
const debtForm = document.querySelector('#debt-form');
const retrospectiveModal = document.querySelector('#retrospective-modal');
const categoryGroupsModal = document.querySelector('#category-groups-modal');
const categoryGroupsForm = document.querySelector('#category-groups-form');
const simulatorInputs = ['#sim-initial', '#sim-monthly', '#sim-rate'].map((selector) => document.querySelector(selector));
const transactionFilters = ['#transaction-search', '#filter-type', '#filter-category', '#filter-status', '#filter-min', '#filter-max']
	.map((selector) => document.querySelector(selector));

const modal = document.querySelector('#transaction-modal');
const transactionForm = document.querySelector('#transaction-form');
const transactionList = document.querySelector('#transaction-list');
const transactionMonthFilter = document.querySelector('#transaction-month-filter');
const sidebar = document.querySelector('.sidebar');
let transactionType = 'expense';
let valuesVisible = true;

function updateCurrentDate() {
	const today = new Date();
	const formattedDate = new Intl.DateTimeFormat('pt-BR', {
		weekday: 'long', day: 'numeric', month: 'long'
	}).format(today).toUpperCase();
	document.querySelector('#current-date').textContent = formattedDate;
}

function getCategories() {
	return [...defaultCategories, ...customCategories];
}

function getCategory(name) {
	return getCategories().find((category) => category.name === name) || { name: name || 'Outros', icon: '◇', color: '#8a958f' };
}

function populateCategorySelect(select, allLabel) {
	const selected = select.value;
	select.replaceChildren();
	if (allLabel) select.add(new Option(allLabel, 'all'));
	getCategories().forEach((category) => select.add(new Option(category.name, category.name)));
	if ([...select.options].some((option) => option.value === selected)) select.value = selected;
}

function refreshCategorySelects() {
	populateCategorySelect(document.querySelector('#transaction-category'));
	populateCategorySelect(document.querySelector('#filter-category'), 'Todas as categorias');
	populateCategorySelect(document.querySelector('#import-category'));
}

function getAccount(accountId) {
	return accounts.find((account) => account.id === accountId);
}

function populateAccountSelects() {
	[['#transaction-account', 'Sem conta'], ['#import-account', 'Sem conta'], ['#transfer-from'], ['#transfer-to']].forEach(([selector, emptyLabel]) => {
		const select = document.querySelector(selector);
		const selected = select.value;
		select.replaceChildren();
		if (emptyLabel) select.add(new Option(emptyLabel, ''));
		accounts.forEach((account) => select.add(new Option(account.name, account.id)));
		if ([...select.options].some((option) => option.value === selected)) select.value = selected;
	});
}

function getMonthTransactions(monthKey) {
	return currentTransactions.filter((transaction) => !isTransfer(transaction) && !transaction.adjustment && getTransactionDate(transaction).startsWith(monthKey));
}

function getMonthExpenses(monthKey) {
	return getMonthTransactions(monthKey).filter((transaction) => transaction.type === 'expense');
}

function getCategoryTotals(monthKey) {
	const totals = new Map();
	getMonthExpenses(monthKey).forEach((transaction) => {
		totals.set(transaction.category, (totals.get(transaction.category) || 0) + transaction.amount);
	});
	return new Map([...totals].sort((first, second) => second[1] - first[1]));
}

function getInvestmentsInMonth(monthKey) {
	return investments.filter((investment) => getInvestmentDate(investment).startsWith(monthKey));
}

function setMoney(element, amount) {
	element.dataset.money = amount;
	element.textContent = valuesVisible ? currencyFormatter.format(amount) : 'R$ ••••••';
}

function createActionButton(symbol, label, handler, isDelete = false) {
	const button = document.createElement('button');
	button.className = `item-action${isDelete ? ' delete' : ''}`;
	button.type = 'button';
	button.title = label;
	button.setAttribute('aria-label', label);
	button.textContent = symbol;
	button.addEventListener('click', handler);
	return button;
}

function createEmptyState(message) {
	const emptyState = document.createElement('p');
	emptyState.className = 'empty-state';
	emptyState.textContent = message;
	return emptyState;
}

function updateInstallmentHint() {
	const installments = Math.floor(Number(document.querySelector('#transaction-installments').value)) || 1;
	const amount = Number(document.querySelector('#transaction-amount').value) || 0;
	const isInstallment = transactionType === 'expense' && installments > 1 && !editingTransactionId;
	const recurringInput = document.querySelector('#transaction-recurring');
	recurringInput.disabled = isInstallment;
	if (isInstallment) recurringInput.checked = false;
	document.querySelector('#transaction-amount-label').textContent = isInstallment
		? `Valor total (${installments}x de ${currencyFormatter.format(amount / installments)})`
		: 'Valor';
	const showSubscription = !editingTransactionId && transactionType === 'expense' && recurringInput.checked;
	transactionForm.querySelector('[data-field="subscription"]').hidden = !showSubscription;
	if (!showSubscription) document.querySelector('#transaction-subscription').checked = false;
	updateInvoiceHint();
	updateSplitHint();
}

// Date the first charge will actually have, considering "first charge next month".
function getFirstChargeDate() {
	const date = document.querySelector('#transaction-date').value;
	if (!date) return '';
	const startNextMonth = !editingTransactionId && transactionType === 'expense' && document.querySelector('#transaction-next-month').checked;
	return startNextMonth ? dateInMonth(addMonths(date.slice(0, 7), 1), Number(date.slice(8))) : date;
}

function updateInvoiceHint() {
	const hint = document.querySelector('#transaction-invoice-hint');
	const card = getAccount(document.querySelector('#transaction-account').value);
	const date = getFirstChargeDate();
	if (transactionType !== 'expense' || card?.type !== 'credit' || !date) {
		hint.hidden = true;
		return;
	}
	const invoiceMonth = getInvoiceMonth(card, date);
	const { closingDate, dueDate } = getInvoiceDates(card, invoiceMonth);
	const installments = Math.floor(Number(document.querySelector('#transaction-installments').value)) || 1;
	hint.hidden = false;
	hint.textContent = `${installments > 1 ? 'A 1ª parcela entra' : 'Entra'} na fatura de ${formatMonthLabel(invoiceMonth).toLowerCase()} (fecha ${formatTransactionDate(closingDate)}, vence ${formatTransactionDate(dueDate)}).`
		+ (date.slice(0, 7) !== invoiceMonth ? ' Como a fatura deste mês já fechou, a cobrança vai para a próxima.' : '');
}

function getSplitPeople() {
	return [...new Set(document.querySelector('#transaction-split-people').value.split(',').map((name) => name.trim().slice(0, 40)).filter(Boolean))].slice(0, 10);
}

function updateSplitHint() {
	const enabled = document.querySelector('#transaction-split').checked;
	const hint = document.querySelector('#transaction-split-hint');
	transactionForm.querySelector('[data-field="split-people"]').hidden = !enabled;
	const people = getSplitPeople();
	const amount = Number(document.querySelector('#transaction-amount').value) || 0;
	hint.hidden = !enabled || !people.length || !amount;
	if (!hint.hidden) {
		hint.textContent = `Dividindo igualmente entre você e ${people.length} pessoa(s): cada um paga ${currencyFormatter.format(amount / (people.length + 1))}. Vamos registrar quanto cada pessoa te deve.`;
	}
}

function updateTransactionFormFields() {
	const isTransferType = transactionType === 'transfer';
	const isNew = !editingTransactionId;
	document.querySelectorAll('.type-option:not(.debt-direction)').forEach((button) => {
		button.classList.toggle('active', button.dataset.type === transactionType);
	});
	transactionForm.querySelector('[data-field="category"]').hidden = isTransferType;
	transactionForm.querySelector('[data-field="account"]').hidden = isTransferType;
	transactionForm.querySelector('[data-field="transfer"]').hidden = !isTransferType;
	transactionForm.querySelector('[data-field="paid"]').hidden = isTransferType;
	transactionForm.querySelector('[data-field="new-only"]').hidden = !isNew || isTransferType;
	transactionForm.querySelector('[data-field="installments"]').hidden = transactionType !== 'expense';
	transactionForm.querySelector('[data-field="next-month"]').hidden = !isNew || transactionType !== 'expense';
	transactionForm.querySelector('[data-field="split"]').hidden = !isNew || transactionType !== 'expense';
	if (transactionType !== 'expense') {
		document.querySelector('#transaction-next-month').checked = false;
		document.querySelector('#transaction-split').checked = false;
	}
	updateInstallmentHint();
	updateCategorySuggestion();
}

function updateCategorySuggestion() {
	const hint = document.querySelector('#category-suggestion-hint');
	hint.hidden = true;
	if (categoryTouched || editingTransactionId || transactionType === 'transfer') return;
	const description = document.querySelector('#transaction-description').value;
	const suggestion = suggestCategory(description, currentTransactions, getCategories().map((category) => category.name));
	if (suggestion) {
		document.querySelector('#transaction-category').value = suggestion;
		hint.hidden = false;
		hint.textContent = `Categoria sugerida automaticamente: ${suggestion}`;
	}
	if (transactionType === 'expense' && looksLikeSubscription(description)) {
		const recurring = document.querySelector('#transaction-recurring');
		if (!recurring.disabled && !recurring.dataset.touched) {
			recurring.checked = true;
			updateInstallmentHint();
			document.querySelector('#transaction-subscription').checked = true;
		}
	}
}

function updateReceiptField() {
	const current = document.querySelector('#transaction-receipt-current');
	current.hidden = !editingReceipt || removeEditingReceipt;
	if (editingReceipt) document.querySelector('#transaction-receipt-name').textContent = `📎 ${editingReceipt.name || 'Comprovante'}`;
}

function resetTransactionForm(transaction) {
	const isEditing = Boolean(transaction?.id);
	transactionForm.reset();
	refreshCategorySelects();
	populateAccountSelects();
	editingTransactionId = transaction?.id;
	transactionType = transaction?.type || 'expense';
	const categorySelect = document.querySelector('#transaction-category');
	const category = transaction?.category && !isTransfer(transaction) ? transaction.category : 'Alimentação';
	if (![...categorySelect.options].some((option) => option.value === category)) categorySelect.add(new Option(category, category));
	categorySelect.value = category;
	document.querySelector('#transaction-description').value = transaction?.description || '';
	document.querySelector('#transaction-amount').value = transaction?.amount || '';
	document.querySelector('#transaction-date').value = transaction?.transactionDate || getToday();
	document.querySelector('#transaction-account').value = getAccount(transaction?.accountId) ? transaction.accountId : '';
	document.querySelector('#transfer-from').value = transaction?.fromAccountId || accounts[0]?.id || '';
	document.querySelector('#transfer-to').value = transaction?.toAccountId || accounts[1]?.id || '';
	document.querySelector('#transaction-paid').checked = transaction ? isPaid(transaction) : true;
	document.querySelector('#transaction-tags').value = (transaction?.tags || []).join(', ');
	document.querySelector('#transaction-notes').value = transaction?.notes || '';
	document.querySelector('#transaction-error').textContent = '';
	document.querySelector('#transaction-modal-kicker').textContent = isEditing ? 'EDITAR REGISTRO' : 'NOVO REGISTRO';
	document.querySelector('#transaction-modal-title').textContent = isEditing ? 'Editar lançamento' : 'Adicionar lançamento';
	document.querySelector('#transaction-submit-button').textContent = isEditing ? 'Salvar alterações' : 'Adicionar lançamento';
	categoryTouched = isEditing;
	editingReceipt = isEditing ? transaction.receipt || null : null;
	removeEditingReceipt = false;
	delete document.querySelector('#transaction-recurring').dataset.touched;
	updateReceiptField();
	updateTransactionFormFields();
}

document.querySelector('[data-open-modal]').addEventListener('click', () => {
	resetTransactionForm();
	modal.showModal();
});

document.querySelector('[data-close-modal]').addEventListener('click', () => modal.close());

document.querySelector('#add-goal-button').addEventListener('click', () => {
	resetGoalForm();
	goalModal.showModal();
});

document.querySelector('[data-close-goal-modal]').addEventListener('click', () => goalModal.close());

document.querySelector('#profile-button').addEventListener('click', () => {
	const user = auth.currentUser;
	document.querySelector('#profile-name-input').value = user.displayName || user.email.split('@')[0];
	document.querySelector('#profile-email-input').value = user.email;
	document.querySelector('#profile-income-input').value = monthlyIncome || '';
	setProfilePhotoPreview(profilePhotoData, user.displayName || user.email);
	profileModal.showModal();
});

document.querySelector('[data-close-profile-modal]').addEventListener('click', () => profileModal.close());

document.querySelector('#open-email-change-button').addEventListener('click', () => {
	const usesGoogle = auth.currentUser.providerData.some((provider) => provider.providerId === 'google.com');
	emailChangeForm.reset();
	currentPasswordField.hidden = usesGoogle;
	document.querySelector('#current-password-input').required = !usesGoogle;
	document.querySelector('#email-change-error').textContent = usesGoogle
		? 'Você confirmará sua conta Google no próximo passo.'
		: '';
	emailChangeModal.showModal();
});

document.querySelector('[data-close-email-modal]').addEventListener('click', () => emailChangeModal.close());

document.querySelector('#remove-income-button').addEventListener('click', () => openDeleteConfirmation(
	'Remover sua renda mensal? O saldo e o planejamento serão recalculados e você precisará informar uma nova renda.',
	async () => {
		await setDoc(doc(database, 'users', auth.currentUser.uid), { monthlyIncome: deleteField() }, { merge: true });
		monthlyIncome = 0;
		renderDashboard(currentTransactions);
		await addNotification('Você removeu sua renda mensal.', '×');
		profileModal.close();
		if (!salaryModal.open) salaryModal.showModal();
	}
));

document.querySelector('#add-investment-button').addEventListener('click', () => {
	investmentForm.reset();
	investmentModal.showModal();
});

document.querySelector('[data-close-investment-modal]').addEventListener('click', () => investmentModal.close());

document.querySelector('#cancel-delete-button').addEventListener('click', () => confirmationModal.close());
document.querySelector('#confirm-delete-button').addEventListener('click', async () => {
	const confirmButton = document.querySelector('#confirm-delete-button');
	if (!pendingDeletion) return;
	confirmButton.disabled = true;
	confirmButton.textContent = 'Excluindo...';
	try {
		await pendingDeletion();
		confirmationModal.close();
	} catch (error) {
		console.error('Erro ao excluir item:', error);
	} finally {
		confirmButton.disabled = false;
		confirmButton.textContent = 'Excluir';
	}
});
confirmationModal.addEventListener('close', () => { pendingDeletion = undefined; });

notificationButton.addEventListener('click', () => {
	notificationPanel.hidden = !notificationPanel.hidden;
});

document.querySelector('#clear-notifications-button').addEventListener('click', async () => {
	await Promise.all(notifications.map((notification) => deleteDoc(
		doc(database, 'users', auth.currentUser.uid, 'notifications', notification.id)
	)));
});

document.querySelectorAll('.type-option[data-type]').forEach((button) => {
	button.addEventListener('click', () => {
		transactionType = button.dataset.type;
		updateTransactionFormFields();
	});
});

document.querySelector('#transaction-installments').addEventListener('input', updateInstallmentHint);
document.querySelector('#transaction-amount').addEventListener('input', updateInstallmentHint);
document.querySelector('#transaction-date').addEventListener('input', updateInvoiceHint);
document.querySelector('#transaction-account').addEventListener('change', updateInvoiceHint);
document.querySelector('#transaction-next-month').addEventListener('change', updateInvoiceHint);
document.querySelector('#transaction-split').addEventListener('change', updateSplitHint);
document.querySelector('#transaction-split-people').addEventListener('input', updateSplitHint);
document.querySelector('#transaction-recurring').addEventListener('change', (event) => {
	event.target.dataset.touched = 'true';
	updateInstallmentHint();
});
document.querySelector('#transaction-description').addEventListener('input', updateCategorySuggestion);
document.querySelector('#transaction-category').addEventListener('change', () => {
	categoryTouched = true;
	document.querySelector('#category-suggestion-hint').hidden = true;
});
document.querySelector('#transaction-receipt-view').addEventListener('click', () => viewReceipt(editingReceipt));
document.querySelector('#transaction-receipt-remove').addEventListener('click', () => {
	removeEditingReceipt = true;
	updateReceiptField();
});

transactionForm.addEventListener('submit', async (event) => {
	event.preventDefault();
	const errorMessage = document.querySelector('#transaction-error');
	const description = document.querySelector('#transaction-description').value.trim();
	const amount = Number(document.querySelector('#transaction-amount').value);
	const transactionDate = document.querySelector('#transaction-date').value;
	const tags = parseTags(document.querySelector('#transaction-tags').value);
	const notes = document.querySelector('#transaction-notes').value.trim().slice(0, 300);

	if (!description || !Number.isFinite(amount) || amount <= 0 || !transactionDate) return;

	let transactionData;
	if (transactionType === 'transfer') {
		const fromAccountId = document.querySelector('#transfer-from').value;
		const toAccountId = document.querySelector('#transfer-to').value;
		if (!fromAccountId || !toAccountId || fromAccountId === toAccountId) {
			errorMessage.textContent = 'Escolha duas contas diferentes. Cadastre suas contas em "Contas e cartões".';
			return;
		}
		transactionData = {
			description, amount, transactionDate, tags, notes,
			type: 'transfer', category: 'Transferência', accountId: '', fromAccountId, toAccountId, status: 'paid'
		};
	} else {
		transactionData = {
			description, amount, transactionDate, tags, notes,
			type: transactionType,
			category: document.querySelector('#transaction-category').value,
			accountId: document.querySelector('#transaction-account').value,
			status: document.querySelector('#transaction-paid').checked ? 'paid' : 'pending'
		};
	}

	const installments = transactionType === 'expense' && !editingTransactionId
		? Math.min(60, Math.max(1, Math.floor(Number(document.querySelector('#transaction-installments').value) || 1)))
		: 1;
	const isRecurring = !editingTransactionId && installments === 1 && transactionType !== 'transfer'
		&& document.querySelector('#transaction-recurring').checked;
	const isSubscription = isRecurring && transactionType === 'expense' && document.querySelector('#transaction-subscription').checked;
	const startsNextMonth = !editingTransactionId && transactionType === 'expense' && document.querySelector('#transaction-next-month').checked;
	const splitPeople = !editingTransactionId && transactionType === 'expense' && document.querySelector('#transaction-split').checked ? getSplitPeople() : [];
	if (!editingTransactionId && transactionType === 'expense' && document.querySelector('#transaction-split').checked && !splitPeople.length) {
		errorMessage.textContent = 'Informe com quem a despesa será dividida.';
		return;
	}
	if (startsNextMonth) {
		transactionData.transactionDate = getFirstChargeDate();
		const isCard = getAccount(transactionData.accountId)?.type === 'credit';
		if (!isCard && installments === 1 && transactionData.transactionDate > getToday()) transactionData.status = 'pending';
	}
	// Calculated before saving because the snapshot listener may already include the new transaction.
	const firstAmount = amount / installments;
	const budgetAlert = getBudgetAlert({ ...transactionData, amount: firstAmount }, editingTransactionId);
	const unusual = alertSettings.unusual
		? getUnusualSpending(getPlanningContext(), { ...transactionData, amount: firstAmount }, editingTransactionId)
		: null;
	const transactionsCollection = collection(database, 'users', auth.currentUser.uid, 'transactions');
	const receiptsCollection = collection(database, 'users', auth.currentUser.uid, 'receipts');
	const submitButton = document.querySelector('#transaction-submit-button');
	const submitLabel = submitButton.textContent;
	const receiptFile = document.querySelector('#transaction-receipt').files[0];
	errorMessage.textContent = '';
	submitButton.disabled = true;
	submitButton.textContent = 'Salvando...';

	try {
		let receipt;
		try {
			receipt = await prepareReceipt(receiptFile);
		} catch (error) {
			errorMessage.textContent = error.message;
			return;
		}
		const transactionReference = editingTransactionId ? doc(transactionsCollection, editingTransactionId) : doc(transactionsCollection);
		if (receipt) {
			const receiptReference = doc(receiptsCollection);
			await setDoc(receiptReference, { ...receipt, transactionId: transactionReference.id, createdAt: new Date().toISOString() });
			transactionData.receipt = { id: receiptReference.id, name: receipt.name, type: receipt.type };
		}
		let savedId = transactionReference.id;
		if (editingTransactionId) {
			if (editingReceipt && (removeEditingReceipt || receipt)) {
				await deleteDoc(doc(receiptsCollection, editingReceipt.id));
				if (!receipt) transactionData.receipt = deleteField();
			}
			await updateDoc(transactionReference, transactionData);
			await addNotification(`Você editou ${description}.`, '✎');
		} else if (installments > 1) {
			[savedId] = await saveInstallments(transactionData, installments);
			if (receipt) await updateDoc(doc(receiptsCollection, transactionData.receipt.id), { transactionId: savedId });
			await addNotification(`Você parcelou ${description} em ${installments}x de ${currencyFormatter.format(amount / installments)}${startsNextMonth ? ', começando no mês que vem' : ''}.`, '↑');
		} else {
			await setDoc(transactionReference, { ...transactionData, createdAt: new Date().toISOString() });
			if (isRecurring) {
				await addDoc(collection(database, 'users', auth.currentUser.uid, 'recurring'), {
					description, amount, tags, notes,
					type: transactionData.type,
					category: transactionData.category,
					accountId: transactionData.accountId,
					dayOfMonth: Number(transactionData.transactionDate.slice(8)),
					lastGeneratedMonth: transactionData.transactionDate.slice(0, 7),
					subscription: isSubscription,
					createdAt: new Date().toISOString()
				});
			}
			const typeLabel = { income: 'receita', expense: 'despesa', transfer: 'transferência' }[transactionType];
			const symbol = { income: '↓', expense: '↑', transfer: '⇄' }[transactionType];
			await addNotification(`Você adicionou ${description} como ${isSubscription ? 'assinatura' : `${typeLabel}${isRecurring ? ' fixa' : ''}`}.`, symbol);
		}
		if (splitPeople.length) {
			const share = roundMoney(amount / (splitPeople.length + 1));
			const batch = writeBatch(database);
			splitPeople.forEach((person) => batch.set(doc(collection(database, 'users', auth.currentUser.uid, 'debts')), {
				person, description, amount: share, direction: 'receivable', settled: false,
				transactionId: savedId, date: transactionData.transactionDate, createdAt: new Date().toISOString()
			}));
			await batch.commit();
			await addNotification(`${splitPeople.join(', ')} ${splitPeople.length > 1 ? 'te devem' : 'te deve'} ${currencyFormatter.format(share)}${splitPeople.length > 1 ? ' cada' : ''} por ${description}.`, '⇆');
		}
		if (budgetAlert && alertSettings.budget) await raiseAlert(null, budgetAlert, '!');
		if (unusual) {
			await raiseAlert(null, `Gasto fora do comum: ${description} (${currencyFormatter.format(firstAmount)}) é ${unusual.ratio.toFixed(1).replace('.', ',')}x a sua média em ${transactionData.category} (${currencyFormatter.format(unusual.average)}).`, '⚠');
		}
		modal.close();
	} catch (error) {
		console.error('Erro ao salvar lançamento:', error);
		errorMessage.textContent = 'Não foi possível salvar o lançamento. Tente novamente.';
	} finally {
		submitButton.disabled = false;
		submitButton.textContent = submitLabel;
	}
});

investmentForm.addEventListener('submit', async (event) => {
	event.preventDefault();
	const name = document.querySelector('#investment-name').value.trim();
	const amount = Number(document.querySelector('#investment-amount').value);
	const type = document.querySelector('#investment-type').value;
	const frequency = document.querySelector('#investment-frequency-input').value;
	const annualRate = Number(document.querySelector('#investment-rate').value) || null;
	if (!name || !Number.isFinite(amount) || amount <= 0) return;

	try {
		await addDoc(collection(database, 'users', auth.currentUser.uid, 'investments'), {
			name, amount, type, frequency, annualRate, createdAt: new Date().toISOString()
		});
		await addNotification(`Você registrou um aporte de ${currencyFormatter.format(amount)} em ${name}.`, '↗');
		investmentModal.close();
	} catch (error) {
		console.error('Erro ao salvar investimento:', error);
	}
});

document.querySelector('.visibility-button').addEventListener('click', () => {
	valuesVisible = !valuesVisible;
	document.querySelectorAll('[data-money]').forEach((element) => {
		element.textContent = valuesVisible ? currencyFormatter.format(Number(element.dataset.money)) : 'R$ ••••••';
	});
	document.querySelector('.visibility-button').setAttribute('aria-label', valuesVisible ? 'Ocultar valores' : 'Mostrar valores');
});

document.querySelectorAll('.nav-item').forEach((item) => {
	item.addEventListener('click', () => {
		document.querySelectorAll('.nav-item').forEach((link) => link.classList.remove('active'));
		item.classList.add('active');
		sidebar.classList.remove('open');
	});
});

document.querySelector('.menu-button').addEventListener('click', () => sidebar.classList.toggle('open'));
updateCurrentDate();

function setAuthenticationMode(registrationMode) {
	isRegistrationMode = registrationMode;
	const nameField = document.querySelector('#name-field');
	const nameInput = document.querySelector('#auth-name');
	const passwordInput = document.querySelector('#auth-password');
	nameField.hidden = !registrationMode;
	nameInput.required = registrationMode;
	passwordInput.autocomplete = registrationMode ? 'new-password' : 'current-password';
	document.querySelector('#auth-kicker').textContent = registrationMode ? 'COMECE AGORA' : `${getGreeting().toUpperCase()} · BEM-VINDO DE VOLTA`;
	document.querySelector('#auth-title').textContent = registrationMode ? 'Crie sua conta' : 'Entre na sua conta';
	document.querySelector('#auth-subtitle').textContent = registrationMode ? 'Leva menos de um minuto.' : 'Acompanhe sua vida financeira.';
	document.querySelector('#auth-submit').textContent = registrationMode ? 'Criar conta' : 'Entrar';
	document.querySelector('#forgot-password-button').hidden = registrationMode;
	document.querySelector('#auth-switch').innerHTML = registrationMode
		? 'Já possui uma conta? <button type="button" id="auth-mode-toggle">Entrar</button>'
		: 'Ainda não possui uma conta? <button type="button" id="auth-mode-toggle">Criar conta</button>';
	document.querySelector('#auth-mode-toggle').addEventListener('click', () => setAuthenticationMode(!isRegistrationMode));
	updatePasswordStrength();
	authError.textContent = '';
}

/* ---------- Login screen helpers ---------- */

function getGreeting() {
	const hour = new Date().getHours();
	if (hour < 5) return 'Boa madrugada';
	if (hour < 12) return 'Bom dia';
	if (hour < 18) return 'Boa tarde';
	return 'Boa noite';
}

function getPasswordStrength(password) {
	let score = 0;
	if (password.length >= 6) score += 1;
	if (password.length >= 10) score += 1;
	if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
	if (/\d/.test(password)) score += 1;
	if (/[^A-Za-z0-9]/.test(password)) score += 1;
	if (password.length < 6) score = Math.min(score, 1);
	const levels = [
		{ label: 'Muito fraca', color: 'var(--coral)' },
		{ label: 'Fraca', color: 'var(--coral)' },
		{ label: 'Razoável', color: '#e0a526' },
		{ label: 'Boa', color: '#7ab648' },
		{ label: 'Forte', color: 'var(--green)' },
		{ label: 'Muito forte', color: 'var(--green)' }
	];
	return { score, ...levels[score] };
}

function updatePasswordStrength() {
	const password = document.querySelector('#auth-password').value;
	const meter = document.querySelector('#password-strength');
	meter.hidden = !isRegistrationMode || !password;
	if (meter.hidden) return;
	const strength = getPasswordStrength(password);
	const bar = document.querySelector('#password-strength-bar');
	bar.style.width = `${Math.max(10, (strength.score / 5) * 100)}%`;
	bar.style.background = strength.color;
	document.querySelector('#password-strength-label').textContent = `Força da senha: ${strength.label}`;
}

const rememberedEmailKey = 'naverdathi-remembered-email';
const authPasswordInput = document.querySelector('#auth-password');

document.querySelector('#password-toggle').addEventListener('click', (event) => {
	const visible = authPasswordInput.type === 'password';
	authPasswordInput.type = visible ? 'text' : 'password';
	event.currentTarget.textContent = visible ? 'Ocultar' : 'Mostrar';
	event.currentTarget.setAttribute('aria-label', visible ? 'Ocultar senha' : 'Mostrar senha');
	event.currentTarget.setAttribute('aria-pressed', String(visible));
	authPasswordInput.focus();
});

authPasswordInput.addEventListener('input', updatePasswordStrength);
['keydown', 'keyup'].forEach((type) => authPasswordInput.addEventListener(type, (event) => {
	if (typeof event.getModifierState === 'function') {
		document.querySelector('#caps-warning').hidden = !event.getModifierState('CapsLock');
	}
}));
authPasswordInput.addEventListener('blur', () => { document.querySelector('#caps-warning').hidden = true; });

function rememberEmailPreference(email) {
	if (document.querySelector('#remember-email').checked && email) localStorage.setItem(rememberedEmailKey, email);
	else localStorage.removeItem(rememberedEmailKey);
}

(function restoreRememberedEmail() {
	const email = localStorage.getItem(rememberedEmailKey);
	document.querySelector('#auth-kicker').textContent = `${getGreeting().toUpperCase()} · BEM-VINDO DE VOLTA`;
	if (!email) return;
	document.querySelector('#auth-email').value = email;
	document.querySelector('#remember-email').checked = true;
}());

document.querySelector('#forgot-password-button').addEventListener('click', async () => {
	const email = document.querySelector('#auth-email').value.trim();
	if (!email) {
		authError.classList.remove('success-message');
		authError.textContent = 'Informe seu e-mail para receber o link de redefinição.';
		return;
	}

	authError.textContent = '';
	try {
		await sendPasswordResetEmail(auth, email, {
			url: `${window.location.origin}${window.location.pathname}`,
			handleCodeInApp: false
		});
		authError.classList.add('success-message');
		authError.textContent = 'Enviamos um link para redefinir sua senha. Verifique sua caixa de entrada.';
	} catch (error) {
		console.error('Erro ao enviar redefinição de senha:', error);
		authError.classList.remove('success-message');
		authError.textContent = getAuthenticationErrorMessage(error.code);
	}
});

async function openPasswordResetFromLink() {
	const parameters = new URLSearchParams(window.location.search);
	if (parameters.get('mode') !== 'resetPassword' || !parameters.get('oobCode')) return;

	passwordResetCode = parameters.get('oobCode');
	const errorMessage = document.querySelector('#password-reset-error');
	try {
		const email = await verifyPasswordResetCode(auth, passwordResetCode);
		document.querySelector('#password-reset-description').textContent = `Defina uma nova senha para ${email}.`;
		passwordResetModal.showModal();
	} catch (error) {
		console.error('Link de redefinição inválido:', error);
		authError.textContent = 'Este link de redefinição é inválido ou expirou. Solicite outro e-mail.';
		window.history.replaceState({}, document.title, window.location.pathname);
	}
}

passwordResetForm.addEventListener('submit', async (event) => {
	event.preventDefault();
	const newPassword = document.querySelector('#new-password-input').value;
	const confirmation = document.querySelector('#confirm-password-input').value;
	const errorMessage = document.querySelector('#password-reset-error');
	const submitButton = document.querySelector('#password-reset-submit');
	if (newPassword !== confirmation) {
		errorMessage.textContent = 'As senhas não são iguais.';
		return;
	}

	submitButton.disabled = true;
	submitButton.textContent = 'Salvando...';
	errorMessage.textContent = '';
	try {
		await confirmPasswordReset(auth, passwordResetCode, newPassword);
		errorMessage.classList.add('success-message');
		errorMessage.textContent = 'Senha alterada com sucesso. Agora você pode entrar.';
		window.history.replaceState({}, document.title, window.location.pathname);
		setTimeout(() => passwordResetModal.close(), 1800);
	} catch (error) {
		console.error('Erro ao redefinir senha:', error);
		errorMessage.textContent = getAuthenticationErrorMessage(error.code);
	} finally {
		submitButton.disabled = false;
		submitButton.textContent = 'Salvar nova senha';
	}
});

function openDeleteConfirmation(message, deleteAction) {
	confirmationMessage.textContent = message;
	pendingDeletion = deleteAction;
	confirmationModal.showModal();
}

function setProfilePhotoPreview(photo, fallbackText) {
	profilePhotoPreview.replaceChildren();
	if (photo) {
		const image = document.createElement('img');
		image.src = photo;
		image.alt = 'Foto de perfil selecionada';
		profilePhotoPreview.append(image);
	} else {
		profilePhotoPreview.textContent = fallbackText.charAt(0).toUpperCase();
	}
}

function compressProfilePhoto(file) {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
		reader.onload = () => {
			const image = new Image();
			image.onerror = () => reject(new Error('Não foi possível carregar a imagem.'));
			image.onload = () => {
				const maximumSize = 240;
				const scale = Math.min(1, maximumSize / Math.max(image.width, image.height));
				const canvas = document.createElement('canvas');
				canvas.width = Math.round(image.width * scale);
				canvas.height = Math.round(image.height * scale);
				canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
				resolve(canvas.toDataURL('image/webp', 0.75));
			};
			image.src = reader.result;
		};
		reader.readAsDataURL(file);
	});
}

function getAuthenticationErrorMessage(errorCode) {
	const messages = {
		'auth/email-already-in-use': 'Este e-mail já está cadastrado.',
		'auth/invalid-credential': 'E-mail ou senha incorretos.',
		'auth/invalid-email': 'Informe um e-mail válido.',
		'auth/weak-password': 'A senha precisa ter pelo menos 6 caracteres.',
		'auth/too-many-requests': 'Muitas tentativas. Aguarde um momento e tente de novo.',
		'auth/operation-not-allowed': 'O login com Google ainda não está ativado no Firebase.',
		'auth/unauthorized-domain': 'Este endereço do site não está autorizado no Firebase.',
		'auth/popup-closed-by-user': 'A janela de login foi fechada antes da conclusão.',
		'auth/popup-blocked': 'O navegador bloqueou a janela do Google. Permita pop-ups e tente novamente.',
		'auth/cancelled-popup-request': 'A tentativa de login foi cancelada. Tente novamente.'
	};
	return messages[errorCode] || 'Não foi possível concluir a operação. Tente novamente.';
}

emailChangeForm.addEventListener('submit', async (event) => {
	event.preventDefault();
	const user = auth.currentUser;
	const newEmail = document.querySelector('#new-email-input').value.trim();
	const password = document.querySelector('#current-password-input').value;
	const submitButton = document.querySelector('#email-change-submit');
	const errorMessage = document.querySelector('#email-change-error');
	const usesGoogle = user.providerData.some((provider) => provider.providerId === 'google.com');

	if (newEmail === user.email) {
		errorMessage.textContent = 'Informe um e-mail diferente do atual.';
		return;
	}

	errorMessage.classList.remove('success-message');
	errorMessage.textContent = '';
	submitButton.disabled = true;
	submitButton.textContent = 'Verificando...';
	try {
		if (usesGoogle) {
			await reauthenticateWithPopup(user, googleProvider);
		} else {
			const credential = EmailAuthProvider.credential(user.email, password);
			await reauthenticateWithCredential(user, credential);
		}
		await verifyBeforeUpdateEmail(user, newEmail, {
			url: `${window.location.origin}${window.location.pathname}`,
			handleCodeInApp: false
		});
		errorMessage.classList.add('success-message');
		errorMessage.textContent = 'Enviamos um link de confirmação para o novo e-mail. Abra-o para concluir a alteração.';
	} catch (error) {
		console.error('Erro ao alterar e-mail:', error);
		errorMessage.textContent = getAuthenticationErrorMessage(error.code);
	} finally {
		submitButton.disabled = false;
		submitButton.textContent = 'Enviar confirmação';
	}
});

function updateUserInterface(user) {
	const displayName = user.displayName || user.email.split('@')[0];
	document.querySelector('#user-name').textContent = displayName;
	document.querySelector('#user-email').textContent = user.email;
	const avatar = document.querySelector('#user-initial');
	avatar.replaceChildren();
	if (profilePhotoData) {
		const image = document.createElement('img');
		image.src = profilePhotoData;
		image.alt = '';
		avatar.append(image);
	} else {
		avatar.textContent = displayName.charAt(0).toUpperCase();
	}
	document.querySelector('#page-title').textContent = `Olá, ${displayName}.`;
}

function updateMonthFilter(transactions) {
	const selectedMonth = transactionMonthFilter.value;
	const months = [...new Set(transactions.map(getTransactionDate).filter(Boolean).map((date) => date.slice(0, 7)))].sort().reverse();
	transactionMonthFilter.replaceChildren(new Option('Todos os lançamentos', 'all'));
	months.forEach((month) => {
		const label = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' })
			.format(new Date(`${month}-01T12:00:00`));
		transactionMonthFilter.add(new Option(label.charAt(0).toUpperCase() + label.slice(1), month));
	});
	transactionMonthFilter.value = months.includes(selectedMonth) ? selectedMonth : 'all';
}

function createTransactionElement(transaction) {
	const isIncome = transaction.type === 'income';
	const isTransferItem = isTransfer(transaction);
	const category = getCategory(transaction.category);
	const row = document.createElement('article');
	const icon = document.createElement('div');
	const details = document.createElement('div');
	const description = document.createElement('strong');
	const metadata = document.createElement('span');
	const value = document.createElement('strong');
	const actions = document.createElement('div');
	const metadataParts = [
		isTransferItem
			? `${transaction.fromAccountId ? getAccount(transaction.fromAccountId)?.name || 'Conta removida' : 'Sem conta'} → ${getAccount(transaction.toAccountId)?.name || 'Conta removida'}`
			: transaction.category,
		formatTransactionDate(getTransactionDate(transaction))
	];
	const accountName = getAccount(transaction.accountId)?.name;
	if (accountName) metadataParts.push(accountName);

	row.className = 'transaction';
	icon.className = 'transaction-icon';
	if (isTransferItem) {
		icon.classList.add('home');
		icon.textContent = '⇄';
	} else {
		icon.style.background = `${category.color}22`;
		icon.style.color = category.color;
		icon.textContent = category.icon;
	}
	details.className = 'transaction-info';
	description.textContent = transaction.description;
	if (!isPaid(transaction)) {
		const badge = document.createElement('span');
		badge.className = 'status-badge';
		badge.textContent = isIncome ? 'A receber' : 'Pendente';
		description.append(' ', badge);
	}
	metadata.textContent = metadataParts.join(' · ');
	details.append(description, metadata);
	if (transaction.tags?.length) {
		const tags = document.createElement('div');
		tags.className = 'transaction-tags';
		transaction.tags.forEach((tag) => {
			const chip = document.createElement('em');
			chip.textContent = `#${tag}`;
			tags.append(chip);
		});
		details.append(tags);
	}
	if (transaction.notes) {
		const note = document.createElement('small');
		note.className = 'transaction-note';
		note.textContent = transaction.notes;
		details.append(note);
	}
	value.className = `transaction-value ${isTransferItem ? 'transfer-value' : isIncome ? 'income-value' : 'expense-value'}`;
	value.textContent = `${isTransferItem ? '⇄' : isIncome ? '+' : '-'} ${currencyFormatter.format(transaction.amount)}`;
	actions.className = 'item-actions';
	if (transaction.receipt?.id) actions.append(createActionButton('📎', 'Ver comprovante', () => viewReceipt(transaction.receipt)));
	actions.append(
		createActionButton('⧉', 'Duplicar lançamento', () => {
			resetTransactionForm({
				...transaction,
				id: undefined,
				receipt: undefined,
				transactionDate: getToday(),
				description: stripInstallmentSuffix(transaction.description)
			});
			modal.showModal();
		}),
		createActionButton('✎', 'Editar lançamento', () => {
			resetTransactionForm(transaction);
			modal.showModal();
		}),
		createActionButton('×', 'Excluir lançamento', () => deleteWithUndo({
			label: `Lançamento "${transaction.description}" excluído.`,
			items: [{ path: ['transactions', transaction.id], data: transaction }],
			onFinalize: async () => {
				if (transaction.receipt?.id) await deleteDoc(doc(database, 'users', auth.currentUser.uid, 'receipts', transaction.receipt.id));
				await addNotification(`Você excluiu ${transaction.description}.`, '×');
			}
		}), true)
	);
	row.append(icon, details, value, actions);
	return row;
}

function resetGoalForm(goal) {
	goalForm.reset();
	editingGoalId = goal?.id;
	document.querySelector('#goal-title').value = goal?.title || '';
	document.querySelector('#goal-target').value = goal?.targetAmount || '';
	document.querySelector('#goal-current').value = goal?.currentAmount || 0;
	document.querySelector('#goal-deadline').value = goal?.deadline || '';
	document.querySelector('#goal-modal-kicker').textContent = goal ? 'EDITAR META' : 'NOVA META';
	document.querySelector('#goal-modal-title').textContent = goal ? 'Atualize sua meta' : 'Crie um objetivo';
	document.querySelector('#goal-submit-button').textContent = goal ? 'Salvar alterações' : 'Criar meta';
}

function createGoalElement(goal) {
	const percentage = Math.min(100, Math.round((goal.currentAmount / goal.targetAmount) * 100));
	const row = document.createElement('article');
	const identity = document.createElement('div');
	const icon = document.createElement('span');
	const title = document.createElement('strong');
	const progress = document.createElement('div');
	const progressLabel = document.createElement('span');
	const progressBar = document.createElement('i');
	const progressFill = document.createElement('b');
	const percentageLabel = document.createElement('strong');
	const actions = document.createElement('div');

	row.className = 'goal-item';
	icon.className = 'goal-icon';
	icon.textContent = '◎';
	title.textContent = goal.title;
	identity.append(icon, title);
	progress.className = 'goal-progress';
	progressLabel.textContent = `${currencyFormatter.format(goal.currentAmount)} de ${currencyFormatter.format(goal.targetAmount)}`;
	progressFill.style.width = `${percentage}%`;
	progressBar.append(progressFill);
	const plan = document.createElement('small');
	plan.textContent = getGoalPlan(goal);
	progress.append(progressLabel, progressBar, plan);
	percentageLabel.textContent = `${percentage}%`;
	actions.className = 'item-actions';
	actions.append(
		createActionButton('+', 'Guardar dinheiro', () => openContribution(goal)),
		createActionButton('✎', 'Editar meta', () => { resetGoalForm(goal); goalModal.showModal(); }),
		createActionButton('×', 'Excluir meta', () => deleteWithUndo({
			label: `Meta "${goal.title}" excluída.`,
			items: [{ path: ['goals', goal.id], data: goal }],
			onFinalize: () => addNotification(`Você excluiu a meta ${goal.title}.`, '×')
		}), true)
	);
	row.append(identity, progress, percentageLabel, actions);
	return row;
}

function renderGoals(goals) {
	goalsData = goals;
	renderIndicators();
	goalsList.replaceChildren();
	if (!goals.length) {
		const emptyState = document.createElement('p');
		emptyState.className = 'empty-goals';
		emptyState.textContent = 'Nenhuma meta criada ainda.';
		goalsList.append(emptyState);
		return;
	}
	goals.forEach((goal) => goalsList.append(createGoalElement(goal)));
}

async function addNotification(message, symbol) {
	await addDoc(collection(database, 'users', auth.currentUser.uid, 'notifications'), {
		message, symbol, createdAt: new Date().toISOString()
	});
}

function renderNotifications() {
	notificationList.replaceChildren();
	notificationBadge.hidden = notifications.length === 0;
	if (!notifications.length) {
		const emptyState = document.createElement('p');
		emptyState.className = 'empty-notifications';
		emptyState.textContent = 'Nenhuma notificação por aqui.';
		notificationList.append(emptyState);
		return;
	}
	notifications.forEach((notification) => {
		const item = document.createElement('article');
		const symbol = document.createElement('span');
		const content = document.createElement('div');
		const message = document.createElement('p');
		const time = document.createElement('time');
		item.className = 'notification-item';
		symbol.className = 'notification-symbol';
		symbol.textContent = notification.symbol || '•';
		message.textContent = notification.message;
		time.textContent = formatTransactionDate(notification.createdAt);
		content.append(message, time);
		item.append(symbol, content);
		notificationList.append(item);
	});
}

function createInvestmentElement(investment) {
	const item = document.createElement('article');
	const identity = document.createElement('div');
	const icon = document.createElement('span');
	const details = document.createElement('div');
	const name = document.createElement('strong');
	const metadata = document.createElement('small');
	const value = document.createElement('strong');
	const actions = document.createElement('div');
	const deleteButton = document.createElement('button');
	const rateText = investment.annualRate ? ` · ${investment.annualRate}% a.a.` : '';

	item.className = 'investment-item';
	identity.className = 'investment-name';
	icon.textContent = '↗';
	name.textContent = investment.name;
	metadata.textContent = `${investment.type} · ${investment.frequency}${rateText}`;
	details.append(name, metadata);
	identity.append(icon, details);
	value.className = 'investment-value';
	value.textContent = currencyFormatter.format(investment.amount);
	actions.className = 'item-actions';
	deleteButton.className = 'item-action delete';
	deleteButton.type = 'button';
	deleteButton.title = 'Excluir aporte';
	deleteButton.setAttribute('aria-label', 'Excluir aporte');
	deleteButton.textContent = '×';
	deleteButton.addEventListener('click', () => deleteWithUndo({
		label: `Aporte em "${investment.name}" excluído. O valor voltou ao seu saldo.`,
		items: [{ path: ['investments', investment.id], data: investment }],
		onFinalize: () => addNotification(`Você excluiu o aporte em ${investment.name}.`, '×')
	}));
	actions.append(deleteButton);
	item.append(identity, value, actions);
	return item;
}

function renderInvestments() {
	const totalInvested = investments.reduce((total, investment) => total + investment.amount, 0);
	document.querySelector('#investment-total').textContent = currencyFormatter.format(totalInvested);
	const recurringInvestment = investments.find((investment) => investment.frequency !== 'Único');
	document.querySelector('#investment-frequency').textContent = recurringInvestment
		? `${recurringInvestment.frequency} (${recurringInvestment.type})`
		: investments.length ? 'Aportes pontuais' : 'Sem aportes';
	investmentsList.replaceChildren();
	if (!investments.length) {
		const emptyState = document.createElement('p');
		emptyState.className = 'empty-investments';
		emptyState.textContent = 'Registre seu primeiro aporte para acompanhar seus investimentos.';
		investmentsList.append(emptyState);
	} else {
		investments.forEach((investment) => investmentsList.append(createInvestmentElement(investment)));
	}
	prefillSimulator();
	renderDashboard(currentTransactions);
}

function getInvestmentDate(investment) {
	return investment.createdAt?.slice(0, 10) || '';
}

function getMonthKey(date) {
	return date.slice(0, 7);
}

function renderFinancialVisuals(transactions) {
	const currentMonth = getCurrentMonth();
	const monthlyTransactions = transactions.filter((transaction) => !isTransfer(transaction) && getTransactionDate(transaction).startsWith(currentMonth));
	const monthlyInvestments = investments.filter((investment) => getInvestmentDate(investment).startsWith(currentMonth));
	const weeklyTotals = Array.from({ length: 4 }, () => ({ income: 0, expense: 0 }));

	monthlyTransactions.forEach((transaction) => {
		const day = Number(getTransactionDate(transaction).slice(-2));
		const week = Math.min(3, Math.floor((day - 1) / 7));
		weeklyTotals[week][transaction.type === 'income' ? 'income' : 'expense'] += transaction.amount;
	});

	monthlyInvestments.forEach((investment) => {
		const day = Number(getInvestmentDate(investment).slice(-2));
		const week = Math.min(3, Math.floor((day - 1) / 7));
		weeklyTotals[week].expense += investment.amount;
	});

	const highestWeeklyValue = Math.max(1, ...weeklyTotals.flatMap((week) => [week.income, week.expense]));
	weeklyTotals.forEach((week, index) => {
		document.querySelector(`#income-week-${index + 1}`).style.height = `${Math.max(2, (week.income / highestWeeklyValue) * 100)}%`;
		document.querySelector(`#expense-week-${index + 1}`).style.height = `${Math.max(2, (week.expense / highestWeeklyValue) * 100)}%`;
	});

	const displayedMonth = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date(`${currentMonth}-01T12:00:00`));
	document.querySelector('#flow-period').textContent = displayedMonth.charAt(0).toUpperCase() + displayedMonth.slice(1);
	const monthlyExpenses = monthlyTransactions
		.filter((transaction) => transaction.type === 'expense')
		.reduce((total, transaction) => total + transaction.amount, 0);
	const monthlyInvestmentTotal = monthlyInvestments.reduce((total, investment) => total + investment.amount, 0);
	const budgetSpent = monthlyExpenses + monthlyInvestmentTotal;
	const budgetLimit = getMonthIncome(getPlanningContext(), currentMonth);
	const budgetPercentage = budgetLimit ? Math.min(100, Math.round((budgetSpent / budgetLimit) * 100)) : 0;
	const budgetRing = document.querySelector('#budget-ring');

	document.querySelector('#budget-percent').textContent = `${budgetPercentage}%`;
	document.querySelector('#budget-spent').textContent = currencyFormatter.format(budgetSpent);
	document.querySelector('#budget-limit').textContent = currencyFormatter.format(budgetLimit);
	budgetRing.style.background = `conic-gradient(var(--yellow) 0 ${budgetPercentage}%, var(--track) ${budgetPercentage}% 100%)`;
	budgetRing.setAttribute('aria-label', `${budgetPercentage} por cento do orçamento mensal utilizado`);
}

function renderDashboard(transactions) {
	currentTransactions = transactions;
	const today = getToday();
	const monthTransactions = getMonthTransactions(getCurrentMonth());
	// Monthly income is only a planning reference: the balance comes from what was actually received and paid.
	const balance = getAvailableBalance({ accounts, transactions, investments, today });
	currentBalance = balance.total;
	const pendingTotal = sumAmounts(transactions.filter((transaction) => transaction.type === 'expense' && !isPaid(transaction)
		&& getAccount(transaction.accountId)?.type !== 'credit'));
	const openInvoices = accounts.filter((account) => account.type === 'credit')
		.reduce((total, card) => total + getPendingInvoices(card, transactions, today, 3).reduce((sum, invoice) => sum + invoice.remaining, 0)
			+ getCardSummary(card, transactions, today).currentInvoice.remaining, 0);
	const receivedThisMonth = sumAmounts(monthTransactions.filter((transaction) => isRealIncome(transaction, accounts)));

	setMoney(document.querySelector('#balance-amount'), balance.total);
	document.querySelector('#balance-amount').classList.toggle('is-negative', balance.total < 0);
	setMoney(document.querySelector('#income-amount'), receivedThisMonth);
	setMoney(document.querySelector('#expense-amount'), sumByType(monthTransactions, 'expense'));
	document.querySelector('#income-description').textContent = monthlyIncome
		? `recebidas · renda mensal informada: ${currencyFormatter.format(monthlyIncome)}`
		: 'receitas registradas';
	document.querySelector('#balance-description').textContent = [
		pendingTotal ? `A pagar: ${currencyFormatter.format(pendingTotal)}` : '',
		openInvoices ? `Faturas em aberto: ${currencyFormatter.format(openInvoices)}` : '',
		balance.invested ? `Investido: ${currencyFormatter.format(balance.invested)}` : ''
	].filter(Boolean).join(' · ') || 'Dinheiro que você tem hoje';
	updateSalaryHint();
	renderFinancialVisuals(transactions);
	updateMonthFilter(transactions);
	renderCategoryChart();
	renderCategoryBudgets();
	renderHistory();
	renderBills();
	renderAccounts();
	renderIndicators();
	renderTransactionList();
	renderPlanning();
	renderCalendar();
	renderDebts();
	if (invoiceModal.open) renderInvoice();
	scheduleAlertCheck();
}

function getFilteredTransactions() {
	const [searchInput, typeSelect, categorySelect, statusSelect, minimumInput, maximumInput] = transactionFilters;
	const selectedMonth = transactionMonthFilter.value;
	const search = normalizeText(searchInput.value.trim());
	const minimum = Number(minimumInput.value) || 0;
	const maximum = Number(maximumInput.value) || Infinity;
	return currentTransactions
		.filter((transaction) => {
			if (selectedMonth !== 'all' && !getTransactionDate(transaction).startsWith(selectedMonth)) return false;
			if (typeSelect.value !== 'all' && transaction.type !== typeSelect.value) return false;
			if (categorySelect.value !== 'all' && transaction.category !== categorySelect.value) return false;
			if (statusSelect.value !== 'all' && (statusSelect.value === 'paid') !== isPaid(transaction)) return false;
			if (transaction.amount < minimum || transaction.amount > maximum) return false;
			if (!search) return true;
			return normalizeText([transaction.description, transaction.category, transaction.notes, ...(transaction.tags || [])].join(' ')).includes(search);
		})
		.sort((first, second) => getTransactionDate(second).localeCompare(getTransactionDate(first)));
}

function renderTransactionList() {
	const filteredTransactions = getFilteredTransactions();
	transactionList.replaceChildren();
	document.querySelector('#transaction-count').textContent = filteredTransactions.length
		? `${filteredTransactions.length} lançamento(s) · Receitas ${currencyFormatter.format(sumByType(filteredTransactions, 'income'))} · Despesas ${currencyFormatter.format(sumByType(filteredTransactions, 'expense'))}`
		: '';
	if (!filteredTransactions.length) {
		const emptyState = document.createElement('p');
		emptyState.className = 'empty-transactions';
		emptyState.textContent = currentTransactions.length ? 'Nenhum lançamento encontrado com esses filtros.' : 'Nenhum lançamento registrado ainda.';
		transactionList.append(emptyState);
		return;
	}
	filteredTransactions.forEach((transaction) => transactionList.append(createTransactionElement(transaction)));
}

transactionMonthFilter.addEventListener('change', () => renderDashboard(currentTransactions));

async function loadFinancialProfile(user) {
	try {
		const profileSnapshot = await getDoc(doc(database, 'users', user.uid));
		monthlyIncome = Number(profileSnapshot.data()?.monthlyIncome || 0);
		profilePhotoData = profileSnapshot.data()?.profilePhoto || '';
		categoryBudgets = profileSnapshot.data()?.categoryBudgets || {};
		customCategories = (profileSnapshot.data()?.customCategories || []).filter((category) => category?.name);
		alertSettings = { ...defaultAlertSettings, ...(profileSnapshot.data()?.alertSettings || {}) };
		sentAlerts = profileSnapshot.data()?.sentAlerts || {};
		categoryGroups = profileSnapshot.data()?.categoryGroups || {};
		pruneSentAlerts();
		if (alertSettings.push) registerPeriodicCheck();
		refreshCategorySelects();
		updateUserInterface(user);
		if (!monthlyIncome && !salaryModal.open) salaryModal.showModal();
		stopAccountListener = onSnapshot(query(
			collection(database, 'users', user.uid, 'accounts'),
			orderBy('createdAt', 'asc')
		), (snapshot) => {
			accounts = snapshot.docs.map((account) => ({ id: account.id, ...account.data() }));
			loadedCollections.add('accounts');
			populateAccountSelects();
			renderDashboard(currentTransactions);
		});
		const transactionsQuery = query(
			collection(database, 'users', user.uid, 'transactions'),
			orderBy('createdAt', 'desc')
		);
		stopTransactionListener = onSnapshot(transactionsQuery, (snapshot) => {
			const transactions = snapshot.docs.map((transaction) => ({ id: transaction.id, ...transaction.data() }));
			loadedCollections.add('transactions');
			renderDashboard(transactions);
			notifyDueBills(transactions);
		});
		stopRecurringListener = onSnapshot(query(
			collection(database, 'users', user.uid, 'recurring'),
			orderBy('createdAt', 'desc')
		), (snapshot) => {
			recurringItems = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
			loadedCollections.add('recurring');
			renderRecurring();
			updateSalaryHint();
			renderPlanning();
			renderCalendar();
			generateRecurringTransactions();
		});
		stopDebtListener = onSnapshot(query(
			collection(database, 'users', user.uid, 'debts'),
			orderBy('createdAt', 'desc')
		), (snapshot) => {
			debts = snapshot.docs.map((debt) => ({ id: debt.id, ...debt.data() }));
			renderDebts();
		}, (error) => console.error('Erro ao carregar divisões de gastos:', error));
		const investmentsQuery = query(
			collection(database, 'users', user.uid, 'investments'),
			orderBy('createdAt', 'desc')
		);
		stopInvestmentListener = onSnapshot(investmentsQuery, (snapshot) => {
			investments = snapshot.docs.map((investment) => ({ id: investment.id, ...investment.data() }));
			loadedCollections.add('investments');
			renderInvestments();
		});
		const goalsQuery = query(
			collection(database, 'users', user.uid, 'goals'),
			orderBy('createdAt', 'desc')
		);
		stopGoalListener = onSnapshot(goalsQuery, (snapshot) => {
			const goals = snapshot.docs.map((goal) => ({ id: goal.id, ...goal.data() }));
			loadedCollections.add('goals');
			renderGoals(goals);
			scheduleAlertCheck();
		});
		const notificationsQuery = query(
			collection(database, 'users', user.uid, 'notifications'),
			orderBy('createdAt', 'desc')
		);
		stopNotificationListener = onSnapshot(notificationsQuery, (snapshot) => {
			notifications = snapshot.docs.map((notification) => ({ id: notification.id, ...notification.data() }));
			renderNotifications();
		});
	} catch (error) {
		console.error('Erro ao carregar dados financeiros:', error);
	}
}

salaryForm.addEventListener('submit', async (event) => {
	event.preventDefault();
	const amount = Number(document.querySelector('#salary-amount').value);
	const errorMessage = document.querySelector('#salary-error');
	const submitButton = salaryForm.querySelector('.submit-button');
	if (!Number.isFinite(amount) || amount <= 0) return;

	errorMessage.textContent = '';
	submitButton.disabled = true;
	submitButton.textContent = 'Salvando...';
	try {
		await setDoc(doc(database, 'users', auth.currentUser.uid), { monthlyIncome: amount }, { merge: true });
		monthlyIncome = amount;
		if (document.querySelector('#salary-recurring').checked) {
			await createSalaryIncome(amount, clampDay(document.querySelector('#salary-day').value, 5));
		}
		await addNotification(`Você cadastrou sua renda mensal de ${currencyFormatter.format(amount)}.`, '↓');
		salaryModal.close();
	} catch (error) {
		console.error('Erro ao salvar renda mensal:', error);
		errorMessage.textContent = 'Não foi possível salvar sua renda. Tente novamente.';
	} finally {
		submitButton.disabled = false;
		submitButton.textContent = 'Começar a organizar';
	}
});

document.querySelector('#salary-recurring').addEventListener('change', (event) => {
	salaryForm.querySelector('[data-salary-day]').hidden = !event.target.checked;
});

// Creates this month's salary as an income (to receive if the day has not come yet) and repeats it monthly.
async function createSalaryIncome(amount, day) {
	const month = getCurrentMonth();
	const transactionDate = dateInMonth(month, day);
	const base = {
		description: 'Salário', amount, type: 'income', category: 'Trabalho', accountId: '', tags: [], notes: ''
	};
	const reference = await addDoc(collection(database, 'users', auth.currentUser.uid, 'recurring'), {
		...base, dayOfMonth: day, lastGeneratedMonth: month, createdAt: new Date().toISOString()
	});
	await addDoc(collection(database, 'users', auth.currentUser.uid, 'transactions'), {
		...base, transactionDate, status: transactionDate <= getToday() ? 'paid' : 'pending',
		recurringId: reference.id, createdAt: new Date().toISOString()
	});
}

function updateSalaryHint() {
	const hint = document.querySelector('#salary-hint');
	const button = document.querySelector('#register-salary-button');
	const hasRecurringIncome = recurringItems.some((item) => item.type === 'income');
	const hasIncomeThisMonth = getMonthTransactions(getCurrentMonth()).some((item) => isRealIncome(item, accounts));
	const show = loadedCollections.has('recurring') && Boolean(monthlyIncome) && !hasRecurringIncome && !hasIncomeThisMonth;
	hint.hidden = !show;
	button.hidden = !show;
	if (show) hint.textContent = 'Sua renda mensal não entra sozinha no saldo. Lance o salário quando ele cair (ou deixe automático).';
}

document.querySelector('#register-salary-button').addEventListener('click', () => {
	resetTransactionForm({ type: 'income', description: 'Salário', amount: monthlyIncome, category: 'Trabalho', transactionDate: getToday() });
	const recurring = document.querySelector('#transaction-recurring');
	recurring.checked = true;
	recurring.dataset.touched = 'true';
	modal.showModal();
});

const adjustBalanceModal = document.querySelector('#adjust-balance-modal');
const adjustBalanceForm = document.querySelector('#adjust-balance-form');

function getAdjustmentTarget() {
	const accountId = document.querySelector('#adjust-balance-account').value;
	const account = getAccount(accountId);
	return account
		? { accountId, current: getAccountBalance(account), label: account.name }
		: { accountId: '', current: currentBalance, label: 'saldo disponível' };
}

function updateAdjustmentPreview() {
	const preview = document.querySelector('#adjust-balance-preview');
	const value = document.querySelector('#adjust-balance-amount').value;
	const target = getAdjustmentTarget();
	if (value === '') {
		preview.textContent = `Hoje o site mostra ${currencyFormatter.format(target.current)} em ${target.label}.`;
		return;
	}
	const difference = roundMoney(Number(value) - target.current);
	preview.textContent = difference
		? `O site mostra ${currencyFormatter.format(target.current)}. Vamos lançar um ajuste de ${difference > 0 ? '+' : '−'}${currencyFormatter.format(Math.abs(difference))}.`
		: 'O saldo já está correto. Nada a ajustar.';
}

document.querySelector('#adjust-balance-button').addEventListener('click', () => {
	adjustBalanceForm.reset();
	const select = document.querySelector('#adjust-balance-account');
	select.replaceChildren(new Option('Saldo total (todas as contas)', ''));
	accounts.filter((account) => account.type !== 'credit').forEach((account) => select.add(new Option(account.name, account.id)));
	updateAdjustmentPreview();
	adjustBalanceModal.showModal();
});
document.querySelector('#adjust-balance-amount').addEventListener('input', updateAdjustmentPreview);
document.querySelector('#adjust-balance-account').addEventListener('change', updateAdjustmentPreview);

adjustBalanceForm.addEventListener('submit', async (event) => {
	event.preventDefault();
	const value = Number(document.querySelector('#adjust-balance-amount').value);
	if (!Number.isFinite(value)) return;
	const target = getAdjustmentTarget();
	const difference = roundMoney(value - target.current);
	if (!difference) {
		adjustBalanceModal.close();
		return;
	}
	try {
		await addDoc(collection(database, 'users', auth.currentUser.uid, 'transactions'), {
			description: 'Ajuste de saldo',
			amount: Math.abs(difference),
			type: difference > 0 ? 'income' : 'expense',
			category: 'Outros',
			accountId: target.accountId,
			tags: ['ajuste'],
			notes: `Saldo corrigido para ${currencyFormatter.format(value)}.`,
			transactionDate: getToday(),
			status: 'paid',
			adjustment: true,
			createdAt: new Date().toISOString()
		});
		await addNotification(`Você ajustou ${target.label} para ${currencyFormatter.format(value)}.`, '⚖');
		adjustBalanceModal.close();
	} catch (error) {
		console.error('Erro ao ajustar saldo:', error);
	}
});

profilePhotoInput.addEventListener('change', async () => {
	const [file] = profilePhotoInput.files;
	if (!file) return;
	try {
		profilePhotoData = await compressProfilePhoto(file);
		setProfilePhotoPreview(profilePhotoData, document.querySelector('#profile-name-input').value);
	} catch (error) {
		console.error('Erro ao processar foto de perfil:', error);
	}
});

profileForm.addEventListener('submit', async (event) => {
	event.preventDefault();
	const name = document.querySelector('#profile-name-input').value.trim();
	const income = Number(document.querySelector('#profile-income-input').value);
	if (!name || !Number.isFinite(income) || income <= 0) return;
	try {
		await updateProfile(auth.currentUser, { displayName: name });
		await setDoc(doc(database, 'users', auth.currentUser.uid), {
			monthlyIncome: income,
			profilePhoto: profilePhotoData || null
		}, { merge: true });
		monthlyIncome = income;
		updateUserInterface(auth.currentUser);
		renderDashboard(currentTransactions);
		await addNotification('Você atualizou seu perfil e sua renda mensal.', '✎');
		profileModal.close();
	} catch (error) {
		console.error('Erro ao salvar perfil:', error);
	}
});

goalForm.addEventListener('submit', async (event) => {
	event.preventDefault();
	const title = document.querySelector('#goal-title').value.trim();
	const targetAmount = Number(document.querySelector('#goal-target').value);
	const currentAmount = Number(document.querySelector('#goal-current').value);
	const deadline = document.querySelector('#goal-deadline').value;
	if (!title || !Number.isFinite(targetAmount) || targetAmount <= 0 || !Number.isFinite(currentAmount) || currentAmount < 0) return;

	const goalData = { title, targetAmount, currentAmount, deadline };
	try {
		if (editingGoalId) {
			await updateDoc(doc(database, 'users', auth.currentUser.uid, 'goals', editingGoalId), goalData);
			await addNotification(`Você editou a meta ${title}.`, '✎');
		} else {
			await addDoc(collection(database, 'users', auth.currentUser.uid, 'goals'), {
				...goalData, createdAt: new Date().toISOString()
			});
			await addNotification(`Você criou a meta ${title}.`, '◎');
		}
		goalModal.close();
	} catch (error) {
		console.error('Erro ao salvar meta:', error);
	}
});

authModeToggle.addEventListener('click', () => setAuthenticationMode(true));

authForm.addEventListener('submit', async (event) => {
	event.preventDefault();
	const email = document.querySelector('#auth-email').value.trim();
	const password = document.querySelector('#auth-password').value;
	const name = document.querySelector('#auth-name').value.trim();
	const submitButton = document.querySelector('#auth-submit');

	authError.textContent = '';
	submitButton.disabled = true;
	submitButton.textContent = 'Aguarde...';
	rememberEmailPreference(email);

	try {
		if (isRegistrationMode) {
			const credential = await createUserWithEmailAndPassword(auth, email, password);
			await updateProfile(credential.user, { displayName: name });
		} else {
			await signInWithEmailAndPassword(auth, email, password);
		}
	} catch (error) {
		console.error('Erro de autenticação Firebase:', error);
		authError.innerHTML = getAuthenticationErrorMessage(error.code);
		submitButton.disabled = false;
		submitButton.textContent = isRegistrationMode ? 'Criar conta' : 'Entrar';
	}
});

document.querySelector('#google-login-button').addEventListener('click', async () => {
	const googleButton = document.querySelector('#google-login-button');
	authError.textContent = '';
	googleButton.disabled = true;
	googleButton.textContent = 'Abrindo Google...';

	try {
		await signInWithPopup(auth, googleProvider);
	} catch (error) {
		console.error('Erro de login Google:', error);
		authError.innerHTML = getAuthenticationErrorMessage(error.code);
		googleButton.disabled = false;
		googleButton.innerHTML = '<span aria-hidden="true">G</span>Continuar com Google';
	}
});

document.querySelector('#logout-button').addEventListener('click', async () => {
	try {
		await flushToast();
	} catch (error) {
		console.error('Erro ao finalizar ação pendente:', error);
	}
	signOut(auth);
});

onAuthStateChanged(auth, async (user) => {
	const isAuthenticated = Boolean(user);
	authScreen.hidden = isAuthenticated;
	appShell.hidden = !isAuthenticated;
	if (user) {
		updateUserInterface(user);
		await loadFinancialProfile(user);
		return;
	}

	monthlyIncome = 0;
	if (stopTransactionListener) stopTransactionListener();
	if (stopGoalListener) stopGoalListener();
	if (stopNotificationListener) stopNotificationListener();
	if (stopInvestmentListener) stopInvestmentListener();
	if (stopAccountListener) stopAccountListener();
	if (stopRecurringListener) stopRecurringListener();
	if (stopDebtListener) stopDebtListener();
	clearTimeout(alertTimer);
	clearScheduledAlerts();
	debts = [];
	alertSettings = { ...defaultAlertSettings };
	sentAlerts = {};
	categoryGroups = {};
	loadedCollections.clear();
	hideToast();
	notifications = [];
	investments = [];
	currentTransactions = [];
	accounts = [];
	recurringItems = [];
	goalsData = [];
	categoryBudgets = {};
	customCategories = [];
	notifiedBills.clear();
	renderNotifications();
	if (salaryModal.open) salaryModal.close();
	const submitButton = document.querySelector('#auth-submit');
	const googleButton = document.querySelector('#google-login-button');
	submitButton.disabled = false;
	submitButton.textContent = isRegistrationMode ? 'Criar conta' : 'Entrar';
	googleButton.disabled = false;
	googleButton.innerHTML = '<span aria-hidden="true">G</span>Continuar com Google';
});

openPasswordResetFromLink();

function getBudgetAlert(transaction, excludeId) {
	const limit = Number(categoryBudgets[transaction.category]);
	if (transaction.type !== 'expense' || !limit || !transaction.transactionDate.startsWith(getCurrentMonth())) return '';
	const previous = sumAmounts(getMonthExpenses(getCurrentMonth())
		.filter((item) => item.category === transaction.category && item.id !== excludeId));
	const next = previous + transaction.amount;
	if (previous < limit && next >= limit) {
		return `Atenção: você estourou o limite de ${transaction.category} (${currencyFormatter.format(next)} de ${currencyFormatter.format(limit)}).`;
	}
	if (previous < limit * 0.8 && next >= limit * 0.8) {
		return `Você já usou ${Math.round((next / limit) * 100)}% do limite de ${transaction.category}.`;
	}
	return '';
}

async function saveInstallments(transactionData, count) {
	const transactionsCollection = collection(database, 'users', auth.currentUser.uid, 'transactions');
	const batch = writeBatch(database);
	const groupId = doc(transactionsCollection).id;
	const totalCents = Math.round(transactionData.amount * 100);
	const baseCents = Math.floor(totalCents / count);
	const firstMonth = transactionData.transactionDate.slice(0, 7);
	const day = Number(transactionData.transactionDate.slice(8));
	const isCreditCard = getAccount(transactionData.accountId)?.type === 'credit';
	const createdAt = Date.now();
	const ids = [];
	for (let index = 0; index < count; index += 1) {
		const transactionDate = dateInMonth(addMonths(firstMonth, index), day);
		const reference = doc(transactionsCollection);
		ids.push(reference.id);
		batch.set(reference, {
			...transactionData,
			// Only the first installment keeps the receipt so it is not referenced (and deleted) multiple times.
			receipt: index === 0 ? transactionData.receipt || null : null,
			description: `${transactionData.description} (${index + 1}/${count})`,
			amount: (baseCents + (index === 0 ? totalCents - baseCents * count : 0)) / 100,
			transactionDate,
			// Card installments are charged on the invoice; other future installments become bills to pay.
			status: isCreditCard || transactionDate <= getToday() ? transactionData.status : 'pending',
			installment: { groupId, number: index + 1, total: count },
			createdAt: new Date(createdAt + index).toISOString()
		});
	}
	await batch.commit();
	return ids;
}

async function generateRecurringTransactions() {
	if (isGeneratingRecurring || !auth.currentUser) return;
	const currentMonth = getCurrentMonth();
	const userId = auth.currentUser.uid;
	const batch = writeBatch(database);
	let createdCount = 0;
	recurringItems.forEach((item) => {
		if (!/^\d{4}-\d{2}$/.test(item.lastGeneratedMonth || '')) return;
		let month = addMonths(item.lastGeneratedMonth, 1);
		if (month > currentMonth) return;
		while (month <= currentMonth && createdCount < 400) {
			batch.set(doc(collection(database, 'users', userId, 'transactions')), {
				description: item.description,
				amount: item.amount,
				category: item.category,
				type: item.type,
				accountId: item.accountId || '',
				tags: item.tags || [],
				notes: item.notes || '',
				transactionDate: dateInMonth(month, item.dayOfMonth),
				status: item.type === 'income' ? 'paid' : 'pending',
				recurringId: item.id,
				createdAt: new Date().toISOString()
			});
			createdCount += 1;
			month = addMonths(month, 1);
		}
		batch.update(doc(database, 'users', userId, 'recurring', item.id), { lastGeneratedMonth: addMonths(month, -1) });
	});
	if (!createdCount) return;
	isGeneratingRecurring = true;
	try {
		await batch.commit();
		await addNotification(`${createdCount} lançamento(s) fixo(s) foram gerados automaticamente.`, '↻');
	} catch (error) {
		console.error('Erro ao gerar lançamentos fixos:', error);
	} finally {
		isGeneratingRecurring = false;
	}
}

async function notifyDueBills(transactions) {
	if (!alertSettings.bills) return;
	const today = getToday();
	const warningDays = Number(alertSettings.billDays) || 0;
	for (const transaction of transactions) {
		if (transaction.type !== 'expense' || isPaid(transaction)) continue;
		const days = daysBetween(today, getTransactionDate(transaction));
		const level = days < 0 ? 'overdue' : days <= warningDays ? 'soon' : '';
		const key = `${transaction.id}:${level}`;
		if (!level || transaction.dueNotified === level || notifiedBills.has(key)) continue;
		notifiedBills.add(key);
		const message = level === 'overdue'
			? `A conta ${transaction.description} está atrasada desde ${formatTransactionDate(getTransactionDate(transaction))}.`
			: days === 0 ? `A conta ${transaction.description} vence hoje.` : `A conta ${transaction.description} vence em ${days} dia(s).`;
		try {
			await updateDoc(doc(database, 'users', auth.currentUser.uid, 'transactions', transaction.id), { dueNotified: level });
			await addNotification(message, '!');
		} catch (error) {
			console.error('Erro ao notificar vencimento:', error);
		}
	}
}

function renderCategoryChart() {
	const selectedMonth = transactionMonthFilter.value;
	const month = selectedMonth !== 'all' ? selectedMonth : getCurrentMonth();
	const totals = getCategoryTotals(month);
	const total = [...totals.values()].reduce((sum, value) => sum + value, 0);
	const legend = document.querySelector('#category-legend');
	const stops = [];
	let start = 0;
	document.querySelector('#category-period').textContent = formatMonthLabel(month);
	setMoney(document.querySelector('#category-total'), total);
	legend.replaceChildren();
	totals.forEach((value, name) => {
		const color = getCategory(name).color;
		const percent = (value / total) * 100;
		const item = document.createElement('li');
		const dot = document.createElement('i');
		const label = document.createElement('span');
		const amount = document.createElement('strong');
		const share = document.createElement('small');
		stops.push(`${color} ${start}% ${start + percent}%`);
		start += percent;
		dot.style.background = color;
		label.textContent = name;
		amount.textContent = currencyFormatter.format(value);
		share.textContent = `${Math.round(percent)}%`;
		item.append(dot, label, amount, share);
		legend.append(item);
	});
	if (!total) {
		const item = document.createElement('li');
		item.className = 'empty-row';
		item.textContent = 'Sem despesas neste período.';
		legend.append(item);
	}
	document.querySelector('#category-donut').style.background = total ? `conic-gradient(${stops.join(', ')})` : 'var(--track)';
}

function renderCategoryBudgets() {
	const list = document.querySelector('#category-budget-list');
	const entries = Object.entries(categoryBudgets).filter(([, limit]) => Number(limit) > 0);
	const totals = getCategoryTotals(getCurrentMonth());
	list.replaceChildren();
	if (!entries.length) {
		list.append(createEmptyState('Defina limites para acompanhar quanto gasta em cada categoria.'));
		return;
	}
	entries.forEach(([name, limit]) => {
		const spent = totals.get(name) || 0;
		const percent = Math.round((spent / limit) * 100);
		const item = document.createElement('div');
		const header = document.createElement('div');
		const title = document.createElement('strong');
		const values = document.createElement('span');
		const bar = document.createElement('i');
		const fill = document.createElement('b');
		const status = document.createElement('small');
		item.className = `category-budget-item${percent >= 100 ? ' over' : percent >= 80 ? ' warning' : ''}`;
		title.textContent = `${getCategory(name).icon} ${name}`;
		values.textContent = `${currencyFormatter.format(spent)} de ${currencyFormatter.format(limit)}`;
		fill.style.width = `${Math.min(100, percent)}%`;
		status.textContent = percent >= 100
			? `Limite estourado em ${currencyFormatter.format(spent - limit)}`
			: `Restam ${currencyFormatter.format(limit - spent)} (${percent}% usado)`;
		header.append(title, values);
		bar.append(fill);
		item.append(header, bar, status);
		list.append(item);
	});
}

function renderHistory() {
	const chart = document.querySelector('#history-chart');
	const currentMonth = getCurrentMonth();
	const months = Array.from({ length: 6 }, (_, index) => addMonths(currentMonth, index - 5));
	const data = months.map((month) => {
		const monthTransactions = getMonthTransactions(month);
		return {
			month,
			income: sumAmounts(monthTransactions.filter((transaction) => isRealIncome(transaction, accounts))),
			expense: sumByType(monthTransactions, 'expense') + sumAmounts(getInvestmentsInMonth(month))
		};
	});
	const highest = Math.max(1, ...data.flatMap((item) => [item.income, item.expense]));
	chart.replaceChildren();
	data.forEach((item) => {
		const column = document.createElement('div');
		const bars = document.createElement('div');
		const incomeBar = document.createElement('i');
		const expenseBar = document.createElement('i');
		const label = document.createElement('span');
		column.className = `chart-column${item.month === currentMonth ? ' current' : ''}`;
		column.title = `${formatMonthLabel(item.month)}: receitas ${currencyFormatter.format(item.income)}, despesas ${currencyFormatter.format(item.expense)}`;
		bars.className = 'bars';
		incomeBar.className = 'income-bar';
		expenseBar.className = 'expense-bar';
		incomeBar.style.height = `${Math.max(2, (item.income / highest) * 100)}%`;
		expenseBar.style.height = `${Math.max(2, (item.expense / highest) * 100)}%`;
		label.textContent = new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(new Date(`${item.month}-01T12:00:00`)).replace('.', '');
		bars.append(incomeBar, expenseBar);
		column.append(bars, label);
		chart.append(column);
	});
}

function renderIndicators() {
	const today = getToday();
	const month = getCurrentMonth();
	const day = Number(today.slice(8));
	const monthTransactions = getMonthTransactions(month);
	const monthExpenses = monthTransactions.filter((transaction) => transaction.type === 'expense');
	const spentSoFar = sumAmounts(monthExpenses.filter((transaction) => getTransactionDate(transaction) <= today));
	const outlook = getEndOfMonthForecast(getPlanningContext(), currentBalance);
	const forecast = outlook.forecast;
	lastForecastValue = forecast;
	const forecastElement = document.querySelector('#forecast-amount');
	setMoney(forecastElement, forecast);
	forecastElement.classList.toggle('is-negative', forecast < 0);
	forecastElement.classList.toggle('is-positive', forecast >= 0);
	document.querySelector('#forecast-description').textContent = currentTransactions.length
		? [
			'Saldo de hoje',
			outlook.pendingIncome ? `+ ${currencyFormatter.format(outlook.pendingIncome)} a receber` : '',
			outlook.pendingExpenses ? `− ${currencyFormatter.format(outlook.pendingExpenses)} em contas` : '',
			outlook.invoicesDue ? `− ${currencyFormatter.format(outlook.invoicesDue)} em faturas` : '',
			outlook.paceRest ? `− ~${currencyFormatter.format(outlook.paceRest)} no ritmo atual (${currencyFormatter.format(outlook.dailyPace)}/dia)` : ''
		].filter(Boolean).join(' ') + '.'
		: 'Registre lançamentos para ver a previsão.';

	const previousMonth = addMonths(month, -1);
	const previousLimit = dateInMonth(previousMonth, day);
	const previousSpent = sumAmounts(getMonthExpenses(previousMonth).filter((transaction) => getTransactionDate(transaction) <= previousLimit));
	const comparisonValue = document.querySelector('#comparison-value');
	const comparisonDescription = document.querySelector('#comparison-description');
	comparisonValue.classList.remove('is-positive', 'is-negative');
	if (!previousSpent) {
		comparisonValue.textContent = '—';
		comparisonDescription.textContent = 'Sem dados do mês passado para comparar.';
	} else {
		const change = Math.round(((spentSoFar - previousSpent) / previousSpent) * 100);
		comparisonValue.textContent = `${change > 0 ? '+' : ''}${change}%`;
		comparisonValue.classList.add(change <= 0 ? 'is-positive' : 'is-negative');
		comparisonDescription.textContent = change <= 0
			? `Você gastou ${Math.abs(change)}% a menos que no mesmo período do mês passado.`
			: `Você gastou ${change}% a mais que no mesmo período do mês passado.`;
	}

	// Goal contributions are savings, not living costs, so they stay out of the average.
	const livingExpenses = (monthKey) => sumAmounts(getMonthExpenses(monthKey).filter((transaction) => transaction.category !== 'Metas'));
	const previousTotals = [1, 2, 3].map((offset) => livingExpenses(addMonths(month, -offset))).filter((value) => value > 0);
	const averageExpenses = previousTotals.length
		? previousTotals.reduce((sum, value) => sum + value, 0) / previousTotals.length
		: livingExpenses(month);
	const reserve = sumAmounts(investments) + goalsData.reduce((sum, goal) => sum + Number(goal.currentAmount || 0), 0);
	const coveredMonths = averageExpenses ? reserve / averageExpenses : 0;
	document.querySelector('#reserve-months').textContent = averageExpenses
		? `${coveredMonths.toFixed(1).replace('.', ',')} ${coveredMonths >= 0.95 && coveredMonths < 1.05 ? 'mês' : 'meses'}`
		: '—';
	document.querySelector('#reserve-description').textContent = !averageExpenses
		? 'Registre despesas para calcular sua reserva.'
		: coveredMonths >= 6
			? 'Ótimo! Sua reserva já cobre o ideal de 6 a 12 meses de despesas.'
			: `Faltam ${currencyFormatter.format(averageExpenses * 6 - reserve)} para cobrir 6 meses de despesas.`;
	document.querySelector('#reserve-progress').style.width = `${Math.min(100, (coveredMonths / 6) * 100)}%`;
	renderInsights();
}

function renderInsights() {
	const list = document.querySelector('#insight-list');
	const month = getCurrentMonth();
	const today = getToday();
	const expenses = getMonthExpenses(month);
	const insights = [];

	if (!expenses.length) {
		insights.push('Registre suas despesas do mês para receber análises automáticas.');
	} else {
		const biggest = expenses.reduce((largest, transaction) => (transaction.amount > largest.amount ? transaction : largest));
		const totals = getCategoryTotals(month);
		const total = sumAmounts(expenses);
		const [topCategory, topValue] = [...totals][0];
		const previousTotals = getCategoryTotals(addMonths(month, -1));
		insights.push(`Sua maior despesa do mês foi ${biggest.description} (${currencyFormatter.format(biggest.amount)}).`);
		insights.push(`${topCategory} representa ${Math.round((topValue / total) * 100)}% dos seus gastos do mês.`);
		const increases = [...totals]
			.map(([name, value]) => ({ name, value, previous: previousTotals.get(name) || 0 }))
			.filter((item) => item.previous && item.value > item.previous * 1.2)
			.sort((first, second) => (second.value / second.previous) - (first.value / first.previous));
		if (increases.length) {
			const [item] = increases;
			insights.push(`Você já gastou ${Math.round(((item.value - item.previous) / item.previous) * 100)}% a mais em ${item.name} do que em todo o mês passado.`);
		}
	}

	const sevenDaysAgo = toDateKey(new Date(Date.now() - 7 * 86400000));
	const fourteenDaysAgo = toDateKey(new Date(Date.now() - 14 * 86400000));
	const expenseBetween = (start, end) => sumAmounts(currentTransactions.filter((transaction) => {
		const date = getTransactionDate(transaction);
		return transaction.type === 'expense' && !transaction.adjustment && date > start && date <= end;
	}));
	const lastWeek = expenseBetween(sevenDaysAgo, today);
	const weekBefore = expenseBetween(fourteenDaysAgo, sevenDaysAgo);
	if (lastWeek && weekBefore) {
		insights.push(`Nos últimos 7 dias você gastou ${currencyFormatter.format(lastWeek)}, ${lastWeek > weekBefore ? 'mais' : 'menos'} que nos 7 dias anteriores (${currencyFormatter.format(weekBefore)}).`);
	}

	const monthIncome = getMonthIncome(getPlanningContext(), month);
	if (monthIncome) {
		const saved = monthIncome - sumAmounts(expenses) - sumAmounts(getInvestmentsInMonth(month));
		const rate = Math.round((saved / monthIncome) * 100);
		insights.push(saved < 0
			? `Seus gastos já superam sua renda do mês em ${currencyFormatter.format(-saved)}.`
			: rate >= 20
				? `Você está poupando ${rate}% da sua renda este mês. Excelente!`
				: `Você está poupando ${rate}% da sua renda este mês. O ideal é pelo menos 20%.`);
	}

	const overdue = currentTransactions.filter((transaction) => transaction.type === 'expense' && !isPaid(transaction) && getTransactionDate(transaction) < today);
	if (overdue.length) insights.push(`Você tem ${overdue.length} conta(s) atrasada(s), somando ${currencyFormatter.format(sumAmounts(overdue))}.`);

	list.replaceChildren(...insights.map((text) => {
		const item = document.createElement('li');
		item.textContent = text;
		return item;
	}));
}

function renderBills() {
	const list = document.querySelector('#bill-list');
	const today = getToday();
	const bills = currentTransactions
		.filter((transaction) => transaction.type === 'expense' && !isPaid(transaction))
		.sort((first, second) => getTransactionDate(first).localeCompare(getTransactionDate(second)));
	setMoney(document.querySelector('#bills-total'), sumAmounts(bills));
	list.replaceChildren();
	if (!bills.length) {
		list.append(createEmptyState('Nenhuma conta pendente. Desmarque "Já foi pago" ao lançar uma despesa para acompanhá-la aqui.'));
		return;
	}
	bills.slice(0, 12).forEach((bill) => {
		const days = daysBetween(today, getTransactionDate(bill));
		const item = document.createElement('article');
		const info = document.createElement('div');
		const title = document.createElement('strong');
		const status = document.createElement('span');
		const value = document.createElement('strong');
		const payButton = document.createElement('button');
		item.className = `bill-item${days < 0 ? ' overdue' : days <= 3 ? ' soon' : ''}`;
		title.textContent = bill.description;
		status.textContent = days < 0
			? `Atrasada há ${-days} dia(s)`
			: days === 0 ? 'Vence hoje' : `Vence em ${formatTransactionDate(getTransactionDate(bill))} (${days} dia(s))`;
		value.className = 'bill-value';
		value.textContent = currencyFormatter.format(bill.amount);
		payButton.className = 'pay-button';
		payButton.type = 'button';
		payButton.textContent = 'Marcar como pago';
		payButton.addEventListener('click', async () => {
			payButton.disabled = true;
			try {
				await updateDoc(doc(database, 'users', auth.currentUser.uid, 'transactions', bill.id), { status: 'paid' });
				await addNotification(`Você marcou ${bill.description} como paga.`, '✓');
			} catch (error) {
				console.error('Erro ao marcar conta como paga:', error);
				payButton.disabled = false;
			}
		});
		info.append(title, status);
		item.append(info, value, payButton);
		list.append(item);
	});
	if (bills.length > 12) list.append(createEmptyState(`E mais ${bills.length - 12} conta(s). Use o filtro "Pendentes" nos lançamentos.`));
}

function renderRecurring() {
	const list = document.querySelector('#recurring-list');
	list.replaceChildren();
	if (!recurringItems.length) {
		list.append(createEmptyState('Marque "Repetir todo mês" ao lançar aluguel, assinaturas ou salário para criá-los automaticamente.'));
		renderSubscriptions();
		return;
	}
	recurringItems.forEach((item) => {
		const row = document.createElement('article');
		const info = document.createElement('div');
		const title = document.createElement('strong');
		const details = document.createElement('span');
		const value = document.createElement('strong');
		row.className = 'recurring-item';
		title.textContent = item.description;
		details.textContent = `${item.category} · todo dia ${item.dayOfMonth}${item.subscription ? ' · assinatura' : ''}`;
		value.className = `bill-value ${item.type === 'income' ? 'income-value' : 'expense-value'}`;
		value.textContent = `${item.type === 'income' ? '+' : '-'} ${currencyFormatter.format(item.amount)}`;
		info.append(title, details);
		const actions = document.createElement('div');
		actions.className = 'item-actions';
		if (item.type === 'expense') {
			actions.append(createActionButton(item.subscription ? '★' : '☆', item.subscription ? 'Deixar de tratar como assinatura' : 'Marcar como assinatura', async () => {
				await updateDoc(doc(database, 'users', auth.currentUser.uid, 'recurring', item.id), { subscription: !item.subscription });
			}));
		}
		actions.append(createRecurringDeleteButton(item, 'Parar de repetir'));
		row.append(info, value, actions);
		list.append(row);
	});
	renderSubscriptions();
}

function createRecurringDeleteButton(item, label) {
	return createActionButton('×', label, () => deleteWithUndo({
		label: `"${item.description}" não será mais lançado automaticamente.`,
		items: [{ path: ['recurring', item.id], data: item }],
		onFinalize: () => addNotification(`${item.description} não será mais lançado automaticamente.`, '×')
	}), true);
}

function getAccountBalance(account) {
	return computeAccountBalance(account, currentTransactions, getToday());
}

function renderAccounts() {
	const grid = document.querySelector('#accounts-grid');
	grid.replaceChildren();
	if (!accounts.length) {
		grid.append(createEmptyState('Cadastre suas contas, carteira e cartões de crédito para ver o saldo de cada um.'));
		return;
	}
	accounts.forEach((account) => {
		const card = document.createElement('article');
		const header = document.createElement('header');
		const identity = document.createElement('div');
		const name = document.createElement('strong');
		const type = document.createElement('small');
		const actions = document.createElement('div');
		const label = document.createElement('small');
		const value = document.createElement('strong');
		card.className = `account-card${account.type === 'credit' ? ' credit' : ''}`;
		name.textContent = account.name;
		type.textContent = accountTypeLabels[account.type] || 'Conta';
		identity.append(name, type);
		actions.className = 'item-actions';
		actions.append(
			createActionButton('✎', 'Editar conta', () => openAccountModal(account)),
			createActionButton('×', 'Excluir conta', () => openDeleteConfirmation(
				`Excluir "${account.name}"? Os lançamentos ligados a ela serão mantidos.`,
				async () => {
					await deleteDoc(doc(database, 'users', auth.currentUser.uid, 'accounts', account.id));
					await addNotification(`Você excluiu a conta ${account.name}.`, '×');
				}
			), true)
		);
		header.append(identity, actions);
		value.className = 'account-balance';
		card.append(header);
		if (account.type === 'credit') {
			const summary = getCardSummary(account, currentTransactions, getToday());
			const bar = document.createElement('i');
			const fill = document.createElement('b');
			const detail = document.createElement('small');
			const status = document.createElement('span');
			const pending = getPendingInvoices(account, currentTransactions, getToday(), 3);
			label.textContent = 'Fatura atual';
			status.className = `invoice-status ${summary.currentInvoice.status}`;
			status.textContent = invoiceStatusLabels[summary.currentInvoice.status];
			label.append(' ', status);
			setMoney(value, summary.currentInvoice.remaining);
			bar.className = 'mini-progress';
			fill.style.width = `${summary.limit ? Math.min(100, (summary.used / summary.limit) * 100) : 0}%`;
			if (summary.percent >= 90) fill.style.background = 'var(--coral)';
			else if (summary.percent >= 70) fill.style.background = 'var(--yellow)';
			bar.append(fill);
			const paidNote = summary.currentInvoice.paid ? `Total ${currencyFormatter.format(summary.invoice)}, já pago ${currencyFormatter.format(summary.currentInvoice.paid)} · ` : '';
			detail.textContent = `${paidNote}Fecha em ${formatTransactionDate(summary.currentInvoice.closingDate)} · vence em ${formatTransactionDate(summary.dueDate)} · Limite usado ${currencyFormatter.format(summary.used)} · disponível ${currencyFormatter.format(summary.available)}`;
			card.append(label, value, bar, detail);
			pending.forEach((invoice) => {
				const warning = document.createElement('small');
				warning.className = `invoice-warning ${invoice.status}`;
				warning.textContent = `Fatura de ${formatMonthLabel(invoice.month).toLowerCase()} ${invoice.status === 'overdue' ? 'atrasada' : 'fechada'}: ${currencyFormatter.format(invoice.remaining)} a pagar até ${formatTransactionDate(invoice.dueDate)}`;
				card.append(warning);
			});
			const openButton = document.createElement('button');
			openButton.type = 'button';
			openButton.className = 'pay-button invoice-open-button';
			openButton.textContent = pending.length ? 'Ver e pagar fatura' : 'Ver fatura';
			openButton.addEventListener('click', () => openInvoiceModal(account, pending[0]?.month));
			card.append(openButton);
		} else {
			label.textContent = 'Saldo atual';
			setMoney(value, getAccountBalance(account));
			card.append(label, value);
		}
		grid.append(card);
	});
	const loose = getAvailableBalance({ accounts, transactions: currentTransactions, investments, today: getToday() }).loose;
	if (loose) {
		const card = document.createElement('article');
		const name = document.createElement('strong');
		const type = document.createElement('small');
		const value = document.createElement('strong');
		card.className = 'account-card loose';
		name.textContent = 'Sem conta definida';
		type.textContent = 'Lançamentos feitos sem escolher uma conta';
		value.className = 'account-balance';
		setMoney(value, loose);
		card.append(name, type, value);
		grid.append(card);
	}
}

function updateAccountFormFields() {
	const isCredit = document.querySelector('#account-type').value === 'credit';
	accountForm.querySelectorAll('[data-account-field="credit"]').forEach((element) => { element.hidden = !isCredit; });
	accountForm.querySelectorAll('[data-account-field="regular"]').forEach((element) => { element.hidden = isCredit; });
}

function openAccountModal(account) {
	accountForm.reset();
	editingAccountId = account?.id;
	document.querySelector('#account-name').value = account?.name || '';
	document.querySelector('#account-type').value = account?.type || 'checking';
	document.querySelector('#account-initial').value = account?.initialBalance || 0;
	document.querySelector('#account-limit').value = account?.limit || '';
	document.querySelector('#account-closing').value = account?.closingDay || 1;
	document.querySelector('#account-due').value = account?.dueDay || 10;
	document.querySelector('#account-modal-kicker').textContent = account ? 'EDITAR CONTA' : 'NOVA CONTA';
	document.querySelector('#account-modal-title').textContent = account ? 'Atualizar conta' : 'Adicionar conta';
	updateAccountFormFields();
	accountModal.showModal();
}

function getGoalPlan(goal) {
	const remaining = goal.targetAmount - goal.currentAmount;
	if (remaining <= 0) return 'Meta concluída!';
	if (!goal.deadline) return `Faltam ${currencyFormatter.format(remaining)}`;
	if (goal.deadline < getToday()) return `Prazo vencido · faltam ${currencyFormatter.format(remaining)}`;
	const [deadlineYear, deadlineMonth] = goal.deadline.split('-').map(Number);
	const [currentYear, currentMonth] = getCurrentMonth().split('-').map(Number);
	const monthsLeft = Math.max(1, (deadlineYear - currentYear) * 12 + (deadlineMonth - currentMonth));
	return `${monthsLeft} ${monthsLeft === 1 ? 'mês restante' : 'meses restantes'} · guarde ${currencyFormatter.format(remaining / monthsLeft)}/mês`;
}

function openContribution(goal) {
	contributionGoal = goal;
	contributionForm.reset();
	document.querySelector('#contribution-title').textContent = goal.title;
	document.querySelector('#contribution-deduct').checked = true;
	contributionModal.showModal();
}

function renderSimulator() {
	const [initialInput, monthlyInput, rateInput] = simulatorInputs;
	const initial = Number(initialInput.value) || 0;
	const monthly = Number(monthlyInput.value) || 0;
	const monthlyRate = Math.pow(1 + (Number(rateInput.value) || 0) / 100, 1 / 12) - 1;
	const results = document.querySelector('#simulator-results');
	results.replaceChildren(...[1, 5, 10].map((years) => {
		const months = years * 12;
		const growth = Math.pow(1 + monthlyRate, months);
		const total = initial * growth + (monthlyRate ? monthly * ((growth - 1) / monthlyRate) : monthly * months);
		const invested = initial + monthly * months;
		const item = document.createElement('article');
		const label = document.createElement('span');
		const value = document.createElement('strong');
		const earnings = document.createElement('small');
		label.textContent = `Em ${years} ${years === 1 ? 'ano' : 'anos'}`;
		value.textContent = currencyFormatter.format(total);
		earnings.textContent = `Rendimento de ${currencyFormatter.format(total - invested)}`;
		item.append(label, value, earnings);
		return item;
	}));
}

function prefillSimulator() {
	const [initialInput, monthlyInput, rateInput] = simulatorInputs;
	const monthlyContribution = investments.reduce((total, investment) => {
		if (investment.frequency === 'Mensal') return total + investment.amount;
		if (investment.frequency === 'Semanal') return total + (investment.amount * 52) / 12;
		return total;
	}, 0);
	const ratedInvestments = investments.filter((investment) => investment.annualRate);
	if (!initialInput.dataset.touched) initialInput.value = sumAmounts(investments).toFixed(2);
	if (!monthlyInput.dataset.touched) monthlyInput.value = monthlyContribution.toFixed(2);
	if (!rateInput.dataset.touched && ratedInvestments.length) {
		const weightedRate = ratedInvestments.reduce((total, investment) => total + investment.annualRate * investment.amount, 0) / sumAmounts(ratedInvestments);
		rateInput.value = weightedRate.toFixed(2);
	}
	renderSimulator();
}

function exportTransactionsCsv() {
	const rows = getFilteredTransactions();
	if (!rows.length) return;
	const typeLabels = { income: 'Receita', expense: 'Despesa', transfer: 'Transferência' };
	const header = ['Data', 'Tipo', 'Descrição', 'Categoria', 'Conta', 'Valor', 'Situação', 'Tags', 'Observação'];
	const lines = [header.map(escapeCsvText).join(';'), ...rows.map((transaction) => [
		escapeCsvText(getTransactionDate(transaction)),
		escapeCsvText(typeLabels[transaction.type]),
		escapeCsvText(transaction.description),
		escapeCsvText(transaction.category),
		escapeCsvText(isTransfer(transaction)
			? `${getAccount(transaction.fromAccountId)?.name || ''} → ${getAccount(transaction.toAccountId)?.name || ''}`
			: getAccount(transaction.accountId)?.name || ''),
		(transaction.type === 'expense' ? -transaction.amount : transaction.amount).toFixed(2).replace('.', ','),
		escapeCsvText(isPaid(transaction) ? 'Pago' : 'Pendente'),
		escapeCsvText((transaction.tags || []).join(', ')),
		escapeCsvText(transaction.notes)
	].join(';'))];
	const url = URL.createObjectURL(new Blob([`\uFEFF${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' }));
	const link = document.createElement('a');
	link.href = url;
	link.download = `lancamentos-${getToday()}.csv`;
	link.click();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function renderImportPreview() {
	const invert = document.querySelector('#import-invert').checked;
	const preview = document.querySelector('#import-preview');
	preview.replaceChildren(...pendingImport.slice(0, 6).map((row) => {
		const signedAmount = invert ? -row.amount : row.amount;
		const item = document.createElement('div');
		const description = document.createElement('span');
		const value = document.createElement('strong');
		description.textContent = `${formatTransactionDate(row.date)} · ${row.description}`;
		value.className = signedAmount < 0 ? 'expense-value' : 'income-value';
		value.textContent = `${signedAmount < 0 ? '-' : '+'} ${currencyFormatter.format(Math.abs(signedAmount))}`;
		item.append(description, value);
		return item;
	}));
}

const themeButton = document.querySelector('#theme-button');
themeButton.addEventListener('click', () => {
	const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
	document.documentElement.dataset.theme = theme;
	localStorage.setItem('theme', theme);
});

document.querySelectorAll('[data-close-dialog]').forEach((button) => {
	button.addEventListener('click', () => button.closest('dialog').close());
});

transactionFilters.forEach((input) => input.addEventListener('input', renderTransactionList));

document.querySelector('#add-account-button').addEventListener('click', () => openAccountModal());
document.querySelector('#account-type').addEventListener('change', updateAccountFormFields);

accountForm.addEventListener('submit', async (event) => {
	event.preventDefault();
	const name = document.querySelector('#account-name').value.trim().slice(0, 40);
	const type = document.querySelector('#account-type').value;
	if (!name || !accountTypeLabels[type]) return;
	const isCredit = type === 'credit';
	const accountData = {
		name,
		type,
		initialBalance: isCredit ? 0 : Number(document.querySelector('#account-initial').value) || 0,
		limit: isCredit ? Math.max(0, Number(document.querySelector('#account-limit').value) || 0) : 0,
		closingDay: isCredit ? clampDay(document.querySelector('#account-closing').value, 1) : null,
		dueDay: isCredit ? clampDay(document.querySelector('#account-due').value, 10) : null
	};
	try {
		if (editingAccountId) {
			await updateDoc(doc(database, 'users', auth.currentUser.uid, 'accounts', editingAccountId), accountData);
			await addNotification(`Você editou a conta ${name}.`, '✎');
		} else {
			await addDoc(collection(database, 'users', auth.currentUser.uid, 'accounts'), { ...accountData, createdAt: new Date().toISOString() });
			await addNotification(`Você adicionou a conta ${name}.`, '▭');
		}
		accountModal.close();
	} catch (error) {
		console.error('Erro ao salvar conta:', error);
	}
});

function openBudgetModal() {
	const fields = document.querySelector('#budget-fields');
	fields.replaceChildren(...getCategories().filter((category) => category.name !== 'Metas').map((category) => {
		const label = document.createElement('label');
		const input = document.createElement('input');
		label.textContent = `${category.icon} ${category.name}`;
		input.type = 'number';
		input.min = '0';
		input.step = '0.01';
		input.placeholder = 'Sem limite';
		input.dataset.category = category.name;
		input.value = categoryBudgets[category.name] || '';
		label.append(input);
		return label;
	}));
	budgetModal.showModal();
}

document.querySelector('#edit-category-budgets-button').addEventListener('click', openBudgetModal);
document.querySelector('#budget-more-button').addEventListener('click', openBudgetModal);

budgetForm.addEventListener('submit', async (event) => {
	event.preventDefault();
	const budgets = {};
	budgetForm.querySelectorAll('input[data-category]').forEach((input) => {
		const value = Number(input.value);
		if (Number.isFinite(value) && value > 0) budgets[input.dataset.category] = value;
	});
	try {
		// mergeFields replaces the whole map so removed limits are actually deleted.
		await setDoc(doc(database, 'users', auth.currentUser.uid), { categoryBudgets: budgets }, { mergeFields: ['categoryBudgets'] });
		categoryBudgets = budgets;
		renderDashboard(currentTransactions);
		await addNotification('Você atualizou seus limites por categoria.', '◔');
		budgetModal.close();
	} catch (error) {
		console.error('Erro ao salvar limites:', error);
	}
});

function renderCategoryManager() {
	const manager = document.querySelector('#category-manager');
	manager.replaceChildren(...getCategories().map((category) => {
		const chip = document.createElement('span');
		const isCustom = customCategories.some((custom) => custom.name === category.name);
		chip.className = 'category-chip';
		chip.style.borderColor = category.color;
		chip.textContent = `${category.icon} ${category.name}`;
		if (isCustom) {
			const removeButton = document.createElement('button');
			removeButton.type = 'button';
			removeButton.textContent = '×';
			removeButton.setAttribute('aria-label', `Remover categoria ${category.name}`);
			removeButton.addEventListener('click', () => openDeleteConfirmation(
				`Remover a categoria "${category.name}"? Os lançamentos existentes manterão o nome dela.`,
				() => saveCustomCategories(customCategories.filter((custom) => custom.name !== category.name))
			));
			chip.append(removeButton);
		}
		return chip;
	}));
}

async function saveCustomCategories(categories) {
	await setDoc(doc(database, 'users', auth.currentUser.uid), { customCategories: categories }, { merge: true });
	customCategories = categories;
	refreshCategorySelects();
	renderCategoryManager();
	renderDashboard(currentTransactions);
}

document.querySelector('#manage-categories-button').addEventListener('click', () => {
	categoryForm.reset();
	document.querySelector('#category-error').textContent = '';
	renderCategoryManager();
	categoryModal.showModal();
});

categoryForm.addEventListener('submit', async (event) => {
	event.preventDefault();
	const errorMessage = document.querySelector('#category-error');
	const name = document.querySelector('#category-name').value.trim().slice(0, 30);
	const icon = document.querySelector('#category-icon').value.trim().slice(0, 2) || '•';
	const colorValue = document.querySelector('#category-color').value;
	const color = /^#[0-9a-f]{6}$/i.test(colorValue) ? colorValue : '#8a958f';
	if (!name) return;
	if ([...getCategories().map((category) => category.name), 'Transferência'].some((existing) => normalizeText(existing) === normalizeText(name))) {
		errorMessage.textContent = 'Já existe uma categoria com esse nome.';
		return;
	}
	errorMessage.textContent = '';
	try {
		await saveCustomCategories([...customCategories, { name, icon, color }]);
		await addNotification(`Você criou a categoria ${name}.`, icon);
		categoryForm.reset();
	} catch (error) {
		console.error('Erro ao salvar categoria:', error);
		errorMessage.textContent = 'Não foi possível salvar a categoria.';
	}
});

contributionForm.addEventListener('submit', async (event) => {
	event.preventDefault();
	const amount = Number(document.querySelector('#contribution-amount').value);
	const goal = contributionGoal;
	if (!goal || !Number.isFinite(amount) || amount <= 0) return;
	try {
		await updateDoc(doc(database, 'users', auth.currentUser.uid, 'goals', goal.id), { currentAmount: increment(amount) });
		if (document.querySelector('#contribution-deduct').checked) {
			await addDoc(collection(database, 'users', auth.currentUser.uid, 'transactions'), {
				description: `Meta: ${goal.title}`,
				amount,
				category: 'Metas',
				type: 'expense',
				accountId: '',
				tags: ['meta'],
				notes: '',
				status: 'paid',
				transactionDate: getToday(),
				goalId: goal.id,
				createdAt: new Date().toISOString()
			});
		}
		await addNotification(`Você guardou ${currencyFormatter.format(amount)} na meta ${goal.title}.`, '◎');
		if (goal.currentAmount < goal.targetAmount && goal.currentAmount + amount >= goal.targetAmount) {
			await addNotification(`Parabéns! Você concluiu a meta ${goal.title}.`, '★');
		}
		contributionModal.close();
	} catch (error) {
		console.error('Erro ao guardar dinheiro na meta:', error);
	}
});

simulatorInputs.forEach((input) => input.addEventListener('input', () => {
	input.dataset.touched = 'true';
	renderSimulator();
}));

document.querySelector('#export-csv-button').addEventListener('click', exportTransactionsCsv);
document.querySelector('#print-report-button').addEventListener('click', () => window.print());

importFileInput.addEventListener('change', async () => {
	const [file] = importFileInput.files;
	importFileInput.value = '';
	if (!file) return;
	const summary = document.querySelector('#import-summary');
	const submitButton = document.querySelector('#import-submit');
	document.querySelector('#import-error').textContent = '';
	refreshCategorySelects();
	populateAccountSelects();
	document.querySelector('#import-category').value = 'Outros';
	pendingImport = [];
	if (file.size > 5 * 1024 * 1024) {
		summary.textContent = 'O arquivo é muito grande. O limite é de 5 MB.';
	} else {
		const buffer = await file.arrayBuffer();
		let text;
		try {
			text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
		} catch {
			// Many Brazilian banks export OFX/CSV in Latin-1.
			text = new TextDecoder('iso-8859-1').decode(buffer);
		}
		const isOfx = /<OFX>/i.test(text) || file.name.toLowerCase().endsWith('.ofx');
		const parsedRows = assignImportIds((isOfx ? parseOfx(text) : parseCsv(text))
			.filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.date) && Number.isFinite(row.amount) && row.amount !== 0));
		const existingIds = new Set(currentTransactions.map((transaction) => transaction.importId).filter(Boolean));
		const newRows = parsedRows.filter((row) => !existingIds.has(row.importId));
		pendingImport = newRows.slice(0, 1000);
		const duplicates = parsedRows.length - newRows.length;
		summary.textContent = pendingImport.length
			? `${pendingImport.length} lançamento(s) encontrado(s)${duplicates ? ` · ${duplicates} já importado(s) foram ignorados` : ''}. Valores negativos viram despesas e positivos viram receitas.`
			: parsedRows.length
				? 'Todos os lançamentos deste arquivo já foram importados.'
				: 'Não encontramos lançamentos. Use um arquivo OFX ou um CSV com colunas de data, descrição e valor.';
	}
	submitButton.disabled = !pendingImport.length;
	renderImportPreview();
	importModal.showModal();
});

document.querySelector('#import-invert').addEventListener('change', renderImportPreview);

importForm.addEventListener('submit', async (event) => {
	event.preventDefault();
	if (!pendingImport.length) return;
	const category = document.querySelector('#import-category').value;
	const accountId = document.querySelector('#import-account').value;
	const invert = document.querySelector('#import-invert').checked;
	const submitButton = document.querySelector('#import-submit');
	const transactionsCollection = collection(database, 'users', auth.currentUser.uid, 'transactions');
	const createdAt = Date.now();
	submitButton.disabled = true;
	submitButton.textContent = 'Importando...';
	try {
		// Firestore batches accept at most 500 writes.
		for (let start = 0; start < pendingImport.length; start += 400) {
			const batch = writeBatch(database);
			pendingImport.slice(start, start + 400).forEach((row, index) => {
				const signedAmount = invert ? -row.amount : row.amount;
				const isExpense = signedAmount < 0;
				batch.set(doc(transactionsCollection), {
					description: row.description,
					amount: Math.round(Math.abs(signedAmount) * 100) / 100,
					type: isExpense ? 'expense' : 'income',
					category: isExpense ? category : 'Outros',
					accountId,
					transactionDate: row.date,
					status: 'paid',
					tags: ['importado'],
					notes: '',
					importId: row.importId,
					createdAt: new Date(createdAt + start + index).toISOString()
				});
			});
			await batch.commit();
		}
		await addNotification(`Você importou ${pendingImport.length} lançamento(s) do extrato.`, '⇩');
		pendingImport = [];
		importModal.close();
	} catch (error) {
		console.error('Erro ao importar extrato:', error);
		document.querySelector('#import-error').textContent = 'Não foi possível importar. Tente novamente.';
	} finally {
		submitButton.disabled = false;
		submitButton.textContent = 'Importar lançamentos';
	}
});

/* ---------- Shared helpers for the new features ---------- */

function getPlanningContext() {
	return {
		transactions: currentTransactions,
		accounts,
		recurringItems,
		investments,
		monthlyIncome,
		goals: goalsData,
		categoryBudgets,
		categoryGroups,
		today: getToday()
	};
}

function userDocument(...path) {
	return doc(database, 'users', auth.currentUser.uid, ...path);
}

/* ---------- Toast and undo ---------- */

const toastElement = document.querySelector('#toast');
const toastMessage = document.querySelector('#toast-message');
const toastButton = document.querySelector('#toast-action');

function hideToast() {
	clearTimeout(toastTimer);
	toastAction = undefined;
	toastElement.hidden = true;
}

// Runs the pending "expire" callback right away (e.g. before logging out or showing another toast).
async function flushToast() {
	const pending = toastAction;
	hideToast();
	if (pending?.onExpire) await pending.onExpire();
}

async function showToast(message, { actionLabel = 'Desfazer', onAction, onExpire, duration = 7000 } = {}) {
	await flushToast();
	toastMessage.textContent = message;
	toastButton.textContent = actionLabel;
	toastButton.hidden = !onAction;
	toastElement.hidden = false;
	toastAction = { onAction, onExpire };
	toastTimer = setTimeout(() => {
		flushToast().catch((error) => console.error('Erro ao finalizar ação:', error));
	}, duration);
}

toastButton.addEventListener('click', async () => {
	const pending = toastAction;
	hideToast();
	if (pending?.onAction) {
		try {
			await pending.onAction();
		} catch (error) {
			console.error('Erro ao desfazer:', error);
		}
	}
});

async function deleteWithUndo({ label, items, onFinalize }) {
	try {
		const batch = writeBatch(database);
		items.forEach(({ path }) => batch.delete(userDocument(...path)));
		await batch.commit();
	} catch (error) {
		console.error('Erro ao excluir:', error);
		return;
	}
	await showToast(label, {
		onAction: async () => {
			const batch = writeBatch(database);
			items.forEach(({ path, data }) => {
				const { id, ...rest } = data;
				batch.set(userDocument(...path), rest);
			});
			await batch.commit();
		},
		onExpire: onFinalize
	});
}

/* ---------- Receipts ---------- */

const receiptModal = document.querySelector('#receipt-modal');
let receiptObjectUrl = '';

async function viewReceipt(receipt) {
	if (!receipt?.id) return;
	const viewer = document.querySelector('#receipt-viewer');
	const download = document.querySelector('#receipt-download');
	document.querySelector('#receipt-title').textContent = receipt.name || 'Comprovante';
	viewer.replaceChildren(createEmptyState('Carregando comprovante...'));
	download.hidden = true;
	receiptModal.showModal();
	try {
		const snapshot = await getDoc(userDocument('receipts', receipt.id));
		const data = snapshot.data()?.data;
		if (!data) throw new Error('Comprovante não encontrado.');
		if (receiptObjectUrl) URL.revokeObjectURL(receiptObjectUrl);
		receiptObjectUrl = dataUrlToObjectUrl(data);
		const isPdf = data.startsWith('data:application/pdf');
		const preview = document.createElement(isPdf ? 'iframe' : 'img');
		preview.src = receiptObjectUrl;
		if (isPdf) preview.title = receipt.name || 'Comprovante';
		else preview.alt = receipt.name || 'Comprovante';
		viewer.replaceChildren(preview);
		download.href = receiptObjectUrl;
		download.download = receipt.name || 'comprovante';
		download.hidden = false;
	} catch (error) {
		console.error('Erro ao abrir comprovante:', error);
		viewer.replaceChildren(createEmptyState('Não foi possível abrir o comprovante.'));
	}
}

/* ---------- Credit card invoices ---------- */

function openInvoiceModal(card, month) {
	const today = getToday();
	invoiceView = { cardId: card.id, month: month || getInvoiceMonth(card, today) };
	const select = document.querySelector('#invoice-pay-account');
	select.replaceChildren();
	accounts.filter((account) => account.type !== 'credit').forEach((account) => select.add(new Option(account.name, account.id)));
	select.add(new Option('Sem conta (só registrar o pagamento)', ''));
	document.querySelector('#invoice-pay-date').value = today;
	document.querySelector('#invoice-pay-error').textContent = '';
	renderInvoice();
	invoiceModal.showModal();
}

function renderInvoice() {
	const card = getAccount(invoiceView.cardId);
	if (!card) {
		invoiceModal.close();
		return;
	}
	const today = getToday();
	const invoice = getInvoice(card, invoiceView.month, currentTransactions, today);
	const status = document.querySelector('#invoice-status');
	const list = document.querySelector('#invoice-items');
	document.querySelector('#invoice-card-name').textContent = card.name;
	document.querySelector('#invoice-month-label').textContent = formatMonthLabel(invoice.month);
	setMoney(document.querySelector('#invoice-total'), invoice.total);
	setMoney(document.querySelector('#invoice-paid'), invoice.paid);
	document.querySelector('#invoice-closing').textContent = formatTransactionDate(invoice.closingDate);
	document.querySelector('#invoice-due').textContent = formatTransactionDate(invoice.dueDate);
	status.className = `invoice-status ${invoice.status}`;
	status.textContent = invoiceStatusLabels[invoice.status];
	list.replaceChildren();
	if (!invoice.items.length) list.append(createEmptyState('Nenhuma compra nesta fatura.'));
	invoice.items.forEach((item) => {
		const row = document.createElement('div');
		const info = document.createElement('div');
		const title = document.createElement('strong');
		const meta = document.createElement('span');
		const value = document.createElement('strong');
		row.className = 'invoice-item';
		title.textContent = item.description;
		meta.textContent = `${formatTransactionDate(getTransactionDate(item))} · ${item.category}`;
		value.className = item.type === 'income' ? 'income-value' : 'expense-value';
		value.textContent = `${item.type === 'income' ? '+' : ''}${currencyFormatter.format(item.amount)}`;
		info.append(title, meta);
		row.append(info, value);
		list.append(row);
	});
	invoice.payments.forEach((payment) => {
		const row = document.createElement('div');
		row.className = 'invoice-item payment';
		const info = document.createElement('div');
		const title = document.createElement('strong');
		const meta = document.createElement('span');
		const value = document.createElement('strong');
		title.textContent = 'Pagamento';
		meta.textContent = `${formatTransactionDate(getTransactionDate(payment))} · ${payment.fromAccountId ? getAccount(payment.fromAccountId)?.name || 'Conta removida' : 'Sem conta'}`;
		value.className = 'income-value';
		value.textContent = `- ${currencyFormatter.format(payment.amount)}`;
		info.append(title, meta);
		row.append(info, value);
		list.append(row);
	});
	const payForm = document.querySelector('#invoice-pay-form');
	payForm.hidden = invoice.remaining <= 0;
	document.querySelector('#invoice-pay-amount').value = invoice.remaining ? invoice.remaining.toFixed(2) : '';
	document.querySelector('#invoice-pay-submit').textContent = invoice.status === 'open' ? 'Antecipar pagamento' : 'Pagar fatura';
}

document.querySelector('#invoice-prev').addEventListener('click', () => {
	invoiceView.month = addMonths(invoiceView.month, -1);
	renderInvoice();
});

document.querySelector('#invoice-next').addEventListener('click', () => {
	invoiceView.month = addMonths(invoiceView.month, 1);
	renderInvoice();
});

document.querySelector('#invoice-pay-form').addEventListener('submit', async (event) => {
	event.preventDefault();
	const card = getAccount(invoiceView.cardId);
	const amount = Number(document.querySelector('#invoice-pay-amount').value);
	const fromAccountId = document.querySelector('#invoice-pay-account').value;
	const transactionDate = document.querySelector('#invoice-pay-date').value;
	const errorMessage = document.querySelector('#invoice-pay-error');
	const submitButton = document.querySelector('#invoice-pay-submit');
	if (!card || !Number.isFinite(amount) || amount <= 0 || !transactionDate) return;
	errorMessage.textContent = '';
	submitButton.disabled = true;
	try {
		const monthLabel = formatMonthLabel(invoiceView.month).toLowerCase();
		await addDoc(collection(database, 'users', auth.currentUser.uid, 'transactions'), {
			description: `Pagamento da fatura ${card.name} (${monthLabel})`,
			amount: roundMoney(amount),
			transactionDate,
			type: 'transfer',
			category: 'Transferência',
			accountId: '',
			fromAccountId,
			toAccountId: card.id,
			invoiceMonth: invoiceView.month,
			status: 'paid',
			tags: ['fatura'],
			notes: '',
			createdAt: new Date().toISOString()
		});
		await addNotification(`Você pagou ${currencyFormatter.format(amount)} da fatura ${card.name} de ${monthLabel}.`, '✓');
	} catch (error) {
		console.error('Erro ao pagar fatura:', error);
		errorMessage.textContent = 'Não foi possível registrar o pagamento. Tente novamente.';
	} finally {
		submitButton.disabled = false;
	}
});

/* ---------- Alerts ---------- */

async function raiseAlert(key, message, symbol) {
	if (!auth.currentUser) return;
	if (key) {
		if (sentAlerts[key]) return;
		sentAlerts[key] = getToday();
		await setDoc(doc(database, 'users', auth.currentUser.uid), { sentAlerts: { [key]: getToday() } }, { merge: true });
	}
	await addNotification(message, symbol);
	if (alertSettings.push) showSystemNotification(message, key || undefined);
}

function pruneSentAlerts() {
	const limit = toDateKey(new Date(Date.now() - 120 * 86400000));
	const kept = Object.fromEntries(Object.entries(sentAlerts).filter(([key, date]) => key === 'ach-init' || date >= limit));
	if (Object.keys(kept).length === Object.keys(sentAlerts).length) return;
	sentAlerts = kept;
	setDoc(doc(database, 'users', auth.currentUser.uid), { sentAlerts: kept }, { mergeFields: ['sentAlerts'] })
		.catch((error) => console.error('Erro ao limpar alertas antigos:', error));
}

function scheduleAlertCheck() {
	clearTimeout(alertTimer);
	// Waits for all listeners to settle so alerts are not computed from partial data.
	alertTimer = setTimeout(() => {
		runAlertChecks().catch((error) => console.error('Erro ao verificar alertas:', error));
	}, 1500);
}

async function runAlertChecks() {
	if (!auth.currentUser || !['transactions', 'accounts', 'goals', 'investments', 'recurring'].every((name) => loadedCollections.has(name))) return;
	const today = getToday();
	const month = getCurrentMonth();
	const cards = accounts.filter((account) => account.type === 'credit');
	if (alertSettings.invoice) {
		const warningDays = Number(alertSettings.invoiceDays) || 0;
		for (const card of cards) {
			const current = getInvoice(card, getInvoiceMonth(card, today), currentTransactions, today);
			const daysToClose = daysBetween(today, current.closingDate);
			if (current.remaining > 0 && daysToClose >= 0 && daysToClose <= warningDays) {
				await raiseAlert(`inv-close-${card.id}-${current.month}`, `A fatura ${card.name} fecha ${daysToClose ? `em ${daysToClose} dia(s)` : 'hoje'} com ${currencyFormatter.format(current.remaining)} a pagar.`, '▭');
			}
			for (const invoice of getPendingInvoices(card, currentTransactions, today, 2)) {
				const label = formatMonthLabel(invoice.month).toLowerCase();
				const daysToDue = daysBetween(today, invoice.dueDate);
				if (invoice.status === 'overdue') {
					await raiseAlert(`inv-late-${card.id}-${invoice.month}`, `A fatura ${card.name} de ${label} está atrasada: ${currencyFormatter.format(invoice.remaining)} em aberto desde ${formatTransactionDate(invoice.dueDate)}.`, '!');
				} else if (daysToDue <= warningDays) {
					await raiseAlert(`inv-due-${card.id}-${invoice.month}`, `A fatura ${card.name} de ${label} vence ${daysToDue ? `em ${daysToDue} dia(s)` : 'hoje'}: ${currencyFormatter.format(invoice.remaining)} a pagar.`, '▭');
				}
			}
		}
	}
	if (alertSettings.cardLimit) {
		const threshold = Number(alertSettings.cardLimitPercent) || 80;
		for (const card of cards) {
			const usage = getCardSummary(card, currentTransactions, today);
			if (!usage.limit || usage.percent < threshold) continue;
			const level = usage.percent >= 100 ? 100 : threshold;
			await raiseAlert(`limit-${card.id}-${month}-${level}`, level === 100
				? `Você atingiu o limite do cartão ${card.name}.`
				: `Você já usou ${Math.round(usage.percent)}% do limite do cartão ${card.name}. Disponível: ${currencyFormatter.format(usage.available)}.`, '!');
		}
	}
	if (alertSettings.forecast && lastForecastValue < 0 && Number(today.slice(8)) >= 3) {
		await raiseAlert(`forecast-${month}`, `Atenção: no ritmo atual, seu saldo deve fechar o mês negativo em ${currencyFormatter.format(-lastForecastValue)}.`, '⚠');
	}
	if (alertSettings.goals) {
		for (const goal of goalsData) {
			if (!goal.deadline || goal.deadline < today || goal.currentAmount >= goal.targetAmount) continue;
			const expected = getGoalExpectedProgress(goal, today);
			const actual = goal.currentAmount / goal.targetAmount;
			if (expected === null || expected < 0.15 || actual >= expected - 0.1) continue;
			await raiseAlert(`goal-${goal.id}-${month}`, `A meta ${goal.title} está atrasada: você tem ${Math.round(actual * 100)}% do valor, mas o plano previa ${Math.round(expected * 100)}% até agora. ${getGoalPlan(goal)}.`, '◎');
		}
	}
	if (alertSettings.achievements) await checkAchievementAlerts();
	await updateScheduledAlerts();
}

async function checkAchievementAlerts() {
	const ctx = getPlanningContext();
	const unlocked = computeAchievements(ctx).filter((achievement) => achievement.unlocked);
	if (!sentAlerts['ach-init']) {
		// First run: register what was already achieved without flooding the user with notifications.
		const initial = Object.fromEntries([...unlocked.map((achievement) => [`ach-${achievement.id}`, getToday()]), ['ach-init', getToday()]]);
		sentAlerts = { ...sentAlerts, ...initial };
		await setDoc(doc(database, 'users', auth.currentUser.uid), { sentAlerts: initial }, { merge: true });
	} else {
		for (const achievement of unlocked) {
			await raiseAlert(`ach-${achievement.id}`, `Conquista desbloqueada: ${achievement.title}! ${achievement.description}`, '★');
		}
	}
	const previousMonth = addMonths(getCurrentMonth(), -1);
	if (getMonthTransactions(previousMonth).length) {
		await raiseAlert(`retro-${previousMonth}`, `Sua retrospectiva de ${formatMonthLabel(previousMonth).toLowerCase()} está pronta. Veja em Relatórios → Retrospectiva do mês.`, '★');
	}
}

// Saves upcoming bills and invoices so the service worker can notify even with the site closed.
async function updateScheduledAlerts() {
	if (!alertSettings.push || !systemNotificationsSupported() || Notification.permission !== 'granted') return;
	const today = getToday();
	const scheduled = [];
	if (alertSettings.bills) {
		currentTransactions.filter((item) => item.type === 'expense' && !isPaid(item)).forEach((bill) => {
			const due = getTransactionDate(bill);
			if (daysBetween(today, due) > 60) return;
			scheduled.push({
				key: `bill-${bill.id}-${due}`,
				fireOn: toDateKey(new Date(new Date(`${due}T12:00:00`).getTime() - (Number(alertSettings.billDays) || 0) * 86400000)),
				until: toDateKey(new Date(new Date(`${due}T12:00:00`).getTime() + 7 * 86400000)),
				message: `A conta ${bill.description} (${currencyFormatter.format(bill.amount)}) vence em ${formatTransactionDate(due)}.`
			});
		});
	}
	if (alertSettings.invoice) {
		accounts.filter((account) => account.type === 'credit').forEach((card) => {
			const currentMonth = getInvoiceMonth(card, today);
			[-1, 0, 1].forEach((offset) => {
				const invoice = getInvoice(card, addMonths(currentMonth, offset), currentTransactions, today);
				if (invoice.remaining <= 0 || invoice.status === 'paid') return;
				scheduled.push({
					key: `invoice-${card.id}-${invoice.month}`,
					fireOn: toDateKey(new Date(new Date(`${invoice.dueDate}T12:00:00`).getTime() - (Number(alertSettings.invoiceDays) || 0) * 86400000)),
					until: toDateKey(new Date(new Date(`${invoice.dueDate}T12:00:00`).getTime() + 7 * 86400000)),
					message: `A fatura ${card.name} (${currencyFormatter.format(invoice.remaining)}) vence em ${formatTransactionDate(invoice.dueDate)}.`
				});
			});
		});
	}
	await saveScheduledAlerts(scheduled);
	navigator.serviceWorker.controller?.postMessage('check-alerts');
}

function openAlertSettings() {
	const fields = {
		'#alert-bills': 'bills', '#alert-invoice': 'invoice', '#alert-card-limit': 'cardLimit', '#alert-budget': 'budget',
		'#alert-forecast': 'forecast', '#alert-unusual': 'unusual', '#alert-goals': 'goals', '#alert-achievements': 'achievements', '#alert-push': 'push'
	};
	Object.entries(fields).forEach(([selector, key]) => { document.querySelector(selector).checked = Boolean(alertSettings[key]); });
	document.querySelector('#alert-bill-days').value = alertSettings.billDays;
	document.querySelector('#alert-invoice-days').value = alertSettings.invoiceDays;
	document.querySelector('#alert-card-limit-percent').value = alertSettings.cardLimitPercent;
	document.querySelector('#alert-settings-error').textContent = '';
	const pushInput = document.querySelector('#alert-push');
	pushInput.disabled = !systemNotificationsSupported();
	if (!systemNotificationsSupported()) document.querySelector('#alert-push-status').textContent = 'Este navegador não suporta notificações do sistema.';
	notificationPanel.hidden = true;
	alertSettingsModal.showModal();
}

document.querySelector('#alert-settings-button').addEventListener('click', openAlertSettings);

alertSettingsForm.addEventListener('submit', async (event) => {
	event.preventDefault();
	const errorMessage = document.querySelector('#alert-settings-error');
	const clamp = (value, minimum, maximum, fallback) => Math.min(maximum, Math.max(minimum, Math.round(Number(value)))) || fallback;
	const settings = {
		bills: document.querySelector('#alert-bills').checked,
		billDays: clamp(document.querySelector('#alert-bill-days').value, 0, 15, 0),
		invoice: document.querySelector('#alert-invoice').checked,
		invoiceDays: clamp(document.querySelector('#alert-invoice-days').value, 0, 15, 0),
		cardLimit: document.querySelector('#alert-card-limit').checked,
		cardLimitPercent: clamp(document.querySelector('#alert-card-limit-percent').value, 10, 100, 80),
		budget: document.querySelector('#alert-budget').checked,
		forecast: document.querySelector('#alert-forecast').checked,
		unusual: document.querySelector('#alert-unusual').checked,
		goals: document.querySelector('#alert-goals').checked,
		achievements: document.querySelector('#alert-achievements').checked,
		push: document.querySelector('#alert-push').checked
	};
	errorMessage.classList.remove('success-message');
	errorMessage.textContent = '';
	if (settings.push) {
		const permission = await requestSystemNotifications();
		if (permission !== 'granted') {
			settings.push = false;
			document.querySelector('#alert-push').checked = false;
			errorMessage.textContent = permission === 'denied'
				? 'As notificações estão bloqueadas no navegador. Libere-as nas configurações do site e tente de novo.'
				: 'Não foi possível ativar as notificações neste navegador.';
		}
	} else {
		await clearScheduledAlerts();
	}
	try {
		await setDoc(doc(database, 'users', auth.currentUser.uid), { alertSettings: settings }, { merge: true });
		alertSettings = settings;
		notifiedBills.clear();
		scheduleAlertCheck();
		if (!errorMessage.textContent) alertSettingsModal.close();
		if (settings.push) showSystemNotification('Notificações ativadas! Você receberá avisos de contas, faturas e metas.', 'push-enabled');
	} catch (error) {
		console.error('Erro ao salvar alertas:', error);
		errorMessage.textContent = 'Não foi possível salvar suas preferências.';
	}
});

/* ---------- Planning: forecast, commitments, 50/30/20 and achievements ---------- */

function renderPlanning() {
	if (!auth.currentUser) return;
	const ctx = getPlanningContext();
	renderForecast(ctx);
	renderCommitments(ctx);
	renderRule(ctx);
	renderAchievements(ctx);
}

function renderForecast(ctx) {
	const list = document.querySelector('#forecast-list');
	const rows = buildForecast(ctx, lastForecastValue, currentBalance);
	const highest = Math.max(1, ...rows.map((row) => Math.abs(row.net)));
	list.replaceChildren(...rows.map((row) => {
		const item = document.createElement('div');
		const label = document.createElement('span');
		const bar = document.createElement('i');
		const fill = document.createElement('b');
		const values = document.createElement('div');
		const net = document.createElement('strong');
		const cumulative = document.createElement('small');
		const detail = document.createElement('small');
		item.className = `forecast-row${row.isCurrent ? ' current' : ''}`;
		label.textContent = row.isCurrent ? `${formatShortMonth(row.month)} (atual)` : `${formatShortMonth(row.month)}/${row.month.slice(2, 4)}`;
		fill.style.width = `${(Math.abs(row.net) / highest) * 100}%`;
		fill.className = row.net < 0 ? 'negative' : '';
		bar.append(fill);
		setMoney(net, row.net);
		net.className = row.net < 0 ? 'is-negative' : 'is-positive';
		cumulative.textContent = `Saldo previsto: ${currencyFormatter.format(row.cumulative)}`;
		detail.className = 'forecast-detail';
		detail.textContent = row.isCurrent
			? `Variação até o fim do mês, partindo do saldo de hoje (${currencyFormatter.format(currentBalance)}).`
			: `Entradas ${currencyFormatter.format(row.income)} · contas e faturas ${currencyFormatter.format(row.committed)} · dia a dia ~${currencyFormatter.format(row.variable)}${row.investments ? ` · aportes ${currencyFormatter.format(row.investments)}` : ''}`;
		values.append(net, cumulative);
		item.append(label, bar, values, detail);
		return item;
	}));
	const firstNegative = rows.find((row) => row.cumulative < 0);
	const summary = document.querySelector('#forecast-summary');
	summary.classList.toggle('is-negative', Boolean(firstNegative));
	summary.textContent = !ctx.monthlyIncome && !ctx.transactions.length
		? 'Cadastre sua renda e alguns lançamentos para ver a previsão.'
		: firstNegative
			? `Atenção: mantendo o ritmo, seu saldo fica negativo em ${formatMonthLabel(firstNegative.month).toLowerCase()}.`
			: `Mantendo o ritmo, seu saldo deve chegar a ${currencyFormatter.format(rows.at(-1).cumulative)} em ${formatMonthLabel(rows.at(-1).month).toLowerCase()}.`;
}

function renderCommitments(ctx) {
	const { months, installmentGroups, remainingInstallments } = buildCommitments(ctx);
	const list = document.querySelector('#commitment-list');
	setMoney(document.querySelector('#installments-remaining'), remainingInstallments);
	document.querySelector('#installments-remaining').title = 'Total de parcelas futuras';
	list.replaceChildren(...months.map((month) => {
		const item = document.createElement('div');
		const header = document.createElement('div');
		const label = document.createElement('strong');
		const value = document.createElement('span');
		const bar = document.createElement('i');
		const fill = document.createElement('b');
		const detail = document.createElement('small');
		item.className = `commitment-item${month.percent >= 50 ? ' over' : month.percent >= 30 ? ' warning' : ''}`;
		label.textContent = formatMonthLabel(month.month);
		value.textContent = `${currencyFormatter.format(month.total)}${month.income ? ` · ${Math.round(month.percent)}% da renda` : ''}`;
		fill.style.width = `${Math.min(100, month.percent)}%`;
		detail.textContent = [
			month.installments && `parcelas ${currencyFormatter.format(month.installments)}`,
			month.recurringExpenses && `fixos ${currencyFormatter.format(month.recurringExpenses)}`,
			month.otherExpenses && `agendados ${currencyFormatter.format(month.otherExpenses)}`
		].filter(Boolean).join(' · ') || 'Nada comprometido ainda.';
		header.append(label, value);
		bar.append(fill);
		item.append(header, bar, detail);
		return item;
	}));
	const groups = document.querySelector('#installment-groups');
	groups.replaceChildren();
	if (!installmentGroups.length) return;
	const title = document.createElement('p');
	title.className = 'section-kicker';
	title.textContent = 'Parcelamentos em andamento';
	groups.append(title, ...installmentGroups.slice(0, 8).map((group) => {
		const row = document.createElement('div');
		const info = document.createElement('div');
		const name = document.createElement('strong');
		const meta = document.createElement('span');
		const value = document.createElement('strong');
		row.className = 'installment-group';
		name.textContent = group.description;
		meta.textContent = `faltam ${group.remainingCount} de ${group.total} · termina em ${formatMonthLabel(group.lastMonth).toLowerCase()}`;
		value.textContent = currencyFormatter.format(group.remainingAmount);
		info.append(name, meta);
		row.append(info, value);
		return row;
	}));
}

function renderRule(ctx) {
	const month = getCurrentMonth();
	const groups = buildRule503020(ctx, month);
	const income = groups[0].amount + groups[1].amount + groups[2].amount;
	document.querySelector('#rule-period').textContent = formatMonthLabel(month);
	const list = document.querySelector('#rule-list');
	if (!ctx.monthlyIncome && !income) {
		list.replaceChildren(createEmptyState('Cadastre sua renda e suas despesas para ver a divisão do seu dinheiro.'));
		return;
	}
	list.replaceChildren(...groups.map((group) => {
		const item = document.createElement('div');
		const header = document.createElement('div');
		const label = document.createElement('strong');
		const value = document.createElement('span');
		const bar = document.createElement('i');
		const fill = document.createElement('b');
		const marker = document.createElement('em');
		const status = document.createElement('small');
		const isSavings = group.key === 'savings';
		const isOff = isSavings ? group.percent < group.target : group.percent > group.target;
		item.className = `rule-item${isOff ? (isSavings ? ' warning' : ' over') : ''}`;
		label.textContent = `${group.label}`;
		value.textContent = `${Math.round(group.percent)}% · ${currencyFormatter.format(group.amount)}`;
		fill.style.width = `${Math.min(100, group.percent)}%`;
		fill.style.background = group.color;
		marker.style.left = `${group.target}%`;
		marker.title = `Meta: ${group.target}%`;
		status.textContent = isSavings
			? (isOff ? `Ideal: ${group.target}% (${currencyFormatter.format(group.ideal)}). Faltam ${currencyFormatter.format(group.ideal - group.amount)}.` : `Parabéns! Acima dos ${group.target}% recomendados.`)
			: (isOff ? `Acima do ideal de ${group.target}% em ${currencyFormatter.format(group.amount - group.ideal)}.` : `Dentro do ideal de ${group.target}% (até ${currencyFormatter.format(group.ideal)}).`);
		header.append(label, value);
		bar.append(fill, marker);
		item.append(header, bar, status);
		return item;
	}));
}

function renderAchievements(ctx) {
	const achievements = computeAchievements(ctx);
	const streak = getBudgetStreak(ctx);
	document.querySelector('#streak-badge').textContent = `${streak} ${streak === 1 ? 'mês' : 'meses'} no azul${streak >= 3 ? ' 🔥' : ''}`;
	document.querySelector('#achievement-grid').replaceChildren(...achievements.map((achievement) => {
		const item = document.createElement('article');
		const icon = document.createElement('span');
		const title = document.createElement('strong');
		const description = document.createElement('small');
		const bar = document.createElement('i');
		const fill = document.createElement('b');
		item.className = `achievement${achievement.unlocked ? ' unlocked' : ''}`;
		item.title = achievement.unlocked ? 'Conquistada!' : `${achievement.progress}% concluído`;
		icon.textContent = achievement.icon;
		title.textContent = achievement.title;
		description.textContent = achievement.detail && !achievement.unlocked ? `${achievement.description} (${achievement.detail})` : achievement.description;
		fill.style.width = `${achievement.progress}%`;
		bar.className = 'mini-progress';
		bar.append(fill);
		item.append(icon, title, description, bar);
		return item;
	}));
}

/* ---------- 50/30/20 category classification ---------- */

document.querySelector('#rule-categories-button').addEventListener('click', () => {
	const fields = document.querySelector('#category-groups-fields');
	fields.replaceChildren(...getCategories().map((category) => {
		const label = document.createElement('label');
		const select = document.createElement('select');
		label.textContent = `${category.icon} ${category.name}`;
		Object.entries(ruleGroups).forEach(([key, group]) => select.add(new Option(group.label, key)));
		select.value = getCategoryGroup(category.name, categoryGroups);
		select.dataset.category = category.name;
		label.append(select);
		return label;
	}));
	categoryGroupsModal.showModal();
});

categoryGroupsForm.addEventListener('submit', async (event) => {
	event.preventDefault();
	const groups = {};
	categoryGroupsForm.querySelectorAll('select[data-category]').forEach((select) => {
		if (select.value !== (defaultCategoryGroups[select.dataset.category] || 'wants')) groups[select.dataset.category] = select.value;
	});
	try {
		await setDoc(doc(database, 'users', auth.currentUser.uid), { categoryGroups: groups }, { mergeFields: ['categoryGroups'] });
		categoryGroups = groups;
		renderPlanning();
		categoryGroupsModal.close();
	} catch (error) {
		console.error('Erro ao salvar classificação:', error);
	}
});

/* ---------- Financial calendar ---------- */

function getCalendarEvents(month) {
	const currentMonth = getCurrentMonth();
	const events = [];
	currentTransactions.forEach((transaction) => {
		const date = getTransactionDate(transaction);
		if (isTransfer(transaction) || transaction.adjustment || !date.startsWith(month)) return;
		events.push({
			date, kind: transaction.type, amount: transaction.amount, label: transaction.description,
			detail: transaction.category, pending: !isPaid(transaction)
		});
	});
	if (month >= currentMonth) {
		recurringItems.filter((item) => (item.lastGeneratedMonth || '') < month).forEach((item) => {
			events.push({
				date: dateInMonth(month, item.dayOfMonth), kind: item.type, amount: item.amount, label: item.description,
				detail: `${item.category} · previsto`, projected: true
			});
		});
	}
	accounts.filter((account) => account.type === 'credit').forEach((card) => {
		[-1, 0, 1].forEach((offset) => {
			const invoice = getInvoice(card, addMonths(month, offset), currentTransactions, getToday());
			if (!invoice.dueDate.startsWith(month) || invoice.total <= 0) return;
			events.push({
				date: invoice.dueDate, kind: 'invoice', amount: invoice.status === 'paid' ? invoice.total : invoice.remaining || invoice.total,
				label: `Fatura ${card.name}`, detail: invoiceStatusLabels[invoice.status], pending: invoice.status !== 'paid', card
			});
		});
	});
	return events;
}

function renderCalendar() {
	const grid = document.querySelector('#calendar-grid');
	if (!grid) return;
	const today = getToday();
	const events = getCalendarEvents(calendarMonth);
	const byDate = new Map();
	events.forEach((event) => byDate.set(event.date, [...(byDate.get(event.date) || []), event]));
	document.querySelector('#calendar-title').textContent = formatMonthLabel(calendarMonth);
	const weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((name) => {
		const cell = document.createElement('span');
		cell.className = 'calendar-weekday';
		cell.textContent = name;
		return cell;
	});
	const firstWeekday = new Date(`${calendarMonth}-01T12:00:00`).getDay();
	const blanks = Array.from({ length: firstWeekday }, () => {
		const cell = document.createElement('span');
		cell.className = 'calendar-blank';
		return cell;
	});
	const days = Array.from({ length: getDaysInMonth(calendarMonth) }, (_, index) => {
		const date = dateInMonth(calendarMonth, index + 1);
		const dayEvents = byDate.get(date) || [];
		const cell = document.createElement('button');
		const number = document.createElement('span');
		const income = sumAmounts(dayEvents.filter((event) => event.kind === 'income'));
		const expense = sumAmounts(dayEvents.filter((event) => event.kind === 'expense'));
		cell.type = 'button';
		cell.className = 'calendar-day';
		cell.classList.toggle('today', date === today);
		cell.classList.toggle('selected', date === selectedCalendarDate);
		cell.classList.toggle('past', date < today);
		cell.setAttribute('aria-label', `${formatTransactionDate(date)}: ${dayEvents.length} item(ns)`);
		number.className = 'calendar-number';
		number.textContent = index + 1;
		cell.append(number);
		if (income) {
			const value = document.createElement('small');
			value.className = 'income-value';
			value.textContent = `+${compactMoney(income)}`;
			cell.append(value);
		}
		if (expense) {
			const value = document.createElement('small');
			value.className = 'expense-value';
			value.textContent = `-${compactMoney(expense)}`;
			cell.append(value);
		}
		const dots = document.createElement('span');
		dots.className = 'calendar-dots';
		if (dayEvents.some((event) => event.kind === 'income')) dots.append(createDot('income-dot'));
		if (dayEvents.some((event) => event.kind === 'expense' && !event.pending && !event.projected)) dots.append(createDot('expense-dot'));
		if (dayEvents.some((event) => event.pending && event.kind !== 'invoice')) dots.append(createDot('pending-dot'));
		if (dayEvents.some((event) => event.kind === 'invoice')) dots.append(createDot('invoice-dot'));
		if (dayEvents.some((event) => event.projected)) dots.append(createDot('projected-dot'));
		if (dots.childElementCount) cell.append(dots);
		cell.addEventListener('click', () => {
			selectedCalendarDate = date;
			renderCalendar();
		});
		return cell;
	});
	grid.replaceChildren(...weekdays, ...blanks, ...days);
	renderCalendarDetails(events);
}

function createDot(className) {
	const dot = document.createElement('i');
	dot.className = `legend-dot ${className}`;
	return dot;
}

function compactMoney(value) {
	if (!valuesVisible) return '•••';
	if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1).replace('.', ',')}k`;
	return Math.round(value).toString();
}

function renderCalendarDetails(events) {
	const container = document.querySelector('#calendar-details');
	const monthIncome = sumAmounts(events.filter((event) => event.kind === 'income'));
	const monthExpense = sumAmounts(events.filter((event) => event.kind === 'expense'));
	const summary = document.createElement('p');
	summary.className = 'calendar-summary';
	summary.textContent = `${formatMonthLabel(calendarMonth)}: entradas ${currencyFormatter.format(monthIncome)} · saídas ${currencyFormatter.format(monthExpense)}${calendarMonth >= getCurrentMonth() ? ' (inclui previstos)' : ''}`;
	if (!selectedCalendarDate.startsWith(calendarMonth)) {
		container.replaceChildren(summary, createEmptyState('Clique em um dia para ver os detalhes.'));
		return;
	}
	const dayEvents = events.filter((event) => event.date === selectedCalendarDate);
	const title = document.createElement('h3');
	const dayLabel = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${selectedCalendarDate}T12:00:00`));
	title.textContent = dayLabel.charAt(0).toUpperCase() + dayLabel.slice(1);
	const list = document.createElement('div');
	list.className = 'calendar-event-list';
	if (!dayEvents.length) list.append(createEmptyState('Nada programado para este dia.'));
	dayEvents.forEach((event) => {
		const row = document.createElement('div');
		const info = document.createElement('div');
		const name = document.createElement('strong');
		const meta = document.createElement('span');
		const value = document.createElement('strong');
		row.className = `calendar-event ${event.kind}${event.pending ? ' pending' : ''}${event.projected ? ' projected' : ''}`;
		name.textContent = event.label;
		meta.textContent = [event.detail, event.pending && event.kind !== 'invoice' ? (event.kind === 'income' ? 'a receber' : 'a pagar') : ''].filter(Boolean).join(' · ');
		value.className = event.kind === 'income' ? 'income-value' : 'expense-value';
		value.textContent = `${event.kind === 'income' ? '+' : '-'} ${currencyFormatter.format(event.amount)}`;
		info.append(name, meta);
		row.append(info, value);
		if (event.kind === 'invoice') {
			row.classList.add('clickable');
			row.addEventListener('click', () => openInvoiceModal(event.card, addMonths(selectedCalendarDate.slice(0, 7), Number(event.card.dueDay) > Number(event.card.closingDay) ? 0 : -1)));
		}
		list.append(row);
	});
	container.replaceChildren(summary, title, list);
}

document.querySelector('#calendar-prev').addEventListener('click', () => {
	calendarMonth = addMonths(calendarMonth, -1);
	renderCalendar();
});
document.querySelector('#calendar-next').addEventListener('click', () => {
	calendarMonth = addMonths(calendarMonth, 1);
	renderCalendar();
});
document.querySelector('#calendar-today').addEventListener('click', () => {
	calendarMonth = getCurrentMonth();
	selectedCalendarDate = getToday();
	renderCalendar();
});

/* ---------- Quick entry ---------- */

const quickEntryInput = document.querySelector('#quick-entry-input');
const quickEntryPreview = document.querySelector('#quick-entry-preview');
const quickEntryDefault = quickEntryPreview.textContent;

function getQuickEntry() {
	const parsed = parseQuickEntry(quickEntryInput.value, getToday());
	if (!parsed) return null;
	const category = suggestCategory(parsed.description, currentTransactions, getCategories().map((item) => item.name)) || 'Outros';
	return { ...parsed, category };
}

quickEntryInput.addEventListener('input', () => {
	quickEntryPreview.classList.remove('is-negative');
	if (!quickEntryInput.value.trim()) {
		quickEntryPreview.textContent = quickEntryDefault;
		return;
	}
	const entry = getQuickEntry();
	if (!entry) {
		quickEntryPreview.textContent = 'Inclua um valor, por exemplo: "farmácia 32,50".';
		return;
	}
	const installmentText = entry.installments > 1 ? ` em ${entry.installments}x de ${currencyFormatter.format(entry.amount / entry.installments)}` : '';
	quickEntryPreview.textContent = `${entry.type === 'income' ? 'Receita' : 'Despesa'} · ${entry.description} · ${currencyFormatter.format(entry.amount)}${installmentText} · ${entry.category} · ${entry.date === getToday() ? 'hoje' : formatTransactionDate(entry.date)}`;
});

document.querySelector('#quick-entry-form').addEventListener('submit', async (event) => {
	event.preventDefault();
	const entry = getQuickEntry();
	if (!entry) {
		quickEntryPreview.textContent = 'Não entendi. Use, por exemplo: "mercado 50" ou "+ salário 3000".';
		quickEntryPreview.classList.add('is-negative');
		return;
	}
	const transactionData = {
		description: entry.description,
		amount: entry.amount,
		type: entry.type,
		category: entry.category,
		accountId: '',
		tags: [],
		notes: '',
		transactionDate: entry.date,
		status: entry.date > getToday() ? 'pending' : 'paid'
	};
	const firstAmount = entry.amount / entry.installments;
	const budgetAlert = getBudgetAlert({ ...transactionData, amount: firstAmount });
	const unusual = alertSettings.unusual ? getUnusualSpending(getPlanningContext(), { ...transactionData, amount: firstAmount }) : null;
	try {
		let ids;
		if (entry.installments > 1) {
			ids = await saveInstallments(transactionData, entry.installments);
		} else {
			const reference = await addDoc(collection(database, 'users', auth.currentUser.uid, 'transactions'), { ...transactionData, createdAt: new Date().toISOString() });
			ids = [reference.id];
		}
		quickEntryInput.value = '';
		quickEntryPreview.textContent = quickEntryDefault;
		await showToast(`Adicionado: ${entry.description} · ${currencyFormatter.format(entry.amount)} em ${entry.category}.`, {
			onAction: async () => {
				const batch = writeBatch(database);
				ids.forEach((id) => batch.delete(userDocument('transactions', id)));
				await batch.commit();
			},
			onExpire: () => addNotification(`Você adicionou ${entry.description} pelo lançamento rápido.`, entry.type === 'income' ? '↓' : '↑')
		});
		if (budgetAlert && alertSettings.budget) await raiseAlert(null, budgetAlert, '!');
		if (unusual) await raiseAlert(null, `Gasto fora do comum: ${entry.description} (${currencyFormatter.format(firstAmount)}) é ${unusual.ratio.toFixed(1).replace('.', ',')}x a sua média em ${entry.category}.`, '⚠');
	} catch (error) {
		console.error('Erro no lançamento rápido:', error);
		quickEntryPreview.textContent = 'Não foi possível salvar. Tente novamente.';
		quickEntryPreview.classList.add('is-negative');
	}
});

/* ---------- Subscriptions ---------- */

function renderSubscriptions() {
	const list = document.querySelector('#subscription-list');
	const subscriptions = recurringItems.filter((item) => item.type === 'expense' && item.subscription);
	const monthly = sumAmounts(subscriptions);
	setMoney(document.querySelector('#subscriptions-monthly'), monthly);
	setMoney(document.querySelector('#subscriptions-yearly'), monthly * 12);
	document.querySelector('#subscriptions-share').textContent = monthlyIncome ? `${((monthly / monthlyIncome) * 100).toFixed(1).replace('.', ',')}%` : '—';
	list.replaceChildren();
	if (!subscriptions.length) {
		list.append(createEmptyState('Nenhuma assinatura. Clique em "Nova assinatura" ou marque ☆ em um lançamento fixo.'));
		return;
	}
	subscriptions.sort((first, second) => second.amount - first.amount).forEach((item) => {
		const row = document.createElement('article');
		const info = document.createElement('div');
		const title = document.createElement('strong');
		const details = document.createElement('span');
		const value = document.createElement('strong');
		const actions = document.createElement('div');
		row.className = 'recurring-item';
		title.textContent = item.description;
		details.textContent = `todo dia ${item.dayOfMonth} · ${currencyFormatter.format(item.amount * 12)}/ano`;
		value.className = 'bill-value expense-value';
		value.textContent = `${currencyFormatter.format(item.amount)}/mês`;
		actions.className = 'item-actions';
		actions.append(
			createActionButton('★', 'Deixar de tratar como assinatura', () => updateDoc(userDocument('recurring', item.id), { subscription: false })),
			createRecurringDeleteButton(item, 'Cancelar assinatura')
		);
		info.append(title, details);
		row.append(info, value, actions);
		list.append(row);
	});
}

document.querySelector('#add-subscription-button').addEventListener('click', () => {
	resetTransactionForm();
	const recurring = document.querySelector('#transaction-recurring');
	recurring.checked = true;
	recurring.dataset.touched = 'true';
	if ([...document.querySelector('#transaction-category').options].some((option) => option.value === 'Lazer')) {
		document.querySelector('#transaction-category').value = 'Lazer';
	}
	updateInstallmentHint();
	document.querySelector('#transaction-subscription').checked = true;
	document.querySelector('#transaction-modal-title').textContent = 'Nova assinatura';
	modal.showModal();
});

/* ---------- Split expenses ---------- */

function renderDebts() {
	const list = document.querySelector('#debt-list');
	if (!list) return;
	const open = debts.filter((debt) => !debt.settled);
	setMoney(document.querySelector('#debts-receivable'), sumAmounts(open.filter((debt) => debt.direction === 'receivable')));
	setMoney(document.querySelector('#debts-payable'), sumAmounts(open.filter((debt) => debt.direction === 'payable')));
	list.replaceChildren();
	if (!open.length) {
		list.append(createEmptyState('Ninguém te deve e você não deve a ninguém. Marque "Dividir com outras pessoas" ao lançar uma despesa.'));
	}
	const people = new Map();
	open.forEach((debt) => people.set(debt.person, [...(people.get(debt.person) || []), debt]));
	[...people].sort((first, second) => first[0].localeCompare(second[0])).forEach(([person, items]) => {
		const group = document.createElement('section');
		const header = document.createElement('header');
		const name = document.createElement('strong');
		const balance = document.createElement('span');
		const net = sumAmounts(items.filter((debt) => debt.direction === 'receivable')) - sumAmounts(items.filter((debt) => debt.direction === 'payable'));
		group.className = 'debt-group';
		name.textContent = person;
		balance.className = net >= 0 ? 'is-positive' : 'is-negative';
		balance.textContent = net >= 0 ? `te deve ${currencyFormatter.format(net)}` : `você deve ${currencyFormatter.format(-net)}`;
		header.append(name, balance);
		group.append(header);
		items.forEach((debt) => {
			const row = document.createElement('div');
			const info = document.createElement('div');
			const title = document.createElement('strong');
			const meta = document.createElement('span');
			const value = document.createElement('strong');
			const actions = document.createElement('div');
			row.className = 'debt-item';
			title.textContent = debt.description;
			meta.textContent = `${debt.direction === 'receivable' ? 'Te deve' : 'Você deve'} · ${formatTransactionDate(debt.date || debt.createdAt)}`;
			value.className = debt.direction === 'receivable' ? 'income-value' : 'expense-value';
			value.textContent = currencyFormatter.format(debt.amount);
			actions.className = 'item-actions';
			actions.append(
				createActionButton('✓', debt.direction === 'receivable' ? 'Marcar como recebido' : 'Marcar como pago', () => settleDebt(debt)),
				createActionButton('×', 'Excluir registro', () => deleteWithUndo({
					label: `Registro "${debt.description}" de ${debt.person} excluído.`,
					items: [{ path: ['debts', debt.id], data: debt }]
				}), true)
			);
			info.append(title, meta);
			row.append(info, value, actions);
			group.append(row);
		});
		list.append(group);
	});
	const settled = debts.filter((debt) => debt.settled).slice(0, 5);
	if (settled.length) {
		const title = document.createElement('p');
		title.className = 'section-kicker settled-title';
		title.textContent = 'Quitados recentemente';
		list.append(title, ...settled.map((debt) => {
			const row = document.createElement('div');
			row.className = 'debt-item settled';
			const info = document.createElement('span');
			info.textContent = `${debt.person} · ${debt.description} · ${currencyFormatter.format(debt.amount)}`;
			row.append(info);
			return row;
		}));
	}
}

async function settleDebt(debt) {
	const isReceivable = debt.direction === 'receivable';
	try {
		await updateDoc(userDocument('debts', debt.id), { settled: true, settledAt: new Date().toISOString() });
		// Recording the money that came in (or went out) keeps the available balance correct.
		const reference = await addDoc(collection(database, 'users', auth.currentUser.uid, 'transactions'), {
			description: isReceivable ? `Reembolso de ${debt.person}: ${debt.description}` : `Pagamento a ${debt.person}: ${debt.description}`,
			amount: debt.amount,
			type: isReceivable ? 'income' : 'expense',
			category: 'Outros',
			accountId: '',
			tags: [isReceivable ? 'reembolso' : 'divisão'],
			notes: '',
			transactionDate: getToday(),
			status: 'paid',
			debtId: debt.id,
			createdAt: new Date().toISOString()
		});
		await showToast(`${debt.person} ${isReceivable ? 'te pagou' : 'foi pago'}: ${currencyFormatter.format(debt.amount)} registrado no seu saldo.`, {
			onAction: async () => {
				await updateDoc(userDocument('debts', debt.id), { settled: false, settledAt: deleteField() });
				await deleteDoc(reference);
			},
			onExpire: () => addNotification(isReceivable
				? `Você recebeu ${currencyFormatter.format(debt.amount)} de ${debt.person} (${debt.description}).`
				: `Você pagou ${currencyFormatter.format(debt.amount)} a ${debt.person} (${debt.description}).`, '✓')
		});
	} catch (error) {
		console.error('Erro ao quitar registro:', error);
	}
}

document.querySelector('#add-debt-button').addEventListener('click', () => {
	debtForm.reset();
	debtDirection = 'receivable';
	document.querySelectorAll('.debt-direction').forEach((button) => button.classList.toggle('active', button.dataset.direction === debtDirection));
	debtModal.showModal();
});

document.querySelectorAll('.debt-direction').forEach((button) => button.addEventListener('click', () => {
	debtDirection = button.dataset.direction;
	document.querySelectorAll('.debt-direction').forEach((item) => item.classList.toggle('active', item === button));
}));

debtForm.addEventListener('submit', async (event) => {
	event.preventDefault();
	const person = document.querySelector('#debt-person').value.trim().slice(0, 40);
	const description = document.querySelector('#debt-description').value.trim().slice(0, 80);
	const amount = Number(document.querySelector('#debt-amount').value);
	if (!person || !description || !Number.isFinite(amount) || amount <= 0) return;
	try {
		await addDoc(collection(database, 'users', auth.currentUser.uid, 'debts'), {
			person, description, amount: roundMoney(amount), direction: debtDirection, settled: false,
			date: getToday(), createdAt: new Date().toISOString()
		});
		debtModal.close();
	} catch (error) {
		console.error('Erro ao salvar registro:', error);
	}
});

/* ---------- Monthly retrospective ---------- */

function openRetrospective() {
	const select = document.querySelector('#retrospective-month');
	const currentMonth = getCurrentMonth();
	const months = [...new Set([
		currentMonth,
		...currentTransactions.map((transaction) => getTransactionDate(transaction).slice(0, 7)).filter((month) => month && month <= currentMonth)
	])].sort().reverse().slice(0, 24);
	select.replaceChildren(...months.map((month) => new Option(formatMonthLabel(month), month)));
	const previousMonth = addMonths(currentMonth, -1);
	select.value = months.includes(previousMonth) ? previousMonth : currentMonth;
	renderRetrospective();
	retrospectiveModal.showModal();
}

function createRetroCard(label, amount, className = '') {
	const card = document.createElement('div');
	const title = document.createElement('span');
	const value = document.createElement('strong');
	title.textContent = label;
	value.className = className;
	if (typeof amount === 'number') setMoney(value, amount);
	else value.textContent = amount;
	card.append(title, value);
	return card;
}

function renderRetrospective() {
	const month = document.querySelector('#retrospective-month').value;
	const retro = buildRetrospective(getPlanningContext(), month);
	const content = document.querySelector('#retrospective-content');
	document.querySelector('#retrospective-title').textContent = `Seu ${month === getCurrentMonth() ? 'mês até agora' : 'mês'}: ${formatMonthLabel(month).toLowerCase()}`;
	if (!retro.count && !retro.invested) {
		content.replaceChildren(createEmptyState('Sem lançamentos neste mês.'));
		return;
	}
	const headline = document.createElement('p');
	headline.className = `retro-headline ${retro.saved >= 0 ? 'is-positive' : 'is-negative'}`;
	headline.textContent = retro.saved >= 0
		? `Você fechou no azul e guardou ${Math.round(retro.savingsRate)}% da sua renda. ${retro.savingsRate >= 20 ? 'Excelente!' : 'Dá para chegar aos 20%!'}`
		: `Você gastou ${currencyFormatter.format(-retro.saved)} a mais do que ganhou. Vamos ajustar no próximo mês?`;
	const cards = document.createElement('div');
	cards.className = 'retro-cards';
	cards.append(
		createRetroCard('Receitas', retro.income, 'is-positive'),
		createRetroCard('Despesas', retro.spent, 'is-negative'),
		createRetroCard(retro.saved >= 0 ? 'Sobrou' : 'Faltou', Math.abs(retro.saved), retro.saved >= 0 ? 'is-positive' : 'is-negative'),
		createRetroCard('Investido', retro.invested)
	);
	const highlights = document.createElement('ul');
	highlights.className = 'insight-list';
	const addHighlight = (text) => {
		const item = document.createElement('li');
		item.textContent = text;
		highlights.append(item);
	};
	if (retro.spentChange !== null) {
		addHighlight(retro.spentChange <= 0
			? `Você gastou ${Math.abs(Math.round(retro.spentChange))}% a menos que no mês anterior.`
			: `Você gastou ${Math.round(retro.spentChange)}% a mais que no mês anterior.`);
	}
	if (retro.biggestExpense) addHighlight(`Maior despesa: ${retro.biggestExpense.description} (${currencyFormatter.format(retro.biggestExpense.amount)}).`);
	if (retro.biggestIncrease) addHighlight(`Onde mais aumentou: ${retro.biggestIncrease.name} (+${currencyFormatter.format(retro.biggestIncrease.difference)}).`);
	if (retro.biggestDecrease) addHighlight(`Onde mais economizou: ${retro.biggestDecrease.name} (${currencyFormatter.format(retro.biggestDecrease.difference)}).`);
	addHighlight(`${retro.noSpendDays} dia(s) sem nenhum gasto e ${retro.count} lançamento(s) registrados.`);
	if (retro.goalSavings) addHighlight(`Você guardou ${currencyFormatter.format(retro.goalSavings)} nas suas metas.`);
	if (retro.pendingCount) addHighlight(`${retro.pendingCount} conta(s) deste mês ainda estão pendentes.`);
	const categoriesTitle = document.createElement('p');
	categoriesTitle.className = 'section-kicker';
	categoriesTitle.textContent = 'Para onde foi o dinheiro';
	const categories = document.createElement('ul');
	categories.className = 'category-legend';
	retro.categories.slice(0, 5).forEach((category) => {
		const item = document.createElement('li');
		const dot = document.createElement('i');
		const label = document.createElement('span');
		const amount = document.createElement('strong');
		const change = document.createElement('small');
		dot.style.background = getCategory(category.name).color;
		label.textContent = category.name;
		amount.textContent = currencyFormatter.format(category.value);
		const difference = category.previous ? Math.round(((category.value - category.previous) / category.previous) * 100) : null;
		change.textContent = difference === null ? 'novo' : `${difference > 0 ? '+' : ''}${difference}%`;
		change.className = difference !== null && difference > 0 ? 'is-negative' : 'is-positive';
		item.append(dot, label, amount, change);
		categories.append(item);
	});
	content.replaceChildren(headline, cards, highlights, categoriesTitle, categories);
}

document.querySelector('#open-retrospective-button').addEventListener('click', openRetrospective);
document.querySelector('#retrospective-month').addEventListener('change', renderRetrospective);

/* ---------- Offline indicator ---------- */

function updateOnlineStatus() {
	document.querySelector('#offline-banner').hidden = navigator.onLine;
}

window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);
updateOnlineStatus();

refreshCategorySelects();
renderSimulator();

if ('serviceWorker' in navigator) {
	window.addEventListener('load', () => {
		navigator.serviceWorker.register('sw.js').catch((error) => console.error('Erro ao registrar o service worker:', error));
	});
}
