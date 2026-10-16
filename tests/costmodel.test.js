// Hand-calculated test cases the cost model must reproduce exactly. Run: node --test tests/
// The cases live in src/costmodel.js (SELFTEST) so the page can run the same checks; this file is the gate.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const CM = require(path.join(__dirname, "..", "src", "costmodel.js"));
const SD = require(path.join(__dirname, "..", "src", "sample.js"));

for (const t of CM.SELFTEST) {
  test(t.name, () => {
    const got = t.run();
    const close = (a, b) => a == null || b == null ? assert.equal(a, b) : assert.ok(Math.abs(a - b) < 1e-6, `${got} vs ${t.expect}${t.note ? " (" + t.note + ")" : ""}`);
    if (Array.isArray(t.expect)) { assert.equal(got.length, t.expect.length); t.expect.forEach((e, i) => typeof e === "number" ? close(got[i], e) : assert.equal(got[i], e)); }
    else close(got, t.expect);
  });
}

test("CSV parser handles quotes, CRLF and a BOM", () => {
  const { headers, rows } = CM.parseCSV('﻿a,b,c\r\n1,"x, y","say ""hi"""\r\n2,,\r\n');
  assert.deepEqual(headers, ["a", "b", "c"]);
  assert.deepEqual(rows, [{ a: "1", b: "x, y", c: 'say "hi"' }, { a: "2", b: "", c: "" }]);
});
test("Column mapper recognises export headers", () => {
  const m = CM.autoMap("sales", ["Check #", "Store Number", "Business Date", "PLU", "Quantity", "Net Amount", "Order Source"]);
  assert.equal(m.order_id, "Check #"); assert.equal(m.store_id, "Store Number"); assert.equal(m.date, "Business Date"); assert.equal(m.item_id, "PLU"); assert.equal(m.qty, "Quantity"); assert.equal(m.net_price, "Net Amount"); assert.equal(m.channel, "Order Source");
});
test("Dates in several formats and Excel serials", () => {
  assert.equal(CM.toISODate("7/4/2026"), "2026-07-04"); assert.equal(CM.toISODate("2026-07-04"), "2026-07-04"); assert.equal(CM.toISODate(46207), "2026-07-04"); assert.equal(CM.toISODate("20260704"), "2026-07-04"); assert.equal(CM.toISODate("4-Jul-26"), "2026-07-04");
});
test("Validation reports unmapped components instead of dropping them silently", () => {
  const ds = tinyWith(r => r.recipes.push({ _row: 99, item_id: "bowl", component_id: "ghost", portions: 1 }));
  const v = CM.validate(ds);
  assert.ok(v.errors.some(e => e.file === "recipes" && /unmapped/.test(e.msg) && /ghost/.test(e.msg)));
});
test("Validation flags items without a recipe and unit mismatches", () => {
  const ds = tinyWith(r => { r.items.push({ _row: 50, item_id: "orphan", item_name: "Orphan", line: "Bowls", price: 9, byo: null, active: null, store_id: null, menu_calories: null }); r.components.push({ _row: 60, component_id: "odd", component_name: "Odd", station: "Toppings", case_cost: 10, case_size: 1, case_unit: "lb", portion_size: 1, portion_unit: "fl oz" }); });
  const v = CM.validate(ds);
  assert.ok(v.errors.some(e => /no recipe/.test(e.msg) && /Orphan/.test(e.msg)));
  assert.ok(v.errors.some(e => /unit mismatch/.test(e.msg)));
});
test("Synthetic dataset validates cleanly and reconciles as designed", () => {
  const items = require(path.join(__dirname, "..", "data", "items.json")), station = require(path.join(__dirname, "..", "data", "station.json"));
  const { files } = SD.makeSample({ items, station, days: 31 });
  const ds = {}; for (const k of Object.keys(files)) ds[k] = files[k].map((r, i) => Object.assign({ _row: i + 2 }, r));
  const v = CM.validate(ds); assert.deepEqual(v.errors, []);
  const M = CM.build(ds); const R = CM.analyze(M, { target: 30 });
  assert.ok(R.totals.fc > 20 && R.totals.fc < 35, "food cost in a plausible range: " + R.totals.fc);
  assert.ok(R.byo.orders > 0 && R.byo.avgComponents > 6);
  assert.ok(R.reconcile.rows.every(r => r.verdict === "Pass"), JSON.stringify(R.reconcile.rows.map(r => [r.name, r.month, r.verdict])));
  // the scenario machinery conserves revenue when nothing changes
  const R0 = CM.analyze(M, { target: 30 }, { name: "noop" }); assert.ok(Math.abs(R0.totals.rev - R.totals.rev) < 1e-6);
});
function tinyWith(f) {
  // rebuild the engine's tiny fixture through the public API and let the test mutate it
  const t = CM.SELFTEST.find(x => x.name === "Item cost sums portions"); void t;
  const CMi = require(path.join(__dirname, "..", "src", "costmodel.js"));
  const ds = JSON.parse(JSON.stringify(CMi.__tiny ? CMi.__tiny() : null));
  f(ds); return ds;
}
