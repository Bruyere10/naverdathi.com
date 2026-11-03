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
	addDoc,
	collection,
	deleteDoc,
	doc,
	deleteField,
	getDoc,
	getFirestore,
	increment,
	onSnapshot,
	orderBy,
	query,
	setDoc,
	updateDoc,
	writeBatch
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

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
const database = getFirestore(app);
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

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
	style: 'currency',
	currency: 'BRL'
});

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

function toDateKey(date) {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function getToday() {
	return toDateKey(new Date());
}

function getCurrentMonth() {
	return getToday().slice(0, 7);
}

function addMonths(monthKey, amount) {
	const [year, month] = monthKey.split('-').map(Number);
	return toDateKey(new Date(year, month - 1 + amount, 1)).slice(0, 7);
}

function getDaysInMonth(monthKey) {
	const [year, month] = monthKey.split('-').map(Number);
	return new Date(year, month, 0).getDate();
}

function dateInMonth(monthKey, day) {
	return `${monthKey}-${String(Math.min(day, getDaysInMonth(monthKey))).padStart(2, '0')}`;
}

function daysBetween(fromDate, toDate) {
	return Math.round((new Date(`${toDate}T12:00:00`) - new Date(`${fromDate}T12:00:00`)) / 86400000);
}

function formatMonthLabel(monthKey) {
	const label = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date(`${monthKey}-01T12:00:00`));
	return label.charAt(0).toUpperCase() + label.slice(1);
}

