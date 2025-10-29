import os, json
from backend.iab_taxonomy import parse_iab_tsv

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
TSV = os.path.join(ROOT, "backend", "data", "IAB_Content_Taxonomy_3_1.tsv")
OUT = os.path.join(ROOT, "frontend", "src", "data", "iab_content_taxonomy_3_1.v1.json")

def main():
	items = parse_iab_tsv(TSV)
	if len(items) < 200:
		raise SystemExit(f"Too few IAB nodes: {len(items)} from {TSV}")
	os.makedirs(os.path.dirname(OUT), exist_ok=True)
	payload = {"version": "3.1", "source": "fallback", "codes": items}
	with open(OUT, "w", encoding="utf-8") as f:
		json.dump(payload, f, ensure_ascii=False, indent=2)
	print(f"Wrote {len(items)} nodes -> {OUT}")

if __name__ == "__main__":
	main()