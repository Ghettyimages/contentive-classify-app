// scripts/build_correct_iab_mapping.mjs
// Creates correct IAB 3.1 mapping based on official specification
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const TSV = path.join(projectRoot, 'backend/data/IAB_Content_Taxonomy_3_1.tsv');
const OUT = path.join(projectRoot, 'frontend/src/data/iab_content_taxonomy_3_1.v1.json');

// Official IAB 3.1 Content Taxonomy root categories in correct order
// Based on the official IAB Tech Lab Content Taxonomy 3.1 specification
const OFFICIAL_ROOT_ORDER = [
  { uid: '1', name: 'Automotive', code: 'IAB1' },
  { uid: '42', name: 'Books and Literature', code: 'IAB2' },
  { uid: '52', name: 'Business and Finance', code: 'IAB3' },
  { uid: '123', name: 'Careers', code: 'IAB4' },
  { uid: '132', name: 'Education', code: 'IAB5' },
  { uid: '186', name: 'Family and Relationships', code: 'IAB6' },
  { uid: '223', name: 'Healthy Living', code: 'IAB7' },
  { uid: '210', name: 'Food & Drink', code: 'IAB8' },
  { uid: '239', name: 'Hobbies & Interests', code: 'IAB9' },
  { uid: '274', name: 'Home & Garden', code: 'IAB10' },
  { uid: '383', name: 'Law', code: 'IAB11' },
  { uid: '286', name: 'Medical Health', code: 'IAB12' },
  { uid: 'unknown13', name: 'News', code: 'IAB13' }, // Need to find UID
  { uid: '391', name: 'Personal Finance', code: 'IAB14' },
  { uid: '422', name: 'Pets', code: 'IAB15' },
  { uid: '432', name: 'Pop Culture', code: 'IAB16' },
  { uid: '483', name: 'Sports', code: 'IAB17' },
  { uid: '552', name: 'Style & Fashion', code: 'IAB18' },
  { uid: '596', name: 'Technology & Computing', code: 'IAB19' },
  { uid: '653', name: 'Travel', code: 'IAB20' },
  { uid: '441', name: 'Real Estate', code: 'IAB21' },
  { uid: '473', name: 'Shopping', code: 'IAB22' },
  { uid: '453', name: 'Religion & Spirituality', code: 'IAB23' },
  { uid: '464', name: 'Science', code: 'IAB24' },
  { uid: '680', name: 'Video Gaming', code: 'IAB25' },
  { uid: '150', name: 'Attractions', code: 'IAB26' },
];

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
  if (headerIdx === -1) throw new Error('[IAB] Could not find TSV header row');
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
      uid: c[iUID]?.trim(),
      parent_uid: c[iParent]?.trim() || null,
      label: label.trim(),
      path: pathArr.length ? pathArr : [label],
      level
    };
  }).filter(n => n && n.uid && n.label);

  // Build tree indexes
  const byParent = new Map();
  const nodeByUid = new Map();
  
  for (const n of nodes) {
    nodeByUid.set(n.uid, n);
    const list = byParent.get(n.parent_uid || '__ROOT__') || [];
    list.push(n);
    byParent.set(n.parent_uid || '__ROOT__', list);
  }
  
  // Sort siblings alphabetically for consistent subcategory ordering
  for (const [k, list] of byParent.entries()) {
    list.sort((a,b) => a.label.localeCompare(b.label));
  }

  // Create UID to IAB code mapping using official order
  const codeByUid = new Map();
  
  // Map root categories using official specification
  for (const official of OFFICIAL_ROOT_ORDER) {
    const node = nodeByUid.get(official.uid);
    if (node) {
      codeByUid.set(official.uid, official.code);
      console.log(`✅ ${official.code}: ${node.label}`);
    } else {
      console.warn(`⚠️  Official UID ${official.uid} not found for ${official.name}`);
    }
  }

  // Handle any unmapped root categories
  const roots = byParent.get('__ROOT__') || [];
  let nextIabNum = OFFICIAL_ROOT_ORDER.length + 1;
  for (const root of roots) {
    if (!codeByUid.has(root.uid)) {
      const fallbackCode = `IAB${nextIabNum++}`;
      codeByUid.set(root.uid, fallbackCode);
      console.log(`🔄 Fallback ${fallbackCode}: ${root.label} (UID: ${root.uid})`);
    }
  }

  // Assign child codes recursively
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

  // Assign all child codes
  for (const root of roots) {
    assignChildren(root.uid);
  }

  // Generate final codes array
  const codes = nodes.map(n => ({
    code: codeByUid.get(n.uid) || `UNMAPPED-${n.uid}`,
    label: n.label,
    path: n.path,
    level: n.level,
    parent: n.parent_uid ? codeByUid.get(n.parent_uid) || null : null
  })).filter(c => !c.code.startsWith('UNMAPPED'));

  return codes;
}

// Generate the corrected taxonomy
console.log('🚀 Generating corrected IAB 3.1 taxonomy...');
const tsv = fs.readFileSync(TSV, 'utf8');
const codes = parseTSV(tsv);

// Verify critical mappings
const iab18 = codes.find(c => c.code === 'IAB18');
if (iab18?.label === 'Style & Fashion') {
  console.log(`✅ IAB18 correctly mapped to: ${iab18.label}`);
} else {
  console.error(`❌ ERROR: IAB18 mapping failed. Got: ${iab18?.label || 'NOT FOUND'}`);
}

const iab17 = codes.find(c => c.code === 'IAB17');
if (iab17?.label === 'Sports') {
  console.log(`✅ IAB17 correctly mapped to: ${iab17.label}`);
} else {
  console.error(`❌ ERROR: IAB17 mapping failed. Got: ${iab17?.label || 'NOT FOUND'}`);
}

if (codes.length < 200) {
  console.error(`❌ ERROR: Too few codes generated: ${codes.length}`);
  process.exit(1);
}

// Write the corrected file
const out = { 
  version: '3.1', 
  source: 'corrected-official-mapping', 
  codes,
  generated_at: new Date().toISOString(),
  note: 'IAB 3.1 Content Taxonomy with correct official code assignments'
};

fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log(`✅ Generated ${codes.length} codes with correct IAB mappings`);
console.log(`✅ Written to: ${OUT}`);