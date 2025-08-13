import csv
import os
import io

HEADER_ALIASES = {
	"code": {"code", "Code", "CODE", "Node Code"},
	"name": {"name", "Name", "LABEL", "Label", "Node Name"},
	"tier1": {"Tier1", "Tier 1", "TIER1", "Taxonomy Tier 1"},
	"tier2": {"Tier2", "Tier 2", "TIER2", "Taxonomy Tier 2"},
	"tier3": {"Tier3", "Tier 3", "TIER3", "Taxonomy Tier 3"},
	"tier4": {"Tier4", "Tier 4", "TIER4", "Taxonomy Tier 4"},
	"path": {"Path", "Full Path", "Taxonomy Path"},
}


def _keymap(fieldnames):
	km = {k: None for k in HEADER_ALIASES}
	fset = set(fieldnames or [])
	for want, aliases in HEADER_ALIASES.items():
		for a in aliases:
			if a in fset:
				km[want] = a
				break
	return km


def _last_non_empty(items):
	for x in reversed(items):
		if x and str(x).strip():
			return str(x).strip()
	return ""


def _parent_of(code: str):
	# e.g. IAB9-6-2 -> IAB9-6 ; IAB9 -> ""
	if not code or not code.startswith("IAB"):
		return ""
	parts = code[3:].split("-")
	if len(parts) <= 1:
		return ""
	return "IAB" + "-".join([parts[0]] + parts[1:-1])


def parse_iab_tsv(path):
	if not os.path.exists(path):
		return [], {"error": f"missing file: {path}"}

	rows, diag = [], {"path": path, "count_raw": 0, "headers": None}
	# Handle UTF-8 with BOM and ensure tab delimiter
	with io.open(path, "r", encoding="utf-8-sig", newline="") as f:
		reader = csv.DictReader(f, delimiter="\t")
		diag["headers"] = reader.fieldnames
		km = _keymap(reader.fieldnames or [])
		for r in reader:
			diag["count_raw"] += 1
			code = (r.get(km["code"]) or "").strip() if km["code"] else ""
			if not code:
				continue

			tiers = [
				(r.get(km["tier1"]) or "").strip() if km["tier1"] else "",
				(r.get(km["tier2"]) or "").strip() if km["tier2"] else "",
				(r.get(km["tier3"]) or "").strip() if km["tier3"] else "",
				(r.get(km["tier4"]) or "").strip() if km["tier4"] else "",
			]
			name = (r.get(km["name"]) or "").strip() if km["name"] else ""
			label = name or _last_non_empty(tiers)
			if not label and km["path"]:
				# fallback: take last token of path
				path_val = (r.get(km["path"]) or "").strip()
				if path_val:
					label = path_val.split(">")[-1].strip()

			if not label:
				# skip rows without any label
				continue

			level = len([t for t in tiers if t])
			parent = _parent_of(code)
			rows.append({"code": code, "label": label, "level": level or 1, "parent": parent})

	# de-dupe by code
	uniq = {}
	for x in rows:
		uniq[x["code"]] = x
	rows = list(uniq.values())

	def sort_key(x):
		core = x["code"][3:] if x["code"].startswith("IAB") else x["code"]
		parts = []
		for p in core.split("-"):
			parts.append(int(p) if p.isdigit() else p)
		return (parts, x["label"].lower())

	rows.sort(key=sort_key)
	return rows, diag