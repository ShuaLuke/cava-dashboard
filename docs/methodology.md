# Methodology

Every formula and assumption in the Cost & sales tool, so finance and culinary can check the math. The code is `src/costmodel.js`; the hand-calculated cases in `tests/costmodel.test.js` (also shown on the Reconcile tab) must reproduce these numbers exactly after every change.

Vocabulary: a **component** is one thing the line stocks (grilled chicken, hummus, a bottle of water). An **item** is a menu entry: a curated bowl with a fixed recipe, a side, a drink, or a build-your-own line (`byo = 1`) whose contents come from the order's **modifiers**. A **portion** is one scoop or piece as served.

## 1. Portion cost

Each component row gives either a `portion_cost` directly, or the case it is bought in:

```
usable per case   = case_size × unit(case_unit → portion_unit) × yield_pct / 100
cost per portion  = case_cost ÷ usable per case × portion_size
```

Example: a 40 lb case of chicken at $110, 4 oz portions, 80% yield after trim and cook loss. 40 lb = 640 oz; usable = 512 oz; cost = $110 ÷ 512 × 4 = **$0.859**.

- Units convert within one family only (weight: g, kg, oz, lb; volume: ml, l, fl oz, cup, pt, qt, gal; count: each, piece, serving, dozen). A weight case with a volume portion is a **unit mismatch** error, never a silent guess.
- Yield must be between 0 and 100. Blank means 100.
- `portion_cost`, when present, wins over the case math (for prepped items costed elsewhere).

## 2. Cost versions and store costs

A component may have several rows. `effective_date` makes versions: the cost used on a given day is the latest version dated on or before that day; before the first dated version, the undated row (or the earliest version) applies. A row with a `store_id` is used for that store only; stores without their own row use the global one. Every sales line is costed at its own store and date, so a price rise on September 1 affects September sales, not August's.

## 3. Item cost

Curated item (recipe rows):

```
food cost = Σ over recipe rows ( portions × portion cost of the component )
```

Half a scoop is `portions = 0.5`; a double is 2. Two mains in one bowl are two rows (0.5 each, or 1 each).

Build-your-own line (no recipe): the same sum over the order's modifier rows. A curated item with modifiers (an add or swap) is the recipe plus its modifiers.

Packaging (optional file) is added per unit by menu line and service: `channel` in_store → `dine_in`; app, web, delivery and catering → `digital`; `all` rows are fallbacks. It is shown separately everywhere ("food" vs "food + paper") so theoretical food cost stays comparable with the books.

Waste is **not** a per-item adder. It is reported at period level from the waste log (section 10) and shows up in reconciliation as the gap between theoretical and actual.

## 4. Revenue per line

```
unit revenue = net_price if given
             = store menu price + Σ (up-charge × portions) over modifiers, otherwise
line revenue = unit revenue × qty
```

`net_price` is what was paid after discounts, including up-charges; delivery menus with marked-up prices show up here and in the channel price table.

## 5. Mix-weighted (theoretical) food cost

For any scope (stores, months, channel):

```
theoretical food cost % = Σ line cost ÷ Σ line revenue × 100
with paper              = (Σ line cost + Σ packaging) ÷ Σ line revenue × 100
gross profit            = Σ revenue − Σ food − Σ packaging
```

The same sums are kept per store, month, store-month, channel, daypart, day of week, menu line and item.

**Coverage**: build-your-own lines with no modifiers and items with no recipe have unknown cost; their revenue is counted and their share is reported as "uncosted". The reconciliation test refuses to judge a month below 97% coverage.

## 6. Menu engineering

Kasavana & Smith's matrix on curated meals (build-your-own lines are excluded: they are a line, not an item). Per item in scope:

```
units, revenue, cost from the sales lines
contribution per unit = (revenue − cost) ÷ units
popularity threshold  = 0.7 × total meal units ÷ number of meals sold
contribution threshold = Σ contribution ÷ Σ units  (sales-weighted average)
```

Star = above both; Plowhorse = popular, low contribution; Puzzle = unpopular, high contribution; Dog = neither. Add-ons get their own thresholds. The reading column gives the standard action: keep and feature, reprice or trim cost, promote or reposition, candidate to cut.

