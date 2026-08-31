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
	onSnapshot,
	orderBy,
	query,
	setDoc,
	updateDoc
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

function getCategoryIcon(category) {
	const icons = { Alimentação: '⌁', Moradia: '⌂', Transporte: '↗', Lazer: '✦', Estudo: '✎', Jogos: '◈', Trabalho: '▣', Outros: '◇' };
	return icons[category] || '◇';
}

function resetTransactionForm(transaction) {
	transactionForm.reset();
	editingTransactionId = transaction?.id;
	transactionType = transaction?.type || 'expense';
	document.querySelector('#transaction-description').value = transaction?.description || '';
	document.querySelector('#transaction-amount').value = transaction?.amount || '';
	document.querySelector('#transaction-category').value = transaction?.category || 'Alimentação';
	document.querySelector('#transaction-date').value = transaction?.transactionDate || new Date().toISOString().slice(0, 10);
	document.querySelector('#transaction-modal-kicker').textContent = transaction ? 'EDITAR REGISTRO' : 'NOVO REGISTRO';
	document.querySelector('#transaction-modal-title').textContent = transaction ? 'Editar lançamento' : 'Adicionar lançamento';
	document.querySelector('#transaction-submit-button').textContent = transaction ? 'Salvar alterações' : 'Adicionar lançamento';
	document.querySelectorAll('.type-option').forEach((button) => {
		button.classList.toggle('active', button.dataset.type === transactionType);
	});
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
		document.querySelectorAll('.type-option').forEach((option) => option.classList.toggle('active', option === button));
	});
});

