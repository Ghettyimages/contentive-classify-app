# backend/iab_taxonomy.py
from __future__ import annotations
import os
import csv
import logging
import io
from typing import List, Dict, Tuple
from flask import Blueprint, jsonify
from flask_cors import cross_origin
import re
import json
from typing import Tuple
import json as _json

bp = Blueprint("iab", __name__)
log = logging.getLogger("iab")

_DEFAULT_PATH = os.path.join(os.path.dirname(__file__), "data", "IAB_Content_Taxonomy_3_1.tsv")
_IAB_CACHE: List[Dict] = []
_IAB_PATH: str = ""
_HEADERS_INFO: Tuple[list[str], str] | None = None  # (headers, path)

# Known header variants
CODE_FIELDS = [
	"Code", "code", "IAB Code", "Taxonomy Code", "Legacy (V2) Code",
	"Node Code", "NodeID", "Node ID", "Id", "ID",
]
NAME_FIELDS = [
	"Name", "name", "Label", "Taxonomy Name", "Node Name", "Title", "English Name",
]
TIER_FIELDS = ["Tier1", "Tier2", "Tier3", "Tier 1", "Tier 2", "Tier 3", "Path", "Full Path"]

MIN_FULL_TAXONOMY = 200


def _env_path() -> str:
	return os.getenv("IAB_TSV_PATH", _DEFAULT_PATH)


def _open_text_sig(path: str) -> io.TextIOBase:
	return open(path, "r", encoding="utf-8-sig", newline="")


def _pick_first(row: dict, keys: list[str]) -> str | None:
	for k in keys:
		if k in row and row[k] is not None and str(row[k]).strip():
			return str(row[k]).strip()
	return None


def parse_iab_tsv(tsv_path: str | None = None) -> List[Dict]:
	"""Parse the official IAB 3.1 TSV and return deterministic codes with UI-friendly shape.

	Returns list of dicts:
	{
	  "code": "IAB9-7",
	  "label": "Basketball",
	  "path": ["Sports", "Basketball"],
	  "level": 2,
	  "parent": "IAB9"  # None for top-level
	}
	
	Rules:
	- Top-level: IAB{rank}, where rank is 1-based position among roots (alphabetical by label)
	- Children: IAB{topRank}-{seq}, where seq is child's local 1-based index under its parent (siblings sorted alphabetically)
	- Deterministic across runs given same TSV
	"""
	path = tsv_path or _env_path()
	if not os.path.exists(path):
		raise RuntimeError(f"IAB TSV not found at {path}")

	nodes: List[Dict] = []
	headers: list[str] = []
	with _open_text_sig(path) as f:
		text = f.read()
		lines = [ln for ln in text.splitlines() if ln is not None]
		# Find actual header row (some files include a preamble line before the header)
		header_idx = -1
		for i, ln in enumerate(lines):
			if ('Unique ID' in ln) and ('Parent' in ln) and ('Tier 1' in ln):
				header_idx = i
				break
		if header_idx == -1:
			raise RuntimeError("[IAB] Could not find TSV header row (Unique ID / Parent / Tier 1)")
		data_str = "\n".join(lines[header_idx:])
		reader = csv.DictReader(io.StringIO(data_str), delimiter="\t")
		headers = reader.fieldnames or []
		global _HEADERS_INFO
		_HEADERS_INFO = (headers, path)
		# Header indices by name
		def get(row: dict, key: str) -> str:
			v = row.get(key)
			return str(v).strip() if v is not None else ""
		for row in reader:
			uid = get(row, "Unique ID")
			parent_uid = get(row, "Parent") or None
			name = get(row, "Name")
			# Build hierarchical path from tiers
			tiers = [get(row, "Tier 1"), get(row, "Tier 2"), get(row, "Tier 3"), get(row, "Tier 4")]
			path_names = [t for t in tiers if t]
			label = name or (path_names[-1] if path_names else "")
			if not uid or not label:
				continue
			if not path_names:
				path_names = [label]
			level = len(path_names) if path_names else 1
			nodes.append({
				"uid": uid,
				"parent_uid": parent_uid,
				"label": label,
				"path": path_names,
				"level": level,
			})

	# Index by parent
	by_parent: dict[str, List[Dict]] = {}
	roots: List[Dict] = []
	for n in nodes:
		key = n.get("parent_uid") or "__ROOT__"
		lst = by_parent.get(key, [])
		lst.append(n)
		by_parent[key] = lst
		if n.get("parent_uid") is None:
			roots.append(n)

	# Sort siblings deterministically by label
	for k, lst in list(by_parent.items()):
		lst.sort(key=lambda a: a.get("label", "").lower())
		by_parent[k] = lst
	roots.sort(key=lambda a: a.get("label", "").lower())

	# Assign codes
	code_by_uid: dict[str, str] = {}
	top_rank_by_uid: dict[str, int] = {}

	for i, root in enumerate(roots):
		top = f"IAB{i+1}"
		code_by_uid[root["uid"]] = top
		top_rank_by_uid[root["uid"]] = i + 1
		_assign_children(root["uid"], top, by_parent, code_by_uid, top_rank_by_uid, nodes)

	# Build final list
	codes: List[Dict] = []
	for n in nodes:
		uid = n["uid"]
		code = code_by_uid.get(uid)
		parent_uid = n.get("parent_uid")
		parent_code = code_by_uid.get(parent_uid) if parent_uid else None
		codes.append({
			"code": code,
			"label": n["label"],
			"path": n["path"],
			"level": n["level"],
			"parent": parent_code,
		})

	if len(codes) < 200:
		raise RuntimeError(f"[IAB] taxonomy too small ({len(codes)}) at {path}")

	return codes


