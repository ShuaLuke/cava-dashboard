# Spread Sheet: CAVA's menu, by the component

> Unofficial fan project. Not affiliated with, endorsed by or connected to CAVA Group, Inc. or its restaurants. Menus and prices change.

An interactive dashboard of [CAVA](https://cava.com)'s menu, read from cava.com on Oct 16, 2026: every chef-curated bowl and pita, the sides, drinks and desserts, and the 44-component build-your-own line with its up-charges and per-component nutrition. Prices are from the online ordering menu for the Dupont Circle store in Washington, DC.

It is a sibling of [Well & Call](https://github.com/ShuaLuke/back-bar-dashboard), the DC cocktail-menu dashboard, and reuses its code: swap drinks for menu items and bar ingredients for station components.

## Views
- **Overview**: KPIs, top pairings, by-menu-line price and calorie spread, most-used components, category mix, signals
- **Component lookup**: search a component, see ranked partners and the items
- **Pairing matrix**: co-occurrence heatmap of the top 16/24/32 components
- **Pairing map**: interactive chord diagram (stations ⇄ components, drill-down, filters)
- **Prep & inventory / Pricing / Menu gaps**: operations views built from the menu alone: fresh components only one item uses, what sits on the build-your-own line that no curated item features, how a bowl's price follows its main
- **Head to head**: pick any two menu lines (bowls vs. pitas to start) and compare side by side: price, calories, what they're built from, shared vs. exclusive components and pairings
- **Cost & sales (what if)**: a preview of margin and sales analysis. Costs are adjustable *assumptions* per component type. Sales are a seeded *random simulated* sample. Lists what real recipe, invoice and POS data would unlock
- **Compare brands**: hidden until a second brand is added to the data

On a desktop the Overview fits on one screen. Clicking a component, pairing or category opens a detail drawer with sub-maps. Hover any stat for details. On a phone, tap once for details and again to open.

## Run it
Open `index.html` in a browser. It needs an internet connection for D3 (cdnjs) and fonts (Google Fonts).

## Publish on GitHub Pages
Push the repo to GitHub, then Settings → Pages → Deploy from a branch → `main` / `(root)`. `index.html` is self-contained. Rebuild and commit `index.html` after every change. The `og:url` and `og:image` tags in `src/template.html` assume the site lives at `https://shualuke.github.io/cava-dashboard/`; change them if the repo gets another name.

## Rebuild after changing data or code
```
python3 scripts/normalize.py data/items_raw.tsv data/items.json   # raw menu rows + station.tsv -> items.json + station.json
python3 scripts/build.py                                           # template + data -> index.html
python3 scripts/make_og.py                                         # optional: re-render og.png (link preview) with headless Chrome
```

## Files
- `data/items_raw.tsv`: one row per menu item: group (brand), line (Bowls, Pitas, Sides, Drinks, Desserts), section, item, price, cal, ingredients as written on the menu (`;`-separated)
- `data/station.tsv`: the build-your-own line: station, component, up-charge, and per-portion nutrition from CAVA's Nutrition & Allergen Guide
- `scripts/normalize.py`: regex rules mapping menu wording to a canonical component and category (first match wins). Exits with an error listing anything unmapped. Also writes `data/station.json` with each component's canonical name so the page can join the line to the curated items
- `data/items.json`, `data/station.json`: normalized output the page reads
- `src/template.html`: the whole app (CSS + HTML + JS, D3 v7). Everything above the `<!--BODY-->` marker goes in `<head>`. `__DATA__` and `__STATION__` are replaced at build time
- `data/sources.md`: menu URLs, read dates and judgment calls

## Data notes
- Build-your-own bowls, pitas and the kids meal have no fixed ingredients, so they aren't items; the station catalog covers them. A build-your-own bowl or pita is $11.75 at the Dupont store.
- "Meals" are bowls and pitas; "add-ons" are sides, drinks and desserts. "Vegetarian" means no chicken, steak, lamb or salmon.
- Plain "rice" on the menu counts as saffron basmati rice. A side dip's description maps to the dip, not to its constituents.
- No sales or cost data. Operations views are based on the menu only.
