# Data dictionary

The input files the Cost & sales tool reads, with exact column names, types and units. Blank templates with one example row are in `data/templates/`; filled examples are in `data/sample/` and downloadable from the tool's Data tab.

General rules:

- CSV, TSV or Excel (.xlsx). In a workbook, name each sheet after the file type (components, items, …) and every sheet loads at once.
- Column order does not matter. Headers are matched by name, case-insensitively, ignoring spaces and punctuation; the alternative names listed below are recognised automatically, and anything else can be mapped by hand on load.
- Dates: YYYY-MM-DD preferred; M/D/YYYY, YYYYMMDD, D-Mon-YY and Excel date cells are accepted. Months: YYYY-MM.
- Money in dollars without symbols (12.50). Percentages as numbers (80 means 80%).
- Codes (store_id, item_id, component_id) must match exactly across files. They are case-sensitive.
- Several files of the same type can be loaded together (one sales file per month, for example); their rows are concatenated.
- Rows the tool cannot use are never dropped silently: every problem is listed on the Data tab with the file, row and reason.

## Components (recipe cost) · `components.csv`

**Required.** One row per component (or SKU) and cost version. Portion cost is computed from the case, or taken from portion_cost when given. Repeat a component with a later effective_date to add a cost version, or with a store_id to give one store its own cost.

| Column | Required | Type | Meaning | Example | Also recognised as |
|---|---|---|---|---|---|
| `component_id` | yes | text | Unique code. Matches component_id in recipes, modifiers, waste and inventory. | `glazed-salmon` | sku, ingredient_id, item_code, code, id, component, ingredient |
| `component_name` | yes | text | Display name. | `Glazed Salmon` | name, ingredient_name, description, ingredient, component |
| `station` | yes | text | Where it lives on the line: Greens, Grains, Dips + Spreads, Mains, Toppings, Dressings, Sides, Sweets, Drinks or Packaging. | `Mains` | category, group, family, type, line_station, station_name |
| `case_cost` |  | num ($) | What one purchase unit (case, bag, bottle) costs. | `118.40` | case_price, pack_cost, purchase_cost, invoice_cost, cost_per_case, unit_cost, price_per_case |
| `case_size` |  | num | How much is in one purchase unit, in case_unit. | `40` | pack_size, case_qty, case_quantity, purchase_qty, pack, size |
| `case_unit` |  | text | Unit of case_size: lb, oz, kg, g, gal, qt, pt, cup, fl oz, l, ml, each. | `lb` | purchase_unit, pack_unit, uom, unit, case_uom |
| `portion_size` |  | num | One menu portion (scoop, piece), in portion_unit. | `4` | portion, serving_size, portion_qty, portion_weight, serving |
| `portion_unit` |  | text | Unit of portion_size. Must be the same kind (weight, volume or count) as case_unit. | `oz` | serving_unit, portion_uom |
| `yield_pct` |  | num (%) | Usable share after trim, cook loss and prep, 0–100. Blank = 100. | `80` | yield, yield_percent, usable_pct, usable |
| `portion_cost` |  | num ($) | Optional. If given, used as the cost of one portion instead of the case math. | `0.92` | cost_per_portion, portion_price, unit_portion_cost, cost, plate_cost |
| `upcharge` |  | num ($) | What a guest pays to add it to a build-your-own order. Blank = 0 (included). | `4.25` | up_charge, premium, add_on_price, modifier_price, surcharge, extra_charge |
| `effective_date` |  | date | The day this cost takes effect. Blank = from the start. Later dates make cost versions. | `2026-09-01` | date, as_of, effective, valid_from, start_date, cost_date, price_date |
| `store_id` |  | text | Blank = every store. A row with a store_id gives that store its own cost. |  | store, store_number, store_no, location_id, location, site, unit_number |
| `perishable` |  | bool | 1 if it spoils within days (used for waste exposure). | `1` | fresh, is_perishable |
| `shelf_life_days` |  | num | Days it keeps once prepped. | `3` | shelf_life |
| `prep_steps` |  | num | Prep steps per batch (default 1). Used for prep load. | `3` | steps, prep, prep_step_count |
| `par_portions` |  | num | Daily par in portions, for waste exposure. | `120` | par, par_level, daily_par |
| `calories` |  | num | Calories per portion, for the nutrition check. | `320` | cal, kcal, energy |
| `sodium_mg` |  | num | Sodium per portion, mg. | `630` | sodium, na_mg |

## Items (menu) · `items.csv`

**Required.** One row per menu item. Build-your-own lines are items too (byo = 1) with no recipe rows: their components come from the modifiers file. Repeat an item with a store_id to give that store its own price.

