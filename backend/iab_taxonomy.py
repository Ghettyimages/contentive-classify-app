# backend/iab_taxonomy.py
import os, csv, re, logging
from flask import Blueprint, jsonify

bp = Blueprint("iab", __name__)
log = logging.getLogger("iab")

DEFAULT_PATH = os.getenv(
    "IAB_TSV_PATH",
    os.path.join(os.path.dirname(__file__), "data", "IAB_Content_Taxonomy_3_1.tsv"),
)

def _parse_iab_tsv(tsv_path: str):
    items = []
    with open(tsv_path, "r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f, delimiter="\t")
        if not reader.fieldnames:
            raise ValueError("IAB TSV appears to have no header row")
        for row in reader:
            code = next((v for v in row.values() if v and re.match(r"^IAB\d+(?:-\d+)*$", v)), None)
            name = row.get("Name") or row.get("Label") or row.get("Category") or row.get("Description")
            if code and name:
                items.append({"code": code.strip(), "name": name.strip()})

    if len(items) < 100:
        raise ValueError(f"[IAB] suspiciously low taxonomy size: {len(items)} from {tsv_path}")

    def code_key(c): return tuple(int(p) for p in c["code"][3:].split("-"))
    items.sort(key=lambda r: (code_key(r), r["name"]))
    return items

@bp.get("/taxonomy/iab3_1")
def taxonomy():
    items = _parse_iab_tsv(DEFAULT_PATH)
    return jsonify({"version": "3.1", "count": len(items), "items": items})

@bp.get("/taxonomy/count")
def taxonomy_count():
    return jsonify({"count": len(_parse_iab_tsv(DEFAULT_PATH))})