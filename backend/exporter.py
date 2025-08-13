import csv
import io
import json
from typing import List, Dict


def to_csv(rows: List[Dict]) -> bytes:
	if not rows:
		return b""
	# Collect all keys across rows for stable header
	fieldnames = []
	seen = set()
	for r in rows:
		for k in r.keys():
			if k not in seen:
				seen.add(k)
				fieldnames.append(k)
	out = io.StringIO()
	writer = csv.DictWriter(out, fieldnames=fieldnames)
	writer.writeheader()
	for r in rows:
		writer.writerow({k: r.get(k) for k in fieldnames})
	return out.getvalue().encode("utf-8")


def to_json(rows: List[Dict]) -> bytes:
	return json.dumps(rows, ensure_ascii=False).encode("utf-8")