| Column | Required | Type | Meaning | Example | Also recognised as |
|---|---|---|---|---|---|
| `item_id` | yes | text | Unique code. Matches item_id in recipes and sales. | `greek-goddess-salmon` | id, plu, menu_item_id, product_id, sku, code, item |
| `item_name` | yes | text | Display name. | `Greek Goddess Salmon` | name, item, menu_item, product, description, item_description |
| `line` | yes | text | Menu line: Bowls, Pitas, Sides, Drinks, Desserts, Kids, … Lines whose name says side, drink, dessert, sweet, chips, bottled or fountain count as add-ons. | `Bowls` | menu_line, category, menu_category, section, group, department |
| `price` | yes | num ($) | Menu price before up-charges. | `16.00` | menu_price, base_price, list_price, retail, retail_price, unit_price |
| `byo` |  | bool | 1 for a build-your-own item (bowl, pita). Its components come from modifiers. | `0` | build_your_own, is_byo, custom, customizable |
| `active` |  | bool | 0 to keep an item in the files but off the menu. Blank = 1. | `1` | is_active, on_menu, status, enabled |
| `store_id` |  | text | Blank = every store. A row with a store_id overrides the price at that store. |  | store, store_number, location_id, location |
| `menu_calories` |  | num | Calories printed on the menu, for the nutrition check. | `700` | calories, cal, kcal |

## Recipes (portions per item) · `recipes.csv`

**Required.** One row per component in each curated item, with how many portions it uses. 0.5 is half a scoop, 2 is double.

| Column | Required | Type | Meaning | Example | Also recognised as |
|---|---|---|---|---|---|
| `item_id` | yes | text | From items. | `greek-goddess-salmon` | id, plu, menu_item_id, product_id, item |
| `component_id` | yes | text | From components. | `glazed-salmon` | sku, ingredient_id, component, ingredient, modifier_id |
| `portions` | yes | num | Portions of the component in one item. | `1` | qty, quantity, portion, servings, amount, count |

## Sales (order lines) · `sales.csv`

Needed for sales, scenarios and reconciliation. One row per item line on each order, from the POS. order_id lets the tool see what was bought together (attach rates, order size, cannibalization). Without it each row counts as its own order.

| Column | Required | Type | Meaning | Example | Also recognised as |
|---|---|---|---|---|---|
| `order_id` |  | text | Order or check number, unique within a store and day. | `DC-001-20260701-0042` | order, check_id, check, ticket, ticket_id, transaction_id, receipt, order_number |
| `line_id` |  | text | Line number within the order. Lets modifiers attach to the right line when an order holds the same item twice. | `1` | line, line_no, line_number, seq, order_line_id, sequence |
| `store_id` | yes | text | From stores. | `DC-001` | store, store_number, store_no, location_id, location, site, unit_number |
| `date` | yes | date | Business date, YYYY-MM-DD (M/D/YYYY and Excel dates are accepted). | `2026-07-01` | business_date, order_date, day, transaction_date, sale_date |
| `time` |  | text | HH:MM, 24-hour. Used for dayparts when daypart is blank. | `12:35` | order_time, time_of_day, timestamp, sale_time |
| `channel` |  | text | in_store, app, web, delivery or catering. Blank = in_store. | `app` | order_channel, source, order_type, order_source, platform, ordering_channel |
| `daypart` |  | text | Optional: breakfast, lunch, afternoon, dinner. Computed from time when blank. | `lunch` | meal_period, day_part |
| `item_id` | yes | text | From items. A build-your-own order uses the byo item for its line (BYO-BOWL). | `BYO-BOWL` | plu, menu_item_id, product_id, sku, item, menu_item |
| `qty` | yes | num | Units on the line. Blank = 1. | `1` | quantity, units, count |
| `net_price` |  | num ($) | Price actually paid per unit, after discounts, including up-charges. Blank = menu price plus the up-charges of its modifiers. | `16.00` | price, unit_price, net, net_amount, amount, gross_price, sale_price, net_sales |

## Modifiers (build-your-own picks) · `modifiers.csv`

Needed for build-your-own analysis. One row per component picked on an order line: every component of a build-your-own bowl, or an add or swap on a curated item. qty 2 is a double, 0.5 a half-and-half.

| Column | Required | Type | Meaning | Example | Also recognised as |
|---|---|---|---|---|---|
| `order_id` | yes | text | From sales. | `DC-001-20260701-0042` | order, check_id, check, ticket, ticket_id, transaction_id, order_number |
| `line_id` |  | text | From sales. Blank = the first line on the order with this item_id. | `1` | line, line_no, line_number, seq, order_line_id |
| `item_id` |  | text | The item on the order the modifier belongs to; used when line_id is blank. | `BYO-BOWL` | plu, menu_item_id, product_id, item, parent_item |
| `component_id` | yes | text | From components. | `glazed-salmon` | modifier, modifier_id, sku, component, ingredient_id, ingredient, modifier_code |
| `qty` |  | num | Portions picked. Blank = 1. | `1` | quantity, portions, count, modifier_qty |

