# backend/iab_taxonomy.py
import os
import csv
import logging
from typing import List, Dict
from flask import Blueprint, jsonify

bp = Blueprint("iab", __name__)
log = logging.getLogger("iab")

_DEFAULT_PATH = os.path.join(os.path.dirname(__file__), "data", "IAB_Content_Taxonomy_3_1.tsv")
_IAB_CACHE: List[Dict] = []
_IAB_PATH: str = ""


def _env_path() -> str:
	return os.getenv("IAB_TSV_PATH", _DEFAULT_PATH)


def parse_iab_tsv(tsv_path: str | None = None) -> List[Dict]:
	"""Parse TSV into minimal list of dicts: {code,name}. Size guard >= 100."""
	path = tsv_path or _env_path()
	items: List[Dict] = []
	with open(path, "r", encoding="utf-8", newline="") as f:
		reader = csv.DictReader(f, delimiter="\t")
		if not reader.fieldnames:
			raise RuntimeError("IAB TSV has no header row")
		for row in reader:
			code = (row.get("Code") or row.get("code") or row.get("IAB Code") or "").strip()
			name = (row.get("Name") or row.get("name") or row.get("Label") or "").strip()
			if not code or not name:
				continue
			items.append({"code": code, "name": name})
	if len(items) < 100:
		raise RuntimeError(f"IAB taxonomy too small: {len(items)} rows at {path}")
	return items


def load_iab_taxonomy(tsv_path: str | None = None) -> List[Dict]:
	"""Cached richer loader returning {code,name,path,level}. Prefer this at runtime."""
	global _IAB_CACHE, _IAB_PATH
	path = tsv_path or _env_path()
	if _IAB_CACHE and _IAB_PATH == path:
		return _IAB_CACHE
	items: List[Dict] = []
	with open(path, "r", encoding="utf-8", newline="") as f:
		reader = csv.DictReader(f, delimiter="\t")
		if not reader.fieldnames:
			raise RuntimeError("[IAB] TSV has no header row")
		for row in reader:
			code = (row.get("Code") or row.get("code") or "").strip()
			name = (row.get("Name") or row.get("Label") or row.get("Category") or row.get("Description") or "").strip()
			if not code or not name:
				continue
			tiers = [
				(row.get("Tier1") or row.get("Tier 1") or "").strip(),
				(row.get("Tier2") or row.get("Tier 2") or "").strip(),
				(row.get("Tier3") or row.get("Tier 3") or "").strip(),
				(row.get("Tier4") or row.get("Tier 4") or "").strip(),
			]
			path_names = [t for t in tiers if t]
			level = len(path_names) if path_names else 1
			items.append({"code": code, "name": name, "path": path_names or [name], "level": level})
	if len(items) < 100:
		raise RuntimeError(f"[IAB] taxonomy too small ({len(items)}) at {path}")
	# Sort numerically by code parts then name for stability
	def code_key(code: str):
		core = code[3:] if code.startswith("IAB") else code
		parts = []
		for p in core.split("-"):
			try:
				parts.append(int(p))
			except ValueError:
				parts.append(p)
		return tuple(parts)
	items.sort(key=lambda r: (code_key(r["code"]), r["name"]))
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
def get_taxonomy_count():
	items = load_iab_taxonomy()
	return jsonify({"count": len(items)})


__all__ = ["parse_iab_tsv", "load_iab_taxonomy"]