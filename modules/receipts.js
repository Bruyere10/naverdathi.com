const maxReceiptBytes = 900 * 1024;

function readAsDataUrl(file) {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
		reader.onload = () => resolve(reader.result);
		reader.readAsDataURL(file);
	});
}

function loadImage(source) {
	return new Promise((resolve, reject) => {
		const image = new Image();
		image.onerror = () => reject(new Error('Não foi possível carregar a imagem.'));
		image.onload = () => resolve(image);
		image.src = source;
	});
}

// Receipts are stored in Firestore (1 MB per document), so images are compressed until they fit.
export async function prepareReceipt(file) {
	if (!file) return null;
	const name = file.name.slice(0, 80);
	if (file.type === 'application/pdf') {
		if (file.size > 650 * 1024) throw new Error('O PDF deve ter no máximo 650 KB. Tire uma foto ou compacte o arquivo.');
		return { name, type: file.type, data: await readAsDataUrl(file) };
	}
	if (!file.type.startsWith('image/')) throw new Error('Envie uma imagem (JPG, PNG, WEBP) ou um PDF.');
	if (file.size > 15 * 1024 * 1024) throw new Error('A imagem é muito grande (máximo de 15 MB).');
	const image = await loadImage(await readAsDataUrl(file));
	for (const [maximumSize, quality] of [[1600, 0.72], [1200, 0.65], [900, 0.6], [700, 0.5]]) {
		const scale = Math.min(1, maximumSize / Math.max(image.width, image.height));
		const canvas = document.createElement('canvas');
		canvas.width = Math.round(image.width * scale);
		canvas.height = Math.round(image.height * scale);
		canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
		const data = canvas.toDataURL('image/webp', quality);
		if (data.length <= maxReceiptBytes) return { name, type: data.startsWith('data:image/webp') ? 'image/webp' : 'image/png', data };
	}
	throw new Error('Não foi possível compactar a imagem. Tente uma foto menor.');
}

export function dataUrlToObjectUrl(dataUrl) {
	const [header, base64] = dataUrl.split(',');
	const type = header.match(/data:([^;]+)/)?.[1] || 'application/octet-stream';
	const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
	return URL.createObjectURL(new Blob([bytes], { type }));
}