## Stores · `stores.csv`

Optional. Store names and regions for the multi-store views. Stores named only in sales still work; they just show as their code.

| Column | Required | Type | Meaning | Example | Also recognised as |
|---|---|---|---|---|---|
| `store_id` | yes | text | Unique store code used in every other file. | `DC-001` | store, store_number, store_no, location_id, location, site, unit_number, id |
| `store_name` |  | text | Display name. | `Dupont Circle` | name, location_name, store |
| `region` |  | text | Region or market for roll-ups. | `Mid-Atlantic` | market, area, district, dma |
| `city` |  | text |  | `Washington` |  |
| `state` |  | text |  | `DC` | st |

## Packaging & paper · `packaging.csv`

Optional. Packaging cost per item by menu line and service: bowl, lid, bag share, utensils. channel is dine_in, digital (app, web, delivery) or all; line can be all.

| Column | Required | Type | Meaning | Example | Also recognised as |
|---|---|---|---|---|---|
| `line` | yes | text | Menu line from items, or all. | `Bowls` | menu_line, category, item_line |
| `channel` | yes | text | dine_in, digital or all. | `digital` | service, order_type, mode |
| `cost` | yes | num ($) | Packaging and paper per item. | `0.58` | packaging_cost, paper_cost, amount, cost_per_item |

## Waste log · `waste.csv`

Optional. Portions thrown away, by store, day and component, from the waste log. Replaces the flat waste assumption.

| Column | Required | Type | Meaning | Example | Also recognised as |
|---|---|---|---|---|---|
| `store_id` | yes | text | From stores. | `DC-001` | store, store_number, location_id, location |
| `date` | yes | date | Day logged. | `2026-07-03` | business_date, log_date, day |
| `component_id` | yes | text | From components. | `avocado` | sku, ingredient_id, component, ingredient |
| `qty_portions` | yes | num | Portions wasted. | `12` | qty, quantity, portions, waste_qty, amount, units |
| `reason` |  | text | Optional: spoilage, over-prep, drop, expired. | `spoilage` | waste_reason, type, category |

## Actuals (books) · `actuals.csv`

Needed for the reconciliation test. Food cost from the books, one row per store and month, for the reconciliation test.

| Column | Required | Type | Meaning | Example | Also recognised as |
|---|---|---|---|---|---|
| `store_id` | yes | text | From stores. | `DC-001` | store, store_number, location_id, location |
| `period` | yes | month | Month, YYYY-MM. | `2026-07` | month, fiscal_period, period_name, accounting_period |
| `actual_food_cost` | yes | num ($) | Food cost of goods sold for the month, from the P&L. | `71250.00` | cogs, food_cost, actual_cogs, actual_cost, food_cogs, cost_of_goods |
| `net_sales` |  | num ($) | Net sales for the month from the books. Blank = the sum of the sales file. | `248900.00` | sales, revenue, net_revenue, actual_sales, total_sales |

## Inventory counts · `inventory.csv`

Optional. Beginning count, purchases and ending count in portions, per store, month and component, for theoretical vs actual usage.

| Column | Required | Type | Meaning | Example | Also recognised as |
|---|---|---|---|---|---|
| `store_id` | yes | text | From stores. | `DC-001` | store, store_number, location_id, location |
| `period` | yes | month | Month, YYYY-MM. | `2026-07` | month, fiscal_period, period_name |
| `component_id` | yes | text | From components. | `glazed-salmon` | sku, ingredient_id, component, ingredient |
| `begin_qty` | yes | num | Portions on hand at the start of the month. | `140` | beginning, begin, opening, start_qty, begin_count, opening_count |
| `purchased_qty` | yes | num | Portions received during the month. | `1860` | purchases, received, purchased, receipts |
| `end_qty` | yes | num | Portions on hand at the end. | `150` | ending, end, closing, end_count, closing_count |

## Units

Weight: g, kg, oz, lb. Volume: ml, l, fl oz, cup, pt, qt, gal. Count: each, ct, piece, serving, portion, scoop, bag, bottle, can, dozen. A case and its portion must use the same kind of unit; a weight case with a volume portion is reported as a unit mismatch.

## Channels and dayparts

Channel values are normalised to in_store, app, web, delivery, catering or other (so "Mobile App", "DoorDash" and "Counter" all work). Dayparts, when not given, come from the time column: before 11:00 breakfast, 11:00–14:59 lunch, 15:00–16:59 afternoon, 17:00 and later dinner.

## Minimum sets

- Costs only: components, items, recipes.
- Sales, menu engineering, scenarios with volumes: add sales (and modifiers for build-your-own).
- Reconciliation test: add actuals.
- Everything: add stores, packaging, waste and inventory.