## 7. Up-charge coverage

For every component with an up-charge:

```
incremental cost = portion cost − average cost of the included mains   (mains: it replaces one)
                 = portion cost                                       (toppings such as avocado: pure add)
margin per add   = up-charge − incremental cost
break-even cost  = up-charge + average included main   (mains)
                 = up-charge                           (adds)
picks            = Σ portions picked in scope (from modifiers)
margin in scope  = margin per add × picks
```

"Included mains" are the mains with no up-charge (grilled chicken, harissa honey chicken, falafel, roasted vegetables in the sample), averaged at the reference store and date.

## 8. Build-your-own analysis

From orders whose line is a `byo` item with modifiers:

- **Pick rate** of a component = build-your-own orders containing it ÷ all build-your-own orders.
- **Components per order** = Σ modifier quantities ÷ orders; also per station.
- **Builds**: the sorted set of (component, quantity) on a line is its signature. Orders are counted per signature; the most common signatures are the top builds.
- **Nearest curated item** = the curated item on the same line with the highest Jaccard similarity (shared components ÷ components in either) to the build's component set.
- **Combinations not on the menu** = builds ordered at least twice whose nearest curated item is less than 80% similar, ranked by orders, with their average paid price, cost, food cost % and the price that would hit the target.
- **Cannibalization** for a curated item = look-alike builds (≥ 75% similar, same line) ÷ (curated units + look-alike builds). High overlap: the item mostly formalizes an existing build; low: it brings new demand. This is a heuristic read of co-existence, not a before/after test.

## 9. Orders

- **Attach rate** of add-on line L for meal M = orders holding M that also hold an item from L ÷ orders holding M. Also by channel, and the five most attached individual items.
- **Spend per order lift** = average order value of orders containing the item − average of orders without it (items with ≥ 20 orders). Correlation only.
- **Channel price differences** = average paid per unit by channel, for items where any channel differs from in-store by more than a cent.
- **Dayparts** from `time` when `daypart` is blank: before 11:00 breakfast, 11:00–14:59 lunch, 15:00–16:59 afternoon, from 17:00 dinner.

## 10. Operations

- **Prep load** per item: number of components, number of stations, Σ `prep_steps` (default 1 per component), and the components nothing else moves ("only this item needs": used by no other curated item and picked under 20 portions per store-week).
- **Cross-utilization** of a recipe = share of its components already at volume elsewhere (on two or more curated items, or ≥ 20 portions per store-week on the line). Works for any item and for candidates built on the Scenarios tab.
- **Waste exposure**: waste cost = logged portions × the portion cost at that store and date; waste % = wasted ÷ (theoretical usage + wasted); per week = ÷ weeks in scope. Theoretical usage of a component = Σ portions implied by the sales lines (recipes + modifiers).
- **Low movers** = station components (greens, grains, dips, mains, toppings, dressings) that no curated item uses and whose pick rate is under 3%.
- **Theoretical vs actual usage** = actual (begin + purchased − end, in portions) against theoretical for the same store-months; variance over +10% reads as over-portioning or waste, under −5% as under-portioning or a count error.
- **Trend**: per item, contribution per unit and food cost % in the first month in scope against the last; "slipping" = contribution down more than $0.10 or food cost up more than 2 points. Needs two months.
- **Regional**: items sold at a subset of the stores in scope, and items with a store-specific price.

## 11. Scenarios

A scenario re-runs the whole engine with changes applied; every table is recomputed and compared with the base.

