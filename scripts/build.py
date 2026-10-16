"""Build index.html from src/template.html + data/items.json + data/station.json.

Usage (from the project root):
    python3 scripts/normalize.py data/items_raw.tsv data/items.json
    python3 scripts/build.py

Everything in the template above the <!--BODY--> marker goes in <head>.
"""
import json, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
template = (root / "src" / "template.html").read_text()
items = json.loads((root / "data" / "items.json").read_text())
station = json.loads((root / "data" / "station.json").read_text())
if template.count("<!--BODY-->") != 1:
    raise SystemExit("src/template.html needs exactly one <!--BODY--> marker")
head, body = template.split("<!--BODY-->")
for k, v in {"__N_ITEMS__": len(items), "__N_LINES__": len({d["line"] for d in items}), "__N_STATION__": len(station)}.items():
    head = head.replace(k, str(v))
body = body.replace("__DATA__", json.dumps(items, ensure_ascii=False, separators=(",", ":")))
body = body.replace("__STATION__", json.dumps(station, ensure_ascii=False, separators=(",", ":")))
html = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        + head.strip() + '\n</head>\n<body style="margin:0">\n' + body.strip() + '\n</body>\n</html>\n')
(root / "index.html").write_text(html)
print(f"Wrote index.html ({len(items)} items, {len(station)} station components)")
