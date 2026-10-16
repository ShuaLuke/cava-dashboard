# Spread Sheet: CAVA's menu, by the component

> Unofficial fan project. Not affiliated with, endorsed by or connected to CAVA Group, Sweetgreen, Chipotle or their restaurants. Menus and prices change.

An interactive dashboard of [CAVA](https://cava.com)'s menu, with Sweetgreen and Chipotle alongside for comparison, read from each chain's own site on Oct 16, 2026: every named, fixed-recipe item (curated bowls, pitas, salads, wraps, plates, burritos, kids meals), the sides, drinks and desserts, and CAVA's 44-component build-your-own line with its up-charges and per-component nutrition. Prices are from each chain's online ordering menu for one downtown Washington, DC store (CAVA Dupont Circle, Sweetgreen Farragut Square, Chipotle Dupont Circle).

It is a sibling of [Well & Call](https://github.com/ShuaLuke/back-bar-dashboard), the DC cocktail-menu dashboard, and reuses its code: swap drinks for menu items and bar ingredients for station components.

## Views
- **Overview**: KPIs, top pairings, by-menu-line price and calorie spread, most-used components, category mix, signals
- **Component lookup**: search a component, see ranked partners and the items
- **Pairing matrix**: co-occurrence heatmap of the top 16/24/32 components
- **Pairing map**: interactive chord diagram (stations ⇄ components, drill-down, filters)
- **Prep & inventory / Pricing / Menu gaps**: operations views built from the menu alone: fresh components only one item uses, what sits on the build-your-own line that no curated item features, how a bowl's price follows its main
- **Head to head**: pick any two menu lines or two brands and compare side by side: price, calories, what they're built from, shared vs. exclusive components and pairings
- **Cost & sales**: a cost, sales-mix, menu-engineering and scenario tool that runs on your own recipe-cost and POS files, entirely in the browser tab (nothing is uploaded). Opens on a synthetic sample dataset so every view works before anything is loaded. See below
- **Compare brands**: CAVA, Sweetgreen and Chipotle side by side: price, add-ons, what they build from, signature components, common ground, and pairings the others use that one doesn't

On a desktop the Overview fits on one screen. Clicking a component, pairing or category opens a detail drawer with sub-maps. Hover any stat for details. On a phone, tap once for details and again to open.

## Cost & sales tool
Six tabs: **Data** (load CSV/TSV/.xlsx, templates, validation, column mapping, storage opt-in), **Costs** (per-item cost from portions after yield, up-charge coverage, cost a build, cost history, nutrition check), **Sales & mix** (mix-weighted food cost by store and month, menu engineering, build-your-own pick rates and builds, combinations not on the menu, cannibalization, attach rates, channel and daypart), **Scenarios** (commodity cost, repricing with elasticity, up-charges, remove or swap, new item or LTO, supply disruption, saved comparisons, price ladder), **Operations** (stores and regions, prep load, waste and low movers, theoretical vs actual, trend) and **Reconcile** (theoretical food cost against the books with pass criteria fixed in advance).

- Inputs: `docs/data-dictionary.md`, blank templates in `data/templates/`, filled examples in `data/sample/`.
- Method: `docs/methodology.md`; tests: `node --test tests/*.test.js`.
- Privacy: `docs/security-review.md`. The page's content-security policy blocks every network connection; the offline build makes no requests at all.
- The sample: `docs/sample-data.md`. A worked decision: `docs/walkthrough.md`. The gating test: `docs/reconciliation-test.md`. Delivery and support: `docs/delivery-and-support.md`. The asks tracker: `docs/cava-pilot-tracker.md`.

## Run it
Open `index.html` in a browser. It needs an internet connection for D3 (cdnjs) and fonts (Google Fonts). `dist/offline/index.html` is the same page with D3 and the fonts embedded: it needs no connection and makes no network requests.

## Publish on GitHub Pages
Push the repo to GitHub, then Settings → Pages → Deploy from a branch → `main` / `(root)`. `index.html` is self-contained. Rebuild and commit `index.html` after every change. The `og:url` and `og:image` tags in `src/template.html` assume the site lives at `https://shualuke.github.io/cava-dashboard/`; change them if the repo gets another name.

## Rebuild after changing data or code
```
python3 scripts/normalize.py data/items_raw.tsv data/items.json   # raw menu rows + station.tsv -> items.json + station.json
python3 scripts/build.py --offline                                 # template + data + src/*.js -> index.html and dist/offline/index.html
node --test tests/*.test.js                                        # cost-model test cases
node scripts/make_sample.js                                        # templates, data dictionary and sample files from src/
python3 scripts/vendor.py                                          # once: download D3 + fonts into vendor/ (SRI hash, offline build)
python3 scripts/make_og.py                                         # optional: re-render og.png (link preview) with headless Chrome
```

## Files
- `data/items_raw.tsv`: one row per menu item: group (brand: CAVA, Sweetgreen, Chipotle), line (menu line; names are unique across brands), section, item, price, cal, ingredients as written on the menu (`;`-separated)
- `data/station.tsv`: CAVA's build-your-own line: station, component, up-charge, and per-portion nutrition from CAVA's Nutrition & Allergen Guide
- `scripts/normalize.py`: regex rules mapping menu wording to a canonical component and category (first match wins). Exits with an error listing anything unmapped. Also writes `data/station.json` with each component's canonical name so the page can join the line to the curated items
- `data/items.json`, `data/station.json`: normalized output the page reads
- `src/template.html`: the menu dashboard (CSS + HTML + JS, D3 v7). Everything above the `<!--BODY-->` marker goes in `<head>`. `__DATA__`, `__STATION__` and the script markers are replaced at build time
- `src/costmodel.js`: the cost & sales engine (templates, CSV, validation, costing, analysis, scenarios, reconciliation); runs in the browser and under Node
- `src/costtool.js`: the tool's UI; `src/sample.js`: the synthetic dataset generator; `src/xlsx-lite.js`: dependency-free .xlsx reader
- `tests/costmodel.test.js`: hand-calculated cases; `docs/`: dictionary, methodology, security review, sample notes, walkthrough, reconciliation test, delivery plan, asks tracker
- `vendor/`: pinned copies of D3 and the fonts with hashes (`scripts/vendor.py`); `dist/offline/`: the offline build
- `data/sources.md`: menu URLs, read dates and judgment calls

## Data notes
- Build-your-own bowls, pitas and the kids meal have no fixed ingredients, so they aren't items; the station catalog covers them. A build-your-own bowl or pita is $11.75 at the Dupont store.
- "Meals" are bowls, pitas, salads, wraps, plates, burritos and kids meals; "add-ons" are sides, chips, drinks and desserts (any line whose name says so). "Vegetarian" means no chicken, beef, pork, lamb or fish.
- Chipotle's regular burritos, bowls, tacos and salads are build-your-own, so only its named items (featured bowls, the High Protein menu, kids meal) are items. Sweetgreen's bottled drinks and sweets have no price on its store menu.
- Plain "rice" on the menu counts as saffron basmati rice. A side dip's description maps to the dip, not to its constituents.
- The menu views use no sales or cost data. The Cost & sales tool's default dataset is synthetic (`docs/sample-data.md`); none of it is CAVA's real cost, sales or margin data.
