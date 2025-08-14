# backend/iab_taxonomy.py
from __future__ import annotations
import os
import csv
import logging
import io
from typing import List, Dict, Tuple
from flask import Blueprint, jsonify

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


__all__ = ["parse_iab_tsv", "load_iab_taxonomy"]