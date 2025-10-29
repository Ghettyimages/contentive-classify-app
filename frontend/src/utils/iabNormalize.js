export function normalizeIabCodes(raw) {
	const map = new Map();
	for (const x of (Array.isArray(raw) ? raw : [])) {
		const code = String(x?.code || '').trim();
		const label = String(x?.label || x?.name || '').trim();
		const level = Number(x?.level) || 1;
		const parent = String(x?.parent || '').trim();
		if (!code || !label) continue;
		map.set(code, { code, label, level, parent });
	}
	const out = [...map.values()];
	const key = (c) => {
		const parts = c.code.slice(3).split('-').map(p => (/^\d+$/.test(p) ? Number(p) : p));
		return [JSON.stringify(parts), c.label.toLowerCase()];
	};
	out.sort((a, b) => {
		const [pa, la] = key(a);
		const [pb, lb] = key(b);
		const cmp = pa.localeCompare(pb, undefined, { numeric: true });
		return cmp || la.localeCompare(lb);
	});
	return out;
}