/* Synthetic demo dataset for the Cost & sales tool. Everything here is made up.
   Costs sit inside published fast-casual ranges, prices are CAVA's Dupont Circle menu (Oct 16, 2026), the menu
   structure is CAVA's real curated items and build-your-own line, and sales are drawn from a seeded random
   generator, so the same seed always gives the same files. The parameters are documented in docs/sample-data.md.
   Runs in the browser (window.SampleData) and under Node (module.exports). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.SampleData = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const slug = s => String(s).toLowerCase().replace(/®|™/g, "").replace(/\+/g, " ").replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  function rng(seed) { let t = seed >>> 0; return () => { t += 0x6D2B79F5; let r = Math.imul(t ^ t >>> 15, 1 | t); r ^= r + Math.imul(r ^ r >>> 7, 61 | r); return ((r ^ r >>> 14) >>> 0) / 4294967296; }; }
  const pad2 = n => (n < 10 ? "0" : "") + n;
  const iso = d => d.getUTCFullYear() + "-" + pad2(d.getUTCMonth() + 1) + "-" + pad2(d.getUTCDate());
  const pick = (r, weights) => { const tot = weights.reduce((a, w) => a + w[1], 0); let x = r() * tot; for (const w of weights) { x -= w[1]; if (x <= 0) return w[0]; } return weights[weights.length - 1][0]; };
  const poisson = (r, mean) => { if (mean > 30) { let s = 0; for (let i = 0; i < 12; i++) s += r(); return Math.max(0, Math.round(mean + Math.sqrt(mean) * (s - 6))); } const L = Math.exp(-mean); let k = 0, p = 1; do { k++; p *= r(); } while (p > L); return k - 1; };
  const round2 = v => Math.round(v * 100) / 100;

  // --- parameters (see docs/sample-data.md)
  const STORES = [
    { store_id: "DC-001", store_name: "Dupont Circle", region: "Mid-Atlantic", city: "Washington", state: "DC", orders: 140, dow: [0.65, 0.95, 1.0, 1.02, 1.05, 1.1, 0.8], channel: [["in_store", 52], ["app", 22], ["web", 9], ["delivery", 17]], priceAdj: 0 },
    { store_id: "MD-014", store_name: "Bethesda", region: "Mid-Atlantic", city: "Bethesda", state: "MD", orders: 110, dow: [0.85, 0.95, 1.0, 1.0, 1.02, 1.08, 1.0], channel: [["in_store", 58], ["app", 18], ["web", 8], ["delivery", 16]], priceAdj: -0.3 },
    { store_id: "VA-022", store_name: "Clarendon", region: "Mid-Atlantic", city: "Arlington", state: "VA", orders: 120, dow: [0.8, 0.95, 1.0, 1.02, 1.04, 1.1, 0.95], channel: [["in_store", 55], ["app", 20], ["web", 9], ["delivery", 16]], priceAdj: 0 },
  ];
  // component costs: [case_cost, case_size, case_unit, portion_size, portion_unit, yield_pct, perishable, shelf_life_days, prep_steps]
  const COST = {
    "power-greens": [13, 4, "lb", 2.5, "oz", 95, 1, 3, 1], "arugula": [16, 4, "lb", 2, "oz", 95, 1, 3, 1], "super-greens": [14, 4, "lb", 2.5, "oz", 95, 1, 3, 1], "baby-spinach": [12, 4, "lb", 2, "oz", 95, 1, 3, 1], "romaine": [19, 10, "lb", 3, "oz", 75, 1, 3, 2],
    "saffron-basmati-rice": [38, 25, "lb", 1.8, "oz", 98, 0, 2, 2], "brown-rice": [27, 25, "lb", 1.8, "oz", 98, 0, 2, 2], "black-lentils": [45, 25, "lb", 1.5, "oz", 98, 0, 2, 2],
    "tzatziki": [38, 2, "gal", 2, "fl oz", 100, 1, 4, 3], "hummus": [26, 2, "gal", 2, "fl oz", 100, 1, 5, 3], "crazy-feta": [58, 2, "gal", 2, "fl oz", 100, 1, 5, 3], "harissa": [44, 2, "gal", 2, "fl oz", 100, 1, 7, 3], "red-pepper-hummus": [30, 2, "gal", 2, "fl oz", 100, 1, 5, 3], "roasted-eggplant-dip": [40, 2, "gal", 2, "fl oz", 100, 1, 4, 4],
    "glazed-salmon": [139, 10, "lb", 4, "oz", 90, 1, 2, 4], "grilled-steak": [168, 20, "lb", 4, "oz", 82, 1, 3, 3], "harissa-honey-chicken": [118, 40, "lb", 4, "oz", 78, 1, 3, 4], "grilled-chicken": [112, 40, "lb", 4, "oz", 78, 1, 3, 3], "falafel": [34, 100, "each", 3, "each", 100, 0, 2, 2], "spicy-lamb-meatballs": [62, 10, "lb", 3.5, "oz", 92, 1, 3, 3], "braised-lamb": [176, 20, "lb", 4, "oz", 72, 1, 3, 5], "roasted-vegetables": [46, 20, "lb", 4, "oz", 85, 1, 3, 3],
    "fiery-broccoli": [34, 20, "lb", 2.5, "oz", 80, 1, 2, 2], "fire-roasted-corn": [22, 12, "lb", 2, "oz", 95, 1, 3, 2], "avocado": [62, 48, "each", 0.5, "each", 100, 1, 1, 2], "pickled-onions": [19, 2, "gal", 1, "fl oz", 100, 0, 14, 1], "pickles": [31, 5, "gal", 1.5, "fl oz", 100, 0, 30, 1], "tomato-onion": [29, 20, "lb", 2, "oz", 90, 1, 2, 2], "tomato-cucumber": [31, 20, "lb", 2, "oz", 90, 1, 2, 2], "sumac-cabbage-slaw": [18, 10, "lb", 2, "oz", 95, 1, 3, 2], "kalamata-olives": [52, 2, "gal", 1, "fl oz", 100, 0, 30, 1], "cucumber": [24, 20, "lb", 2, "oz", 85, 1, 3, 2], "crumbled-feta": [46, 10, "lb", 1, "oz", 100, 1, 10, 1], "pita-crisps": [17, 5, "lb", 0.75, "oz", 100, 0, 14, 1],
    "greek-goddess-dressing": [28, 1, "gal", 1.5, "fl oz", 100, 1, 7, 2], "balsamic-date-vinaigrette": [26, 1, "gal", 1.5, "fl oz", 100, 0, 14, 2], "yogurt-dill-dressing": [22, 1, "gal", 1.5, "fl oz", 100, 1, 5, 2], "lemon-herb-tahini": [30, 1, "gal", 1.5, "fl oz", 100, 0, 10, 2], "greek-vinaigrette": [19, 1, "gal", 1.5, "fl oz", 100, 0, 14, 2], "garlic-dressing": [21, 1, "gal", 1.5, "fl oz", 100, 1, 7, 2], "skhug": [34, 1, "gal", 1.5, "fl oz", 100, 1, 5, 3], "hot-harissa-vinaigrette": [27, 1, "gal", 1.5, "fl oz", 100, 0, 14, 2],
    "pita": [36, 120, "each", 1, "each", 100, 0, 5, 1], "pita-chips": [31, 10, "lb", 3, "oz", 100, 0, 30, 1], "harissa-bbq-seasoning": [38, 5, "lb", 0.1, "oz", 100, 0, 180, 1],
    "pomegranate-apple": [29, 2.5, "gal", 16, "fl oz", 100, 1, 5, 1], "blueberry-lavender": [31, 2.5, "gal", 16, "fl oz", 100, 1, 5, 1], "cucumber-mint-lime": [26, 2.5, "gal", 16, "fl oz", 100, 1, 5, 1], "classic-lemonade": [17, 2.5, "gal", 16, "fl oz", 100, 1, 5, 1], "jasmine-green-tea": [22, 1, "lb", 0.2, "oz", 100, 0, 180, 1], "unsweet-tea": [14, 1, "lb", 0.2, "oz", 100, 0, 180, 1], "fountain-soda": [82, 5, "gal", 3.5, "fl oz", 100, 0, 90, 1],
    "spindrift-lemon": [31, 24, "each", 1, "each", 100, 0, 180, 0], "spindrift-half-tea-and-half-lemon": [31, 24, "each", 1, "each", 100, 0, 180, 0], "open-water-still": [18, 12, "each", 1, "each", 100, 0, 365, 0], "open-water-sparkling": [18, 12, "each", 1, "each", 100, 0, 365, 0], "kids-apple-juice": [23, 40, "each", 1, "each", 100, 0, 180, 0], "kids-milk": [34, 50, "each", 1, "each", 100, 1, 10, 0], "kids-chocolate-milk": [38, 50, "each", 1, "each", 100, 1, 10, 0],
    "salted-chocolate-oat-cookie": [52, 48, "each", 1, "each", 100, 0, 7, 0], "greyston-blondie": [40, 36, "each", 1, "each", 100, 0, 7, 0], "greyston-brownie": [40, 36, "each", 1, "each", 100, 0, 7, 0], "apricot-honey-cookie": [54, 48, "each", 1, "each", 100, 0, 7, 0],
  };
  const COST_V2 = { "glazed-salmon": 156, "avocado": 57, "grilled-chicken": 116.5, "harissa-honey-chicken": 122.5 }; // case costs from 2026-09-01
  const BYO_BASE = 11.75;
  const CURATED_POP = { "chicken-rice": 20, "greek-chicken": 14, "harissa-avocado": 12, "greek-goddess-salmon": 10, "spicy-lamb-avocado": 7, "salmon-yogurt-dill": 7, "steak-harissa": 6, "falafel-crunch": 6, "greek-salad": 5, "spicy-chicken-avocado": 5, "steak-feta": 4, "greek-goddess-steak-salad": 3, "pomegranate-glazed-salmon": 2, "harissa-lamb-pita": 4 };
  const W = {
    greens: [["super-greens", 30], ["power-greens", 25], ["arugula", 20], ["romaine", 15], ["baby-spinach", 4]],
    grains: [["saffron-basmati-rice", 50], ["brown-rice", 30], ["black-lentils", 20]],
    dips: [["hummus", 32], ["crazy-feta", 25], ["tzatziki", 22], ["harissa", 9], ["red-pepper-hummus", 8], ["roasted-eggplant-dip", 4]],
    mains: [["grilled-chicken", 36], ["harissa-honey-chicken", 18], ["grilled-steak", 13], ["falafel", 10], ["glazed-salmon", 9], ["roasted-vegetables", 5], ["spicy-lamb-meatballs", 5], ["braised-lamb", 3]],
    toppings: [["pickled-onions", 60], ["crumbled-feta", 50], ["tomato-onion", 45], ["cucumber", 45], ["pita-crisps", 40], ["fire-roasted-corn", 35], ["tomato-cucumber", 30], ["fiery-broccoli", 28], ["sumac-cabbage-slaw", 25], ["avocado", 22], ["kalamata-olives", 20], ["pickles", 18], ["romaine", 8]],
    dressings: [["greek-vinaigrette", 30], ["lemon-herb-tahini", 18], ["yogurt-dill-dressing", 14], ["skhug", 12], ["hot-harissa-vinaigrette", 10], ["greek-goddess-dressing", 8], ["garlic-dressing", 6], ["balsamic-date-vinaigrette", 2]],
  };
  // archetype builds: the builds guests come back to. Some mirror curated items (cannibalization), some exist only on the line (off-menu candidates).
  const ARCH = [
    { w: 16, line: "Bowls", c: ["super-greens", "saffron-basmati-rice", "hummus", "tzatziki", "grilled-chicken", "pickled-onions", "tomato-onion", "cucumber", "crumbled-feta", "greek-vinaigrette", "pita:0.25"] },
    { w: 12, line: "Bowls", c: ["saffron-basmati-rice", "crazy-feta", "hummus", "harissa-honey-chicken", "avocado", "fire-roasted-corn", "cucumber", "pickled-onions", "hot-harissa-vinaigrette"] },
    { w: 10, line: "Bowls", c: ["arugula", "saffron-basmati-rice", "hummus", "red-pepper-hummus", "glazed-salmon", "pickled-onions", "fiery-broccoli", "sumac-cabbage-slaw", "greek-goddess-dressing"] },
    { w: 9, line: "Bowls", c: ["power-greens", "brown-rice", "crazy-feta", "grilled-steak", "avocado", "fire-roasted-corn", "pickled-onions", "crumbled-feta", "skhug"] },
    { w: 8, line: "Bowls", c: ["super-greens", "black-lentils", "hummus", "falafel", "roasted-vegetables", "tomato-onion", "cucumber", "pita-crisps", "lemon-herb-tahini", "pita:0.25"] },
    { w: 7, line: "Bowls", c: ["romaine", "tzatziki", "grilled-chicken", "tomato-cucumber", "kalamata-olives", "crumbled-feta", "greek-vinaigrette"] },
    { w: 6, line: "Bowls", c: ["saffron-basmati-rice", "harissa", "crazy-feta", "grilled-chicken:2", "pickled-onions", "fire-roasted-corn", "pita-crisps", "hot-harissa-vinaigrette"] },
    { w: 6, line: "Bowls", c: ["super-greens", "saffron-basmati-rice", "hummus", "glazed-salmon", "avocado", "cucumber", "fire-roasted-corn", "crumbled-feta", "yogurt-dill-dressing"] },
    { w: 5, line: "Bowls", c: ["power-greens", "saffron-basmati-rice", "tzatziki", "grilled-steak", "pickled-onions", "tomato-onion", "pickles", "crumbled-feta", "garlic-dressing", "pita:0.25"] },
    { w: 4, line: "Bowls", c: ["arugula", "brown-rice", "roasted-eggplant-dip", "spicy-lamb-meatballs", "pickled-onions", "cucumber", "sumac-cabbage-slaw", "lemon-herb-tahini"] },
    { w: 7, line: "Pitas", c: ["pita", "tzatziki", "grilled-chicken", "tomato-onion", "kalamata-olives", "crumbled-feta", "romaine", "yogurt-dill-dressing"] },
    { w: 5, line: "Pitas", c: ["pita", "crazy-feta", "harissa-honey-chicken", "avocado", "pickles", "fire-roasted-corn", "pickled-onions", "hot-harissa-vinaigrette"] },
    { w: 4, line: "Pitas", c: ["pita", "hummus", "grilled-steak", "pickled-onions", "crumbled-feta", "sumac-cabbage-slaw", "garlic-dressing"] },
  ];
  const PACKAGING = [["Bowls", "dine_in", 0.32], ["Bowls", "digital", 0.61], ["Pitas", "dine_in", 0.18], ["Pitas", "digital", 0.47], ["Sides", "dine_in", 0.12], ["Sides", "digital", 0.22], ["Drinks", "dine_in", 0.14], ["Drinks", "digital", 0.18], ["Desserts", "dine_in", 0.06], ["Desserts", "digital", 0.10], ["all", "all", 0.10]];
  const WASTE_RATE = { green: 0.04, dip: 0.02, main: 0.025, topping: 0.03, grain: 0.01, dressing: 0.015, bread: 0.01 };
  const LOW_MOVER_FLOOR = { "baby-spinach": 9, "braised-lamb": 4, "balsamic-date-vinaigrette": 3, "roasted-eggplant-dip": 2 }; // portions a day thrown out regardless of sales (par-driven)
  const ACTUAL_GAP = { "DC-001": 0.06, "MD-014": 0.075, "VA-022": 0.07 }; // books above theoretical (waste, over-portioning, shrink)
  const ACTUAL_GAP_OVERRIDE = { "VA-022|2026-09": 0.21 }; // one store-month that fails on purpose
  const INV_VARIANCE = { "glazed-salmon": 0.08, "crumbled-feta": 0.14, "grilled-chicken": 0.03, "avocado": 0.09, "hummus": 0.02, "saffron-basmati-rice": -0.03, "grilled-steak": 0.06, "tzatziki": 0.04, "crazy-feta": 0.05, "pickled-onions": 0.12, "harissa-honey-chicken": 0.02, "pita": 0.01 };

  function makeSample(opts) {
    opts = opts || {};
    const items = (opts.items || []).filter(d => d.group === "CAVA"), station = opts.station || [];
    const seed = opts.seed || 20261016, days = opts.days || 92, start = opts.start || "2026-07-01", scale = opts.scale || 1;
    const r = rng(seed);
    const F = { stores: [], components: [], items: [], recipes: [], sales: [], modifiers: [], packaging: [], waste: [], actuals: [], inventory: [] };
    STORES.forEach(s => F.stores.push({ store_id: s.store_id, store_name: s.store_name, region: s.region, city: s.city, state: s.state }));
    // components: station catalog + add-on SKUs
    const comp = new Map(); const addComp = (id, name, stationName, upcharge, cal, sodium) => { if (comp.has(id)) return comp.get(id); const c = COST[id]; if (!c) throw new Error("sample: no cost for " + id); const row = { component_id: id, component_name: name, station: stationName, case_cost: c[0], case_size: c[1], case_unit: c[2], portion_size: c[3], portion_unit: c[4], yield_pct: c[5], portion_cost: null, upcharge: upcharge || 0, effective_date: null, store_id: null, perishable: c[6], shelf_life_days: c[7], prep_steps: c[8], par_portions: null, calories: cal == null ? null : cal, sodium_mg: sodium == null ? null : sodium }; comp.set(id, row); F.components.push(row); return row; };
    const canonId = new Map();
    station.forEach(s => { const id = slug(s.canon); canonId.set(s.canon, id); const st = s.station === "Sides" ? "Sides" : s.station; addComp(id, s.canon === "Pita" ? "Pita" : s.component.replace(/®/g, ""), st, s.upcharge, s.canon === "Pita" ? 320 : s.cal, s.canon === "Pita" ? 720 : s.sodium); });
    addComp("pita-chips", "Pita Chips", "Sides", 0, 280, 420); addComp("harissa-bbq-seasoning", "Harissa BBQ Seasoning", "Pantry", 0, 0, 90);
    // items and recipes from the menu
    const itemRows = []; const addItem = (id, name, line, price, byo, cal) => { const row = { item_id: id, item_name: name, line, price, byo: byo ? 1 : 0, active: 1, store_id: null, menu_calories: cal == null ? null : cal }; F.items.push(row); itemRows.push(row); return row; };
    const rec = (iid, cid, portions) => F.recipes.push({ item_id: iid, component_id: cid, portions });
    addItem("BYO-BOWL", "Build-your-own bowl", "Bowls", BYO_BASE, true, null); addItem("BYO-PITA", "Build-your-own pita", "Pitas", BYO_BASE, true, null);
    const DRINK_NAMES = {}; // drink/dessert components take the item's name
    for (const d of items) {
      const id = slug(d.item); if (d.small) {
        if (d.line === "Sides") { addItem(id, d.item, d.line, d.price, false, d.cal); const dip = d.ings.map(i => canonId.get(i.name)).find(c => c && comp.get(c).station === "Dips + Spreads"); if (dip) rec(id, dip, 2); else if (/chips/i.test(d.item)) { rec(id, "pita-chips", 1); if (/harissa/i.test(d.item)) rec(id, "harissa-bbq-seasoning", 1); } else rec(id, "pita", 1); }
        else { const cid = slug(d.item); addComp(cid, d.item, d.line === "Drinks" ? "Drinks" : "Sweets", 0, d.cal, null); addItem(id, d.item, d.line, d.price, false, d.cal); rec(id, cid, 1); }
        continue;
      }
      addItem(id, d.item, d.line, d.price, false, d.cal);
      const ids = d.ings.map(i => canonId.get(i.name)).filter(Boolean);
      const fam = cid => { const st = comp.get(cid).station; return st === "Dips + Spreads" ? "dip" : st === "Mains" ? "main" : st === "Greens" ? "green" : st === "Dressings" ? "dressing" : st === "Grains" ? "grain" : st === "Toppings" ? "topping" : "other"; };
      const n = {}; ids.forEach(c => { const f = fam(c); n[f] = (n[f] || 0) + 1; });
      ids.forEach(c => { const f = fam(c); const p = (f === "dip" || f === "main" || f === "dressing" || f === "green") && n[f] > 1 ? 0.5 : 1; rec(id, c, p); });
      if (d.line === "Pitas" && !ids.includes("pita")) rec(id, "pita", 1);
    }
    // a regional item sold at one store only
    addItem("harissa-lamb-pita", "Harissa Lamb Pita (regional)", "Pitas", 16.45, false, 890); ["pita", "harissa", "braised-lamb", "pickled-onions", "cucumber", "sumac-cabbage-slaw", "crumbled-feta", "hot-harissa-vinaigrette"].forEach(c => rec("harissa-lamb-pita", c, 1));
    // store price overrides (regional pricing) and a second cost version
    for (const row of itemRows) if ((row.line === "Bowls" || row.line === "Pitas") && !row.byo) F.items.push({ item_id: row.item_id, item_name: null, line: null, price: round2(row.price - 0.3), byo: null, active: null, store_id: "MD-014", menu_calories: null });
    F.items.push({ item_id: "BYO-BOWL", item_name: null, line: null, price: BYO_BASE - 0.3, byo: null, active: null, store_id: "MD-014", menu_calories: null });
    F.items.push({ item_id: "BYO-PITA", item_name: null, line: null, price: BYO_BASE - 0.3, byo: null, active: null, store_id: "MD-014", menu_calories: null });
    for (const [cid, cost] of Object.entries(COST_V2)) { const c = comp.get(cid); F.components.push(Object.assign({}, c, { case_cost: cost, effective_date: "2026-09-01" })); }
    PACKAGING.forEach(([line, channel, cost]) => F.packaging.push({ line, channel, cost }));
    const price = (iid, store) => { const base = itemRows.find(x => x.item_id === iid).price; return (itemRows.find(x => x.item_id === iid).line === "Bowls" || itemRows.find(x => x.item_id === iid).line === "Pitas") ? round2(base + store.priceAdj) : base; };
    const upch = cid => comp.get(cid).upcharge || 0;
    const curated = itemRows.filter(x => !x.byo && (x.line === "Bowls" || x.line === "Pitas"));
    const sides = itemRows.filter(x => x.line === "Sides"), drinks = itemRows.filter(x => x.line === "Drinks" && !/kids/i.test(x.item_name)), kidsDrinks = itemRows.filter(x => /kids/i.test(x.item_name)), desserts = itemRows.filter(x => x.line === "Desserts");
    const chips = sides.filter(s => /chips/i.test(s.item_name)), sideDips = sides.filter(s => !/chips|pita$/i.test(s.item_name)), sidePita = sides.find(s => /side pita/i.test(s.item_name));
    // build-your-own generators
    const chooseN = (list, n, excl) => { const out = []; const pool = list.filter(x => !excl || !excl.has(x[0])); for (let i = 0; i < n && pool.length; i++) { const c = pick(r, pool); out.push(c); const k = pool.findIndex(p => p[0] === c); pool.splice(k, 1); } return out; };
    const buildBowl = () => {
      const b = []; const base = pick(r, [["greens", 25], ["grains", 30], ["both", 45]]);
      if (base !== "grains") b.push([pick(r, W.greens), 1]); if (base !== "greens") b.push([pick(r, W.grains), 1]);
      chooseN(W.dips, pick(r, [[1, 35], [2, 55], [3, 10]])).forEach(d => b.push([d, 1]));
      const mm = pick(r, [["one", 93], ["half", 5], ["double", 2]]); if (mm === "one") b.push([pick(r, W.mains), 1]); else if (mm === "double") b.push([pick(r, W.mains), 2]); else chooseN(W.mains, 2).forEach(m => b.push([m, 0.5]));
      chooseN(W.toppings, 2 + Math.floor(r() * 5)).forEach(t => b.push([t, 1]));
      chooseN(W.dressings, pick(r, [[0, 5], [1, 70], [2, 25]])).forEach(d => b.push([d, 1]));
      if (r() < 0.55) b.push(["pita", 0.25]);
      return b;
    };
    const buildPita = () => { const b = [["pita", 1]]; chooseN(W.dips, pick(r, [[1, 55], [2, 45]])).forEach(d => b.push([d, 1])); b.push([pick(r, W.mains), 1]); chooseN(W.toppings, 2 + Math.floor(r() * 3)).forEach(t => b.push([t, 1])); if (r() < 0.9) b.push([pick(r, W.dressings), 1]); return b; };
    const fromArch = line => { const a = pick(r, ARCH.filter(x => x.line === line).map(x => [x, x.w])); const b = a.c.map(s => { const [id, q] = s.split(":"); return [id, q ? +q : 1]; }); if (r() < 0.25) { const t = pick(r, W.toppings); if (!b.some(x => x[0] === t)) b.push([t, 1]); else b.splice(b.findIndex(x => x[0] === t), 1); } return b; };
    const build = line => (r() < 0.7 ? fromArch(line) : line === "Bowls" ? buildBowl() : buildPita());
    // sales
    const usageSW = new Map(); // store|week|cid -> portions (for waste and inventory)
    const usageSM = new Map();
    const cogsSM = new Map(), revSM = new Map();
    const addUse = (store, date, cid, q) => { const wk = weekOf(date); const k = store + "|" + wk + "|" + cid; usageSW.set(k, (usageSW.get(k) || 0) + q); const m = store + "|" + date.slice(0, 7) + "|" + cid; usageSM.set(m, (usageSM.get(m) || 0) + q); };
    const startD = new Date(start + "T00:00:00Z"); const weekOf = d => { const dt = new Date(d + "T00:00:00Z"); const dow = dt.getUTCDay(); dt.setUTCDate(dt.getUTCDate() - dow); return iso(dt); };
    const compCostAt = (cid, date) => { const c = comp.get(cid); const cc = date >= "2026-09-01" && COST_V2[cid] != null ? COST_V2[cid] : c.case_cost; const conv = { lb: 453.59237, oz: 28.349523125, gal: 3785.411784, "fl oz": 29.5735295625, each: 1 }; const usable = c.case_size * conv[c.case_unit] / conv[c.portion_unit] * c.yield_pct / 100; return cc / usable * c.portion_size; };
    const recipeOf = new Map(); F.recipes.forEach(x => { let a = recipeOf.get(x.item_id); if (!a) { a = []; recipeOf.set(x.item_id, a); } a.push([x.component_id, x.portions]); });
    const monthFactor = m => ({ "2026-07": 1.0, "2026-08": 0.96, "2026-09": 1.04 })[m] || 1;
    for (let di = 0; di < days; di++) {
      const dt = new Date(startD.getTime() + di * 86400000); const date = iso(dt); const dow = dt.getUTCDay(); const month = date.slice(0, 7);
      for (const S of STORES) {
        const nOrders = poisson(r, S.orders * scale * S.dow[dow] * monthFactor(month) * (0.9 + 0.2 * r()));
        for (let k = 1; k <= nOrders; k++) {
          const oid = `${S.store_id}-${date.replace(/-/g, "")}-${pad2(k) .padStart(4, "0")}`;
          const ch = pick(r, S.channel);
          const slot = pick(r, [["lunch", 55], ["dinner", 30], ["afternoon", 10], ["early", 5]]);
          const hh = slot === "lunch" ? 11 + Math.floor(r() * 3) : slot === "dinner" ? 17 + Math.floor(r() * 3) : slot === "afternoon" ? 15 + Math.floor(r() * 2) : 10; const time = pad2(hh) + ":" + pad2(Math.floor(r() * 60));
          const nMeals = pick(r, ch === "delivery" ? [[1, 55], [2, 30], [3, 10], [4, 5]] : [[1, 72], [2, 20], [3, 6], [4, 2]]);
          let lineNo = 0; const disc = ch === "app" && r() < 0.06 ? 0.9 : 1; const markup = ch === "delivery" ? 1.12 : 1;
          const lines = [];
          let mainStyle = null;
          for (let m = 0; m < nMeals; m++) {
            lineNo++;
            if (r() < 0.62) { // build-your-own
              const line = r() < 0.8 ? "Bowls" : "Pitas"; const iid = line === "Bowls" ? "BYO-BOWL" : "BYO-PITA"; const b = build(line);
              const up = b.reduce((a, [cid, q]) => a + upch(cid) * q, 0); const p = round2((price(iid, S) + up) * disc * markup);
              lines.push({ order_id: oid, line_id: String(lineNo), store_id: S.store_id, date, time, channel: ch, daypart: null, item_id: iid, qty: 1, net_price: p });
              b.forEach(([cid, q]) => { F.modifiers.push({ order_id: oid, line_id: String(lineNo), item_id: iid, component_id: cid, qty: q }); addUse(S.store_id, date, cid, q); });
              const cogs = b.reduce((a, [cid, q]) => a + compCostAt(cid, date) * q, 0); const mk = S.store_id + "|" + month; cogsSM.set(mk, (cogsSM.get(mk) || 0) + cogs); revSM.set(mk, (revSM.get(mk) || 0) + p);
              if (!mainStyle) mainStyle = b.some(([c]) => /salmon|steak|lamb/.test(c)) ? "premium" : "standard";
            } else {
              const pool = curated.filter(c => c.item_id !== "harissa-lamb-pita" || S.store_id === "VA-022"); const it = pick(r, pool.map(c => [c, CURATED_POP[c.item_id] || 3]));
              const p = round2(price(it.item_id, S) * disc * markup);
              lines.push({ order_id: oid, line_id: String(lineNo), store_id: S.store_id, date, time, channel: ch, daypart: null, item_id: it.item_id, qty: 1, net_price: p });
              const rc = recipeOf.get(it.item_id) || []; rc.forEach(([cid, q]) => addUse(S.store_id, date, cid, q));
              const cogs = rc.reduce((a, [cid, q]) => a + compCostAt(cid, date) * q, 0); const mk = S.store_id + "|" + month; cogsSM.set(mk, (cogsSM.get(mk) || 0) + cogs); revSM.set(mk, (revSM.get(mk) || 0) + p);
              if (!mainStyle) mainStyle = /salmon|steak|lamb/.test(it.item_id) ? "premium" : "standard";
            }
          }
          // add-ons: attach depends on channel and on what the meal was
          const addon = (it, qty) => { lineNo++; const p = round2(it.price * disc * markup); lines.push({ order_id: oid, line_id: String(lineNo), store_id: S.store_id, date, time, channel: ch, daypart: null, item_id: it.item_id, qty: qty || 1, net_price: p }); const rc = recipeOf.get(it.item_id) || []; rc.forEach(([cid, q]) => addUse(S.store_id, date, cid, q * (qty || 1))); const cogs = rc.reduce((a, [cid, q]) => a + compCostAt(cid, date) * q, 0) * (qty || 1); const mk = S.store_id + "|" + month; cogsSM.set(mk, (cogsSM.get(mk) || 0) + cogs); revSM.set(mk, (revSM.get(mk) || 0) + p * (qty || 1)); };
          const inStore = ch === "in_store";
          if (r() < (mainStyle === "premium" ? 0.22 : 0.17)) { addon(pick(r, chips.map(c => [c, 1]))); if (r() < 0.45) addon(pick(r, sideDips.map(c => [c, 1]))); }
          else if (r() < 0.07) addon(pick(r, sideDips.map(c => [c, 1])));
          if (r() < 0.05) addon(sidePita);
          if (r() < (inStore ? 0.34 : ch === "delivery" ? 0.18 : 0.26)) addon(pick(r, drinks.map(d => [d, /fountain|lemonade|pomegranate/i.test(d.item_name) ? 3 : /tea|water|spindrift/i.test(d.item_name) ? 1.4 : 1])));
          if (r() < 0.03) addon(pick(r, kidsDrinks.map(d => [d, 1])));
          if (r() < (mainStyle === "premium" ? 0.15 : 0.11)) addon(pick(r, desserts.map(d => [d, 1])));
          for (const L of lines) F.sales.push(L);
        }
      }
    }
    // waste log: weekly, per store and perishable component
    const weeks = [...new Set([...usageSW.keys()].map(k => k.split("|")[1]))].sort();
    const famOf = cid => { const st = comp.get(cid).station; return st === "Greens" ? "green" : st === "Dips + Spreads" ? "dip" : st === "Mains" ? "main" : st === "Toppings" ? "topping" : st === "Grains" ? "grain" : st === "Dressings" ? "dressing" : "bread"; };
    for (const S of STORES) for (const wk of weeks) for (const c of comp.values()) {
      if (!c.perishable && !LOW_MOVER_FLOOR[c.component_id]) continue; if (c.station === "Drinks" || c.station === "Sweets") continue;
      const use = usageSW.get(S.store_id + "|" + wk + "|" + c.component_id) || 0;
      const rate = WASTE_RATE[famOf(c.component_id)] || 0.02; let q = use * rate * (0.6 + 0.8 * r()) + (LOW_MOVER_FLOOR[c.component_id] || 0) * 7 * (0.7 + 0.6 * r());
      q = Math.round(q); if (q <= 0) continue;
      const endOfWeek = new Date(wk + "T00:00:00Z"); endOfWeek.setUTCDate(endOfWeek.getUTCDate() + 6); const wdate = iso(endOfWeek) > F.sales[F.sales.length - 1].date ? F.sales[F.sales.length - 1].date : iso(endOfWeek);
      F.waste.push({ store_id: S.store_id, date: wdate, component_id: c.component_id, qty_portions: q, reason: pick(r, [["spoilage", 55], ["over-prep", 30], ["drop", 10], ["expired", 5]]) });
    }
    // actuals (books) per store-month, and inventory counts for a dozen components
    const months = [...new Set(F.sales.map(l => l.date.slice(0, 7)))].sort();
    for (const S of STORES) for (const m of months) {
      const k = S.store_id + "|" + m; const cogs = cogsSM.get(k) || 0, rev = revSM.get(k) || 0;
      const gap = ACTUAL_GAP_OVERRIDE[k] != null ? ACTUAL_GAP_OVERRIDE[k] : ACTUAL_GAP[S.store_id];
      F.actuals.push({ store_id: S.store_id, period: m, actual_food_cost: round2(cogs * (1 + gap)), net_sales: round2(rev * (1 + (r() - 0.5) * 0.006)) });
      for (const [cid, v] of Object.entries(INV_VARIANCE)) { const use = usageSM.get(k + "|" + cid) || 0; if (!use) continue; const begin = Math.round(use / 30 * 5 * (0.8 + 0.4 * r())); const end = Math.round(begin * (0.9 + 0.2 * r())); const actual = use * (1 + v) * (0.98 + 0.04 * r()); F.inventory.push({ store_id: S.store_id, period: m, component_id: cid, begin_qty: begin, purchased_qty: Math.round(actual - begin + end), end_qty: end }); }
    }
    // par levels from usage (daily average × 1.3)
    for (const c of comp.values()) { let tot = 0; for (const [k, v] of usageSM) if (k.endsWith("|" + c.component_id)) tot += v; c.par_portions = tot ? Math.round(tot / STORES.length / days * 1.3) : null; }
    const meta = { seed, days, start, stores: STORES.length, orders: new Set(F.sales.map(l => l.order_id)).size, lines: F.sales.length, modifiers: F.modifiers.length, months };
    return { files: F, meta };
  }
  return { makeSample, STORES, COST, COST_V2, ARCH, W, PACKAGING, WASTE_RATE, ACTUAL_GAP, ACTUAL_GAP_OVERRIDE, INV_VARIANCE, BYO_BASE, CURATED_POP };
});
