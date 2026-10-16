"""Render og.png, the 1200x630 link-preview image, with headless Google Chrome.

Usage (from the project root, after build.py):
    python3 scripts/make_og.py

Screenshots the built index.html, then frames it in src/og-card.html with stats from data/items.json.
Needs Google Chrome and an internet connection (fonts and D3 load from CDNs).
"""
import json, pathlib, statistics, subprocess, tempfile, os

MENU_DATE = "Oct 16, 2026"
CHROME = os.environ.get("CHROME", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
root = pathlib.Path(__file__).resolve().parent.parent
items = json.loads((root / "data" / "items.json").read_text())
station = json.loads((root / "data" / "station.json").read_text())


def shoot(url, out, w, h, scale):
    subprocess.run([CHROME, "--headless=new", "--hide-scrollbars", "--disable-gpu", "--allow-file-access-from-files",
                    f"--force-device-scale-factor={scale}", f"--window-size={w},{h}", "--virtual-time-budget=8000",
                    f"--screenshot={out}", url], check=True, capture_output=True)


with tempfile.TemporaryDirectory() as tmp:
    tmp = pathlib.Path(tmp)
    shot = tmp / "dash.png"
    # a copy of the page that opens Head to head on the first two brands (CAVA vs Sweetgreen), or Bowls vs Pitas with one brand
    page_src = (root / "index.html").read_text()
    groups = list(dict.fromkeys(d["group"] for d in items))
    lines = list(dict.fromkeys(d["line"] for d in items))
    kind, a, b = ("g", groups[0], groups[1]) if len(groups) > 1 else ("r", lines[0], lines[1])
    hook = ('<script>window.__notour = true; addEventListener("load", () => { '
            f'h2h.a = "{kind}:" + {json.dumps(a)}; h2h.b = "{kind}:" + {json.dumps(b)}; renderH2H(); setView("h2h"); }});</script>')
    snap = tmp / "snap.html"
    snap.write_text(page_src.replace("</body>", hook + "</body>"))
    shoot(snap.as_uri() + "#h2h", shot, 1200, 800, 1)  # og-card.html's crop assumes this size
    prices = [d["price"] for d in items if not d["small"] and d["price"] is not None]
    med = statistics.median(prices)
    fill = {
        "__LINES__": str(len({d["line"] for d in items})),
        "__ITEMS__": str(len(items)),
        "__STATION__": str(len(station)),
        "__INGS__": str(len({i["name"] for d in items for i in d["ings"]})),
        "__BRANDS__": str(len({d["group"] for d in items})),
        "__BRAND_LIST__": ", ".join(dict.fromkeys(d["group"] for d in items)),
        "__MEDIAN__": f"${med:.2f}",
        "__DATE__": MENU_DATE,
        "__SHOT__": shot.as_uri(),
    }
    card = (root / "src" / "og-card.html").read_text()
    for k, v in fill.items():
        card = card.replace(k, v)
    page = tmp / "card.html"
    page.write_text(card)
    shoot(page.as_uri(), root / "og.png", 1200, 630, 1)
print(f"Wrote og.png ({(root / 'og.png').stat().st_size // 1024} KB)")
