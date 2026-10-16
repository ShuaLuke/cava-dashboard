# The reconciliation test

The one test that decides whether anything else is worth pursuing: load one real store-month on CAVA's side and check whether theoretical food cost lands close to what the books show. The pass criteria below are fixed in advance and built into the tool (`CostModel.RECON` in `src/costmodel.js`, shown on the Reconcile tab).

## What CAVA loads

Private to CAVA; nothing leaves the machine (see `docs/security-review.md`). Use the offline build (`dist/offline/index.html`) on an internal laptop.

| File | What it holds for the store-month | Where it usually comes from |
|---|---|---|
| `components.csv` | Every component with case cost, case size, portion size, yield (or a portion cost) and up-charge, as of that month | Recipe-costing system export or the culinary costing sheet |
| `items.csv` | Every item sold that month with its menu price; the build-your-own lines with `byo = 1` | Menu management / POS item list |
| `recipes.csv` | Portions of each component in each curated item | Recipe cards |
| `sales.csv` | Every order line for the store-month with order id, date, item, quantity and net price | POS export |
| `modifiers.csv` | Every component picked on every build-your-own line (and adds on curated items) | POS modifier export |
| `actuals.csv` | One row: the store, the month, food COGS from the P&L and net sales from the P&L | Finance |
| optional `waste.csv`, `inventory.csv` | The month's waste log and counts | Store systems |

Templates with exact columns: `data/templates/`; dictionary: `docs/data-dictionary.md`. The column mapper on the Data tab accepts the systems' own header names, so exports need not be reformatted.

## Steps

1. Open the tool, Data tab, drop the files. Check that every file shows "Ready" and that the Checks panel reports no errors. Problems it reports (unmapped components, items without recipes, sales for unknown items, unit mismatches) are fixed in the files, not worked around.
2. Click "Use this data". The banner turns green ("Your data").
3. Reconcile tab. One row per store-month in `actuals.csv`.
4. Record the row: coverage, theoretical %, theoretical + logged waste, books %, gap, verdict. Export the table ("⤓ CSV") for the record.

Time: an hour the first time, mostly spent on the component and recipe files; minutes after that.

## What counts as a pass

| Check | Rule | If it fails |
|---|---|---|
| Coverage | ≥ 97% of the month's net sales is costed (every sold item has a recipe; every build-your-own line has modifiers) | **Not assessable.** Fix the files; the result is not a verdict on the model. |
| Sales agree | Sales in the file within 2% of net sales in the books | **Review.** The POS extract and the P&L disagree; fix the extract before judging cost. |
| Gap = books % − theoretical % | 0 to +3.0 points | **Pass.** The books carry waste, over-portioning and shrink; theoretical does not. 1–3 points is the normal distance. |
| | −1.0 to 0, or +3.0 to +5.0 | **Review.** Negative: recipes, portions or costs are overstated, or purchases were timed across the month boundary. High: waste or portioning is above normal, or something is missing from recipes or costs. The waste log narrows it down. |
| | below −1.0 or above +5.0 | **Fail.** The model does not describe the store. Find out why before building anything on it. |

A pass on one store-month means the component model and the cost inputs are sound for that store, and the rest of the tool can be trusted on that data. It does not say the gap is "good" or "bad" operationally; that is what the waste and theoretical-vs-actual views are for.

## What to do with each outcome

- **Pass**: proceed to the proof-of-value decision (`docs/walkthrough.md`) on CAVA's data, then a second store-month to confirm.
- **Review**: list the top five items by sales and check their recipes and costs by hand against the Costs tab (click an item for its build-up). Check cost effective dates against invoice dates. Load the waste log and re-read "+ logged waste".
- **Fail**: compare one high-volume component's theoretical usage with purchases (`inventory.csv`, Operations → Theoretical vs actual). A large variance on one component points at a recipe or portion error; a uniform variance across components points at costs or sales coverage.

## What the sample shows

With the built-in sample, eight store-months pass (gaps of 1.6–2.0 points, by construction) and Clarendon in September fails (5.7 points, by construction) so the fail state is visible before any real data is loaded.