transactionForm.addEventListener('submit', async (event) => {
	event.preventDefault();
	const description = document.querySelector('#transaction-description').value.trim();
	const amount = Number(document.querySelector('#transaction-amount').value);
	const category = document.querySelector('#transaction-category').value;
	const transactionDate = document.querySelector('#transaction-date').value;
	const isIncome = transactionType === 'income';

	if (!description || !Number.isFinite(amount) || amount <= 0) return;

	try {
			const transactionData = { description, amount, category, transactionDate, type: isIncome ? 'income' : 'expense' };
			if (editingTransactionId) {
				await updateDoc(doc(database, 'users', auth.currentUser.uid, 'transactions', editingTransactionId), transactionData);
				await addNotification(`Você editou ${description}.`, '✎');
			} else {
				await addDoc(collection(database, 'users', auth.currentUser.uid, 'transactions'), {
					...transactionData, createdAt: new Date().toISOString()
				});
				await addNotification(`Você adicionou ${description} como ${isIncome ? 'receita' : 'despesa'}.`, isIncome ? '↓' : '↑');
			}
		modal.close();
	} catch (error) {
		console.error('Erro ao salvar lançamento:', error);
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
	return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' })
		.format(new Date(isoDate))
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
	const row = document.createElement('article');
	const icon = document.createElement('div');
	const details = document.createElement('div');
	const description = document.createElement('strong');
	const metadata = document.createElement('span');
	const value = document.createElement('strong');
	const actions = document.createElement('div');
	const editButton = document.createElement('button');
	const deleteButton = document.createElement('button');

	row.className = 'transaction';
	icon.className = `transaction-icon ${isIncome ? 'work' : 'food'}`;
	icon.textContent = getCategoryIcon(transaction.category);
	details.className = 'transaction-info';
	description.textContent = transaction.description;
	metadata.textContent = `${transaction.category} · ${formatTransactionDate(getTransactionDate(transaction))}`;
	value.className = `transaction-value ${isIncome ? 'income-value' : 'expense-value'}`;
	value.textContent = `${isIncome ? '+' : '-'} ${currencyFormatter.format(transaction.amount)}`;
	actions.className = 'item-actions';
	editButton.className = 'item-action';
	editButton.type = 'button';
	editButton.title = 'Editar lançamento';
	editButton.setAttribute('aria-label', 'Editar lançamento');
	editButton.textContent = '✎';
	editButton.addEventListener('click', () => {
		resetTransactionForm(transaction);
		modal.showModal();
	});
	deleteButton.className = 'item-action delete';
	deleteButton.type = 'button';
	deleteButton.title = 'Excluir lançamento';
	deleteButton.setAttribute('aria-label', 'Excluir lançamento');
	deleteButton.textContent = '×';
	deleteButton.addEventListener('click', () => openDeleteConfirmation(
		`Você deseja excluir o lançamento "${transaction.description}"? Essa ação não pode ser desfeita.`,
		async () => {
		await deleteDoc(doc(database, 'users', auth.currentUser.uid, 'transactions', transaction.id));
		await addNotification(`Você excluiu ${transaction.description}.`, '×');
		}
	));
	actions.append(editButton, deleteButton);
	details.append(description, metadata);
	row.append(icon, details, value, actions);
	return row;
}

function resetGoalForm(goal) {
	goalForm.reset();
	editingGoalId = goal?.id;
	document.querySelector('#goal-title').value = goal?.title || '';
	document.querySelector('#goal-target').value = goal?.targetAmount || '';
	document.querySelector('#goal-current').value = goal?.currentAmount || 0;
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
	progress.append(progressLabel, progressBar);
	percentageLabel.textContent = `${percentage}%`;
	actions.className = 'item-actions';
	[['✎', 'Editar meta', () => { resetGoalForm(goal); goalModal.showModal(); }], ['×', 'Excluir meta', () => openDeleteConfirmation(
		`Você deseja excluir a meta "${goal.title}"? Essa ação não pode ser desfeita.`,
		async () => {
			await deleteDoc(doc(database, 'users', auth.currentUser.uid, 'goals', goal.id));
			await addNotification(`Você excluiu a meta ${goal.title}.`, '×');
		}
	)]].forEach(([symbol, label, handler], index) => {
		const button = document.createElement('button');
		button.className = `item-action${index ? ' delete' : ''}`;
		button.type = 'button';
		button.title = label;
		button.setAttribute('aria-label', label);
		button.textContent = symbol;
		button.addEventListener('click', handler);
		actions.append(button);
	});
	row.append(identity, progress, percentageLabel, actions);
	return row;
}

function renderGoals(goals) {
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
	renderDashboard(currentTransactions);
}

function getInvestmentDate(investment) {
	return investment.createdAt?.slice(0, 10) || '';
}

function getMonthKey(date) {
	return date.slice(0, 7);
}

function renderFinancialVisuals(transactions) {
	const currentMonth = new Date().toISOString().slice(0, 7);
	const monthlyTransactions = transactions.filter((transaction) => getTransactionDate(transaction).startsWith(currentMonth));
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
	budgetRing.style.background = `conic-gradient(var(--yellow) 0 ${budgetPercentage}%, #ebf0ed ${budgetPercentage}% 100%)`;
	budgetRing.setAttribute('aria-label', `${budgetPercentage} por cento do orçamento mensal utilizado`);
}

function renderDashboard(transactions) {
	currentTransactions = transactions;
	const transactionIncome = transactions
		.filter((transaction) => transaction.type === 'income')
		.reduce((total, transaction) => total + transaction.amount, 0);
	const expenses = transactions
		.filter((transaction) => transaction.type === 'expense')
		.reduce((total, transaction) => total + transaction.amount, 0);
	const income = monthlyIncome + transactionIncome;
	const totalInvested = investments.reduce((total, investment) => total + investment.amount, 0);
	const balance = income - expenses - totalInvested;
	const amounts = { '#balance-amount': balance, '#income-amount': income, '#expense-amount': expenses };

	Object.entries(amounts).forEach(([selector, amount]) => {
		const element = document.querySelector(selector);
		element.dataset.money = amount;
		element.textContent = valuesVisible ? currencyFormatter.format(amount) : 'R$ ••••••';
	});
	document.querySelector('#balance-description').textContent = monthlyIncome
		? `Renda mensal: ${currencyFormatter.format(monthlyIncome)}`
		: 'Adicione sua renda mensal';
	renderFinancialVisuals(transactions);
	updateMonthFilter(transactions);
	const selectedMonth = transactionMonthFilter.value;
	const filteredTransactions = selectedMonth === 'all'
		? transactions
		: transactions.filter((transaction) => getTransactionDate(transaction).startsWith(selectedMonth));
	transactionList.replaceChildren();
	if (!filteredTransactions.length) {
		const emptyState = document.createElement('p');
		emptyState.className = 'empty-transactions';
		emptyState.textContent = 'Nenhum lançamento registrado ainda.';
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
		updateUserInterface(user);
		if (!monthlyIncome && !salaryModal.open) salaryModal.showModal();
		const transactionsQuery = query(
			collection(database, 'users', user.uid, 'transactions'),
			orderBy('createdAt', 'desc')
		);
		stopTransactionListener = onSnapshot(transactionsQuery, (snapshot) => {
			const transactions = snapshot.docs.map((transaction) => ({ id: transaction.id, ...transaction.data() }));
			renderDashboard(transactions);
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
	if (!title || !Number.isFinite(targetAmount) || targetAmount <= 0 || !Number.isFinite(currentAmount) || currentAmount < 0) return;

	const goalData = { title, targetAmount, currentAmount };
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
	notifications = [];
	investments = [];
	currentTransactions = [];
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