- **Cost change**: component cost × (1 + % ÷ 100), or set to a dollar amount, at every version.
- **Swap**: component A is costed and counted as component B wherever it appears (recipes and modifiers), portions unchanged.
- **Repricing**: new price per item. Units respond: `units' = units × (1 + elasticity × Δprice ÷ old price)`, with elasticity adjustable (default −0.8; 0 switches the demand response off). Revenue and cost scale with units'.
- **Up-charge change**: Δ on the premium component. Share of picks kept `pf = 1 + elasticity × Δ ÷ old up-charge` (clamped 0–1.5; if the old up-charge was 0, the item price is the denominator). Lines keeping the pick pay Δ more; lines dropping it lose the old up-charge in revenue and the incremental cost in food cost (they take an included main instead). Pick counts in the up-charge table are scaled by `pf`.
- **Remove an item**: its lines are dropped; `retention` (default 80%) of its units move to the other items on the same menu line, pro rata to their units; the rest is lost.
- **New item / limited-time offer**: cost from its recipe; projected units = units per store-week × stores in scope × weeks (LTO weeks, capped at the scope); a `cannibal` share (default 70%) of that volume is pulled pro rata from the other items on its line, the rest is new demand. The projection is spread over stores, months and channels in proportion to existing units.
- **Supply disruption**: for a component, the curated items using it (units, sales, share) and the build-your-own orders picking it; revenue at risk is their sum. Reporting only; nothing is re-routed.
- **Saved scenarios** are kept in memory (and on this device only with the storage opt-in). Compare shows up to three against the base; exports are CSV (table) and JSON (the scenario definitions).

**Price ladder**: for each curated meal on a line that has a build-your-own item, `formula = build-your-own base price + Σ up-charges of its up-charged components`; gap = price − formula. Items with the same formula and different prices are flagged as overlaps.

## 11b. Month-to-month decomposition (Monthly review, step 2)

Why food cost % moved from month A to month B, in two parts that add up exactly:

```
cost effect  = FC(A's sales costed at B's component costs) − FC(A)
mix & price  = FC(B) − FC(A's sales costed at B's component costs)
```

"Costed at B's costs" re-runs the engine with every line costed as of B's last day (`scope.costAsOf`). Per item, its contribution to the change in points is `(item food cost ÷ total sales)_B − (item food cost ÷ total sales)_A`; these sum to the total change. Per component, the table lists the cost before and after, the dollar impact at B's usage and the points of food cost that represents. Mix indicators shown alongside: build-your-own share of meals, share of builds with a premium main, add-on share of units, average paid per unit, average order.

## 11c. New-item candidates (Suggest new menu items)

From the "combinations not on the menu" list (section 8):

```
score = contribution per order × orders per store-week × (0.5 + 0.5 × share of components at volume) × min(1, target ÷ food cost %)
```

where contribution per order = average paid − build cost, and the suggested price is the average paid rounded to 5¢. The "why" for each candidate states the orders, the components already at volume (and any new prep), the food cost at the paid price against the target, and the closest curated item with its similarity. "Evaluate as a new item" carries the recipe, price and observed volume into the menu-change flow.

## 11d. Portion changes

A scenario may replace an item's recipe (`scn.recipes[item] = [{component, portions}]`). Every sales line of that item is re-costed with the new portions; nothing else changes. The nutrition check recomputes with the new portions when per-portion calories are loaded.

## 11e. What to do: recommendations

Given a situation, the advisor generates candidate moves, scores each with the same formulas the scenario engine uses, ranks them, assembles a plan and verifies the plan with one full engine run.

Situations and their baseline:

| Situation | Baseline the moves are measured against |
|---|---|
| Improve food cost | today |
| A component cost changed by x% | today's menu at the new cost (the loss at current prices is shown first) |
| A component is unavailable | every curated item that needs it comes off the menu (retention applies) and build-your-own picks of it are served nothing and pay no up-charge |
| A new component is available | today (the component joins the model for the session with its cost and up-charge) |
| A price change is planned | today with that change applied |