def _assign_children(parent_uid: str, parent_code: str, by_parent: dict[str, List[Dict]], code_by_uid: dict[str, str], top_rank_by_uid: dict[str, int], nodes: List[Dict]):
	kids = by_parent.get(parent_uid) or []
	# Determine top rank for this subtree by climbing to root via parent links
	uid_to_parent: dict[str, str | None] = {n["uid"]: n.get("parent_uid") for n in nodes}
	def top_rank_of(uid: str) -> int:
		p = uid
		while True:
			parent = uid_to_parent.get(p)
			if not parent:
				return top_rank_by_uid.get(p, 0)
			p = parent
	for idx, child in enumerate(kids):
		top_rank = top_rank_of(parent_uid)
		code = f"IAB{top_rank}-{idx+1}"
		code_by_uid[child["uid"]] = code
		top_rank_by_uid[child["uid"]] = top_rank
		_assign_children(child["uid"], code, by_parent, code_by_uid, top_rank_by_uid, nodes)


# Legacy/minimal loaders retained for compatibility elsewhere in the app

def load_iab_taxonomy(tsv_path: str | None = None) -> List[Dict]:
	"""Cached richer loader returning {code,name,path,level}. Prefer this at runtime."""
	global _IAB_CACHE, _IAB_PATH, _HEADERS_INFO
	path = tsv_path or _env_path()
	if _IAB_CACHE and _IAB_PATH == path:
		return _IAB_CACHE
	items: List[Dict] = []
	with _open_text_sig(path) as f:
		reader = csv.DictReader(f, delimiter="\t")
		headers = reader.fieldnames or []
		_HEADERS_INFO = (headers, path)
		for row in reader:
			code = _pick_first(row, CODE_FIELDS) or ""
			name = _pick_first(row, NAME_FIELDS)
			if not code and not name:
				continue
			# build path/level
			tiers = []
			for k in TIER_FIELDS:
				v = row.get(k)
				if v and str(v).strip():
					txt = str(v).strip()
					if ">" in txt:
						txt = txt.split(">")[-1].strip()
					tiers.append(txt)
			if not name:
				name = tiers[-1] if tiers else None
			if not name:
				continue
			path_names = [t for t in tiers if t] or [name]
			level = len(path_names)
			items.append({"code": code, "name": name, "path": path_names, "level": level or 1})
	if len(items) < 100:
		raise RuntimeError(f"[IAB] taxonomy too small ({len(items)}) at {path}")
	# sort by code then name
	def code_key(code: str):
		core = code[3:] if code.startswith("IAB") else code
		parts = []
		for p in (core.split("-") if core else []):
			try:
				parts.append(int(p))
			except ValueError:
				parts.append(p)
		return tuple(parts)
	items.sort(key=lambda r: (code_key(r.get("code", "")), r["name"]))
	_IAB_CACHE = items
	_IAB_PATH = path
	log.info("[IAB] Loaded %d categories from %s", len(items), path)
	return items


