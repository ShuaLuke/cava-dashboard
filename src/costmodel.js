/* Spread Sheet cost model: the computation engine behind the Cost & sales tool.
   Pure JavaScript, no dependencies, no network. Runs in the browser (window.CostModel) and under Node
   (module.exports) so the same code is unit-tested with hand-calculated cases (tests/costmodel.test.js).
   Every formula here is written up in docs/methodology.md; keep the two in step. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.CostModel = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* ---------- 1. Input templates (the data dictionary) ---------- */
  // Each file type lists its columns: key, required, type (text|num|int|date|month|bool), unit, description, example
  // and the alternative header names the column mapper recognises. Headers are matched after normalisation
  // (lower case, anything that isn't a letter or digit becomes "_").
  const T = (k, req, type, desc, ex, aliases, unit) => ({ k, req: !!req, type, desc, ex, aliases: aliases || [], unit });
  const TEMPLATES = {
    components: {
      label: "Components (recipe cost)", need: "required", file: "components.csv",
      desc: "One row per component (or SKU) and cost version. Portion cost is computed from the case, or taken from portion_cost when given. Repeat a component with a later effective_date to add a cost version, or with a store_id to give one store its own cost.",
      cols: [
        T("component_id", 1, "text", "Unique code. Matches component_id in recipes, modifiers, waste and inventory.", "glazed-salmon", ["sku", "ingredient_id", "item_code", "code", "id", "component", "ingredient"]),
        T("component_name", 1, "text", "Display name.", "Glazed Salmon", ["name", "ingredient_name", "description", "ingredient", "component"]),
        T("station", 1, "text", "Where it lives on the line: Greens, Grains, Dips + Spreads, Mains, Toppings, Dressings, Sides, Sweets, Drinks or Packaging.", "Mains", ["category", "group", "family", "type", "line_station", "station_name"]),
        T("case_cost", 0, "num", "What one purchase unit (case, bag, bottle) costs.", "118.40", ["case_price", "pack_cost", "purchase_cost", "invoice_cost", "cost_per_case", "unit_cost", "price_per_case"], "$"),
        T("case_size", 0, "num", "How much is in one purchase unit, in case_unit.", "40", ["pack_size", "case_qty", "case_quantity", "purchase_qty", "pack", "size"]),
        T("case_unit", 0, "text", "Unit of case_size: lb, oz, kg, g, gal, qt, pt, cup, fl oz, l, ml, each.", "lb", ["purchase_unit", "pack_unit", "uom", "unit", "case_uom"]),
        T("portion_size", 0, "num", "One menu portion (scoop, piece), in portion_unit.", "4", ["portion", "serving_size", "portion_qty", "portion_weight", "serving"]),
        T("portion_unit", 0, "text", "Unit of portion_size. Must be the same kind (weight, volume or count) as case_unit.", "oz", ["serving_unit", "portion_uom"]),
        T("yield_pct", 0, "num", "Usable share after trim, cook loss and prep, 0–100. Blank = 100.", "80", ["yield", "yield_percent", "usable_pct", "usable"], "%"),
        T("portion_cost", 0, "num", "Optional. If given, used as the cost of one portion instead of the case math.", "0.92", ["cost_per_portion", "portion_price", "unit_portion_cost", "cost", "plate_cost"], "$"),
        T("upcharge", 0, "num", "What a guest pays to add it to a build-your-own order. Blank = 0 (included).", "4.25", ["up_charge", "premium", "add_on_price", "modifier_price", "surcharge", "extra_charge"], "$"),
        T("effective_date", 0, "date", "The day this cost takes effect. Blank = from the start. Later dates make cost versions.", "2026-09-01", ["date", "as_of", "effective", "valid_from", "start_date", "cost_date", "price_date"]),
        T("store_id", 0, "text", "Blank = every store. A row with a store_id gives that store its own cost.", "", ["store", "store_number", "store_no", "location_id", "location", "site", "unit_number"]),
        T("perishable", 0, "bool", "1 if it spoils within days (used for waste exposure).", "1", ["fresh", "is_perishable"]),
        T("shelf_life_days", 0, "num", "Days it keeps once prepped.", "3", ["shelf_life"]),
        T("prep_steps", 0, "num", "Prep steps per batch (default 1). Used for prep load.", "3", ["steps", "prep", "prep_step_count"]),
        T("par_portions", 0, "num", "Daily par in portions, for waste exposure.", "120", ["par", "par_level", "daily_par"]),
        T("calories", 0, "num", "Calories per portion, for the nutrition check.", "320", ["cal", "kcal", "energy"]),
        T("sodium_mg", 0, "num", "Sodium per portion, mg.", "630", ["sodium", "na_mg"]),
      ],
    },
    items: {
      label: "Items (menu)", need: "required", file: "items.csv",
      desc: "One row per menu item. Build-your-own lines are items too (byo = 1) with no recipe rows: their components come from the modifiers file. Repeat an item with a store_id to give that store its own price.",
      cols: [
        T("item_id", 1, "text", "Unique code. Matches item_id in recipes and sales.", "greek-goddess-salmon", ["id", "plu", "menu_item_id", "product_id", "sku", "code", "item"]),
        T("item_name", 1, "text", "Display name.", "Greek Goddess Salmon", ["name", "item", "menu_item", "product", "description", "item_description"]),
        T("line", 1, "text", "Menu line: Bowls, Pitas, Sides, Drinks, Desserts, Kids, … Lines whose name says side, drink, dessert, sweet, chips, bottled or fountain count as add-ons.", "Bowls", ["menu_line", "category", "menu_category", "section", "group", "department"]),
        T("price", 1, "num", "Menu price before up-charges.", "16.00", ["menu_price", "base_price", "list_price", "retail", "retail_price", "unit_price"], "$"),
        T("byo", 0, "bool", "1 for a build-your-own item (bowl, pita). Its components come from modifiers.", "0", ["build_your_own", "is_byo", "custom", "customizable"]),
        T("active", 0, "bool", "0 to keep an item in the files but off the menu. Blank = 1.", "1", ["is_active", "on_menu", "status", "enabled"]),
        T("store_id", 0, "text", "Blank = every store. A row with a store_id overrides the price at that store.", "", ["store", "store_number", "location_id", "location"]),
        T("menu_calories", 0, "num", "Calories printed on the menu, for the nutrition check.", "700", ["calories", "cal", "kcal"]),
      ],
    },
    recipes: {
      label: "Recipes (portions per item)", need: "required", file: "recipes.csv",
      desc: "One row per component in each curated item, with how many portions it uses. 0.5 is half a scoop, 2 is double.",
      cols: [
        T("item_id", 1, "text", "From items.", "greek-goddess-salmon", ["id", "plu", "menu_item_id", "product_id", "item"]),
        T("component_id", 1, "text", "From components.", "glazed-salmon", ["sku", "ingredient_id", "component", "ingredient", "modifier_id"]),
        T("portions", 1, "num", "Portions of the component in one item.", "1", ["qty", "quantity", "portion", "servings", "amount", "count"]),
      ],
    },
    sales: {
      label: "Sales (order lines)", need: "for sales, scenarios and reconciliation", file: "sales.csv",
      desc: "One row per item line on each order, from the POS. order_id lets the tool see what was bought together (attach rates, order size, cannibalization). Without it each row counts as its own order.",
      cols: [
        T("order_id", 0, "text", "Order or check number, unique within a store and day.", "DC-001-20260701-0042", ["order", "check_id", "check", "ticket", "ticket_id", "transaction_id", "receipt", "order_number"]),
        T("line_id", 0, "text", "Line number within the order. Lets modifiers attach to the right line when an order holds the same item twice.", "1", ["line", "line_no", "line_number", "seq", "order_line_id", "sequence"]),
        T("store_id", 1, "text", "From stores.", "DC-001", ["store", "store_number", "store_no", "location_id", "location", "site", "unit_number"]),
        T("date", 1, "date", "Business date, YYYY-MM-DD (M/D/YYYY and Excel dates are accepted).", "2026-07-01", ["business_date", "order_date", "day", "transaction_date", "sale_date"]),
        T("time", 0, "text", "HH:MM, 24-hour. Used for dayparts when daypart is blank.", "12:35", ["order_time", "time_of_day", "timestamp", "sale_time"]),
        T("channel", 0, "text", "in_store, app, web, delivery or catering. Blank = in_store.", "app", ["order_channel", "source", "order_type", "order_source", "platform", "ordering_channel"]),
        T("daypart", 0, "text", "Optional: breakfast, lunch, afternoon, dinner. Computed from time when blank.", "lunch", ["meal_period", "day_part"]),
        T("item_id", 1, "text", "From items. A build-your-own order uses the byo item for its line (BYO-BOWL).", "BYO-BOWL", ["plu", "menu_item_id", "product_id", "sku", "item", "menu_item"]),
        T("qty", 1, "num", "Units on the line. Blank = 1.", "1", ["quantity", "units", "count"]),
        T("net_price", 0, "num", "Price actually paid per unit, after discounts, including up-charges. Blank = menu price plus the up-charges of its modifiers.", "16.00", ["price", "unit_price", "net", "net_amount", "amount", "gross_price", "sale_price", "net_sales"], "$"),
      ],
    },
    modifiers: {
      label: "Modifiers (build-your-own picks)", need: "for build-your-own analysis", file: "modifiers.csv",
      desc: "One row per component picked on an order line: every component of a build-your-own bowl, or an add or swap on a curated item. qty 2 is a double, 0.5 a half-and-half.",
      cols: [
        T("order_id", 1, "text", "From sales.", "DC-001-20260701-0042", ["order", "check_id", "check", "ticket", "ticket_id", "transaction_id", "order_number"]),
        T("line_id", 0, "text", "From sales. Blank = the first line on the order with this item_id.", "1", ["line", "line_no", "line_number", "seq", "order_line_id"]),
        T("item_id", 0, "text", "The item on the order the modifier belongs to; used when line_id is blank.", "BYO-BOWL", ["plu", "menu_item_id", "product_id", "item", "parent_item"]),
        T("component_id", 1, "text", "From components.", "glazed-salmon", ["modifier", "modifier_id", "sku", "component", "ingredient_id", "ingredient", "modifier_code"]),
        T("qty", 0, "num", "Portions picked. Blank = 1.", "1", ["quantity", "portions", "count", "modifier_qty"]),
      ],
    },
    stores: {
      label: "Stores", need: "optional", file: "stores.csv",
      desc: "Store names and regions for the multi-store views. Stores named only in sales still work; they just show as their code.",
      cols: [
        T("store_id", 1, "text", "Unique store code used in every other file.", "DC-001", ["store", "store_number", "store_no", "location_id", "location", "site", "unit_number", "id"]),
        T("store_name", 0, "text", "Display name.", "Dupont Circle", ["name", "location_name", "store"]),
        T("region", 0, "text", "Region or market for roll-ups.", "Mid-Atlantic", ["market", "area", "district", "dma"]),
        T("city", 0, "text", "", "Washington", []),
        T("state", 0, "text", "", "DC", ["st"]),
      ],
    },
    packaging: {
      label: "Packaging & paper", need: "optional", file: "packaging.csv",
      desc: "Packaging cost per item by menu line and service: bowl, lid, bag share, utensils. channel is dine_in, digital (app, web, delivery) or all; line can be all.",
      cols: [
        T("line", 1, "text", "Menu line from items, or all.", "Bowls", ["menu_line", "category", "item_line"]),
        T("channel", 1, "text", "dine_in, digital or all.", "digital", ["service", "order_type", "mode"]),
        T("cost", 1, "num", "Packaging and paper per item.", "0.58", ["packaging_cost", "paper_cost", "amount", "cost_per_item"], "$"),
      ],
    },
    waste: {
      label: "Waste log", need: "optional", file: "waste.csv",
      desc: "Portions thrown away, by store, day and component, from the waste log. Replaces the flat waste assumption.",
      cols: [
        T("store_id", 1, "text", "From stores.", "DC-001", ["store", "store_number", "location_id", "location"]),
        T("date", 1, "date", "Day logged.", "2026-07-03", ["business_date", "log_date", "day"]),
        T("component_id", 1, "text", "From components.", "avocado", ["sku", "ingredient_id", "component", "ingredient"]),
        T("qty_portions", 1, "num", "Portions wasted.", "12", ["qty", "quantity", "portions", "waste_qty", "amount", "units"]),
        T("reason", 0, "text", "Optional: spoilage, over-prep, drop, expired.", "spoilage", ["waste_reason", "type", "category"]),
      ],
    },
    actuals: {
      label: "Actuals (books)", need: "for the reconciliation test", file: "actuals.csv",
      desc: "Food cost from the books, one row per store and month, for the reconciliation test.",
      cols: [
        T("store_id", 1, "text", "From stores.", "DC-001", ["store", "store_number", "location_id", "location"]),
        T("period", 1, "month", "Month, YYYY-MM.", "2026-07", ["month", "fiscal_period", "period_name", "accounting_period"]),
        T("actual_food_cost", 1, "num", "Food cost of goods sold for the month, from the P&L.", "71250.00", ["cogs", "food_cost", "actual_cogs", "actual_cost", "food_cogs", "cost_of_goods"], "$"),
        T("net_sales", 0, "num", "Net sales for the month from the books. Blank = the sum of the sales file.", "248900.00", ["sales", "revenue", "net_revenue", "actual_sales", "total_sales"], "$"),
      ],
    },
    inventory: {
      label: "Inventory counts", need: "optional", file: "inventory.csv",
      desc: "Beginning count, purchases and ending count in portions, per store, month and component, for theoretical vs actual usage.",
      cols: [
        T("store_id", 1, "text", "From stores.", "DC-001", ["store", "store_number", "location_id", "location"]),
        T("period", 1, "month", "Month, YYYY-MM.", "2026-07", ["month", "fiscal_period", "period_name"]),
        T("component_id", 1, "text", "From components.", "glazed-salmon", ["sku", "ingredient_id", "component", "ingredient"]),
        T("begin_qty", 1, "num", "Portions on hand at the start of the month.", "140", ["beginning", "begin", "opening", "start_qty", "begin_count", "opening_count"]),
        T("purchased_qty", 1, "num", "Portions received during the month.", "1860", ["purchases", "received", "purchased", "receipts"]),
        T("end_qty", 1, "num", "Portions on hand at the end.", "150", ["ending", "end", "closing", "end_count", "closing_count"]),
      ],
    },
  };
  const TYPES = Object.keys(TEMPLATES);
  const CORE = ["components", "items", "recipes"];

  /* ---------- 2. Small utilities ---------- */
  const norm = s => String(s == null ? "" : s).replace(/^﻿/, "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const num = v => { if (v == null) return null; if (typeof v === "number") return Number.isFinite(v) ? v : null; const s = String(v).trim().replace(/[$,%\s]/g, "").replace(/^\((.*)\)$/, "-$1"); if (s === "" || s === "-") return null; const n = Number(s); return Number.isFinite(n) ? n : null; };
  const bool = v => { if (v == null || v === "") return null; if (typeof v === "boolean") return v; const s = String(v).trim().toLowerCase(); if (["1", "y", "yes", "true", "t", "x", "active", "on"].includes(s)) return true; if (["0", "n", "no", "false", "f", "inactive", "off"].includes(s)) return false; return null; };
  const pad2 = n => (n < 10 ? "0" : "") + n;
  const EXCEL_EPOCH = Date.UTC(1899, 11, 30);
  function toISODate(v) {
    if (v == null || v === "") return null;
    if (typeof v === "number") { if (v > 20000 && v < 80000) { const d = new Date(EXCEL_EPOCH + Math.round(v) * 86400000); return d.toISOString().slice(0, 10); } return null; }
    const s = String(v).trim();
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if (m) return `${m[1]}-${pad2(+m[2])}-${pad2(+m[3])}`;
    m = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/); if (m) return `${m[1]}-${pad2(+m[2])}-${pad2(+m[3])}`;
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/); if (m) { const y = m[3].length === 2 ? 2000 + +m[3] : +m[3]; return `${y}-${pad2(+m[1])}-${pad2(+m[2])}`; }
    m = s.match(/^(\d{4})(\d{2})(\d{2})$/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/); if (m) { const mo = "janfebmaraprmayjunjulaugsepoctnovdec".indexOf(m[2].toLowerCase()) / 3; if (mo >= 0) { const y = m[3].length === 2 ? 2000 + +m[3] : +m[3]; return `${y}-${pad2(mo + 1)}-${pad2(+m[1])}`; } }
    const n = Number(s); if (Number.isFinite(n) && n > 20000 && n < 80000) return toISODate(n);
    return null;
  }
  function toMonth(v) { if (v == null || v === "") return null; const s = String(v).trim(); let m = s.match(/^(\d{4})-(\d{1,2})$/); if (m) return `${m[1]}-${pad2(+m[2])}`; m = s.match(/^(\d{1,2})\/(\d{4})$/); if (m) return `${m[2]}-${pad2(+m[1])}`; m = s.match(/^(\d{4})(\d{2})$/); if (m) return `${m[1]}-${m[2]}`; const d = toISODate(s); return d ? d.slice(0, 7) : null; }
  function toTime(v) { if (v == null || v === "") return null; const s = String(v).trim(); let m = s.match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])?/); if (!m) { const n = Number(s); if (Number.isFinite(n) && n >= 0 && n < 1) { const mins = Math.round(n * 1440); return pad2(Math.floor(mins / 60)) + ":" + pad2(mins % 60); } return null; } let h = +m[1]; const mi = +m[2]; if (m[3]) { const pm = m[3].toLowerCase() === "pm"; if (pm && h < 12) h += 12; if (!pm && h === 12) h = 0; } return pad2(h) + ":" + pad2(mi); }
  const dayOfWeek = iso => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(iso + "T12:00:00Z").getUTCDay()];
  function daypartOf(time) { if (!time) return "unknown"; const h = +time.slice(0, 2); return h < 11 ? "breakfast" : h < 15 ? "lunch" : h < 17 ? "afternoon" : "dinner"; }
  const CHANNELS = ["in_store", "app", "web", "delivery", "catering", "other"];
  function channelOf(v) {
    const s = norm(v); if (!s) return "in_store";
    if (/^(in_store|instore|store|dine_in|dinein|counter|pos|walk_in|kiosk|register|front)/.test(s)) return "in_store";
    if (/app|mobile|ios|android/.test(s)) return "app";
    if (/web|online|site|desktop|ecom/.test(s)) return "web";
    if (/deliver|doordash|uber|grubhub|postmates|third|3p|marketplace/.test(s)) return "delivery";
    if (/cater/.test(s)) return "catering";
    return "other";
  }
  const pkgChannel = ch => ch === "in_store" ? "dine_in" : "digital";
  const ADDON_LINE = /side|drink|dessert|sweet|chips|bottled|fountain|beverage|bakery/i;
  const STATION_FAM = s => { const t = norm(s); if (/^green/.test(t)) return "green"; if (/grain|rice|lentil|base/.test(t)) return "grain"; if (/dip|spread|salsa|hummus/.test(t)) return "dip"; if (/main|protein|meat/.test(t)) return "main"; if (/topping|veg|extra/.test(t)) return "topping"; if (/dressing|sauce|vinaigrette/.test(t)) return "dressing"; if (/bread|pita|chip|crisp|side/.test(t)) return "bread"; if (/sweet|dessert|cookie|bakery|pantry/.test(t)) return "sweet"; if (/drink|bever|juice|soda|tea|water/.test(t)) return "drink"; if (/pack|paper|supply/.test(t)) return "packaging"; return "other"; };
  const LINE_STATIONS = new Set(["green", "grain", "dip", "main", "topping", "dressing"]); // the build-your-own line proper
  const UNITS = (() => { const w = "w", v = "v", c = "c"; const u = {
    g: [w, 1], gram: [w, 1], grams: [w, 1], gr: [w, 1], kg: [w, 1000], kilogram: [w, 1000], oz: [w, 28.349523125], ounce: [w, 28.349523125], ounces: [w, 28.349523125], lb: [w, 453.59237], lbs: [w, 453.59237], pound: [w, 453.59237], pounds: [w, 453.59237],
    ml: [v, 1], milliliter: [v, 1], l: [v, 1000], liter: [v, 1000], litre: [v, 1000], floz: [v, 29.5735295625], fl_oz: [v, 29.5735295625], fluid_ounce: [v, 29.5735295625], fluid_ounces: [v, 29.5735295625], cup: [v, 236.5882365], cups: [v, 236.5882365], pt: [v, 473.176473], pint: [v, 473.176473], qt: [v, 946.352946], quart: [v, 946.352946], quarts: [v, 946.352946], gal: [v, 3785.411784], gallon: [v, 3785.411784], gallons: [v, 3785.411784],
    each: [c, 1], ea: [c, 1], ct: [c, 1], count: [c, 1], pc: [c, 1], pcs: [c, 1], piece: [c, 1], pieces: [c, 1], unit: [c, 1], units: [c, 1], serving: [c, 1], servings: [c, 1], portion: [c, 1], portions: [c, 1], scoop: [c, 1], scoops: [c, 1], bag: [c, 1], bags: [c, 1], bottle: [c, 1], bottles: [c, 1], can: [c, 1], cans: [c, 1], cup_ct: [c, 1], sleeve: [c, 1], dozen: [c, 12], dz: [c, 12] }; return u; })();
  const unitOf = s => { const t = norm(s).replace(/_+/g, "_"); if (!t) return null; return UNITS[t] || UNITS[t.replace(/s$/, "")] || null; };
  const sum = (arr, f) => { let s = 0; for (let i = 0; i < arr.length; i++) s += f ? f(arr[i], i) : arr[i]; return s; };
  const by = (arr, f) => { const m = new Map(); for (const x of arr) { const k = f(x); let a = m.get(k); if (!a) { a = []; m.set(k, a); } a.push(x); } return m; };
  const r2 = v => Math.round(v * 100) / 100;
  const slug = s => String(s).toLowerCase().replace(/®|™/g, "").replace(/\+/g, " ").replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

  /* ---------- 3. CSV ---------- */
  function parseCSV(text, delim) {
    text = String(text).replace(/^﻿/, "");
    if (!delim) { const head = text.slice(0, 4000).split(/\r?\n/)[0] || ""; const c = { ",": (head.match(/,/g) || []).length, "\t": (head.match(/\t/g) || []).length, ";": (head.match(/;/g) || []).length, "|": (head.match(/\|/g) || []).length }; delim = Object.keys(c).sort((a, b) => c[b] - c[a])[0]; if (!c[delim]) delim = ","; }
    const rows = []; let row = [], field = "", q = false, i = 0; const n = text.length;
    while (i < n) {
      const ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i += 2; continue; } q = false; i++; continue; } field += ch; i++; continue; }
      if (ch === '"') { q = true; i++; continue; }
      if (ch === delim) { row.push(field); field = ""; i++; continue; }
      if (ch === "\n" || ch === "\r") { row.push(field); field = ""; if (row.length > 1 || row[0] !== "") rows.push(row); row = []; if (ch === "\r" && text[i + 1] === "\n") i++; i++; continue; }
      field += ch; i++;
    }
    row.push(field); if (row.length > 1 || row[0] !== "") rows.push(row);
    if (!rows.length) return { headers: [], rows: [], delim };
    const headers = rows[0].map(h => String(h).trim());
    const out = rows.slice(1).map(r => { const o = {}; for (let k = 0; k < headers.length; k++) o[headers[k]] = r[k] == null ? "" : r[k]; return o; });
    return { headers, rows: out, delim };
  }
  const csvCell = v => { if (v == null) return ""; const s = typeof v === "number" ? String(v) : String(v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  function toCSV(rows, cols) { if (!cols) cols = rows.length ? Object.keys(rows[0]) : []; const lines = [cols.map(csvCell).join(",")]; for (const r of rows) lines.push(cols.map(c => csvCell(r[c])).join(",")); return lines.join("\n") + "\n"; }
  function templateCSV(type) { const t = TEMPLATES[type]; return toCSV([Object.fromEntries(t.cols.map(c => [c.k, c.ex || ""]))], t.cols.map(c => c.k)); }

  /* ---------- 4. File type detection and column mapping ---------- */
  function detectType(filename, headers) {
    const f = norm(filename || "");
    const byName = [["modifier", "modifiers"], ["recipe_cost", "components"], ["component", "components"], ["ingredient", "components"], ["sku", "components"], ["recipe", "recipes"], ["bom", "recipes"], ["item", "items"], ["menu", "items"], ["product", "items"], ["sales", "sales"], ["order", "sales"], ["pos", "sales"], ["check", "sales"], ["transaction", "sales"], ["store", "stores"], ["location", "stores"], ["packag", "packaging"], ["paper", "packaging"], ["waste", "waste"], ["actual", "actuals"], ["books", "actuals"], ["pnl", "actuals"], ["p_l", "actuals"], ["inventor", "inventory"], ["count", "inventory"]];
    for (const [k, t] of byName) if (f.includes(k)) return t;
    if (!headers || !headers.length) return null;
    let best = null, bestScore = 0;
    for (const t of TYPES) { const m = autoMap(t, headers); const req = TEMPLATES[t].cols.filter(c => c.req); const hit = req.filter(c => m[c.k]).length; const opt = TEMPLATES[t].cols.filter(c => !c.req && m[c.k]).length; const score = hit === req.length ? 10 + opt : hit; if (score > bestScore) { bestScore = score; best = t; } }
    return bestScore >= 10 ? best : null;
  }
  function autoMap(type, headers) {
    const t = TEMPLATES[type]; const used = new Set(); const map = {};
    const H = headers.map(h => ({ h, n: norm(h) }));
    const take = (col, pred) => { if (map[col.k]) return; const hit = H.find(x => !used.has(x.h) && pred(x.n)); if (hit) { map[col.k] = hit.h; used.add(hit.h); } };
    // pass 1: exact key; pass 2: exact alias; pass 3: key contained; required columns first in each pass
    const cols = t.cols.slice().sort((a, b) => (b.req - a.req));
    cols.forEach(c => take(c, n => n === c.k));
    cols.forEach(c => take(c, n => c.aliases.includes(n)));
    cols.forEach(c => take(c, n => n.includes(c.k) || c.k.includes(n) && n.length >= 4));
    t.cols.forEach(c => { if (!(c.k in map)) map[c.k] = null; });
    return map;
  }
  // apply a header map and coerce types; returns rows keyed by template column, plus the rows it could not parse
  function applyMap(type, rows, map) {
    const t = TEMPLATES[type]; const out = []; const bad = [];
    rows.forEach((r, i) => {
      const o = { _row: i + 2 }; let problem = null;
      for (const c of t.cols) {
        const h = map[c.k]; let v = h == null ? null : r[h];
        if (v === "" || v == null) v = null;
        else if (c.type === "num" || c.type === "int") { const n = num(v); if (n == null) problem = problem || `${c.k} is not a number ("${v}")`; v = n; }
        else if (c.type === "date") { const d = toISODate(v); if (!d) problem = problem || `${c.k} is not a date ("${v}")`; v = d; }
        else if (c.type === "month") { const d = toMonth(v); if (!d) problem = problem || `${c.k} is not a month ("${v}")`; v = d; }
        else if (c.type === "bool") { const b = bool(v); if (b == null) problem = problem || `${c.k} is not yes/no ("${v}")`; v = b; }
        else v = String(v).trim();
        o[c.k] = v;
      }
      if (problem) bad.push({ row: i + 2, problem }); else out.push(o);
    });
    return { rows: out, bad };
  }

  /* ---------- 5. Validation ---------- */
  // dataset: { components: rows, items: rows, recipes: rows, sales?, modifiers?, stores?, packaging?, waste?, actuals?, inventory? } (rows already mapped)
  function validate(ds) {
    const errors = [], warnings = [], info = [];
    const E = (file, msg, rows) => errors.push({ file, msg, rows });
    const W = (file, msg, rows) => warnings.push({ file, msg, rows });
    const has = k => Array.isArray(ds[k]) && ds[k].length;
    for (const k of CORE) if (!has(k)) E(k, `The ${TEMPLATES[k].label.toLowerCase()} file is missing or empty.`);
    if (errors.length) return { errors, warnings, info, ok: false };
    // components
    const compIds = new Set(); const compKey = new Set();
    ds.components.forEach(r => {
      if (!r.component_id) return E("components", `Row ${r._row}: component_id is blank.`);
      compIds.add(r.component_id);
      const key = `${r.component_id}|${r.store_id || ""}|${r.effective_date || ""}`;
      if (compKey.has(key)) W("components", `Row ${r._row}: duplicate cost row for ${r.component_id}${r.store_id ? " at " + r.store_id : ""}${r.effective_date ? " dated " + r.effective_date : ""}; the last one wins.`);
      compKey.add(key);
      const pc = portionCost(r);
      if (pc.cost == null) E("components", `Row ${r._row} (${r.component_name || r.component_id}): no cost: ${pc.why}`);
      else if (pc.cost < 0) E("components", `Row ${r._row} (${r.component_id}): negative cost.`);
      if (r.yield_pct != null && (r.yield_pct <= 0 || r.yield_pct > 100)) E("components", `Row ${r._row} (${r.component_id}): yield_pct must be between 0 and 100 (got ${r.yield_pct}).`);
    });
    // items
    const itemIds = new Set(); const itemKey = new Set();
    ds.items.forEach(r => {
      if (!r.item_id) return E("items", `Row ${r._row}: item_id is blank.`);
      itemIds.add(r.item_id);
      const key = `${r.item_id}|${r.store_id || ""}`;
      if (itemKey.has(key)) W("items", `Row ${r._row}: duplicate row for ${r.item_id}${r.store_id ? " at " + r.store_id : ""}; the last one wins.`);
      itemKey.add(key);
      if (r.store_id) { if (r.price == null) E("items", `Row ${r._row} (${r.item_id} at ${r.store_id}): a store row needs a price.`); return; }
      if (r.price == null) E("items", `Row ${r._row} (${r.item_name || r.item_id}): price is blank.`);
      if (!r.line) E("items", `Row ${r._row} (${r.item_id}): line is blank.`);
    });
    // recipes
    const recipeItems = new Set(); const unknownC = new Map(), unknownI = new Map();
    ds.recipes.forEach(r => {
      if (!itemIds.has(r.item_id)) unknownI.set(r.item_id, (unknownI.get(r.item_id) || 0) + 1);
      if (!compIds.has(r.component_id)) unknownC.set(r.component_id, (unknownC.get(r.component_id) || 0) + 1);
      if (!(r.portions > 0)) E("recipes", `Row ${r._row} (${r.item_id} / ${r.component_id}): portions must be more than 0.`);
      recipeItems.add(r.item_id);
    });
    if (unknownI.size) E("recipes", `${unknownI.size} item_id value(s) are not in items: ${[...unknownI.keys()].slice(0, 8).join(", ")}${unknownI.size > 8 ? "…" : ""}`, sum([...unknownI.values()]));
    if (unknownC.size) E("recipes", `${unknownC.size} component_id value(s) are not in components (unmapped components): ${[...unknownC.keys()].slice(0, 8).join(", ")}${unknownC.size > 8 ? "…" : ""}`, sum([...unknownC.values()]));
    const noRecipe = ds.items.filter(r => !r.byo && !r.store_id && r.active !== false && !recipeItems.has(r.item_id));
    if (noRecipe.length) E("items", `${noRecipe.length} active item(s) have no recipe rows and are not build-your-own: ${noRecipe.slice(0, 8).map(r => r.item_name || r.item_id).join(", ")}${noRecipe.length > 8 ? "…" : ""}`, noRecipe.length);
    // sales
    if (has("sales")) {
      const unk = new Map(); let unkRev = 0, rev = 0, noDate = 0, noStore = 0, badQty = 0; const stores = new Set((ds.stores || []).map(s => s.store_id));
      const hasOrder = ds.sales.some(r => r.order_id);
      ds.sales.forEach(r => {
        const q = r.qty == null ? 1 : r.qty; const line = (r.net_price != null ? r.net_price : 0) * q; rev += line;
        if (!itemIds.has(r.item_id)) { unk.set(r.item_id, (unk.get(r.item_id) || 0) + q); unkRev += line; }
        if (!r.date) noDate++; if (!r.store_id) noStore++; if (!(q > 0)) badQty++;
        if (stores.size && r.store_id && !stores.has(r.store_id)) stores.add("?" + r.store_id);
      });
      if (unk.size) { const share = rev ? unkRev / rev : 0; (share > 0.02 ? E : W)("sales", `${unk.size} item_id value(s) in sales are not in items (${Math.round(sum([...unk.values()])).toLocaleString()} units${rev ? ", " + (share * 100).toFixed(1) + "% of sales" : ""}); these lines are left out: ${[...unk.keys()].slice(0, 8).join(", ")}${unk.size > 8 ? "…" : ""}`, sum([...unk.values()])); }
      if (noDate) E("sales", `${noDate} line(s) have no usable date and are left out.`, noDate);
      if (noStore) E("sales", `${noStore} line(s) have no store_id and are left out.`, noStore);
      if (badQty) W("sales", `${badQty} line(s) have a qty of 0 or less (refunds?) and are left out.`, badQty);
      const extra = [...stores].filter(s => s.startsWith("?")); if (extra.length) W("sales", `Store(s) not in the stores file, shown by code: ${extra.map(s => s.slice(1)).join(", ")}`);
      if (!hasOrder) W("sales", "No order_id column: each line counts as its own order, so attach rates, order size and cannibalization are off.");
      if (!ds.sales.some(r => r.net_price != null)) info.push({ file: "sales", msg: "No net_price column: revenue uses menu prices plus up-charges." });
      if (!ds.sales.some(r => r.channel)) info.push({ file: "sales", msg: "No channel column: everything counts as in-store." });
      if (!ds.sales.some(r => r.time || r.daypart)) info.push({ file: "sales", msg: "No time or daypart column: daypart views are off." });
    }
    if (has("modifiers")) {
      const unkC = new Map(); let n = 0; const orders = new Set((ds.sales || []).map(r => r.order_id)); let orphan = 0;
      ds.modifiers.forEach(r => { if (!compIds.has(r.component_id)) { unkC.set(r.component_id, (unkC.get(r.component_id) || 0) + 1); n++; } if (orders.size && !orders.has(r.order_id)) orphan++; });
      if (unkC.size) E("modifiers", `${unkC.size} component_id value(s) in modifiers are not in components (unmapped components, ${n.toLocaleString()} rows left out): ${[...unkC.keys()].slice(0, 8).join(", ")}${unkC.size > 8 ? "…" : ""}`, n);
      if (orphan) W("modifiers", `${orphan.toLocaleString()} modifier row(s) point at an order_id that is not in sales.`, orphan);
      const byoItems = ds.items.filter(r => r.byo).map(r => r.item_id);
      if (!byoItems.length) W("modifiers", "No item has byo = 1, so modifiers are treated as adds to curated items.");
    } else if (has("sales") && ds.items.some(r => r.byo)) {
      W("sales", "Build-your-own items are in sales but there is no modifiers file, so their cost is unknown and they are left out of food cost.");
    }
    if (has("packaging")) ds.packaging.forEach(r => { if (!(r.cost >= 0)) E("packaging", `Row ${r._row}: cost is blank or negative.`); });
    if (has("waste")) { let u = 0; ds.waste.forEach(r => { if (!compIds.has(r.component_id)) u++; }); if (u) W("waste", `${u} waste row(s) name a component that is not in components and are left out.`, u); }
    if (has("inventory")) { let u = 0; ds.inventory.forEach(r => { if (!compIds.has(r.component_id)) u++; }); if (u) W("inventory", `${u} inventory row(s) name a component that is not in components and are left out.`, u); }
    if (has("actuals")) ds.actuals.forEach(r => { if (!(r.actual_food_cost >= 0)) E("actuals", `Row ${r._row}: actual_food_cost is blank.`); });
    return { errors, warnings, info, ok: !errors.some(e => CORE.includes(e.file) && /missing|blank|unmapped|no cost|no recipe/.test(e.msg)) };
  }

  /* ---------- 6. Portion cost (case → portion, after yield) ---------- */
  function portionCost(r) {
    if (r.portion_cost != null) return { cost: r.portion_cost, how: "given" };
    if (r.case_cost == null) return { cost: null, why: "case_cost (or portion_cost) is blank" };
    if (!(r.case_size > 0)) return { cost: null, why: "case_size is blank or 0" };
    if (!(r.portion_size > 0)) return { cost: null, why: "portion_size is blank or 0" };
    const cu = unitOf(r.case_unit), pu = unitOf(r.portion_unit);
    if (!cu) return { cost: null, why: `case_unit "${r.case_unit || ""}" is not a known unit` };
    if (!pu) return { cost: null, why: `portion_unit "${r.portion_unit || ""}" is not a known unit` };
    if (cu[0] !== pu[0]) return { cost: null, why: `unit mismatch: case is in ${r.case_unit} (${cu[0] === "w" ? "weight" : cu[0] === "v" ? "volume" : "count"}) but the portion is in ${r.portion_unit} (${pu[0] === "w" ? "weight" : pu[0] === "v" ? "volume" : "count"})` };
    const y = r.yield_pct == null ? 100 : r.yield_pct; if (!(y > 0 && y <= 100)) return { cost: null, why: "yield_pct must be between 0 and 100" };
    const caseInPortionUnits = r.case_size * cu[1] / pu[1];
    const usable = caseInPortionUnits * y / 100;
    const cost = r.case_cost / usable * r.portion_size;
    return { cost, how: "case", perUnit: r.case_cost / usable, usable, unit: r.portion_unit };
  }

  /* ---------- 7. Build the model ---------- */
  function build(ds) {
    const M = { ds, stores: new Map(), comps: new Map(), items: new Map(), lines: [], addonLines: new Set(), byoByLine: new Map(), packaging: [], warnings: [] };
    (ds.stores || []).forEach(s => { if (s.store_id) M.stores.set(s.store_id, { id: s.store_id, name: s.store_name || s.store_id, region: s.region || "", city: s.city || "", state: s.state || "" }); });
    // components and cost versions
    for (const r of ds.components) {
      if (!r.component_id) continue;
      let c = M.comps.get(r.component_id);
      if (!c) { c = { id: r.component_id, name: r.component_name || r.component_id, station: r.station || "Other", fam: STATION_FAM(r.station), upcharge: 0, perishable: null, shelf: null, steps: 1, par: null, cal: null, sodium: null, versions: new Map(), dates: new Set() }; M.comps.set(c.id, c); }
      const pc = portionCost(r); if (pc.cost == null) continue;
      const store = r.store_id || "", date = r.effective_date || "0000-00-00";
      let list = c.versions.get(store); if (!list) { list = []; c.versions.set(store, list); }
      const v = { date, cost: pc.cost, how: pc.how, caseCost: r.case_cost, caseSize: r.case_size, caseUnit: r.case_unit, portionSize: r.portion_size, portionUnit: r.portion_unit, yield: r.yield_pct == null ? 100 : r.yield_pct, perUnit: pc.perUnit, usable: pc.usable, row: r._row };
      const i = list.findIndex(x => x.date === date); if (i >= 0) list[i] = v; else list.push(v);
      if (r.effective_date) c.dates.add(r.effective_date);
      if (r.upcharge != null) c.upcharge = r.upcharge;
      if (r.perishable != null) c.perishable = r.perishable; if (r.shelf_life_days != null) c.shelf = r.shelf_life_days;
      if (r.prep_steps != null) c.steps = r.prep_steps; if (r.par_portions != null) c.par = r.par_portions;
      if (r.calories != null) c.cal = r.calories; if (r.sodium_mg != null) c.sodium = r.sodium_mg;
      if (r.component_name) c.name = r.component_name; if (r.station) { c.station = r.station; c.fam = STATION_FAM(r.station); }
    }
    for (const c of M.comps.values()) for (const list of c.versions.values()) list.sort((a, b) => a.date < b.date ? -1 : 1);
    M.costDates = [...new Set([...M.comps.values()].flatMap(c => [...c.dates]))].sort();
    // items
    for (const r of ds.items) {
      if (!r.item_id) continue;
      let it = M.items.get(r.item_id);
      if (!it) { it = { id: r.item_id, name: r.item_name || r.item_id, line: r.line || "Other", price: null, prices: new Map(), byo: false, active: true, addon: false, cal: null, recipe: [] }; M.items.set(it.id, it); }
      if (r.store_id) it.prices.set(r.store_id, r.price); else { if (r.price != null) it.price = r.price; if (r.item_name) it.name = r.item_name; if (r.line) it.line = r.line; if (r.byo != null) it.byo = r.byo; if (r.active != null) it.active = r.active; if (r.menu_calories != null) it.cal = r.menu_calories; }
    }
    for (const it of M.items.values()) { it.addon = ADDON_LINE.test(it.line); if (it.price == null && it.prices.size) it.price = [...it.prices.values()][0]; }
    for (const r of ds.recipes) { const it = M.items.get(r.item_id), c = M.comps.get(r.component_id); if (!it || !c || !(r.portions > 0)) continue; const ex = it.recipe.find(x => x.cid === c.id); if (ex) ex.portions += r.portions; else it.recipe.push({ cid: c.id, portions: r.portions }); }
    for (const it of M.items.values()) it.set = new Set(it.recipe.map(x => x.cid));
    M.lines = [...new Set([...M.items.values()].map(i => i.line))];
    for (const it of M.items.values()) { if (it.addon) M.addonLines.add(it.line); if (it.byo && !M.byoByLine.has(it.line)) M.byoByLine.set(it.line, it.id); }
    M.packaging = (ds.packaging || []).map(r => ({ line: norm(r.line) === "all" ? "all" : r.line, channel: /dine|in_store|store/.test(norm(r.channel)) ? "dine_in" : /dig|app|web|deliv|online|offprem|off_prem/.test(norm(r.channel)) ? "digital" : "all", cost: r.cost || 0 }));
    M.hasPackaging = M.packaging.length > 0;
    const pkgCache = new Map();
    M.pkg = (line, ch) => { const k = line + "|" + ch; if (pkgCache.has(k)) return pkgCache.get(k); const pc = pkgChannel(ch); const find = (l, c) => M.packaging.find(p => p.line === l && p.channel === c); const hit = find(line, pc) || find(line, "all") || find("all", pc) || find("all", "all"); const v = hit ? hit.cost : 0; pkgCache.set(k, v); return v; };
    // cost lookup with a small cache (component|store|month)
    const cache = new Map();
    M.compCost = (cid, store, date) => {
      const key = cid + "|" + (store || "") + "|" + (date || "").slice(0, 7);
      let v = cache.get(key); if (v !== undefined) return v;
      v = compCostRaw(M, cid, store, date); cache.set(key, v); return v;
    };
    M.clearCache = () => cache.clear();
    M.itemPrice = (iid, store) => { const it = M.items.get(iid); if (!it) return null; return store && it.prices.has(store) ? it.prices.get(store) : it.price; };
    M.includedMainCost = (store, date) => { const mains = [...M.comps.values()].filter(c => c.fam === "main" && !(c.upcharge > 0)); if (!mains.length) return 0; return sum(mains, c => M.compCost(c.id, store, date)) / mains.length; };
    // waste, actuals, inventory kept as rows, filtered on use
    M.waste = (ds.waste || []).filter(r => M.comps.has(r.component_id) && r.date && r.qty_portions != null);
    M.actuals = (ds.actuals || []).filter(r => r.period && r.actual_food_cost != null);
    M.inventory = (ds.inventory || []).filter(r => M.comps.has(r.component_id) && r.period);
    // sales: join modifiers to lines
    M.sales = []; M.orders = new Map(); M.months = []; M.channels = []; M.dates = [];
    if (ds.sales && ds.sales.length) joinSales(M, ds.sales, ds.modifiers || []);
    return M;
  }
  function compCostRaw(M, cid, store, date) {
    const c = M.comps.get(cid); if (!c) return 0;
    const d = date || "9999-12-31";
    const pick = list => { if (!list || !list.length) return null; let hit = null; for (const v of list) { if (v.date <= d) hit = v; else break; } return hit || list[0]; };
    let v = null; if (store && c.versions.has(store)) { const l = c.versions.get(store); const h = pick(l); if (h && h.date <= d) v = h; }
    if (!v) v = pick(c.versions.get("")); if (!v && store) v = pick([...c.versions.values()][0]);
    return v ? v.cost : 0;
  }
  function joinSales(M, sales, mods) {
    // index modifiers
    const byLine = new Map(), byItem = new Map();
    for (const m of mods) {
      if (!m.order_id || !M.comps.has(m.component_id)) continue;
      const q = m.qty == null ? 1 : m.qty; if (!(q > 0)) continue;
      const rec = { cid: m.component_id, qty: q };
      if (m.line_id != null && m.line_id !== "") { const k = m.order_id + "|" + m.line_id; let a = byLine.get(k); if (!a) { a = []; byLine.set(k, a); } a.push(rec); }
      else { const k = m.order_id + "|" + (m.item_id || ""); let a = byItem.get(k); if (!a) { a = []; byItem.set(k, a); } a.push(rec); }
    }
    const seenItemLine = new Set(); let n = 0;
    const months = new Set(), channels = new Set(), dates = new Set();
    for (const r of sales) {
      const it = M.items.get(r.item_id); if (!it || !r.date || !r.store_id) continue;
      const q = r.qty == null ? 1 : r.qty; if (!(q > 0)) continue;
      const oid = r.order_id || ("_" + (n++));
      const time = toTime(r.time); const ch = channelOf(r.channel);
      let mlist = null;
      if (r.line_id != null && r.line_id !== "") mlist = byLine.get(oid + "|" + r.line_id) || null;
      if (!mlist) { const k = oid + "|" + r.item_id; if (!seenItemLine.has(k)) { mlist = byItem.get(k) || byItem.get(oid + "|") || null; if (mlist) seenItemLine.add(k); } }
      const L = { oid, store: r.store_id, date: r.date, month: r.date.slice(0, 7), dow: dayOfWeek(r.date), time, daypart: r.daypart ? norm(r.daypart) : daypartOf(time), ch, iid: it.id, qty: q, net: r.net_price, mods: mlist };
      M.sales.push(L); months.add(L.month); channels.add(ch); dates.add(r.date);
      let o = M.orders.get(oid); if (!o) { o = { id: oid, store: L.store, date: L.date, ch, lines: [] }; M.orders.set(oid, o); } o.lines.push(L);
    }
    M.months = [...months].sort(); M.channels = CHANNELS.filter(c => channels.has(c)); M.dates = [...dates].sort();
    for (const L of M.sales) if (!M.stores.has(L.store)) M.stores.set(L.store, { id: L.store, name: L.store, region: "", city: "", state: "" });
  }

  /* ---------- 8. Costing one item or one build ---------- */
  // Unit cost of an item at a store on a date. Returns parts for display. scn: scenario (cost overrides, swaps).
  function costOf(M, parts, store, date, scn) {
    const out = []; let food = 0;
    for (const p of parts) {
      let cid = p.cid; if (scn && scn.swapMap && scn.swapMap.has(cid)) cid = scn.swapMap.get(cid);
      const c = M.comps.get(cid); if (!c) continue;
      let unit = M.compCost(cid, store, date);
      if (scn) { if (scn.costAbs && scn.costAbs[cid] != null) unit = scn.costAbs[cid]; else if (scn.costPct && scn.costPct[cid]) unit = unit * (1 + scn.costPct[cid] / 100); }
      const cost = unit * p.portions; food += cost;
      out.push({ cid, name: c.name, station: c.station, fam: c.fam, portions: p.portions, unit, cost, upcharge: scn && scn.upcharges && scn.upcharges[cid] != null ? scn.upcharges[cid] : c.upcharge });
    }
    return { food, parts: out };
  }
  const modsToParts = mods => mods.map(m => ({ cid: m.cid, portions: m.qty }));
  function upchargeOf(M, cid, scn) { const c = M.comps.get(cid); if (!c) return 0; return scn && scn.upcharges && scn.upcharges[cid] != null ? scn.upcharges[cid] : c.upcharge; }
  // price for a target food cost
  const priceFor = (cost, targetPct) => targetPct > 0 ? cost / (targetPct / 100) : null;

  /* ---------- 9. Scenarios ---------- */
  // scn = { name, costPct: {cid: +15}, costAbs: {cid: 2.10}, prices: {iid: 13.25}, upcharges: {cid: 4.5}, remove: [iid], swaps: [{from, to}],
  //         newItems: [{id, name, line, price, recipe: [{cid, portions}], unitsPerStoreWeek, cannibal: 0.7, weeks: null}], unavailable: [cid],
  //         elasticity: -0.8, retention: 0.8 }
  function normScenario(scn) {
    if (!scn) return null;
    const s = Object.assign({ costPct: {}, costAbs: {}, prices: {}, upcharges: {}, remove: [], swaps: [], newItems: [], unavailable: [], elasticity: -0.8, retention: 0.8 }, scn);
    s.swapMap = new Map(s.swaps.filter(x => x.from && x.to && x.from !== x.to).map(x => [x.from, x.to]));
    s.removeSet = new Set(s.remove);
    s.empty = !Object.keys(s.costPct).some(k => s.costPct[k]) && !Object.keys(s.costAbs).length && !Object.keys(s.prices).length && !Object.keys(s.upcharges).length && !s.remove.length && !s.swapMap.size && !s.newItems.length && !s.unavailable.length;
    return s;
  }

  /* ---------- 10. Analysis ---------- */
  // scope = { stores: Set|null, months: Set|null, channel: "all"|channel, target: 30 }
  function analyze(M, scope, scenario) {
    scope = scope || {}; const scn = normScenario(scenario);
    const target = scope.target || 30;
    const inScope = L => (!scope.stores || scope.stores.has(L.store)) && (!scope.months || scope.months.has(L.month)) && (!scope.channel || scope.channel === "all" || L.ch === scope.channel);
    const lines = M.sales.filter(inScope);
    const storesIn = scope.stores ? [...scope.stores] : [...M.stores.keys()];
    const R = { scope: { stores: storesIn, months: scope.months ? [...scope.months] : M.months, channel: scope.channel || "all", target }, hasSales: lines.length > 0, scenario: scn && !scn.empty ? scn.name || "Scenario" : null, warnings: [] };
    const refDate = lines.length ? lines[lines.length - 1].date : (M.costDates[M.costDates.length - 1] || "9999-12-31");
    const refStore = storesIn[0] || "";
    R.refDate = refDate; R.refStore = refStore;
    const nStores = Math.max(1, storesIn.filter(s => lines.some(L => L.store === s)).length || storesIn.length);
    const dateSet = new Set(lines.map(L => L.date)); const nDays = dateSet.size || 1; const weeks = nDays / 7;
    R.days = nDays; R.weeks = weeks; R.nStores = nStores;

    // --- static item costing (at the reference store/date), used by cost views and by the sales pass for curated items
    R.items = new Map();
    for (const it of M.items.values()) {
      if (!it.active) continue;
      const price = scn && scn.prices[it.id] != null ? scn.prices[it.id] : M.itemPrice(it.id, refStore);
      const c = it.byo ? { food: 0, parts: [] } : costOf(M, it.recipe, refStore, refDate, scn);
      const pkgIn = M.pkg(it.line, "in_store"), pkgDig = M.pkg(it.line, "app");
      R.items.set(it.id, { id: it.id, name: it.name, line: it.line, addon: it.addon, byo: it.byo, price, basePrice: M.itemPrice(it.id, refStore), food: c.food, parts: c.parts, pkgIn, pkgDig,
        fc: price ? c.food / price * 100 : null, cm: price != null ? price - c.food : null, priceFor: priceFor(c.food, target), removed: !!(scn && scn.removeSet.has(it.id)),
        units: 0, rev: 0, cogs: 0, pkg: 0, orders: 0, stores: new Set(), months: new Map() });
    }
    // new items from the scenario
    if (scn) for (const n of scn.newItems) {
      if (!n || !n.id) continue;
      const c = costOf(M, n.recipe || [], refStore, refDate, scn); const price = n.price || 0;
      R.items.set(n.id, { id: n.id, name: n.name || n.id, line: n.line || "Bowls", addon: ADDON_LINE.test(n.line || ""), byo: false, price, basePrice: null, food: c.food, parts: c.parts, pkgIn: M.pkg(n.line || "", "in_store"), pkgDig: M.pkg(n.line || "", "app"),
        fc: price ? c.food / price * 100 : null, cm: price - c.food, priceFor: priceFor(c.food, target), isNew: true, units: 0, rev: 0, cogs: 0, pkg: 0, orders: 0, stores: new Set(), months: new Map() });
    }

    // --- sales pass
    const agg = () => ({ units: 0, rev: 0, cogs: 0, pkg: 0, orders: new Set(), meals: 0 });
    const tot = agg(); const byStore = new Map(), byMonth = new Map(), byStoreMonth = new Map(), byChannel = new Map(), byDaypart = new Map(), byDow = new Map(), byLine = new Map();
    const get = (m, k) => { let a = m.get(k); if (!a) { a = agg(); m.set(k, a); } return a; };
    const add = (a, L, w, rev, cogs, pkg, meal) => { a.units += w; a.rev += rev; a.cogs += cogs; a.pkg += pkg; a.orders.add(L.oid); if (meal) a.meals += w; };
    // first pass: base units per item and per line (needed for removal / cannibalization factors)
    const baseUnits = new Map(), lineUnits = new Map();
    for (const L of lines) { baseUnits.set(L.iid, (baseUnits.get(L.iid) || 0) + L.qty); const it = M.items.get(L.iid); lineUnits.set(it.line, (lineUnits.get(it.line) || 0) + L.qty); }
    const lineFactor = new Map(); // demand moved into remaining items of a line by removals and pulled out by new items
    if (scn && !scn.empty) {
      for (const [line, U] of lineUnits) {
        let removed = 0; for (const [iid, u] of baseUnits) if (scn.removeSet.has(iid) && M.items.get(iid).line === line) removed += u;
        const remaining = U - removed; let g = remaining > 0 ? 1 + scn.retention * removed / remaining : 1;
        let pulled = 0; for (const n of scn.newItems) if ((n.line || "Bowls") === line && n.unitsPerStoreWeek > 0) { const wk = n.weeks ? Math.min(n.weeks, weeks) : weeks; pulled += n.unitsPerStoreWeek * nStores * wk * (n.cannibal == null ? 0.7 : n.cannibal); }
        const h = remaining > 0 ? Math.max(0, 1 - pulled / (remaining * g)) : 1;
        lineFactor.set(line, g * h);
      }
    }
    const elasticity = scn ? scn.elasticity : 0;
    const priceFactor = iid => { if (!scn || scn.prices[iid] == null) return 1; const it = M.items.get(iid); const old = M.itemPrice(iid, refStore); if (!old) return 1; return Math.max(0, 1 + elasticity * (scn.prices[iid] - old) / old); };
    const includedMain = M.includedMainCost(refStore, refDate);
    const incrementalOf = (c, unit) => c.fam === "main" ? Math.max(0, unit - includedMain) : unit;
    // BYO / modifier accumulators
    const picks = new Map(); // cid -> {picks, qty, rev(upcharge), orders}
    const builds = new Map(); // key -> {comps, n, rev, cost, line, iid}
    let byoOrders = 0, byoComps = 0; const byoByStation = new Map(); const byoByLineCount = new Map();
    const upStats = new Map(); // cid -> {picks, margin}
    const uncostedRev = { byoNoMods: 0, total: 0 };
    const orderTotals = new Map(); // oid -> rev
    const itemOrders = new Map(); // iid -> Set(oid)
    const compUsage = new Map(); // cid -> portions (theoretical usage), by store-month too
    const compUsageSM = new Map();
    const perishUse = new Map();
    for (const L of lines) {
      const it = M.items.get(L.iid); const RI = R.items.get(L.iid); if (!RI) continue;
      if (scn && scn.removeSet.has(L.iid)) continue;
      const w = L.qty * priceFactor(L.iid) * (lineFactor.get(it.line) || 1);
      const price = scn && scn.prices[L.iid] != null ? scn.prices[L.iid] : (L.net != null ? L.net : M.itemPrice(L.iid, L.store));
      let unitFood, parts;
      let unitRev = price || 0;
      if (it.byo || (L.mods && L.mods.length)) {
        const base = it.byo ? { food: 0, parts: [] } : costOf(M, it.recipe, L.store, L.date, scn);
        const mc = L.mods && L.mods.length ? costOf(M, modsToParts(L.mods), L.store, L.date, scn) : { food: 0, parts: [] };
        unitFood = base.food + mc.food; parts = base.parts.concat(mc.parts);
        if (it.byo && !(L.mods && L.mods.length)) { uncostedRev.byoNoMods += unitRev * w; }
        if (L.net == null && !(scn && scn.prices[L.iid] != null)) unitRev = (M.itemPrice(L.iid, L.store) || 0) + sum(mc.parts, p => upchargeOf(M, p.cid, null) * p.portions);
        // up-charge scenario: Δ on picked premium components with a demand response (pf = share of picks kept)
        const pfOf = new Map();
        if (scn && Object.keys(scn.upcharges).length) for (const p of mc.parts) { const c = M.comps.get(p.cid); const oldU = c.upcharge, newU = scn.upcharges[p.cid]; if (newU == null || newU === oldU) continue; const d = newU - oldU; const pf = Math.max(0, Math.min(1.5, 1 + elasticity * d / (oldU || M.itemPrice(L.iid, L.store) || 1))); pfOf.set(p.cid, pf); unitRev += p.portions * (d * pf - oldU * (1 - pf)); unitFood -= p.portions * (1 - pf) * incrementalOf(c, p.unit); }
        if (L.mods && L.mods.length && it.byo) {
          byoOrders += w; byoComps += sum(L.mods, m => m.qty) * w; byoByLineCount.set(it.line, (byoByLineCount.get(it.line) || 0) + w);
          const key = L.mods.map(m => (scn && scn.swapMap.get(m.cid)) || m.cid).map((cid, i) => cid + (L.mods[i].qty !== 1 ? "×" + L.mods[i].qty : "")).sort().join("+");
          let b = builds.get(key); if (!b) { b = { key, comps: L.mods.map((m, i) => ({ cid: (scn && scn.swapMap.get(m.cid)) || m.cid, qty: m.qty })), n: 0, rev: 0, cost: 0, line: it.line, iid: it.id }; builds.set(key, b); }
          b.n += w; b.rev += unitRev * w; b.cost += unitFood * w;
          const st = new Map(); for (const p of mc.parts) { st.set(p.station, (st.get(p.station) || 0) + p.portions); }
          for (const [s, q] of st) { let a = byoByStation.get(s); if (!a) { a = { qty: 0, orders: 0 }; byoByStation.set(s, a); } a.qty += q * w; a.orders += w; }
        }
        for (const p of mc.parts) { let a = picks.get(p.cid); if (!a) { a = { picks: 0, qty: 0, rev: 0, byo: 0 }; picks.set(p.cid, a); } const wp = w * (pfOf.get(p.cid) || 1); a.picks += wp; a.qty += p.portions * wp; a.rev += upchargeOf(M, p.cid, scn) * p.portions * wp; if (it.byo) a.byo += wp; }
      } else { unitFood = RI.food; parts = RI.parts; if (L.net == null && !(scn && scn.prices[L.iid] != null)) unitRev = M.itemPrice(L.iid, L.store) || 0; if (refStore !== L.store || RI.parts.length && L.date.slice(0, 7) !== refDate.slice(0, 7)) { const c = costOf(M, it.recipe, L.store, L.date, scn); unitFood = c.food; parts = c.parts; } }
      const pkg = M.pkg(it.line, L.ch);
      const rev = unitRev * w, cogs = unitFood * w, pk = pkg * w;
      uncostedRev.total += rev;
      add(tot, L, w, rev, cogs, pk, !it.addon);
      add(get(byStore, L.store), L, w, rev, cogs, pk, !it.addon); add(get(byMonth, L.month), L, w, rev, cogs, pk, !it.addon); add(get(byStoreMonth, L.store + "|" + L.month), L, w, rev, cogs, pk, !it.addon);
      add(get(byChannel, L.ch), L, w, rev, cogs, pk, !it.addon); add(get(byDaypart, L.daypart), L, w, rev, cogs, pk, !it.addon); add(get(byDow, L.dow), L, w, rev, cogs, pk, !it.addon); add(get(byLine, it.line), L, w, rev, cogs, pk, !it.addon);
      RI.units += w; RI.rev += rev; RI.cogs += cogs; RI.pkg += pk; RI.stores.add(L.store); { let mm = RI.months.get(L.month); if (!mm) { mm = { units: 0, rev: 0, cogs: 0 }; RI.months.set(L.month, mm); } mm.units += w; mm.rev += rev; mm.cogs += cogs; }
      orderTotals.set(L.oid, (orderTotals.get(L.oid) || 0) + rev); { let s = itemOrders.get(L.iid); if (!s) { s = new Set(); itemOrders.set(L.iid, s); } s.add(L.oid); }
      for (const p of parts) { compUsage.set(p.cid, (compUsage.get(p.cid) || 0) + p.portions * w); const k = p.cid + "|" + L.store + "|" + L.month; compUsageSM.set(k, (compUsageSM.get(k) || 0) + p.portions * w); }
    }
    // new items: projected volume, spread across the scope
    if (scn) for (const n of scn.newItems) {
      const RI = R.items.get(n.id); if (!RI || !(n.unitsPerStoreWeek > 0)) continue;
      const wk = n.weeks ? Math.min(n.weeks, weeks) : weeks; const units = n.unitsPerStoreWeek * nStores * wk;
      const rev = units * RI.price, cogs = units * RI.food, pk = units * (RI.pkgIn + RI.pkgDig) / 2;
      RI.units = units; RI.rev = rev; RI.cogs = cogs; RI.pkg = pk; RI.projected = true; RI.cannibal = n.cannibal == null ? 0.7 : n.cannibal; RI.weeks = wk;
      const spread = (map, share) => { for (const [k, a] of map) { const s = share(k, a); a.units += units * s; a.rev += rev * s; a.cogs += cogs * s; a.pkg += pk * s; if (!RI.addon) a.meals += units * s; } };
      const T = tot.units || 1; spread(byStore, (k, a) => a.units / T); spread(byMonth, (k, a) => a.units / T); spread(byStoreMonth, (k, a) => a.units / T); spread(byChannel, (k, a) => a.units / T); spread(byDaypart, (k, a) => a.units / T); spread(byDow, (k, a) => a.units / T);
      const bl = get(byLine, RI.line); bl.units += units; bl.rev += rev; bl.cogs += cogs; bl.pkg += pk; if (!RI.addon) bl.meals += units;
      tot.units += units; tot.rev += rev; tot.cogs += cogs; tot.pkg += pk; if (!RI.addon) tot.meals += units;
      for (const p of RI.parts) compUsage.set(p.cid, (compUsage.get(p.cid) || 0) + p.portions * units);
    }
    const fin = a => ({ units: a.units, rev: a.rev, cogs: a.cogs, pkg: a.pkg, orders: a.orders.size, meals: a.meals, fc: a.rev ? a.cogs / a.rev * 100 : null, fcAll: a.rev ? (a.cogs + a.pkg) / a.rev * 100 : null, gp: a.rev - a.cogs - a.pkg, aov: a.orders.size ? a.rev / a.orders.size : null });
    const finMap = (m, keyName) => [...m].map(([k, a]) => Object.assign({ [keyName]: k }, fin(a))).sort((a, b) => a[keyName] < b[keyName] ? -1 : 1);
    R.totals = fin(tot);
    R.totals.orders = new Set(lines.map(L => L.oid)).size || R.totals.orders;
    R.byStore = finMap(byStore, "store").map(x => Object.assign(x, { name: (M.stores.get(x.store) || {}).name || x.store, region: (M.stores.get(x.store) || {}).region || "" }));
    R.byMonth = finMap(byMonth, "month"); R.byStoreMonth = new Map([...byStoreMonth].map(([k, a]) => [k, fin(a)]));
    R.byChannel = CHANNELS.filter(c => byChannel.has(c)).map(c => Object.assign({ channel: c }, fin(byChannel.get(c))));
    const DP = ["breakfast", "lunch", "afternoon", "dinner", "unknown"]; R.byDaypart = DP.filter(d => byDaypart.has(d)).map(d => Object.assign({ daypart: d }, fin(byDaypart.get(d))));
    const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]; R.byDow = DOW.filter(d => byDow.has(d)).map(d => Object.assign({ dow: d }, fin(byDow.get(d))));
    R.byLine = finMap(byLine, "line");
    R.coverage = uncostedRev.total ? 1 - uncostedRev.byoNoMods / uncostedRev.total : 1;
    R.compUsage = compUsage; R.compUsageSM = compUsageSM;

    // --- item table and menu engineering
    R.itemList = [...R.items.values()].map(x => { x.avgPrice = x.units ? x.rev / x.units : x.price; x.unitCost = x.units ? x.cogs / x.units : x.food; x.cmUnit = x.avgPrice != null ? x.avgPrice - x.unitCost : null; x.cmTotal = x.rev - x.cogs; x.fcSold = x.rev ? x.cogs / x.rev * 100 : x.fc; x.share = tot.units ? x.units / tot.units : 0; x.nStores = x.stores.size; return x; });
    const meals = R.itemList.filter(x => !x.addon && !x.byo && x.units > 0), addons = R.itemList.filter(x => x.addon && x.units > 0);
    R.itemList.forEach(x => { if (x.byo) { x.quadrant = null; x.read = "Build-your-own line: see the modifier analysis"; } });
    const me = (list) => { if (!list.length) return { pop: 0, cm: 0 }; const U = sum(list, x => x.units); const pop = 0.7 * U / list.length; const cm = sum(list, x => x.cmTotal) / U; list.forEach(x => { const hiPop = x.units >= pop, hiCm = x.cmUnit >= cm; x.quadrant = hiPop ? (hiCm ? "Star" : "Plowhorse") : (hiCm ? "Puzzle" : "Dog"); x.read = x.quadrant === "Star" ? "Keep and feature" : x.quadrant === "Plowhorse" ? "Reprice or trim cost" : x.quadrant === "Puzzle" ? "Promote or reposition" : "Candidate to cut"; }); return { pop, cm }; };
    R.me = { meals: me(meals), addons: me(addons) };

    // --- build-your-own
    const pickList = [...picks].map(([cid, a]) => { const c = M.comps.get(cid); const unit = costOf(M, [{ cid, portions: 1 }], refStore, refDate, scn).parts[0]; return { cid, name: c.name, station: c.station, fam: c.fam, picks: a.picks, byoPicks: a.byo, qty: a.qty, rate: byoOrders ? a.byo / byoOrders : 0, upcharge: unit ? unit.upcharge : c.upcharge, cost: unit ? unit.unit : 0, curated: [...M.items.values()].filter(i => i.set.has(cid) && i.active).length }; }).sort((a, b) => b.picks - a.picks);
    R.byo = { orders: byoOrders, avgComponents: byoOrders ? byoComps / byoOrders : null, picks: pickList, byLine: [...byoByLineCount].map(([line, n]) => ({ line, n })),
      byStation: [...byoByStation].map(([station, a]) => ({ station, avgPerOrder: byoOrders ? a.qty / byoOrders : 0, share: byoOrders ? a.orders / byoOrders : 0 })).sort((a, b) => b.avgPerOrder - a.avgPerOrder) };
    // builds: top builds, nearest curated item, off-menu candidates, cannibalization
    const curated = [...M.items.values()].filter(i => i.active && !i.byo && !i.addon && i.set.size);
    const jaccard = (A, B) => { let inter = 0; for (const x of A) if (B.has(x)) inter++; const u = A.size + B.size - inter; return u ? inter / u : 0; };
    const allBuilds = [...builds.values()].sort((a, b) => b.n - a.n);
    const topBuilds = allBuilds.slice(0, 400);
    for (const b of topBuilds) { b.set = new Set(b.comps.map(c => c.cid)); let best = null, bs = 0; for (const it of curated) { const s = jaccard(b.set, it.set); if (s > bs) { bs = s; best = it; } } b.nearest = best ? { id: best.id, name: best.name } : null; b.sim = bs; b.avgPrice = b.n ? b.rev / b.n : 0; b.unitCost = b.n ? b.cost / b.n : 0; b.fc = b.rev ? b.cost / b.rev * 100 : null; b.label = b.comps.map(c => M.comps.get(c.cid).name + (c.qty !== 1 ? " ×" + c.qty : "")).join(", "); b.mains = b.comps.filter(c => M.comps.get(c.cid).fam === "main").map(c => M.comps.get(c.cid).name); }
    R.byo.builds = topBuilds.slice(0, 50); R.byo.distinctBuilds = builds.size;
    R.byo.offMenu = topBuilds.filter(b => b.sim < 0.8 && b.n >= 2).slice(0, 25).map(b => Object.assign({}, b, { priceFor: priceFor(b.unitCost, target), perStoreWeek: b.n / nStores / weeks }));
    R.byo.cannibal = curated.map(it => { let look = 0; for (const b of allBuilds) { if (b.line !== it.line) continue; if (!b.set) b.set = new Set(b.comps.map(c => c.cid)); if (jaccard(b.set, it.set) >= 0.75) look += b.n; } const RI = R.items.get(it.id); const units = RI ? RI.units : 0; return { id: it.id, name: it.name, line: it.line, units, lookalikes: look, ratio: units + look ? look / (units + look) : 0, read: units + look === 0 ? "No data" : look / (units + look) >= 0.5 ? "Mostly formalizes an existing build" : look / (units + look) >= 0.2 ? "Partly overlaps with build-your-own" : "Brings mostly new demand" }; }).sort((a, b) => b.ratio - a.ratio);

    // --- up-charge coverage
    R.upcharges = [...M.comps.values()].filter(c => c.upcharge > 0 || (scn && scn.upcharges[c.id] > 0)).map(c => { const p = costOf(M, [{ cid: c.id, portions: 1 }], refStore, refDate, scn).parts[0]; const unit = p ? p.unit : 0; const up = p ? p.upcharge : c.upcharge; const inc = incrementalOf(c, unit); const pk = picks.get(c.id); const n = pk ? pk.qty : 0; return { cid: c.id, name: c.name, station: c.station, fam: c.fam, upcharge: up, cost: unit, incremental: inc, margin: up - inc, marginPct: up ? (up - inc) / up * 100 : null, breakEven: c.fam === "main" ? up + includedMain : up, picks: n, marginTotal: (up - inc) * n, perStoreWeek: n / nStores / weeks, baseMain: c.fam === "main" ? includedMain : null }; }).sort((a, b) => b.upcharge - a.upcharge);
    R.includedMain = includedMain;

    // --- attach rates (orders with a meal that also hold an add-on), by channel
    const orders = [...M.orders.values()].filter(o => o.lines.some(inScope));
    R.ordersN = orders.length;
    const attach = new Map(); // mealKey -> {n, any, lines: Map(addonLine -> n), items: Map(addonItem -> n), ch: Map(channel -> {n, lines: Map})}
    const addonLines = [...M.addonLines];
    for (const o of orders) {
      const ls = o.lines.filter(inScope); const mealsIn = ls.filter(L => !M.items.get(L.iid).addon && !(scn && scn.removeSet.has(L.iid))); const adds = ls.filter(L => M.items.get(L.iid).addon);
      const addLines = new Set(adds.map(L => M.items.get(L.iid).line)), addItems = new Set(adds.map(L => L.iid));
      for (const mk of new Set(mealsIn.map(L => L.iid))) {
        let a = attach.get(mk); if (!a) { a = { key: mk, n: 0, any: 0, lines: new Map(), items: new Map(), ch: new Map() }; attach.set(mk, a); }
        a.n++; if (adds.length) a.any++; for (const l of addLines) a.lines.set(l, (a.lines.get(l) || 0) + 1); for (const i of addItems) a.items.set(i, (a.items.get(i) || 0) + 1);
        let c = a.ch.get(o.ch); if (!c) { c = { n: 0, lines: new Map() }; a.ch.set(o.ch, c); } c.n++; for (const l of addLines) c.lines.set(l, (c.lines.get(l) || 0) + 1);
      }
    }
    R.attach = { lines: addonLines, meals: [...attach.values()].map(a => ({ key: a.key, name: M.items.get(a.key).name, line: M.items.get(a.key).line, n: a.n, rates: Object.fromEntries(addonLines.map(l => [l, a.n ? (a.lines.get(l) || 0) / a.n : 0])), anyRate: a.n ? a.any / a.n : 0, top: [...a.items].sort((x, y) => y[1] - x[1]).slice(0, 5).map(([iid, n]) => ({ id: iid, name: M.items.get(iid).name, rate: n / a.n })), byChannel: Object.fromEntries([...a.ch].map(([ch, c]) => [ch, { n: c.n, rates: Object.fromEntries(addonLines.map(l => [l, c.n ? (c.lines.get(l) || 0) / c.n : 0])) }])) })).sort((a, b) => b.n - a.n) };
    // --- spend per order drivers
    const totalRev = sum([...orderTotals.values()]); const nOrders = orderTotals.size || 1;
    R.drivers = [...itemOrders].map(([iid, set]) => { const n = set.size; let withRev = 0; for (const o of set) withRev += orderTotals.get(o) || 0; const aovWith = withRev / n; const rest = nOrders - n; const aovWithout = rest ? (totalRev - withRev) / rest : null; return { id: iid, name: M.items.get(iid).name, line: M.items.get(iid).line, n, aovWith, aovWithout, lift: aovWithout != null ? aovWith - aovWithout : null }; }).filter(x => x.n >= 20).sort((a, b) => (b.lift || 0) - (a.lift || 0));
    R.aov = totalRev / nOrders;
    // --- channel price differences (avg paid per item by channel vs in-store)
    const chPrice = new Map(); for (const L of lines) { const k = L.iid + "|" + L.ch; let a = chPrice.get(k); if (!a) { a = { n: 0, rev: 0 }; chPrice.set(k, a); } const p = L.net != null ? L.net : M.itemPrice(L.iid, L.store); a.n += L.qty; a.rev += (p || 0) * L.qty; }
    R.channelPrices = [...R.items.values()].filter(x => x.units > 0 && !x.byo).map(x => { const row = { id: x.id, name: x.name, line: x.line }; for (const ch of M.channels) { const a = chPrice.get(x.id + "|" + ch); row[ch] = a && a.n ? a.rev / a.n : null; } return row; }).filter(r => M.channels.some(ch => r[ch] != null && r.in_store != null && Math.abs(r[ch] - r.in_store) > 0.01));

    // --- operations
    const curatedAll = [...M.items.values()].filter(i => i.active && !i.byo && i.recipe.length);
    const useCount = new Map(); for (const it of curatedAll) for (const p of it.recipe) useCount.set(p.cid, (useCount.get(p.cid) || 0) + 1);
    const perSW = cid => (compUsage.get(cid) || 0) / nStores / weeks; const VOL = scope.volume || 20; // portions per store-week that count as "at volume"
    const prepOf = (recipe) => { const stations = new Set(recipe.map(p => (M.comps.get(p.cid) || {}).station)); return { components: recipe.length, stations: stations.size, steps: sum(recipe, p => (M.comps.get(p.cid) || { steps: 1 }).steps || 1), exclusive: recipe.filter(p => (useCount.get(p.cid) || 0) <= 1 && perSW(p.cid) < VOL).map(p => M.comps.get(p.cid).name), atVolume: recipe.filter(p => perSW(p.cid) >= VOL || (useCount.get(p.cid) || 0) >= 2).length }; };
    R.ops = {};
    R.ops.prep = R.itemList.filter(x => !x.byo && x.parts.length).map(x => { const pr = prepOf(x.parts.map(p => ({ cid: p.cid, portions: p.portions }))); return Object.assign({ id: x.id, name: x.name, line: x.line, units: x.units, isNew: !!x.isNew, crossUtil: pr.components ? pr.atVolume / pr.components : null }, pr); }).sort((a, b) => b.steps - a.steps);
    R.crossUtil = recipe => { const pr = prepOf(recipe); return { score: pr.components ? pr.atVolume / pr.components : null, newLoad: recipe.filter(p => !useCount.has(p.cid) && perSW(p.cid) < VOL).map(p => M.comps.get(p.cid) ? M.comps.get(p.cid).name : p.cid), atVolume: pr.atVolume, components: pr.components }; };
    // waste
    const wasteIn = M.waste.filter(r => (!scope.stores || scope.stores.has(r.store_id)) && (!scope.months || scope.months.has(r.date.slice(0, 7))));
    const wasteBy = new Map(); for (const r of wasteIn) { let a = wasteBy.get(r.component_id); if (!a) { a = { qty: 0, cost: 0, reasons: new Map() }; wasteBy.set(r.component_id, a); } const c = M.compCost(r.component_id, r.store_id, r.date); a.qty += r.qty_portions; a.cost += r.qty_portions * c; if (r.reason) a.reasons.set(r.reason, (a.reasons.get(r.reason) || 0) + r.qty_portions); }
    R.ops.hasWaste = wasteIn.length > 0;
    R.ops.waste = [...M.comps.values()].filter(c => c.fam !== "packaging").map(c => { const w = wasteBy.get(c.id); const use = compUsage.get(c.id) || 0; return { cid: c.id, name: c.name, station: c.station, fam: c.fam, perishable: c.perishable, usage: use, perStoreWeek: perSW(c.id), wasteQty: w ? w.qty : 0, wasteCost: w ? w.cost : 0, wastePerWeek: w ? w.cost / weeks : 0, wastePct: w && (use + w.qty) ? w.qty / (use + w.qty) * 100 : null, reasons: w ? [...w.reasons].sort((a, b) => b[1] - a[1]) : [], curated: useCount.get(c.id) || 0, onLine: LINE_STATIONS.has(c.fam), rate: byoOrders && picks.get(c.id) ? picks.get(c.id).byo / byoOrders : 0 }; });
    R.ops.wasteTotal = sum(R.ops.waste, w => w.wasteCost); R.ops.wastePctCogs = tot.cogs ? R.ops.wasteTotal / tot.cogs * 100 : null;
    R.ops.lowMovers = R.ops.waste.filter(w => w.onLine && w.curated === 0 && (byoOrders ? w.rate < 0.03 : true)).sort((a, b) => a.rate - b.rate);
    // theoretical vs actual usage
    const invIn = M.inventory.filter(r => (!scope.stores || scope.stores.has(r.store_id)) && (!scope.months || scope.months.has(r.period)));
    R.ops.hasInventory = invIn.length > 0;
    const tva = new Map(); for (const r of invIn) { const actual = (r.begin_qty || 0) + (r.purchased_qty || 0) - (r.end_qty || 0); const theo = compUsageSM.get(r.component_id + "|" + r.store_id + "|" + r.period) || 0; let a = tva.get(r.component_id); if (!a) { a = { actual: 0, theo: 0, n: 0 }; tva.set(r.component_id, a); } a.actual += actual; a.theo += theo; a.n++; }
    R.ops.tva = [...tva].map(([cid, a]) => { const c = M.comps.get(cid); const cost = M.compCost(cid, refStore, refDate); return { cid, name: c.name, station: c.station, theoretical: a.theo, actual: a.actual, variance: a.actual - a.theo, variancePct: a.theo ? (a.actual - a.theo) / a.theo * 100 : null, varianceCost: (a.actual - a.theo) * cost, read: !a.theo ? "No theoretical usage" : (a.actual - a.theo) / a.theo > 0.1 ? "Over-portioning or waste" : (a.actual - a.theo) / a.theo < -0.05 ? "Under-portioning or count error" : "In line" }; }).sort((a, b) => Math.abs(b.varianceCost) - Math.abs(a.varianceCost));
    // trend: per store per month fc, and per item cm first vs last month
    const monthsIn = R.byMonth.map(m => m.month);
    R.ops.trend = { months: monthsIn, stores: R.byStore.map(s => ({ store: s.store, name: s.name, points: monthsIn.map(m => { const a = R.byStoreMonth.get(s.store + "|" + m); return a ? a.fc : null; }) })),
      items: monthsIn.length >= 2 ? R.itemList.filter(x => x.units > 0 && !x.byo).map(x => { const f = x.months.get(monthsIn[0]), l = x.months.get(monthsIn[monthsIn.length - 1]); if (!f || !l || !f.units || !l.units) return null; const cmF = (f.rev - f.cogs) / f.units, cmL = (l.rev - l.cogs) / l.units; const fcF = f.rev ? f.cogs / f.rev * 100 : null, fcL = l.rev ? l.cogs / l.rev * 100 : null; return { id: x.id, name: x.name, line: x.line, cmFirst: cmF, cmLast: cmL, cmDelta: cmL - cmF, fcFirst: fcF, fcLast: fcL, fcDelta: fcL != null && fcF != null ? fcL - fcF : null, unitsFirst: f.units, unitsLast: l.units, slipping: cmL < cmF - 0.1 || (fcL != null && fcF != null && fcL - fcF > 2) }; }).filter(Boolean).sort((a, b) => a.cmDelta - b.cmDelta) : [] };
    // regional: items sold in a subset of stores; store price overrides
    R.ops.regional = { items: R.itemList.filter(x => x.units > 0 && x.nStores < nStores && nStores > 1).map(x => ({ id: x.id, name: x.name, line: x.line, units: x.units, stores: [...x.stores].map(s => (M.stores.get(s) || { name: s }).name) })), prices: [...M.items.values()].filter(i => i.active && i.prices.size).map(i => ({ id: i.id, name: i.name, line: i.line, base: i.price, stores: [...i.prices].map(([s, p]) => ({ store: s, name: (M.stores.get(s) || { name: s }).name, price: p })) })) };

    // --- reconciliation (ignores the channel filter; by store-month, full data)
    R.reconcile = reconcile(M, scope, scn);
    // --- cost version history
    R.history = history(M, scn);
    // --- price ladder
    R.ladder = ladder(M, R, scn);
    // --- nutrition check
    R.nutrition = [...M.items.values()].filter(i => i.active && !i.byo && i.recipe.length).map(i => { const calc = sum(i.recipe, p => (M.comps.get(p.cid).cal || 0) * p.portions); const sod = sum(i.recipe, p => (M.comps.get(p.cid).sodium || 0) * p.portions); const missing = i.recipe.filter(p => M.comps.get(p.cid).cal == null).length; return { id: i.id, name: i.name, line: i.line, calc, sodium: sod, menu: i.cal, delta: i.cal != null ? calc - i.cal : null, missing }; });
    R.hasNutrition = R.nutrition.some(n => n.calc > 0);
    // --- disruption exposure
    if (scn && scn.unavailable.length) R.disruption = scn.unavailable.map(cid => { const c = M.comps.get(cid); if (!c) return null; const curatedHit = R.itemList.filter(x => x.parts.some(p => p.cid === cid) && x.units > 0); const curatedRev = sum(curatedHit, x => x.rev); const pk = picks.get(cid); const byoN = pk ? pk.byo : 0; let byoRev = 0; for (const b of allBuilds) { if (!b.set) b.set = new Set(b.comps.map(c => c.cid)); if (b.set.has(cid)) byoRev += b.rev; } return { cid, name: c.name, station: c.station, items: curatedHit.map(x => ({ id: x.id, name: x.name, units: x.units, rev: x.rev, share: tot.rev ? x.rev / tot.rev : 0 })), curatedRev, byoOrders: byoN, byoRev, revAtRisk: curatedRev + byoRev, share: tot.rev ? (curatedRev + byoRev) / tot.rev : 0 }; }).filter(Boolean);
    return R;
  }

  const RECON = { coverage: 0.97, salesTol: 0.02, pass: [0, 3], review: [-1, 5] };
  function reconcile(M, scope, scn) {
    if (!M.actuals.length || !M.sales.length) return { rows: [], note: !M.actuals.length ? "No actuals file loaded." : "No sales loaded." };
    const rows = [];
    for (const a of M.actuals) {
      if (scope.stores && !scope.stores.has(a.store_id)) continue;
      const ls = M.sales.filter(L => L.store === a.store_id && L.month === a.period);
      if (!ls.length) { rows.push({ store: a.store_id, name: (M.stores.get(a.store_id) || { name: a.store_id }).name, month: a.period, verdict: "No sales", note: "No sales lines for this store and month." }); continue; }
      let rev = 0, cogs = 0, uncosted = 0;
      for (const L of ls) { const it = M.items.get(L.iid); let unitRev = L.net; let food; if (it.byo || (L.mods && L.mods.length)) { const base = it.byo ? { food: 0, parts: [] } : costOf(M, it.recipe, L.store, L.date, scn); const mc = L.mods && L.mods.length ? costOf(M, modsToParts(L.mods), L.store, L.date, scn) : { food: 0, parts: [] }; food = base.food + mc.food; if (unitRev == null) unitRev = (M.itemPrice(L.iid, L.store) || 0) + sum(mc.parts, p => upchargeOf(M, p.cid, null) * p.portions); if (it.byo && !(L.mods && L.mods.length)) uncosted += unitRev * L.qty; } else { food = costOf(M, it.recipe, L.store, L.date, scn).food; if (unitRev == null) unitRev = M.itemPrice(L.iid, L.store) || 0; if (!it.recipe.length) uncosted += unitRev * L.qty; } rev += unitRev * L.qty; cogs += food * L.qty; }
      const waste = sum(M.waste.filter(w => w.store_id === a.store_id && w.date.slice(0, 7) === a.period), w => w.qty_portions * M.compCost(w.component_id, w.store_id, w.date));
      const books = a.net_sales != null ? a.net_sales : rev;
      const theo = rev ? cogs / rev * 100 : null, theoW = rev ? (cogs + waste) / rev * 100 : null, actual = books ? a.actual_food_cost / books * 100 : null;
      const coverage = rev ? 1 - uncosted / rev : 0; const salesGap = a.net_sales != null && a.net_sales ? (rev - a.net_sales) / a.net_sales : 0;
      const gap = actual != null && theo != null ? actual - theo : null;
      let verdict, note;
      if (coverage < RECON.coverage) { verdict = "Not assessable"; note = `Only ${(coverage * 100).toFixed(1)}% of sales are costed (need ${RECON.coverage * 100}%): build-your-own lines without modifiers or items without recipes.`; }
      else if (Math.abs(salesGap) > RECON.salesTol) { verdict = "Review"; note = `Sales in the file are ${(salesGap * 100).toFixed(1)}% ${salesGap > 0 ? "above" : "below"} the books; fix the sales extract before judging food cost.`; }
      else if (gap == null) { verdict = "Not assessable"; note = "Missing sales or cost."; }
      else if (gap >= RECON.pass[0] && gap <= RECON.pass[1]) { verdict = "Pass"; note = `Books are ${gap.toFixed(1)} pts above theoretical, inside the ${RECON.pass[0]}–${RECON.pass[1]} pt band expected from waste and over-portioning.`; }
      else if (gap >= RECON.review[0] && gap <= RECON.review[1]) { verdict = "Review"; note = gap < 0 ? `Theoretical is ${(-gap).toFixed(1)} pts above the books: recipes or costs look overstated, or purchases were timed across months.` : `Gap of ${gap.toFixed(1)} pts is more than normal waste explains; check waste logs, portioning and missing items.`; }
      else { verdict = "Fail"; note = gap < 0 ? `Theoretical is ${(-gap).toFixed(1)} pts above the books: recipes, portions or costs are wrong.` : `Gap of ${gap.toFixed(1)} pts: costs or recipes are missing something, or there is a real usage problem.`; }
      rows.push({ store: a.store_id, name: (M.stores.get(a.store_id) || { name: a.store_id }).name, month: a.period, rev, books, cogs, waste, actualCost: a.actual_food_cost, theo, theoW, actual, gap, gapW: actual != null && theoW != null ? actual - theoW : null, coverage, salesGap, verdict, note });
    }
    rows.sort((a, b) => (a.store + a.month) < (b.store + b.month) ? -1 : 1);
    const judged = rows.filter(r => r.gap != null);
    return { rows, judged: judged.length, pass: rows.filter(r => r.verdict === "Pass").length, overall: !judged.length ? "Not assessable" : rows.every(r => r.verdict === "Pass" || r.verdict === "No sales") ? "Pass" : rows.some(r => r.verdict === "Fail") ? "Fail" : "Review" };
  }
  function history(M, scn) {
    const dates = M.costDates; if (dates.length < 1) return { snapshots: [], note: "All costs share one effective date, so there is no history yet. Add rows with a later effective_date to track changes." };
    const curated = [...M.items.values()].filter(i => i.active && !i.byo && i.recipe.length);
    const all = ["0000-00-00"].concat(dates); const snaps = [];
    for (let k = 1; k < all.length; k++) {
      const prev = all[k - 1] === "0000-00-00" ? dates[0] < all[k] ? "0000-00-01" : all[k - 1] : all[k - 1]; const d = all[k];
      const comps = [...M.comps.values()].map(c => ({ cid: c.id, name: c.name, before: compCostRaw(M, c.id, "", prev), after: compCostRaw(M, c.id, "", d) })).filter(x => Math.abs(x.after - x.before) > 1e-9);
      if (!comps.length) continue;
      const items = curated.map(it => { const b = costOf(M, it.recipe, "", prev, scn).food, a = costOf(M, it.recipe, "", d, scn).food; const parts = it.recipe.map(p => ({ name: M.comps.get(p.cid).name, d: (compCostRaw(M, p.cid, "", d) - compCostRaw(M, p.cid, "", prev)) * p.portions })).filter(p => Math.abs(p.d) > 1e-9).sort((x, y) => Math.abs(y.d) - Math.abs(x.d)); const price = it.price || 0; return { id: it.id, name: it.name, line: it.line, before: b, after: a, delta: a - b, fcBefore: price ? b / price * 100 : null, fcAfter: price ? a / price * 100 : null, driver: parts[0] ? parts[0].name : null, drivers: parts }; }).filter(x => Math.abs(x.delta) > 1e-9).sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));
      snaps.push({ date: d, components: comps.map(c => Object.assign(c, { pct: c.before ? (c.after - c.before) / c.before * 100 : null })).sort((a, b) => Math.abs(b.after - b.before) - Math.abs(a.after - a.before)), items });
    }
    return { snapshots: snaps, dates };
  }
  function ladder(M, R, scn) {
    const rows = [];
    for (const it of M.items.values()) {
      if (!it.active || it.byo || it.addon || !it.recipe.length) continue;
      const byoId = M.byoByLine.get(it.line); if (!byoId) continue;
      const base = scn && scn.prices[byoId] != null ? scn.prices[byoId] : M.itemPrice(byoId, R.refStore); if (base == null) continue;
      const ups = it.recipe.map(p => ({ name: M.comps.get(p.cid).name, up: upchargeOf(M, p.cid, scn) })).filter(u => u.up > 0);
      const formula = base + sum(ups, u => u.up); const price = scn && scn.prices[it.id] != null ? scn.prices[it.id] : M.itemPrice(it.id, R.refStore);
      const gap = price - formula;
      rows.push({ id: it.id, name: it.name, line: it.line, price, base, ups, formula, gap, flag: Math.abs(gap) < 0.05 ? "On the ladder" : gap < 0 ? "Below build-your-own" : "Premium over build-your-own" });
    }
    // overlaps: same formula, different price
    const byF = by(rows, r => r.line + "|" + r.formula.toFixed(2));
    for (const [, g] of byF) if (g.length > 1 && new Set(g.map(r => r.price)).size > 1) g.forEach(r => { r.overlap = g.filter(x => x !== r).map(x => x.name); });
    return rows.sort((a, b) => a.line.localeCompare(b.line) || b.gap - a.gap);
  }

  /* ---------- 11. Self-test cases (hand-calculated; also run by tests/costmodel.test.js) ---------- */
  const SELFTEST = [
    { name: "Case to portion with yield", run: () => portionCost({ case_cost: 110, case_size: 40, case_unit: "lb", portion_size: 4, portion_unit: "oz", yield_pct: 80 }).cost, expect: 110 / (40 * 16 * 0.8) * 4, note: "40 lb case at $110, 4 oz portion, 80% yield → $110 / 512 usable oz × 4 = $0.8594" },
    { name: "Volume units", run: () => portionCost({ case_cost: 24, case_size: 1, case_unit: "gal", portion_size: 2, portion_unit: "fl oz" }).cost, expect: 24 / 128 * 2, note: "1 gal at $24, 2 fl oz portion → $0.375" },
    { name: "Count units", run: () => portionCost({ case_cost: 36, case_size: 120, case_unit: "each", portion_size: 1, portion_unit: "each", yield_pct: 100 }).cost, expect: 0.3, note: "120 pitas at $36 → $0.30 each" },
    { name: "Portion cost override wins", run: () => portionCost({ portion_cost: 1.25, case_cost: 100, case_size: 1, case_unit: "lb", portion_size: 1, portion_unit: "oz" }).cost, expect: 1.25 },
    { name: "Unit mismatch is an error", run: () => portionCost({ case_cost: 10, case_size: 1, case_unit: "lb", portion_size: 1, portion_unit: "fl oz" }).cost, expect: null },
    { name: "Item cost sums portions", run: () => { const M = build(tiny()); return costOf(M, M.items.get("bowl").recipe, "", "2026-07-15").food; }, expect: 0.85 * 1 + 0.30 * 0.5 + 0.20 * 2, note: "1 chicken ($0.85) + half hummus ($0.15) + double feta ($0.40) = $1.40" },
    { name: "Later cost version applies after its date", run: () => { const M = build(tiny()); return M.compCost("chicken", "", "2026-09-10"); }, expect: 1.02 },
    { name: "Earlier date keeps the old cost", run: () => { const M = build(tiny()); return M.compCost("chicken", "", "2026-08-31"); }, expect: 0.85 },
    { name: "Store-specific cost overrides", run: () => { const M = build(tiny()); return M.compCost("hummus", "S2", "2026-07-15"); }, expect: 0.36 },
    { name: "Mix-weighted food cost", run: () => { const M = build(tiny()); const R = analyze(M, {}); return r2(R.totals.fc); }, expect: r2((2 * 1.40 + 1 * (0.85 + 0.20 + 2.10)) / (2 * 10 + 1 * (10 + 4)) * 100), note: "two bowls at $10 costing $1.40, one BYO at $10 + $4 salmon up-charge costing $0.85 + $0.20 + $2.10 → 5.95 / 34 = 17.5%" },
    { name: "Up-charge margin vs the included main", run: () => { const M = build(tiny()); const R = analyze(M, {}); const s = R.upcharges.find(u => u.cid === "salmon"); return r2(s.margin); }, expect: r2(4 - (2.10 - 0.85)), note: "salmon $2.10 replaces an included $0.85 main: incremental $1.25 against a $4.00 up-charge → $2.75" },
    { name: "Commodity scenario: chicken +20%", run: () => { const M = build(tiny()); const R = analyze(M, {}, { costPct: { chicken: 20 } }); return r2(R.items.get("bowl").food); }, expect: r2(0.85 * 1.2 + 0.15 + 0.40) },
    { name: "Repricing with elasticity", run: () => { const M = build(tiny()); const R = analyze(M, {}, { prices: { bowl: 11 }, elasticity: -1 }); return r2(R.items.get("bowl").units); }, expect: r2(2 * (1 - 0.1)), note: "+10% price at elasticity −1 → units × 0.9" },
    { name: "Remove an item: 80% of its units move to the line", run: () => { const M = build(tiny()); const R = analyze(M, {}, { remove: ["bowl"], retention: 0.8 }); return r2(R.items.get("byo-bowl").units); }, expect: r2(1 + 0.8 * 2) },
    { name: "Packaging by channel", run: () => { const M = build(tiny()); return [M.pkg("Bowls", "in_store"), M.pkg("Bowls", "delivery")]; }, expect: [0.3, 0.55] },
    { name: "Reconciliation verdict bands", run: () => { const M = build(tiny()); const R = analyze(M, {}); return R.reconcile.rows.map(r => r.verdict); }, expect: ["Pass"], note: "theoretical 17.5% vs books 19.0% → gap 1.5 pts" },
    { name: "Price ladder gap", run: () => { const M = build(tiny()); const R = analyze(M, {}); return r2(R.ladder[0].gap); }, expect: 0, note: "bowl at $10 with no up-charged components sits on the $10 base" },
  ];
  function tiny() {
    const mk = (type, rows) => applyMap(type, rows.map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v)]))), Object.fromEntries(TEMPLATES[type].cols.map(c => [c.k, c.k]))).rows;
    return {
      stores: mk("stores", [{ store_id: "S1", store_name: "One" }, { store_id: "S2", store_name: "Two" }]),
      components: mk("components", [
        { component_id: "chicken", component_name: "Grilled chicken", station: "Mains", portion_cost: 0.85 },
        { component_id: "chicken", component_name: "Grilled chicken", station: "Mains", portion_cost: 1.02, effective_date: "2026-09-01" },
        { component_id: "salmon", component_name: "Salmon", station: "Mains", portion_cost: 2.10, upcharge: 4 },
        { component_id: "hummus", component_name: "Hummus", station: "Dips + Spreads", portion_cost: 0.30 },
        { component_id: "hummus", component_name: "Hummus", station: "Dips + Spreads", portion_cost: 0.36, store_id: "S2" },
        { component_id: "feta", component_name: "Feta", station: "Toppings", portion_cost: 0.20 },
      ]),
      items: mk("items", [{ item_id: "bowl", item_name: "Chicken bowl", line: "Bowls", price: 10 }, { item_id: "byo-bowl", item_name: "Build-your-own bowl", line: "Bowls", price: 10, byo: 1 }]),
      recipes: mk("recipes", [{ item_id: "bowl", component_id: "chicken", portions: 1 }, { item_id: "bowl", component_id: "hummus", portions: 0.5 }, { item_id: "bowl", component_id: "feta", portions: 2 }]),
      sales: mk("sales", [{ order_id: "o1", store_id: "S1", date: "2026-07-01", item_id: "bowl", qty: 2, channel: "in_store" }, { order_id: "o2", store_id: "S1", date: "2026-07-02", item_id: "byo-bowl", qty: 1, channel: "app" }]),
      modifiers: mk("modifiers", [{ order_id: "o2", item_id: "byo-bowl", component_id: "chicken", qty: 1 }, { order_id: "o2", item_id: "byo-bowl", component_id: "feta", qty: 1 }, { order_id: "o2", item_id: "byo-bowl", component_id: "salmon", qty: 1 }]),
      packaging: mk("packaging", [{ line: "Bowls", channel: "dine_in", cost: 0.30 }, { line: "Bowls", channel: "digital", cost: 0.55 }]),
      actuals: mk("actuals", [{ store_id: "S1", period: "2026-07", actual_food_cost: 6.46, net_sales: 34 }]),
    };
  }
  function selfTest() { return SELFTEST.map(t => { let got, ok = false, err = null; try { got = t.run(); const close = (a, b) => a == null || b == null ? a === b : Math.abs(a - b) < 1e-6; ok = Array.isArray(t.expect) ? Array.isArray(got) && t.expect.length === got.length && t.expect.every((e, i) => typeof e === "number" ? close(got[i], e) : got[i] === e) : close(got, t.expect); } catch (e) { err = e; } return { name: t.name, ok, got, expect: t.expect, note: t.note, err }; }); }

  return { __tiny: tiny, TEMPLATES, TYPES, CORE, CHANNELS, RECON, SELFTEST, parseCSV, toCSV, templateCSV, detectType, autoMap, applyMap, validate, portionCost, build, costOf, analyze, normScenario, selfTest, priceFor, slug, norm, toISODate, toMonth, toTime, unitOf, STATION_FAM, ADDON_LINE, sum, by };
});
