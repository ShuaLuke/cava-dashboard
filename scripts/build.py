"""Build index.html from src/template.html + data/items.json + data/station.json + the cost tool scripts.

Usage (from the project root):
    python3 scripts/normalize.py data/items_raw.tsv data/items.json
    python3 scripts/build.py              # hosted build -> index.html (D3 + fonts from the web, with SRI and a strict CSP)
    python3 scripts/build.py --offline    # also writes dist/offline/index.html: D3 and fonts inlined, zero external requests

Everything in the template above the <!--BODY--> marker goes in <head>. src/costmodel.js, src/sample.js, src/xlsx-lite.js
and src/costtool.js are inlined at their __PLACEHOLDER__ markers so the page stays one file.
vendor/ (from scripts/vendor.py) supplies the D3 integrity hash and the files for the offline build.
"""
import base64, json, pathlib, sys
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
for marker, name in [("__COSTMODEL__", "costmodel.js"), ("__SAMPLE__", "sample.js"), ("__XLSX__", "xlsx-lite.js"), ("__COSTTOOL__", "costtool.js")]:
    src = (root / "src" / name).read_text()
    if "</script" in src: raise SystemExit(f"{name} must not contain '</script'")
    if body.count(marker) != 1: raise SystemExit(f"template needs exactly one {marker}")
    body = body.replace(marker, src)

manifest_path = root / "vendor" / "manifest.json"
manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else None
d3_tag = '<script src="https://cdnjs.cloudflare.com/ajax/libs/d3/7.8.5/d3.min.js" integrity="__D3_SRI__" crossorigin="anonymous"></script>'
if manifest: body = body.replace("__D3_SRI__", manifest["d3_sri"])
else: body = body.replace(' integrity="__D3_SRI__" crossorigin="anonymous"', "")

# Content-Security-Policy. connect-src 'none' means the page cannot send anything anywhere; the hosted build may only
# load D3 from cdnjs and the fonts from Google. The offline build allows no remote origin at all.
CSP_HOSTED = ("default-src 'none'; script-src 'unsafe-inline' https://cdnjs.cloudflare.com; style-src 'unsafe-inline' https://fonts.googleapis.com; "
              "font-src https://fonts.gstatic.com; img-src data: blob:; connect-src 'none'; form-action 'none'; base-uri 'none'")
CSP_OFFLINE = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; font-src data:; img-src data: blob:; connect-src 'none'; form-action 'none'; base-uri 'none'"

def page(head, body):
    return ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
            + head.strip() + '\n</head>\n<body style="margin:0">\n' + body.strip() + '\n</body>\n</html>\n')

(root / "index.html").write_text(page(head.replace("__CSP__", CSP_HOSTED), body))
print(f"Wrote index.html ({len(items)} items, {len(station)} station components)")

if "--offline" in sys.argv:
    if not manifest: raise SystemExit("run scripts/vendor.py first")
    vend = root / "vendor"
    d3 = (vend / "d3.v7.8.5.min.js").read_text()
    ohead = head.replace("__CSP__", CSP_OFFLINE)
    # fonts: inline the woff2 files as data: URIs
    faces = []
    for f in manifest["fonts"]:
        b64 = base64.b64encode((vend / f["file"]).read_bytes()).decode()
        faces.append(f"@font-face {{ font-family: '{f['family']}'; font-style: normal; font-weight: {f['weight']}; font-display: swap; src: url(data:font/woff2;base64,{b64}) format('woff2'); }}")
    import re
    ohead = re.sub(r'<link rel="preconnect"[^>]*>\n?', "", ohead)
    ohead = re.sub(r'<link rel="stylesheet" href="https://fonts.googleapis.com[^>]*>', "<style>" + "\n".join(faces) + "</style>", ohead)
    ohead = re.sub(r'<meta property="og:[^>]*>\n?|<meta name="twitter:[^>]*>\n?', "", ohead)
    obody = body.replace(d3_tag.replace("__D3_SRI__", manifest["d3_sri"]), "<script>" + d3 + "</script>", 1)
    if "cdnjs.cloudflare.com" in obody: raise SystemExit("offline build still references cdnjs")
    obody = obody.replace("<!--D3-->", "<script>window.__offline = true;</script>", 1)
    out = root / "dist" / "offline"; out.mkdir(parents=True, exist_ok=True)
    html = page(ohead, obody)
    for bad in ("https://", "http://"):
        hits = [m.start() for m in re.finditer(re.escape(bad), html)]
        # allowed: text that merely mentions a URL (docs, about page); forbidden: src/href attributes
        attr = re.findall(r'(?:src|href)="https?://[^"]+"', html)
        attr = [a for a in attr if "shualuke.github.io" not in a]
        if attr: raise SystemExit("offline build loads from the web: " + ", ".join(attr[:5]))
    (out / "index.html").write_text(html)
    (out / "README.txt").write_text("Spread Sheet, offline build. Open index.html in any modern browser; it needs no internet connection and makes no network requests. "
                                    "Fonts and the D3 library are embedded. See docs/security-review.md in the source repository for the review notes.\n")
    print(f"Wrote dist/offline/index.html ({len(html) // 1024} KB, no external requests)")