@bp.get("/taxonomy/iab3_1")
@cross_origin()
def get_taxonomy():
	items = load_iab_taxonomy()
	return jsonify(items)


@bp.get("/api/taxonomy/iab3_1")
@cross_origin()
def get_taxonomy_api():
	return get_taxonomy()


@bp.get("/taxonomy/count")
@bp.get("/api/taxonomy/count")
@cross_origin()
def get_taxonomy_count():
	items = load_iab_taxonomy()
	return jsonify({"count": len(items)})


@bp.get("/api/taxonomy/iab3_1/debug")
@cross_origin()
def taxonomy_debug():
	items = load_iab_taxonomy()
	headers, path = _HEADERS_INFO if _HEADERS_INFO else ([], _DEFAULT_PATH)
	return jsonify({
		"headers": headers,
		"tsv_path": path,
		"count": len(items),
		"sample": items[:10],
	})


def _natural_key(code: str):
	parts = re.split(r'(\d+)', code or '')
	nk = []
	for p in parts:
		nk.append(int(p) if p.isdigit() else p)
	return nk


def normalize_code(code: str) -> str:
	code = (code or '').strip()
	code = code.replace('–', '-').replace('—', '-')
	code = re.sub(r'\s+', '', code)
	return code.upper()


def load_tsv_items(tsv_path: str) -> List[Dict]:
	items: List[Dict] = []
	with _open_text_sig(tsv_path) as f:
		reader = csv.DictReader(f, delimiter='\t')
		for row in reader:
			code = normalize_code(_pick_first(row, CODE_FIELDS) or '')
			name = _pick_first(row, NAME_FIELDS) or code
			if not code and not name:
				continue
			items.append({"code": code, "name": name})
	items.sort(key=lambda x: (_natural_key(x["code"]), x["name"]))
	return items


def load_bundle_map(bundle_json_path: str) -> Dict[str, str]:
	try:
		with open(bundle_json_path, 'r', encoding='utf-8') as f:
			data = json.load(f)
		# Accept either list or dict
		if isinstance(data, dict):
			return {normalize_code(k): v for k, v in data.items()}
		m: Dict[str, str] = {}
		for row in data:
			c = normalize_code(row.get('code', ''))
			if not c:
				continue
			m[c] = row.get('name') or row.get('label') or row.get('title') or c
		return m
	except Exception:
		return {}


def _get_in(d: dict, path: List[str]):
	cur = d
	for p in path:
		if isinstance(cur, dict) and p in cur:
			cur = cur[p]
		else:
			return None
	return cur


def load_iab_from_firestore(bundle_map: Dict[str, str]) -> List[Dict]:
	try:
		import firebase_admin
		from firebase_admin import firestore as fs
		if not firebase_admin._apps:
			firebase_admin.initialize_app()
		db = fs.client()
		collections = os.getenv('IAB_COLLECTIONS', 'pages,articles,content,urls,documents').split(',')
		fields = os.getenv('IAB_CODE_FIELDS', 'iab_codes,iab_content_codes,iab,iab_categories,taxonomy.iab,categories.iab').split(',')
		seen = set()
		for coll in [c.strip() for c in collections if c.strip()]:
			for doc in db.collection(coll).limit(10000).stream():
				data = doc.to_dict() or {}
				for field in [f.strip() for f in fields if f.strip()]:
					path = field.split('.')
					val = _get_in(data, path)
					if isinstance(val, list):
						vals = val
					elif isinstance(val, str):
						vals = re.split(r'[\s,;]+', val)
					else:
						vals = []
					for c in vals:
						if isinstance(c, str) and c.strip():
							seen.add(normalize_code(c))
		items = [{"code": c, "name": bundle_map.get(c, c)} for c in seen if c]
		items.sort(key=lambda x: (_natural_key(x['code']), x['name']))
		return items
	except Exception as e:
		logging.exception("load_iab_from_firestore failed: %s", e)
		return []


