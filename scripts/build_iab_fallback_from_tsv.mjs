// scripts/build_iab_fallback_from_tsv.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const TSV = path.join(projectRoot, 'backend/data/IAB_Content_Taxonomy_3_1.tsv');
const OUT = path.join(projectRoot, 'frontend/src/data/iab_content_taxonomy_3_1.v1.json');

function parseTSV(txt) {
  const lines = txt.split(/\r?\n/);
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (ln.includes('Unique ID') && ln.includes('Parent') && ln.includes('Tier 1')) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) throw new Error('[IAB Fallback] Could not find TSV header row');
  const [header, ...rows] = lines.slice(headerIdx);
  const cols = header.split('\t').map(s => s.trim());
  const idx = name => cols.indexOf(name);
  const iUID = idx('Unique ID');
  const iParent = idx('Parent');
  const iName = idx('Name');
  const iT1 = idx('Tier 1');
  const iT2 = idx('Tier 2');
  const iT3 = idx('Tier 3');
  const iT4 = idx('Tier 4');

  const nodes = rows.map(r => {
    if (!r || !r.trim()) return null;
    const c = r.split('\t');
    const pathArr = [c[iT1], c[iT2], c[iT3], c[iT4]].filter(Boolean);
    const level = pathArr.length || 1;
    const label = c[iName] || pathArr[pathArr.length - 1] || '';
    return {
      uid: c[iUID],
      parent_uid: c[iParent] || null,
      label,
      path: pathArr.length ? pathArr : [label],
      level
    };
  }).filter(n => n && n.uid && n.label);

  // Build tree indexes (uid -> children order) to produce deterministic codes
  const byParent = new Map();
  const roots = [];
  for (const n of nodes) {
    if (!n.parent_uid) roots.push(n);
    const list = byParent.get(n.parent_uid || '__ROOT__') || [];
    list.push(n);
    byParent.set(n.parent_uid || '__ROOT__', list);
  }
  // sort siblings alphabetically by label for stable codes
  for (const [k, list] of byParent.entries()) list.sort((a,b)=>a.label.localeCompare(b.label));

  // Assign codes depth-first with local indices
  const codeByUid = new Map();
  const topRankByUid = new Map();

  roots.sort((a,b)=>a.label.localeCompare(b.label));
  roots.forEach((root, i) => {
    const top = `IAB${i+1}`;
    codeByUid.set(root.uid, top);
    topRankByUid.set(root.uid, i+1);
    assignChildren(root.uid, top);
  });

  function assignChildren(parentUid, parentCode) {
    const kids = byParent.get(parentUid) || [];
    kids.forEach((child, idx) => {
      const topRank = topRankOf(parentUid);
      const code = `${`IAB${topRank}`}-${idx+1}`;
      codeByUid.set(child.uid, code);
      topRankByUid.set(child.uid, topRank);
      assignChildren(child.uid, code);
    });
  }

  function topRankOf(uid) {
    let p = uid;
    while (true) {
      const parent = nodes.find(n => n.uid === p)?.parent_uid;
      if (!parent) return topRankByUid.get(p);
      p = parent;
    }
  }

  const codes = nodes.map(n => ({
    code: codeByUid.get(n.uid),
    label: n.label,
    path: n.path,
    level: n.level,
    parent: (() => {
      if (!n.parent_uid) return null;
      return codeByUid.get(n.parent_uid) || null;
    })()
  }));

  return codes;
}

const tsv = fs.readFileSync(TSV, 'utf8');
const codes = parseTSV(tsv);
if (!codes.length || codes.length < 200) {
  console.error(`[IAB Fallback] Too few codes: ${codes.length}`);
  process.exit(1);
}
const out = { version: '3.1', source: 'fallback', codes };
fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log(`[IAB Fallback] Wrote ${codes.length} codes to ${OUT}`);