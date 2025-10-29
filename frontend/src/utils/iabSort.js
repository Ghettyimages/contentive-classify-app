export function codeKeyParts(code) {
	return String(code)
		.split('-')
		.map((p, i) => (i === 0 ? parseInt(String(p).replace('IAB', ''), 10) : parseInt(p, 10)));
}

export function sortByIabCode(a, b) {
	const A = codeKeyParts(a.code || a.value);
	const B = codeKeyParts(b.code || b.value);
	for (let i = 0; i < Math.max(A.length, B.length); i++) {
		const x = A[i] ?? -1;
		const y = B[i] ?? -1;
		if (x !== y) return x - y;
	}
	return 0;
}