import csv
import io
import os
import re
import json
from typing import Dict, Set, Any

import requests


class TaxonomyLoadError(Exception):
    pass


def _read_text(tsv_source: str) -> str:
    try:
        if tsv_source.startswith('http://') or tsv_source.startswith('https://'):
            resp = requests.get(tsv_source, timeout=30)
            if resp.status_code != 200:
                raise TaxonomyLoadError(f'HTTP {resp.status_code} fetching taxonomy TSV')
            return resp.text
        if not os.path.exists(tsv_source):
            raise TaxonomyLoadError(f'Local taxonomy TSV not found: {tsv_source}')
        with open(tsv_source, 'r', encoding='utf-8') as f:
            return f.read()
    except TaxonomyLoadError:
        raise
    except Exception as e:
        raise TaxonomyLoadError(f'Failed to read taxonomy TSV: {e}')


def _guess_commit_from_url(url: str) -> str:
    m = re.search(r'/[0-9a-fA-F]{7,40}/', url)
    if m:
        return m.group(0).strip('/').split('/')[-1]
    return 'unversioned'


def load_taxonomy_from_tsv(tsv_source: str) -> Dict[str, Any]:
    text = _read_text(tsv_source)
    reader = csv.reader(io.StringIO(text), delimiter='\t')
    try:
        headers = next(reader)
    except StopIteration:
        raise TaxonomyLoadError('Empty TSV: no header row')

    norm_headers = [h.strip().lower() for h in headers]

    def col_index(*candidates):
        for cand in candidates:
            if cand in norm_headers:
                return norm_headers.index(cand)
        return None

    idx_code = col_index('code', 'iab code', 'iab_code')
    idx_label = col_index('iab category', 'label', 'title', 'name')

    tier_indexes = []
    for i, h in enumerate(norm_headers):
        if h.startswith('tier'):
            tier_indexes.append((i, headers[i].strip()))
    tier_indexes.sort(key=lambda t: t[0])

    if idx_code is None:
        raise TaxonomyLoadError('Missing required "code" column in TSV header')

    codes: Dict[str, Dict[str, Any]] = {}

    for row in reader:
        if not row or all((c or '').strip() == '' for c in row):
            continue
        code = (row[idx_code] or '').strip()
        if not code:
            continue
        path_labels = []
        for ti, _ in tier_indexes:
            if ti < len(row):
                val = (row[ti] or '').strip()
                if val:
                    path_labels.append(val)
        label = (row[idx_label].strip() if (idx_label is not None and idx_label < len(row) and row[idx_label]) else '') if idx_label is not None else ''
        if not label and path_labels:
            label = path_labels[-1]
        level = code.count('-') + 1
        codes[code] = {
            'label': label or code,
            'path': path_labels if path_labels else ([label] if label else []),
            'level': level,
        }

    if not codes:
        raise TaxonomyLoadError('No taxonomy codes parsed from TSV')

    commit = _guess_commit_from_url(tsv_source) if tsv_source.startswith('http') else 'unversioned'
    taxonomy = {
        'version': '3.1',
        'source': tsv_source,
        'commit': commit,
        'codes': codes,
        'labels_to_codes': {},
    }
    return taxonomy


def load_taxonomy(iab_url: str, fallback_json_path: str) -> Dict[str, Any]:
    # FORCE USE CORRECT JSON FILE - Skip remote TSV to avoid old data
    print(f"[IAB Loader] Loading taxonomy from: {fallback_json_path}")
    
    # Use the frontend JSON file with correct mappings
    correct_json_path = os.path.join(
        os.path.dirname(__file__), 
        '..', 'frontend', 'src', 'data', 'iab_content_taxonomy_3_1.v1.json'
    )
    
    # Try correct JSON first
    json_to_use = correct_json_path if os.path.exists(correct_json_path) else fallback_json_path
    
    if not os.path.exists(json_to_use):
        raise TaxonomyLoadError(f'JSON not found: {json_to_use}')
    
    print(f"[IAB Loader] Using JSON file: {json_to_use}")
    
    with open(json_to_use, 'r', encoding='utf-8') as f:
        payload = json.load(f)
    
    codes_map: Dict[str, Dict[str, Any]] = {}
    
    for c in payload.get('codes', []):
        # Handle both formats: direct IAB codes and UID->IAB mappings
        iab_code = c.get('iab_code') or c.get('code')
        if not iab_code:
            continue
            
        label = c.get('label') or c.get('name') or iab_code
        path = c.get('iab_path') or c.get('path') or [label]
        
        codes_map[iab_code] = {
            'label': label,
            'path': path if isinstance(path, list) else [path],
            'level': c.get('level') or (iab_code.count('-') + 1),
        }
        
        # Debug: Log IAB18 specifically
        if iab_code == 'IAB18':
            print(f"[IAB Loader] IAB18 mapping: {label}")
    
    print(f"[IAB Loader] Loaded {len(codes_map)} IAB codes")
    
    return {
        'version': payload.get('version', '3.1'),
        'source': f"local:{os.path.basename(json_to_use)}",
        'commit': payload.get('commit') or 'unversioned',
        'codes': codes_map,
        'labels_to_codes': {},
    }
