# backend/scripts/update_iab_taxonomy.py
import os, csv, re, json, pathlib, urllib.request, sys

IAB_URL = "https://raw.githubusercontent.com/InteractiveAdvertisingBureau/Taxonomies/develop/Content%20Taxonomies/Content%20Taxonomy%203.1.tsv"

ROOT = pathlib.Path(__file__).resolve().parents[2]
BACKEND_DATA = ROOT / "backend" / "data"
FRONTEND_DATA = ROOT / "frontend" / "src" / "data"
TSV_PATH = BACKEND_DATA / "IAB_Content_Taxonomy_3_1.tsv"
JSON_PATH = FRONTEND_DATA / "iab_content_taxonomy_3_1.json"

def ensure_dirs():
    BACKEND_DATA.mkdir(parents=True, exist_ok=True)
    FRONTEND_DATA.mkdir(parents=True, exist_ok=True)

def download_tsv():
    print(f"[IAB] Downloading TSV from {IAB_URL}")
    with urllib.request.urlopen(IAB_URL) as r:
        data = r.read()
    TSV_PATH.write_bytes(data)
    print(f"[IAB] Wrote {TSV_PATH} ({len(data)} bytes)")

def parse_items(tsv_file):
    items = []
    with open(tsv_file, "r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f, delimiter="\t")
        if not reader.fieldnames:
            raise RuntimeError("IAB TSV has no header row")
        for row in reader:
            code = next((v for v in row.values() if v and re.match(r"^IAB\d+(?:-\d+)*$", v)), None)
            name = row.get("Name") or row.get("Label") or row.get("Category") or row.get("Description")
            if code and name:
                items.append({"code": code.strip(), "name": name.strip()})
    if len(items) < 100:
        raise RuntimeError(f"Suspiciously low item count: {len(items)}")
    # sort by code path, then name
    def code_key(c): return tuple(int(p) for p in c["code"][3:].split("-"))
    items.sort(key=lambda r: (code_key(r), r["name"]))
    return items

def write_json(items):
    JSON_PATH.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[IAB] Wrote {JSON_PATH} with {len(items)} items")

def main():
    ensure_dirs()
    if not TSV_PATH.exists():
        download_tsv()
    items = parse_items(TSV_PATH)
    write_json(items)
    print("[IAB] Done.")
    return 0

if __name__ == "__main__":
    sys.exit(main())