Candidate moves and their quick estimates (per period in scope, net of packaging so they match the engine's gross profit):

- **Reprice an item** to p′: `units × f × (paid′ − cost − paper) − units × (paid − cost − paper)`, where `f = 1 + elasticity × (p′ − p) ÷ p` and the paid price scales with the menu price (channel markups and discounts are kept). Candidates: +$0.25 to the maximum step, and the price that hits the target.
- **Change an up-charge** to u′: `picks × (Δ × pf − (1 − pf) × margin)`, `pf = 1 + elasticity × Δ ÷ u`, plus a reprice of every curated item that contains the component so the ladder holds (bundled into the same move). Candidates: +$0.25 to the maximum step, and the up-charge that keeps a 25% margin.
- **Trim a portion** by 12.5%: `units × portions trimmed × portion cost`; flagged for culinary sign-off.
- **Replace a component in curated recipes** with a same-station alternative costing at least half as much (premium mains only with premium mains): `portions × (old cost − new cost)`; flagged for culinary sign-off. When a component is unavailable the substitute applies everywhere, build-your-own included, and the move's value is what it wins back against the baseline: the kept items' contribution, the cost difference, and the substitute's up-charge (if any) on the picks.
- **Remove an item** (Dogs only, meals only): `−(its contribution) + retention × units × average contribution of the other items on its line`.
- **Add a curated item** from the candidates in 11c: `units × (price − cost − paper) − cannibal × units × average line contribution`, units = what guests already build per store-week.

Ranking: the estimate, discounted ×0.8 if the item stays over target, ×0.75 if more than 15% of volume is at risk, ×0.7 for recipe replacements, ×0.95 for other culinary moves, ×0.8 for removals, and ×1.5 for a move that repairs the ladder. One entry per move and target. The plan takes moves in rank order, at most five, skipping any worth less than 5% of the best, with at most one price move and one recipe move per item, no move on a removed item, one component per swap, one new item. Moves can be ticked on and off; the plan is then re-verified. Verification = `analyze` with every chosen move merged into one scenario (for a lost component, a substitute replaces the baseline); the verified figure is the headline, the quick estimate is shown beside it.

## 12. Reconciliation test

Per store-month with an `actuals` row (channel filter ignored):

```
theoretical %   = Σ line cost ÷ Σ line revenue (sales file)
+ logged waste  = (Σ line cost + waste cost in the month) ÷ Σ line revenue
books %         = actual_food_cost ÷ (net_sales from the books, or the sales file if blank)
gap             = books % − theoretical %   (points)
```

Verdict, decided before the test (`CostModel.RECON`):

| Check | Rule | Result |
|---|---|---|
| Coverage | costed revenue ÷ revenue ≥ 97% | otherwise **Not assessable** |
| Sales agree | \|file − books\| ÷ books ≤ 2% | otherwise **Review** (fix the extract first) |
| Gap | 0 to +3.0 points | **Pass** |
| Gap | −1.0 to 0, or +3.0 to +5.0 | **Review** |
| Gap | below −1.0 or above +5.0 | **Fail** |

Why a positive gap is the expected result: the books carry waste, over-portioning, comps and shrink; theoretical does not. Theoretical above the books means recipes, portions or costs are overstated. Overall: Pass only if every judged store-month passes; Fail if any fails; otherwise Review.

## 13. Cost history and nutrition

- **Cost history**: for each `effective_date`, every component whose cost changed and every curated item whose cost moved, with the component that drove the largest part of the move.
- **Nutrition**: calories (and sodium) per item = Σ portions × per-portion values from the components file, against `menu_calories`. Differences over 80 calories are highlighted; they usually mean the curated recipe uses smaller portions than the station defaults.

## 14. Assumptions and limits

- A portion is the same size everywhere unless the recipe or modifier says otherwise; the tool does not know about scoop-size drift between stores (the theoretical vs actual table is where that shows).
- Demand responses (elasticity, retention, cannibalization) are user-set assumptions applied linearly. They are for comparing options, not forecasting.
- Up-charge economics assume a premium main replaces an included one; if guests add a second main, the modifier row's quantity carries that.
- Scope filters apply to sales; cost versions apply by date regardless of scope. Costed-at date for the Costs view is the last sales day in scope (or the latest cost date without sales). The Price change flow defaults its base period to the latest month; Menu change uses all loaded months.
- Every figure in the guided flows can be hovered for its formula, the values plugged in and the source file; figures that depend on a user-set assumption (elasticity, retention, share pulled from the line, forecast units) are shown in amber and say so.
- Orders without `order_id` are treated as single-line orders, which disables attach rates, order lift and cannibalization.
- No labor, occupancy or discounts beyond what `net_price` already reflects.
