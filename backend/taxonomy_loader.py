import csv
import io
import os
import re
from dataclasses import dataclass
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
        # local file
        if not os.path.exists(tsv_source):
            raise TaxonomyLoadError(f'Local taxonomy TSV not found: {tsv_source}')
        with open(tsv_source, 'r', encoding='utf-8') as f:
            return f.read()
    except TaxonomyLoadError:
        raise
    except Exception as e:
        raise TaxonomyLoadError(f'Failed to read taxonomy TSV: {e}')


def _guess_commit_from_url(url: str) -> str:
    # Try to extract a pinned SHA from common GitHub paths
    # e.g., https://raw.githubusercontent.com/org/repo/<sha>/path/to/file.tsv
    m = re.search(r'/[0-9a-fA-F]{7,40}/', url)
    if m:
        return m.group(0).strip('/').split('/')[-1]
    return 'unversioned'


def load_taxonomy(tsv_source: str) -> Dict[str, Any]:
    text = _read_text(tsv_source)
    reader = csv.reader(io.StringIO(text), delimiter='\t')
    try:
        headers = next(reader)
    except StopIteration:
        raise TaxonomyLoadError('Empty TSV: no header row')

    # Normalize headers to lowercase for lookup
    norm_headers = [h.strip().lower() for h in headers]

    def col_index(*candidates):
        for cand in candidates:
            if cand in norm_headers:
                return norm_headers.index(cand)
        return None

    idx_code = col_index('code', 'iab code', 'iab_code')
    idx_label = col_index('label', 'title', 'name')

    # Collect tier columns (tier 1..n) if present
    tier_indexes = []
    for i, h in enumerate(norm_headers):
        if h.startswith('tier'):
            tier_indexes.append((i, headers[i].strip()))
    # Sort by column position to keep path order
    tier_indexes.sort(key=lambda t: t[0])

    if idx_code is None:
        raise TaxonomyLoadError('Missing required "code" column in TSV header')

    codes: Dict[str, Dict[str, Any]] = {}
    labels_to_codes: Dict[str, Set[str]] = {}

    def add_label(label: str, code: str):
        key = (label or '').strip().lower()
        if not key:
            return
        if key not in labels_to_codes:
            labels_to_codes[key] = set()
        labels_to_codes[key].add(code)

    row_count = 0
    for row in reader:
        if not row or all((c or '').strip() == '' for c in row):
            continue
        row_count += 1
        try:
            code = (row[idx_code] or '').strip()
            if not code:
                continue
            # Build path from tiers
            path_labels = []
            for ti, _orig in tier_indexes:
                if ti < len(row):
                    val = (row[ti] or '').strip()
                    if val:
                        path_labels.append(val)
            # Determine label preference: explicit label column, else last tier
            label = (row[idx_label].strip() if (idx_label is not None and idx_label < len(row) and row[idx_label]) else '') if idx_label is not None else ''
            if not label and path_labels:
                label = path_labels[-1]
            level = max(1, len(path_labels)) if code else len(path_labels)

            codes[code] = {
                'label': label or code,
                'path': path_labels if path_labels else ([label] if label else []),
                'level': level if level else 1,
            }

            # Map labels to codes for fast reverse lookup
            if label:
                add_label(label, code)
            for pl in path_labels:
                add_label(pl, code)
        except Exception:
            # Skip malformed rows rather than failing the whole load
            continue

    if not codes:
        raise TaxonomyLoadError('No taxonomy codes parsed from TSV')

    source = tsv_source
    commit = _guess_commit_from_url(tsv_source) if tsv_source.startswith('http') else 'unversioned'

    taxonomy = {
        'version': '3.1',
        'source': source,
        'commit': commit,
        'codes': codes,
        'labels_to_codes': {k: sorted(list(v)) for k, v in labels_to_codes.items()},
    }
    return taxonomy