def load_iab_from_postgres(bundle_map: Dict[str, str]) -> List[Dict]:
	try:
		import psycopg
		dsn = os.getenv('DATABASE_URL')
		if not dsn:
			return []
		seen = set()
		queries = [
			"SELECT DISTINCT iab_code FROM content_categories WHERE iab_code IS NOT NULL",
			"SELECT DISTINCT unnest(iab_codes) AS iab_code FROM content WHERE iab_codes IS NOT NULL",
			"SELECT DISTINCT jsonb_array_elements_text(iab->'codes') AS iab_code FROM content WHERE iab ? 'codes'",
		]
		with psycopg.connect(dsn) as conn:
			with conn.cursor() as cur:
				for q in queries:
					try:
						cur.execute(q)
						for (c,) in cur:
							if c:
								seen.add(normalize_code(c))
					except Exception:
						continue
		items = [{"code": c, "name": bundle_map.get(c, c)} for c in seen if c]
		items.sort(key=lambda x: (_natural_key(x['code']), x['name']))
		return items
	except Exception:
		return []


def load_iab_from_db(bundle_map: Dict[str, str]) -> Tuple[str, List[Dict]]:
	backend = os.getenv('IAB_DB_BACKEND', '').lower().strip()
	if backend == 'postgres':
		items = load_iab_from_postgres(bundle_map)
		return ('postgres', items)
	# default: firestore
	items = load_iab_from_firestore(bundle_map)
	if items:
		return ('firestore', items)
	items = load_iab_from_postgres(bundle_map)
	return ('postgres', items)


def _load_contentive_json(json_path: str) -> List[Dict]:
	with open(json_path, 'r', encoding='utf-8') as f:
		data = _json.load(f)
	codes = data.get('codes') if isinstance(data, dict) else data
	if not isinstance(codes, list):
		raise ValueError('Invalid Contentive taxonomy JSON structure')
	if len(codes) < 50:
		raise ValueError(f'Contentive taxonomy too small: {len(codes)} at {json_path}')
	items: List[Dict] = []
	for c in codes:
		code = c.get('code') or c.get('iab_code') or c.get('uid')
		label = c.get('label') or c.get('name') or code
		path = c.get('path') or c.get('iab_path') or []
		sensitive = bool(c.get('sensitive', False))
		items.append({
			'code': str(code or '').strip(),
			'name': str(label or '').strip(),
			'path': path if isinstance(path, list) else [],
			'iab_code': c.get('iab_code'),
			'sensitive': sensitive,
		})
	# dedupe by code
	seen: Dict[str, Dict] = {}
	for it in items:
		k = it.get('code')
		if k and k not in seen:
			seen[k] = it
	result = list(seen.values())
	if len(result) < 50:
		raise ValueError(f'Contentive taxonomy too small after normalization: {len(result)}')
	return result


def get_taxonomy_codes() -> List[Dict]:
	"""Return normalized taxonomy codes using Contentive JSON first, else TSV.
	Raises ValueError if < 50 codes available.
	"""
	json_path = os.getenv('CONTENTIVE_TAXONOMY_JSON')
	if json_path and os.path.exists(json_path):
		log.info('[IAB] Loading Contentive JSON taxonomy: %s', json_path)
		items = _load_contentive_json(json_path)
		if len(items) < 50:
			raise ValueError(f'Contentive JSON too small: {len(items)}')
		return items
	# Fallback to IAB TSV via our loader
	path = _env_path()
	log.info('[IAB] Loading IAB TSV taxonomy: %s', path)
	items = load_iab_taxonomy(path)
	if len(items) < 50:
		raise ValueError(f'IAB TSV too small: {len(items)}')
	# Normalize keys to match JSON shape
	return [{
		'code': it.get('code'),
		'name': it.get('name'),
		'path': it.get('path', []),
		'iab_code': it.get('code'),
		'sensitive': False,
	} for it in items]


@bp.get('/api/iab31')
@cross_origin()
def api_iab31():
	try:
		codes = parse_iab_tsv(os.getenv('IAB_TSV_PATH'))
		if not codes or len(codes) < 200:
			log.error('[IAB] Backend IAB3.1 parse too small: %s', len(codes) if codes else 0)
			return jsonify({'error': 'taxonomy_unavailable', 'count': len(codes) if codes else 0}), 503
		return jsonify({ 'version': '3.1', 'source': 'backend', 'codes': codes })
	except Exception as e:
		log.exception('[IAB] Backend IAB3.1 parse failed: %s', e)
		return jsonify({'error': 'taxonomy_unavailable'}), 503


__all__ = ["parse_iab_tsv", "load_iab_taxonomy"]