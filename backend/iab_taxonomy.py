# backend/iab_taxonomy.py
from __future__ import annotations
import os
import csv
import logging
import io
from typing import List, Dict, Tuple
from flask import Blueprint, jsonify
import re
import json
from typing import Tuple

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

MIN_FULL_TAXONOMY = 100


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
	"""Parse TSV into minimal list of dicts: {code,name}. Size guard >= 100."""
	path = tsv_path or _env_path()
	if not os.path.exists(path):
		raise RuntimeError(f"IAB TSV not found at {path}")
	items: List[Dict] = []
	with _open_text_sig(path) as f:
		reader = csv.DictReader(f, delimiter="\t")
		headers = reader.fieldnames or []
		global _HEADERS_INFO
		_HEADERS_INFO = (headers, path)
		for row in reader:
			code = _pick_first(row, CODE_FIELDS)
			name = _pick_first(row, NAME_FIELDS)
			if not code and not name:
				continue
			if not name:
				# try tiers/path
				for k in TIER_FIELDS:
					v = row.get(k)
					if v and str(v).strip():
						name = str(v).strip()
						if ">" in name:
							name = name.split(">")[-1].strip()
						break
			if not name:
				continue
			items.append({"code": (code or "").strip(), "name": name.strip()})
	if len(items) < 100:
		raise RuntimeError(f"IAB taxonomy too small: {len(items)} rows at {path}; headers={headers}")
	# de-dupe
	seen = set()
	deduped: List[Dict] = []
	for it in items:
		key = (it.get("code") or "", it["name"])
		if key in seen:
			continue
		seen.add(key)
		deduped.append(it)
	return deduped


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
def get_taxonomy():
	items = load_iab_taxonomy()
	return jsonify(items)


@bp.get("/api/taxonomy/iab3_1")
def get_taxonomy_api():
	return get_taxonomy()


@bp.get("/taxonomy/count")
@bp.get("/api/taxonomy/count")
def get_taxonomy_count():
	items = load_iab_taxonomy()
	return jsonify({"count": len(items)})


@bp.get("/api/taxonomy/iab3_1/debug")
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


__all__ = ["parse_iab_tsv", "load_iab_taxonomy"]