import { normalizeText } from './utils.js';

export function escapeCsvText(value) {
	let text = String(value ?? '');
	// Prevents spreadsheet formula injection when the file is opened in Excel.
	if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
	return `"${text.replace(/"/g, '""')}"`;
}

export function splitCsvLine(line, separator) {
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

export function parseImportDate(value) {
	const brazilianDate = value.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
	if (brazilianDate) return `${brazilianDate[3]}-${brazilianDate[2]}-${brazilianDate[1]}`;
	return value.match(/^\d{4}-\d{2}-\d{2}/)?.[0] || '';
}

export function parseImportAmount(value) {
	let text = value.replace(/[^\d,.-]/g, '');
	if (text.includes(',')) text = text.replace(/\./g, '').replace(',', '.');
	return Number(text);
}

export function parseCsv(text) {
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

export function parseOfx(text) {
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

export function assignImportIds(rows) {
	const occurrences = new Map();
	return rows.map((row) => {
		const baseId = (row.importId || `csv-${row.date}-${row.amount}-${normalizeText(row.description)}`).slice(0, 140);
		const count = (occurrences.get(baseId) || 0) + 1;
		occurrences.set(baseId, count);
		return { ...row, importId: count > 1 ? `${baseId}-${count}` : baseId };
	});
}
