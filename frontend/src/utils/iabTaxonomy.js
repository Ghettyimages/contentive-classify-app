// utils/iabTaxonomy.js

export function parseIABTSV(tsvText) {
  if (!tsvText || typeof tsvText !== 'string') return [];
  const lines = tsvText.trim().split(/\r?\n/);
  if (lines.length === 0) return [];
  const header = lines.shift().split('\t');
  const findIdx = (re) => header.findIndex((h) => re.test(String(h)));
  const idx = {
    code: findIdx(/\b(IAB\s*Code|Code)\b/i),
    tier: findIdx(/\bTier\b/i),
    name: findIdx(/(IAB\s*Category|Name|Label)/i),
  };
  if (idx.code < 0) return [];
  const rows = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const cols = line.split('\t');
    const code = cols[idx.code]?.trim();
    const tier = parseInt((idx.tier >= 0 ? cols[idx.tier] : '1')?.trim() || '1', 10) || 1;
    const name = (idx.name >= 0 ? cols[idx.name] : '')?.trim() || '';
    if (!code || !name) continue;
    rows.push({ code, tier, name });
  }
  return rows;
}

export function codeKeyParts(code) {
  return String(code)
    .split('-')
    .map((p, i) => (i === 0 ? parseInt(String(p).replace(/IAB/i, ''), 10) : parseInt(p, 10)));
}

export function cmpCodes(a, b) {
  const A = codeKeyParts(a.code || a.value);
  const B = codeKeyParts(b.code || b.value);
  const n = Math.max(A.length, B.length);
  for (let i = 0; i < n; i++) {
    const x = A[i] ?? -1;
    const y = B[i] ?? -1;
    if (x !== y) return x - y;
  }
  return 0;
}

export function buildIABOptions(rows) {
  const byCode = new Map();
  for (const r of rows || []) {
    if (!r?.code) continue;
    byCode.set(r.code, r);
  }
  const dedup = Array.from(byCode.values());
  dedup.sort(cmpCodes);

  // Warn on duplicate Tier-1 names
  try {
    const t1 = dedup.filter((r) => (r.tier || 1) === 1);
    const nameCount = new Map();
    for (const r of t1) {
      const k = (r.name || '').toLowerCase();
      if (!k) continue;
      nameCount.set(k, (nameCount.get(k) || 0) + 1);
    }
    for (const [k, cnt] of nameCount) {
      if (cnt > 1) {
        // eslint-disable-next-line no-console
        console.warn('[IAB] Duplicate Tier-1 name detected:', k, 'count=', cnt);
      }
    }
  } catch (_) { /* noop */ }

  return dedup.map((r) => ({ value: r.code, label: `${r.code} (${r.name})`, code: r.code }));
}