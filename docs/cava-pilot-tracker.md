# CAVA pilot asks · tracker

Every ask from the pilot list, what the tool does about it today, and a column to record CAVA's answer. Status: **Built** (in the tool now), **Partial** (built with a stated limit), **Doc** (delivered as a document or process), **Needs CAVA** (built, but only real data or a CAVA decision makes it meaningful), **Deferred** (not built; estimate given). "Where" names the tab in Cost & sales.

Reviewed against the build of Oct 16, 2026.

## 1. Data handling and security

| ID | Tag | Ask | Status | Where / how | CAVA answer |
|---|---|---|---|---|---|
| D1 | Must | Local file upload, CSV or Excel, no network | **Built** | Data tab: drop CSV/TSV/.xlsx; CSP `connect-src 'none'` makes a network call impossible | |
| D2 | Must | Published input templates and data dictionary | **Built** | Data tab (blank template + sample per file type, Columns panel); `data/templates/`, `docs/data-dictionary.md` | |
| D3 | Must | Offline build, libraries and fonts bundled | **Built** | `dist/offline/index.html` (one file, zero external requests), from `python3 scripts/build.py --offline` | |
| D4 | Must | Security review package | **Built** | `docs/security-review.md`: every request, CSP, SRI hash, storage keys, how to verify; full source in `src/` | |
| D5 | Should | No persistence by default; opt-in; clear-all | **Built** | Data tab checkbox (off by default) and "Clear all data" in the banner | |
| D6 | Should | Input validation with clear errors | **Built** | Data tab Checks panel: unmapped components, missing costs, unit mismatches, items without recipes, unknown items in sales with their share, bad rows by file and row number | |
| D7 | Should | Column mapping on load | **Built** | Automatic by name and 100+ aliases (PLU, Check #, Business Date…); manual mapping panel per file; remembered only with the storage opt-in | |
| D8 | Nice | Direct export compatibility with CAVA's systems | **Needs CAVA** | The mapper covers common POS/recipe-costing headers; exact exports need CAVA to name the systems and share one anonymised file each | |
| D9 | Nice | Self-hosting behind CAVA's sign-in | **Partial** | The offline file can be dropped on any internal web server as is; sign-in is the server's. Reading files from an internal URL: 1–2 days (see L5) | |
| D10 | Must | Sample data by default, toggle, banner, downloadable | **Built** | Opens on the synthetic dataset; banner on every tab (purple = sample, green = your data); one-click switch both ways; sample files download from the Data tab | |

## 2. Cost model

| ID | Tag | Ask | Status | Where / how | CAVA answer |
|---|---|---|---|---|---|
| C1 | Must | Per-component costs | **Built** | `components.csv`; one cost per component/SKU, per store if wanted | |
| C2 | Must | Per-item portions | **Built** | `recipes.csv` portions (0.5, 1, 2…); item drawer shows the build-up | |
| C3 | Must | Case-to-portion math with yield | **Built** | case cost ÷ (case size × yield) × portion size; weight, volume and count units; `portion_cost` override | |
| C4 | Must | Up-charge coverage | **Built** | Costs → Up-charges: incremental cost vs the included main, margin per add, break-even, picks, margin in scope | |
| C5 | Should | Packaging and paper, dine-in vs digital | **Built** | `packaging.csv` by line and service; shown per item and in mix totals ("with paper") | |
| C6 | Should | Real waste and yield | **Built** | Yield in the portion math; `waste.csv` replaces the old flat $0.45 (Operations → Waste, Reconcile "+ logged waste") | |
| C7 | Should | Build-your-own costing incl. free quarter pita and doubles | **Built** | Every BYO sales line is costed from its modifiers; Costs → Cost a build prices any order by hand | |
| C8 | Should | Cost version history | **Built** | `effective_date` rows; Costs → Cost history lists components and items moved and the driver | |
| C9 | Nice | Nutrition from the same model | **Built** | Costs → Nutrition check: calories and sodium from portions vs menu calories (needs per-portion values in components) | |

## 3. Sales and menu engineering

| ID | Tag | Ask | Status | Where / how | CAVA answer |
|---|---|---|---|---|---|
| S1 | Must | Mix-weighted food cost by store and period | **Built** | Sales & mix → Food cost by store (store × month, by line); scope chips for stores, months, channel | |
| S2 | Must | Build-your-own modifier analysis | **Built** | Sales & mix → Build-your-own: pick rates by station, components per order, most common full builds | |
| S3 | Should | Menu engineering on real sales | **Built** | Sales & mix → Menu engineering: matrix and table with the keep / reprice / promote / cut reading | |
| S4 | Should | Combinations not on the menu | **Built** | Sales & mix → Build-your-own → Combinations not on the menu, with cost, price for target and nearest item | |
| S5 | Should | Cannibalization check | **Built** | Same tab: look-alike builds vs curated units, with a reading | |
| S6 | Should | Add-on attach rates by channel | **Built** | Sales & mix → Attach & orders: heatmap by add-on line, top attached items, channel chips | |
| S7 | Nice | Channel split and price differences | **Built** | Sales & mix → Channel & daypart | |
| S8 | Nice | Daypart and day-of-week | **Built** | Same tab (needs a time or daypart column) | |
| S9 | Nice | Spend per order drivers | **Built** | Attach & orders → Spend per order (correlation, labelled as such) | |

## 4. Scenarios and menu decisions

| ID | Tag | Ask | Status | Where / how | CAVA answer |
|---|---|---|---|---|---|
| M1 | Must | New item builder | **Built** | Scenarios → New item: assemble from components; cost, margin at a price, price for target, cross-utilization, new prep load | |
| M2 | Must | Commodity cost scenarios | **Built** | Scenarios → Commodity cost changes (% or $); every item, up-charge and the mix total update | |
| M3 | Must | Repricing with a demand assumption | **Built** | Scenarios → Repricing with an elasticity slider (−2 to 0) | |
| M4 | Should | Remove or swap scenarios | **Built** | Remove items (retention slider for where volume moves) and Swap a component | |
| M5 | Should | Limited-time offer impact | **Built** | New item with units per store-week, share pulled from the line, and run length in weeks | |
| M6 | Should | Saved, side-by-side scenarios, export | **Built** | Save, open, delete; compare up to three against the base; CSV and JSON export | |
| M7 | Nice | Supply-disruption view | **Built** | Scenarios → Supply disruption: items and orders affected, sales at risk | |
| M8 | Nice | Price ladder check | **Built** | Scenarios → Price ladder: base + up-charges vs price, gaps and overlaps | |

## 5. Operations and multi-store

| ID | Tag | Ask | Status | Where / how | CAVA answer |
|---|---|---|---|---|---|
| O1 | Should | Multi-store and regional pricing | **Built** | Store and month chips on every tab; Operations → Stores & regions: stores side by side, regional items, store prices | |
| O2 | Should | Prep load per item | **Built** | Operations → Prep load: components, stations, prep steps, what only this item needs; new items appear too | |
| O3 | Should | Waste exposure | **Built** | Operations → Waste: weekly waste cost per component from the log, waste % of usage | |
| O4 | Should | Cross-utilization score | **Built** | Prep load column; Cross-utilization check for any item; shown in the new-item builder | |
| O5 | Nice | Low-mover list | **Built** | Operations → Waste → Low movers, with carrying (waste) cost when a log is loaded | |
| O6 | Nice | Theoretical vs actual usage | **Built** | Operations → Theoretical vs actual from `inventory.csv` | |
| O7 | Nice | Trend tracking | **Built** | Operations → Trend: store food cost by month, items whose margin is slipping | |

## 6. Proof of value

| ID | Tag | Ask | Status | Where / how | CAVA answer |
|---|---|---|---|---|---|
| P1 | Must | Synthetic demo dataset in the templates, shipped as default | **Built** | 3 stores, 3 months, 33k orders with modifiers, waste, actuals, inventory; `docs/sample-data.md` documents every parameter and range | |
| P2 | Must | Reconciliation test with pass criteria defined in advance | **Built / Needs CAVA** | Reconcile tab and `docs/reconciliation-test.md`: coverage ≥ 97%, sales within 2%, pass at a 0–3 point gap. Needs one real store-month, loaded privately | |
| P3 | Must | One real decision end to end | **Doc / Needs CAVA** | `docs/walkthrough.md`: the salmon up-charge after a 12% cost rise, and an LTO, on the sample. To repeat on CAVA-shaped dummy data once CAVA picks the question | |
| P4 | Should | Written methodology | **Doc** | `docs/methodology.md`, every formula and assumption | |
| P5 | Should | Test cases run after every change | **Built** | 23 cases in `tests/costmodel.test.js` (`node --test tests/*.test.js`); the 17 hand-calculated ones also run on the Reconcile tab | |

## 7. Delivery and long-term support

| ID | Tag | Ask | Status | Where / how | CAVA answer |
|---|---|---|---|---|---|
| L1 | Should | Maintenance plan | **Doc** | `docs/delivery-and-support.md` (response times and backup maintainer to agree) | |
| L2 | Should | Menu update process without code | **Doc / Built** | Same document; the tool reads new items, prices and cost versions from the files | |
| L3 | Should | Exports | **Built** | CSV on every table, PNG on charts, scenario CSV/JSON, templates and sample files | |
| L4 | Should | Ownership and licensing | **Doc** | Same document, proposal to agree | |
| L5 | Nice | Automated feeds | **Doc** | Three-step path, all on CAVA's side | |
| L6 | Nice | Role-based views | **Deferred** | About a week, after the pilot shows which views each team uses | |
| L7 | Nice | Accessibility and mobile | **Partial** | Keyboard, labels, phone layout done; screen-reader pass and tablet controls deferred (about a week) | |

## Open questions for CAVA

1. Which recipe-costing and POS systems export the files (for D8)?
2. Which store-month for the reconciliation test, and who runs it?
3. Which live decision for P3?
4. The *to agree* items in `docs/delivery-and-support.md`: response times, backup maintainer, licence.
