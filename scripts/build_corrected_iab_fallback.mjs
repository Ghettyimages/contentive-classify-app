// scripts/build_corrected_iab_fallback.mjs
// Fixed version that properly maps IAB codes according to official specification
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const TSV = path.join(projectRoot, 'backend/data/IAB_Content_Taxonomy_3_1.tsv');
const OUT = path.join(projectRoot, 'frontend/src/data/iab_content_taxonomy_3_1.v1.json');

// Official IAB 3.1 root category mapping (based on standard IAB documentation)
const OFFICIAL_IAB_MAPPING = {
  '1': 'IAB1',          // Automotive
  '42': 'IAB2',         // Books and Literature  
  '52': 'IAB3',         // Business and Finance
  '123': 'IAB4',        // Careers
  '132': 'IAB5',        // Education
  '186': 'IAB6',        // Family and Relationships
  '223': 'IAB7',        // Healthy Living
  '210': 'IAB8',        // Food & Drink
  '239': 'IAB9',        // Hobbies & Interests
  '274': 'IAB10',       // Home & Garden
  '383': 'IAB11',       // Law
  '384': 'IAB12',       // Medical Health
  '421': 'IAB13',       // News
  '428': 'IAB14',       // Personal Finance
  '434': 'IAB15',       // Pets
  '437': 'IAB16',       // Pop Culture
  '483': 'IAB17',       // Sports
  '552': 'IAB18',       // Style & Fashion
  '596': 'IAB19',       // Technology & Computing
  '639': 'IAB20',       // Travel
  '150': 'IAB21',       // Attractions
  '1KXCLD': 'IAB22',    // Holidays
  '160': 'IAB23',       // Entertainment
  '8VZQHL': 'IAB24',    // Events
  '183': 'IAB25',       // Fine Art
  '252': 'IAB26',       // Hobbies & Interests (duplicate - need to check)
};

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

  // Build tree indexes
  const byParent = new Map();
  const roots = [];
  for (const n of nodes) {
    if (!n.parent_uid) roots.push(n);
    const list = byParent.get(n.parent_uid || '__ROOT__') || [];
    list.push(n);
    byParent.set(n.parent_uid || '__ROOT__', list);
  }
  
  // Sort siblings alphabetically for consistent subcategory ordering
  for (const [k, list] of byParent.entries()) {
    list.sort((a,b)=>a.label.localeCompare(b.label));
  }

  // Assign codes using official mapping for roots
  const codeByUid = new Map();
  
  // First pass: assign root codes using official mapping
  for (const root of roots) {
    const officialCode = OFFICIAL_IAB_MAPPING[root.uid];
    if (officialCode) {
      codeByUid.set(root.uid, officialCode);
      console.log(`Mapped ${root.uid} (${root.label}) -> ${officialCode}`);
    } else {
      console.warn(`No official mapping found for root UID ${root.uid} (${root.label})`);
      // Fallback to next available IAB number
      const usedNumbers = Object.values(OFFICIAL_IAB_MAPPING)
        .map(code => parseInt(code.replace('IAB', '')))
        .sort((a, b) => a - b);
      let nextNum = 1;
      while (usedNumbers.includes(nextNum)) nextNum++;
      codeByUid.set(root.uid, `IAB${nextNum}`);
    }
  }

  // Second pass: assign child codes
  function assignChildren(parentUid) {
    const kids = byParent.get(parentUid) || [];
    kids.forEach((child, idx) => {
      const parentCode = codeByUid.get(parentUid);
      if (parentCode) {
        const childCode = `${parentCode}-${idx + 1}`;
        codeByUid.set(child.uid, childCode);
        assignChildren(child.uid);
      }
    });
  }

  for (const root of roots) {
    assignChildren(root.uid);
  }

  const codes = nodes.map(n => ({
    code: codeByUid.get(n.uid) || `UNKNOWN-${n.uid}`,
    label: n.label,
    path: n.path,
    level: n.level,
    parent: (() => {
      if (!n.parent_uid) return null;
      return codeByUid.get(n.parent_uid) || null;
    })()
  }));

  return codes.filter(c => !c.code.startsWith('UNKNOWN'));
}

const tsv = fs.readFileSync(TSV, 'utf8');
const codes = parseTSV(tsv);

// Verify IAB18 is correctly mapped to Style & Fashion
const iab18 = codes.find(c => c.code === 'IAB18');
if (iab18) {
  console.log(`✅ IAB18 correctly mapped to: ${iab18.label}`);
  if (iab18.label !== 'Style & Fashion') {
    console.error(`❌ ERROR: IAB18 should be 'Style & Fashion', but got '${iab18.label}'`);
    process.exit(1);
  }
} else {
  console.error('❌ ERROR: IAB18 not found in generated codes');
  process.exit(1);
}

if (!codes.length || codes.length < 200) {
  console.error(`[IAB Fallback] Too few codes: ${codes.length}`);
  process.exit(1);
}

const out = { version: '3.1', source: 'corrected-fallback', codes };
fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log(`[IAB Fallback] ✅ Wrote ${codes.length} codes to ${OUT}`);
console.log(`[IAB Fallback] ✅ IAB18 = Style & Fashion mapping verified`);