function normalizeText(text) {
	return String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function sumAmounts(items) {
	return items.reduce((total, item) => total + Number(item.amount || 0), 0);
}

function sumByType(items, type) {
	return sumAmounts(items.filter((item) => item.type === type));
}

function isPaid(transaction) {
	return transaction.status !== 'pending';
}

function isTransfer(transaction) {
	return transaction.type === 'transfer';
}

function getMonthTransactions(monthKey) {
	return currentTransactions.filter((transaction) => !isTransfer(transaction) && getTransactionDate(transaction).startsWith(monthKey));
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

function parseTags(value) {
	return [...new Set(value.split(',').map((tag) => tag.trim().replace(/^#/, '').slice(0, 20)).filter(Boolean))].slice(0, 8);
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
}

function updateTransactionFormFields() {
	const isTransferType = transactionType === 'transfer';
	document.querySelectorAll('.type-option').forEach((button) => {
		button.classList.toggle('active', button.dataset.type === transactionType);
	});
	transactionForm.querySelector('[data-field="category"]').hidden = isTransferType;
	transactionForm.querySelector('[data-field="account"]').hidden = isTransferType;
	transactionForm.querySelector('[data-field="transfer"]').hidden = !isTransferType;
	transactionForm.querySelector('[data-field="paid"]').hidden = isTransferType;
	transactionForm.querySelector('[data-field="new-only"]').hidden = Boolean(editingTransactionId) || isTransferType;
	transactionForm.querySelector('[data-field="installments"]').hidden = transactionType !== 'expense';
	updateInstallmentHint();
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

document.querySelectorAll('.type-option').forEach((button) => {
	button.addEventListener('click', () => {
		transactionType = button.dataset.type;
		updateTransactionFormFields();
	});
});

document.querySelector('#transaction-installments').addEventListener('input', updateInstallmentHint);
document.querySelector('#transaction-amount').addEventListener('input', updateInstallmentHint);

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
	// Calculated before saving because the snapshot listener may already include the new transaction.
	const budgetAlert = getBudgetAlert({ ...transactionData, amount: amount / installments }, editingTransactionId);
	const transactionsCollection = collection(database, 'users', auth.currentUser.uid, 'transactions');
	errorMessage.textContent = '';

	try {
		if (editingTransactionId) {
			await updateDoc(doc(transactionsCollection, editingTransactionId), transactionData);
			await addNotification(`Você editou ${description}.`, '✎');
		} else if (installments > 1) {
			await saveInstallments(transactionData, installments);
			await addNotification(`Você parcelou ${description} em ${installments}x de ${currencyFormatter.format(amount / installments)}.`, '↑');
		} else {
			await addDoc(transactionsCollection, { ...transactionData, createdAt: new Date().toISOString() });
			if (isRecurring) {
				await addDoc(collection(database, 'users', auth.currentUser.uid, 'recurring'), {
					description, amount, tags, notes,
					type: transactionData.type,
					category: transactionData.category,
					accountId: transactionData.accountId,
					dayOfMonth: Number(transactionDate.slice(8)),
					lastGeneratedMonth: transactionDate.slice(0, 7),
					createdAt: new Date().toISOString()
				});
			}
			const typeLabel = { income: 'receita', expense: 'despesa', transfer: 'transferência' }[transactionType];
			const symbol = { income: '↓', expense: '↑', transfer: '⇄' }[transactionType];
			await addNotification(`Você adicionou ${description} como ${typeLabel}${isRecurring ? ' fixa' : ''}.`, symbol);
		}
		if (budgetAlert) await addNotification(budgetAlert, '!');
		modal.close();
	} catch (error) {
		console.error('Erro ao salvar lançamento:', error);
		errorMessage.textContent = 'Não foi possível salvar o lançamento. Tente novamente.';
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
	document.querySelector('#auth-kicker').textContent = registrationMode ? 'COMECE AGORA' : 'BEM-VINDO DE VOLTA';
	document.querySelector('#auth-title').textContent = registrationMode ? 'Crie sua conta' : 'Entre na sua conta';
	document.querySelector('#auth-subtitle').textContent = registrationMode ? 'Leva menos de um minuto.' : 'Acompanhe sua vida financeira.';
	document.querySelector('#auth-submit').textContent = registrationMode ? 'Criar conta' : 'Entrar';
	document.querySelector('#forgot-password-button').hidden = registrationMode;
	document.querySelector('#auth-switch').innerHTML = registrationMode
		? 'Já possui uma conta? <button type="button" id="auth-mode-toggle">Entrar</button>'
		: 'Ainda não possui uma conta? <button type="button" id="auth-mode-toggle">Criar conta</button>';
	document.querySelector('#auth-mode-toggle').addEventListener('click', () => setAuthenticationMode(!isRegistrationMode));
	authError.textContent = '';
}

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

function formatTransactionDate(isoDate) {
	if (!isoDate) return 'Agora';
	// Plain YYYY-MM-DD strings are parsed as UTC, which would shift the day in Brazil.
	const date = isoDate.length === 10 ? new Date(`${isoDate}T12:00:00`) : new Date(isoDate);
	return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' })
		.format(date)
		.replace('.', '');
}

function getTransactionDate(transaction) {
	return transaction.transactionDate || transaction.createdAt?.slice(0, 10) || '';
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
			? `${getAccount(transaction.fromAccountId)?.name || 'Conta removida'} → ${getAccount(transaction.toAccountId)?.name || 'Conta removida'}`
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
	actions.append(
		createActionButton('⧉', 'Duplicar lançamento', () => {
			resetTransactionForm({
				...transaction,
				id: undefined,
				transactionDate: getToday(),
				description: transaction.description.replace(/ \(\d+\/\d+\)$/, '')
			});
			modal.showModal();
		}),
		createActionButton('✎', 'Editar lançamento', () => {
			resetTransactionForm(transaction);
			modal.showModal();
		}),
		createActionButton('×', 'Excluir lançamento', () => openDeleteConfirmation(
			`Você deseja excluir o lançamento "${transaction.description}"? Essa ação não pode ser desfeita.`,
			async () => {
				await deleteDoc(doc(database, 'users', auth.currentUser.uid, 'transactions', transaction.id));
				await addNotification(`Você excluiu ${transaction.description}.`, '×');
			}
		), true)
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
		createActionButton('×', 'Excluir meta', () => openDeleteConfirmation(
			`Você deseja excluir a meta "${goal.title}"? Essa ação não pode ser desfeita.`,
			async () => {
				await deleteDoc(doc(database, 'users', auth.currentUser.uid, 'goals', goal.id));
				await addNotification(`Você excluiu a meta ${goal.title}.`, '×');
			}
		), true)
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
	deleteButton.addEventListener('click', () => openDeleteConfirmation(
		`Você deseja excluir o aporte em "${investment.name}"? O valor voltará ao seu saldo disponível.`,
		async () => {
			await deleteDoc(doc(database, 'users', auth.currentUser.uid, 'investments', investment.id));
			await addNotification(`Você excluiu o aporte em ${investment.name}.`, '×');
		}
	));
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
	const budgetLimit = monthlyIncome;
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
	// Balance only counts paid, non-future movements; transfers just move money between accounts.
	const settled = transactions.filter((transaction) => !isTransfer(transaction) && isPaid(transaction) && getTransactionDate(transaction) <= today);
	const monthTransactions = getMonthTransactions(getCurrentMonth());
	const balance = monthlyIncome + sumByType(settled, 'income') - sumByType(settled, 'expense') - sumAmounts(investments);
	const pendingTotal = sumAmounts(transactions.filter((transaction) => transaction.type === 'expense' && !isPaid(transaction)));

	setMoney(document.querySelector('#balance-amount'), balance);
	setMoney(document.querySelector('#income-amount'), monthlyIncome + sumByType(monthTransactions, 'income'));
	setMoney(document.querySelector('#expense-amount'), sumByType(monthTransactions, 'expense'));
	document.querySelector('#balance-description').textContent = monthlyIncome
		? `Renda mensal: ${currencyFormatter.format(monthlyIncome)}${pendingTotal ? ` · A pagar: ${currencyFormatter.format(pendingTotal)}` : ''}`
		: 'Adicione sua renda mensal';
	renderFinancialVisuals(transactions);
	updateMonthFilter(transactions);
	renderCategoryChart();
	renderCategoryBudgets();
	renderHistory();
	renderBills();
	renderAccounts();
	renderIndicators();
	renderTransactionList();
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
		refreshCategorySelects();
		updateUserInterface(user);
		if (!monthlyIncome && !salaryModal.open) salaryModal.showModal();
		stopAccountListener = onSnapshot(query(
			collection(database, 'users', user.uid, 'accounts'),
			orderBy('createdAt', 'asc')
		), (snapshot) => {
			accounts = snapshot.docs.map((account) => ({ id: account.id, ...account.data() }));
			populateAccountSelects();
			renderDashboard(currentTransactions);
		});
		const transactionsQuery = query(
			collection(database, 'users', user.uid, 'transactions'),
			orderBy('createdAt', 'desc')
		);
		stopTransactionListener = onSnapshot(transactionsQuery, (snapshot) => {
			const transactions = snapshot.docs.map((transaction) => ({ id: transaction.id, ...transaction.data() }));
			renderDashboard(transactions);
			notifyDueBills(transactions);
		});
		stopRecurringListener = onSnapshot(query(
			collection(database, 'users', user.uid, 'recurring'),
			orderBy('createdAt', 'desc')
		), (snapshot) => {
			recurringItems = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
			renderRecurring();
			generateRecurringTransactions();
		});
		const investmentsQuery = query(
			collection(database, 'users', user.uid, 'investments'),
			orderBy('createdAt', 'desc')
		);
		stopInvestmentListener = onSnapshot(investmentsQuery, (snapshot) => {
			investments = snapshot.docs.map((investment) => ({ id: investment.id, ...investment.data() }));
			renderInvestments();
		});
		const goalsQuery = query(
			collection(database, 'users', user.uid, 'goals'),
			orderBy('createdAt', 'desc')
		);
		stopGoalListener = onSnapshot(goalsQuery, (snapshot) => {
			const goals = snapshot.docs.map((goal) => ({ id: goal.id, ...goal.data() }));
			renderGoals(goals);
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

document.querySelector('#logout-button').addEventListener('click', () => signOut(auth));

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
	for (let index = 0; index < count; index += 1) {
		const transactionDate = dateInMonth(addMonths(firstMonth, index), day);
		batch.set(doc(transactionsCollection), {
			...transactionData,
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
	const today = getToday();
	for (const transaction of transactions) {
		if (transaction.type !== 'expense' || isPaid(transaction)) continue;
		const days = daysBetween(today, getTransactionDate(transaction));
		const level = days < 0 ? 'overdue' : days <= 3 ? 'soon' : '';
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
	const firstMonth = currentTransactions.map(getTransactionDate).filter(Boolean).sort()[0]?.slice(0, 7) || currentMonth;
	const months = Array.from({ length: 6 }, (_, index) => addMonths(currentMonth, index - 5));
	const data = months.map((month) => {
		const monthTransactions = getMonthTransactions(month);
		return {
			month,
			income: (month >= firstMonth ? monthlyIncome : 0) + sumByType(monthTransactions, 'income'),
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
	const scheduled = sumAmounts(monthExpenses.filter((transaction) => getTransactionDate(transaction) > today));
	const monthIncome = monthlyIncome + sumByType(monthTransactions, 'income');
	const monthInvestments = sumAmounts(getInvestmentsInMonth(month));
	const projectedExpenses = Math.max(spentSoFar + scheduled, (spentSoFar / day) * getDaysInMonth(month));
	const forecast = monthIncome - projectedExpenses - monthInvestments;
	const forecastElement = document.querySelector('#forecast-amount');
	setMoney(forecastElement, forecast);
	forecastElement.classList.toggle('is-negative', forecast < 0);
	forecastElement.classList.toggle('is-positive', forecast >= 0);
	document.querySelector('#forecast-description').textContent = monthIncome || spentSoFar
		? `No ritmo atual (${currencyFormatter.format(spentSoFar / day)} por dia), contando contas já agendadas.`
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
		return transaction.type === 'expense' && date > start && date <= end;
	}));
	const lastWeek = expenseBetween(sevenDaysAgo, today);
	const weekBefore = expenseBetween(fourteenDaysAgo, sevenDaysAgo);
	if (lastWeek && weekBefore) {
		insights.push(`Nos últimos 7 dias você gastou ${currencyFormatter.format(lastWeek)}, ${lastWeek > weekBefore ? 'mais' : 'menos'} que nos 7 dias anteriores (${currencyFormatter.format(weekBefore)}).`);
	}

	const monthIncome = monthlyIncome + sumByType(getMonthTransactions(month), 'income');
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
		details.textContent = `${item.category} · todo dia ${item.dayOfMonth}`;
		value.className = `bill-value ${item.type === 'income' ? 'income-value' : 'expense-value'}`;
		value.textContent = `${item.type === 'income' ? '+' : '-'} ${currencyFormatter.format(item.amount)}`;
		info.append(title, details);
		row.append(info, value, createActionButton('×', 'Parar de repetir', () => openDeleteConfirmation(
			`Parar de repetir "${item.description}"? Os lançamentos já criados serão mantidos.`,
			async () => {
				await deleteDoc(doc(database, 'users', auth.currentUser.uid, 'recurring', item.id));
				await addNotification(`${item.description} não será mais lançado automaticamente.`, '×');
			}
		), true));
		list.append(row);
	});
}

function getAccountBalance(account) {
	const today = getToday();
	return currentTransactions.reduce((balance, transaction) => {
		if (getTransactionDate(transaction) > today || !isPaid(transaction)) return balance;
		if (isTransfer(transaction)) {
			if (transaction.toAccountId === account.id) return balance + transaction.amount;
			if (transaction.fromAccountId === account.id) return balance - transaction.amount;
			return balance;
		}
		if (transaction.accountId !== account.id) return balance;
		return balance + (transaction.type === 'income' ? transaction.amount : -transaction.amount);
	}, Number(account.initialBalance) || 0);
}

function getCardSummary(account) {
	const today = getToday();
	const closingDay = Number(account.closingDay) || 1;
	const dueDay = Number(account.dueDay) || 10;
	const currentMonth = getCurrentMonth();
	const closingMonth = Number(today.slice(8)) > closingDay ? addMonths(currentMonth, 1) : currentMonth;
	const cycleEnd = dateInMonth(closingMonth, closingDay);
	const cycleStart = dateInMonth(addMonths(closingMonth, -1), closingDay);
	const dueDate = dateInMonth(dueDay > closingDay ? closingMonth : addMonths(closingMonth, 1), dueDay);
	const cardExpenses = currentTransactions.filter((transaction) => transaction.type === 'expense' && transaction.accountId === account.id);
	const payments = sumAmounts(currentTransactions.filter((transaction) => isTransfer(transaction) && transaction.toAccountId === account.id));
	const invoice = sumAmounts(cardExpenses.filter((transaction) => {
		const date = getTransactionDate(transaction);
		return date > cycleStart && date <= cycleEnd;
	}));
	const used = Math.max(0, sumAmounts(cardExpenses) - payments);
	const limit = Number(account.limit) || 0;
	return { invoice, dueDate, used, limit, available: limit - used };
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
			const summary = getCardSummary(account);
			const bar = document.createElement('i');
			const fill = document.createElement('b');
			const detail = document.createElement('small');
			label.textContent = 'Fatura atual';
			setMoney(value, summary.invoice);
			bar.className = 'mini-progress';
			fill.style.width = `${summary.limit ? Math.min(100, (summary.used / summary.limit) * 100) : 0}%`;
			bar.append(fill);
			detail.textContent = `Vence em ${formatTransactionDate(summary.dueDate)} · Limite disponível: ${currencyFormatter.format(summary.available)}`;
			card.append(label, value, bar, detail);
		} else {
			label.textContent = 'Saldo atual';
			setMoney(value, getAccountBalance(account));
			card.append(label, value);
		}
		grid.append(card);
	});
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

function clampDay(value, fallback) {
	return Math.min(31, Math.max(1, Math.floor(Number(value)) || fallback));
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

function escapeCsvText(value) {
	let text = String(value ?? '');
	// Prevents spreadsheet formula injection when the file is opened in Excel.
	if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
	return `"${text.replace(/"/g, '""')}"`;
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

function splitCsvLine(line, separator) {
	const cells = [];
	let cell = '';
	let quoted = false;
	for (let index = 0; index < line.length; index += 1) {
		const character = line[index];
		if (character === '"') {
			if (quoted && line[index + 1] === '"') {
				cell += '"';
				index += 1;
			} else {
				quoted = !quoted;
			}
		} else if (character === separator && !quoted) {
			cells.push(cell.trim());
			cell = '';
		} else {
			cell += character;
		}
	}
	cells.push(cell.trim());
	return cells;
}

function parseImportDate(value) {
	const brazilianDate = value.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
	if (brazilianDate) return `${brazilianDate[3]}-${brazilianDate[2]}-${brazilianDate[1]}`;
	return value.match(/^\d{4}-\d{2}-\d{2}/)?.[0] || '';
}

function parseImportAmount(value) {
	let text = value.replace(/[^\d,.-]/g, '');
	if (text.includes(',')) text = text.replace(/\./g, '').replace(',', '.');
	return Number(text);
}

function parseCsv(text) {
	const lines = text.split(/\r?\n/).filter((line) => line.trim());
	if (!lines.length) return [];
	const separator = lines[0].includes(';') ? ';' : ',';
	const header = splitCsvLine(lines[0], separator).map(normalizeText);
	const findColumn = (names) => header.findIndex((column) => names.some((name) => column.includes(name)));
	let dateIndex = findColumn(['data', 'date']);
	let amountIndex = findColumn(['valor', 'amount', 'value', 'quantia']);
	let descriptionIndex = findColumn(['descri', 'histori', 'lancamento', 'memo', 'title', 'titulo', 'estabelecimento']);
	const hasHeader = dateIndex >= 0 && amountIndex >= 0;
	if (!hasHeader) {
		dateIndex = 0;
		descriptionIndex = 1;
		amountIndex = 2;
	}
	if (descriptionIndex < 0) descriptionIndex = header.findIndex((_, index) => index !== dateIndex && index !== amountIndex);
	return lines.slice(hasHeader ? 1 : 0).map((line) => {
		const cells = splitCsvLine(line, separator);
		return {
			date: parseImportDate(cells[dateIndex] || ''),
			description: (cells[descriptionIndex] || '').slice(0, 80) || 'Lançamento importado',
			amount: parseImportAmount(cells[amountIndex] || '')
		};
	});
}

function parseOfx(text) {
	return [...text.matchAll(/<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi)].map(([, block]) => {
		const field = (name) => block.match(new RegExp(`<${name}>([^<\\r\\n]*)`, 'i'))?.[1].trim() || '';
		const rawDate = field('DTPOSTED');
		const fitId = field('FITID');
		return {
			date: rawDate ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}` : '',
			description: (field('MEMO') || field('NAME') || 'Lançamento importado').slice(0, 80),
			amount: Number(field('TRNAMT').replace(',', '.')),
			importId: fitId ? `ofx-${fitId}` : ''
		};
	});
}

function assignImportIds(rows) {
	const occurrences = new Map();
	return rows.map((row) => {
		const baseId = (row.importId || `csv-${row.date}-${row.amount}-${normalizeText(row.description)}`).slice(0, 140);
		const count = (occurrences.get(baseId) || 0) + 1;
		occurrences.set(baseId, count);
		return { ...row, importId: count > 1 ? `${baseId}-${count}` : baseId };
	});
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

refreshCategorySelects();
renderSimulator();

if ('serviceWorker' in navigator) {
	window.addEventListener('load', () => {
		navigator.serviceWorker.register('sw.js').catch((error) => console.error('Erro ao registrar o service worker:', error));
	});
}
