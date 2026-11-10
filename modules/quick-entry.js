import { addDays, normalizeText, stripInstallmentSuffix } from './utils.js';

const incomeKeywords = ['recebi', 'recebido', 'salario', 'receita', 'reembolso', 'freela', 'freelance', 'pix recebido', 'rendimento', 'bonus', 'venda'];
const fillerWords = new Set(['r$', 'reais', 'real', 'de', 'no', 'na', 'em', 'com', 'gastei', 'paguei', 'comprei']);

export const categoryKeywords = {
	'Alimentação': ['mercado', 'supermercado', 'ifood', 'restaurante', 'lanche', 'padaria', 'pizza', 'almoco', 'jantar', 'cafe', 'acougue', 'feira', 'hortifruti', 'delivery', 'rappi', 'sorvete', 'hamburguer', 'comida'],
	'Transporte': ['uber', '99', 'gasolina', 'combustivel', 'posto', 'onibus', 'metro', 'estacionamento', 'pedagio', 'taxi', 'passagem', 'oficina', 'ipva', 'etanol', 'trem'],
	'Moradia': ['aluguel', 'condominio', 'luz', 'energia', 'agua', 'internet', 'gas', 'iptu', 'reforma', 'faxina', 'moveis'],
	'Lazer': ['cinema', 'netflix', 'spotify', 'show', 'bar', 'viagem', 'hotel', 'teatro', 'disney', 'hbo', 'prime video', 'balada', 'praia', 'festa'],
	'Estudo': ['curso', 'livro', 'faculdade', 'escola', 'udemy', 'alura', 'mensalidade', 'apostila', 'material escolar'],
	'Jogos': ['steam', 'playstation', 'psn', 'xbox', 'jogo', 'nintendo', 'game', 'ps plus', 'game pass'],
	'Trabalho': ['salario', 'freela', 'freelance', 'cliente', 'coworking', 'notebook'],
	'Metas': ['meta', 'reserva', 'poupanca']
};

export const subscriptionKeywords = ['netflix', 'spotify', 'prime video', 'amazon prime', 'disney', 'hbo', 'youtube premium', 'deezer', 'globoplay', 'apple music', 'apple tv', 'icloud', 'google one', 'game pass', 'ps plus', 'chatgpt', 'paramount', 'crunchyroll', 'academia', 'smart fit', 'assinatura'];

function matchesKeyword(normalized, keyword) {
	return new RegExp(`(^|[^a-z0-9])${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`).test(normalized);
}

export function looksLikeSubscription(description) {
	const normalized = normalizeText(description);
	return subscriptionKeywords.some((keyword) => matchesKeyword(normalized, keyword));
}

function parseMoney(token) {
	const cleaned = token.replace(/^r\$/i, '');
	if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+([.,]\d{1,2})?$/.test(cleaned)) return NaN;
	if (cleaned.includes(',')) return Number(cleaned.replace(/\./g, '').replace(',', '.'));
	// "1.500" is thousands in pt-BR, while "15.90" is a decimal.
	if (/^\d{1,3}(\.\d{3})+$/.test(cleaned)) return Number(cleaned.replace(/\./g, ''));
	return Number(cleaned);
}

function parseDateToken(token, today) {
	const normalized = normalizeText(token);
	if (normalized === 'hoje') return today;
	if (normalized === 'ontem') return addDays(today, -1);
	if (normalized === 'anteontem') return addDays(today, -2);
	if (normalized === 'amanha') return addDays(today, 1);
	const match = token.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/);
	if (!match) return '';
	const day = Number(match[1]);
	const month = Number(match[2]);
	let year = match[3] ? Number(match[3]) : Number(today.slice(0, 4));
	if (year < 100) year += 2000;
	if (month < 1 || month > 12 || day < 1 || day > 31) return '';
	const date = new Date(year, month - 1, day);
	if (date.getMonth() !== month - 1) return '';
	return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// Parses free text like "mercado 50", "uber 23,90 ontem", "+ salário 3000" or "tv 1200 10x".
export function parseQuickEntry(text, today) {
	let input = String(text || '').trim();
	if (!input) return null;
	let type = 'expense';
	if (/^\+/.test(input)) {
		type = 'income';
		input = input.replace(/^\+\s*/, '');
	} else if (/^-/.test(input)) {
		input = input.replace(/^-\s*/, '');
	}
	const tokens = input.split(/\s+/);
	let amount = NaN;
	let amountIndex = -1;
	let date = '';
	let installments = 1;
	const used = new Set();
	tokens.forEach((token, index) => {
		const installmentMatch = token.match(/^(\d{1,2})x$/i);
		if (installmentMatch && Number(installmentMatch[1]) >= 1) {
			installments = Math.min(60, Number(installmentMatch[1]));
			used.add(index);
			return;
		}
		const parsedDate = parseDateToken(token, today);
		if (parsedDate) {
			date = parsedDate;
			used.add(index);
		}
	});
	for (let index = tokens.length - 1; index >= 0; index -= 1) {
		if (used.has(index)) continue;
		const token = tokens[index];
		if (/^r\$$/i.test(token) && tokens[index + 1]) continue;
		const value = parseMoney(token);
		if (Number.isFinite(value) && value > 0) {
			amount = value;
			amountIndex = index;
			used.add(index);
			if (index > 0 && /^r\$$/i.test(tokens[index - 1])) used.add(index - 1);
			break;
		}
	}
	if (!Number.isFinite(amount)) return null;
	const descriptionTokens = tokens.filter((token, index) => !used.has(index) && !fillerWords.has(normalizeText(token)));
	const normalizedDescription = normalizeText(descriptionTokens.join(' '));
	if (type === 'expense' && incomeKeywords.some((keyword) => matchesKeyword(normalizedDescription, keyword))) type = 'income';
	let description = descriptionTokens.join(' ').trim().slice(0, 80);
	if (!description) description = type === 'income' ? 'Receita' : 'Despesa';
	description = description.charAt(0).toUpperCase() + description.slice(1);
	return {
		description,
		amount: Math.round(amount * 100) / 100,
		type,
		date: date || today,
		installments: type === 'expense' ? installments : 1,
		amountIndex
	};
}

// Learns from the user's history first, then falls back to keyword rules.
export function suggestCategory(description, transactions, categoryNames) {
	const normalized = normalizeText(stripInstallmentSuffix(description)).trim();
	if (!normalized) return '';
	const available = new Set(categoryNames);
	const counts = new Map();
	const firstWord = normalized.split(/\s+/)[0];
	transactions.forEach((transaction) => {
		if (transaction.type === 'transfer' || !available.has(transaction.category)) return;
		const previous = normalizeText(stripInstallmentSuffix(transaction.description)).trim();
		let score = 0;
		if (previous === normalized) score = 3;
		else if (firstWord.length >= 3 && previous.split(/\s+/)[0] === firstWord) score = 1;
		if (score) counts.set(transaction.category, (counts.get(transaction.category) || 0) + score);
	});
	if (counts.size) return [...counts].sort((first, second) => second[1] - first[1])[0][0];
	for (const [category, keywords] of Object.entries(categoryKeywords)) {
		if (available.has(category) && keywords.some((keyword) => matchesKeyword(normalized, keyword))) return category;
	}
	return '';
}
