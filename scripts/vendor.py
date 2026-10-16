"""Download the third-party files the page uses (D3 from cdnjs, Geist fonts from Google Fonts) into vendor/,
record their SHA-256 hashes in vendor/manifest.json, and print the SRI hash for the D3 script tag.

Usage: python3 scripts/vendor.py
Run once (or when bumping D3); build.py reads vendor/ for the integrity attribute and for the offline build.
"""
import base64, hashlib, json, pathlib, re, urllib.request
root = pathlib.Path(__file__).resolve().parent.parent
vend = root / "vendor"; vend.mkdir(exist_ok=True); (vend / "fonts").mkdir(exist_ok=True)
D3 = "https://cdnjs.cloudflare.com/ajax/libs/d3/7.8.5/d3.min.js"
FONTS_CSS = "https://fonts.googleapis.com/css2?family=Geist:wght@400..700&family=Geist+Mono:wght@400..600&display=swap"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"  # woff2-capable, so Google serves variable woff2

def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r: return r.read()

manifest = {"files": {}}
d3 = get(D3); (vend / "d3.v7.8.5.min.js").write_bytes(d3)
manifest["files"]["d3.v7.8.5.min.js"] = {"url": D3, "sha256": hashlib.sha256(d3).hexdigest(), "bytes": len(d3)}
manifest["d3_sri"] = "sha384-" + base64.b64encode(hashlib.sha384(d3).digest()).decode()
css = get(FONTS_CSS).decode()
fonts = []
for m in re.finditer(r"/\* (\w+) \*/\s*@font-face \{(.*?)\}", css, re.S):
    block = m.group(2)
    fam = re.search(r"font-family: '([^']+)'", block).group(1); weight = re.search(r"font-weight: ([^;]+);", block).group(1)
    src = re.search(r"url\((https://[^)]+)\) format\('woff2'\)", block); rng = re.search(r"unicode-range: ([^;]+);", block)
    if not src or m.group(1) != "latin": continue
    url = src.group(1); data = get(url)
    name = f"{fam.replace(' ', '')}-{weight.replace(' ', '_')}.woff2"; (vend / "fonts" / name).write_bytes(data)
    manifest["files"]["fonts/" + name] = {"url": url, "sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data)}
    fonts.append({"family": fam, "weight": weight, "file": "fonts/" + name, "unicode_range": rng.group(1) if rng else None})
manifest["fonts"] = fonts; manifest["fonts_css_url"] = FONTS_CSS
(vend / "manifest.json").write_text(json.dumps(manifest, indent=1))
print("D3", len(d3), "bytes, SRI", manifest["d3_sri"]); print("fonts:", [f["file"] for f in fonts])
