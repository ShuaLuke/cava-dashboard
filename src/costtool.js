/* Cost & sales tool: the UI over src/costmodel.js. Loaded after the dashboard script and reuses its helpers
   (esc, tipAttr, ttRows, ttList, money, m2, pct, css, d3, STATION, ITEMS, dEl, openDrawer, setView, hideTip).
   Everything runs in this browser tab. No network calls; the only storage is the opt-in "keep my data on this device". */
(function () {
  "use strict";
  const CM = window.CostModel, SD = window.SampleData;
  const $ = v => v == null || Number.isNaN(v) ? "—" : (v < 0 ? "−$" : "$") + Math.abs(v).toFixed(2);
  const $0 = v => v == null || Number.isNaN(v) ? "—" : (v < 0 ? "−$" : "$") + Math.round(Math.abs(v)).toLocaleString();
  const $k = v => v == null ? "—" : Math.abs(v) >= 1e6 ? (v < 0 ? "−" : "") + "$" + (Math.abs(v) / 1e6).toFixed(2) + "M" : Math.abs(v) >= 1e4 ? (v < 0 ? "−" : "") + "$" + Math.round(Math.abs(v) / 1e3) + "k" : $0(v);
  const pf = (v, d = 1) => v == null || Number.isNaN(v) ? "—" : v.toFixed(d) + "%";
  const nf = v => v == null || Number.isNaN(v) ? "—" : Math.round(v).toLocaleString();
  const n1 = v => v == null || Number.isNaN(v) ? "—" : (Math.round(v * 10) / 10).toLocaleString();
  const sgn = (v, f) => v == null ? "—" : (v > 0 ? "+" : v < 0 ? "−" : "") + f(Math.abs(v)).replace(/^[−-]/, "");
  const pts = v => v == null ? "—" : (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(1) + " pts";
  const monthName = m => { const [y, mo] = m.split("-"); return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][+mo - 1] + " " + y; };
  const CH_LABEL = { in_store: "In store", app: "App", web: "Web", delivery: "Delivery", catering: "Catering", other: "Other" };
  const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;
  const QCOL = { Star: "var(--teal)", Plowhorse: "var(--f-grain)", Puzzle: "var(--f-sweet)", Dog: "var(--muted)" };
  const VERDICT = { Pass: "ok", Review: "warn", Fail: "bad", "Not assessable": "quiet", "No sales": "quiet" };

  const blankScn = () => ({ name: "", costPct: {}, costAbs: {}, prices: {}, upcharges: {}, remove: [], swaps: [], newItems: [], unavailable: [], elasticity: -0.8, retention: 0.8 });
  const CT = { tab: "data", src: "sample", sample: null, own: null, files: [], scope: { stores: null, months: null, channel: "all", target: 30 }, scn: blankScn(), saved: [], compare: new Set(), persist: false, cache: new Map(), exports: new Map(), ready: false, busy: false,
    ui: { itemSort: "fc", itemQ: "", buildQ: "", newItem: { name: "", line: "Bowls", price: 14.25, recipe: [], units: 60, cannibal: 70, weeks: "" }, byoCalc: [], crossItem: "", salesSort: "units", opsStore: null, costTab: "items" } };
  try { CT.persist = localStorage.getItem("cv-ct-persist") === "1"; } catch (e) {}

  /* ---------- storage (opt-in) ---------- */
  const idb = {
    open() { return new Promise((res, rej) => { const q = indexedDB.open("cv-costtool", 1); q.onupgradeneeded = () => q.result.createObjectStore("kv"); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); },
    async get(k) { try { const db = await this.open(); return await new Promise((res, rej) => { const t = db.transaction("kv").objectStore("kv").get(k); t.onsuccess = () => res(t.result); t.onerror = () => rej(t.error); }); } catch (e) { return null; } },
    async set(k, v) { try { const db = await this.open(); await new Promise((res, rej) => { const t = db.transaction("kv", "readwrite"); t.objectStore("kv").put(v, k); t.oncomplete = res; t.onerror = () => rej(t.error); }); } catch (e) {} },
    async clear() { try { const db = await this.open(); await new Promise((res, rej) => { const t = db.transaction("kv", "readwrite"); t.objectStore("kv").clear(); t.oncomplete = res; t.onerror = () => rej(t.error); }); } catch (e) {} },
  };
  async function persistNow() {
    if (!CT.persist) return;
    await idb.set("files", CT.files.map(f => ({ name: f.name, type: f.type, text: f.text, map: f.map })));
    try { localStorage.setItem("cv-ct-saved", JSON.stringify(CT.saved)); } catch (e) {}
  }
  async function restore() {
    if (!CT.persist) return;
    try { CT.saved = JSON.parse(localStorage.getItem("cv-ct-saved") || "[]"); } catch (e) {}
    const files = await idb.get("files");
    if (files && files.length) { CT.files = files.map(f => { const p = CM.parseCSV(f.text); return { name: f.name, type: f.type, headers: p.headers, rows: p.rows, map: f.map || CM.autoMap(f.type, p.headers), text: f.text }; }); useOwnData(true); }
  }
  async function clearAll() {
    CT.files = []; CT.own = null; CT.src = "sample"; CT.saved = []; CT.compare.clear(); CT.scn = blankScn(); CT.cache.clear(); CT.scope = { stores: null, months: null, channel: "all", target: 30 };
    await idb.clear(); try { localStorage.removeItem("cv-ct-saved"); } catch (e) {}
    render();
  }

  /* ---------- data ---------- */
  function ensureSample() {
    if (CT.sample) return CT.sample;
    const { files, meta } = SD.makeSample({ items: ITEMS, station: STATION });
    const ds = {}; for (const k of Object.keys(files)) ds[k] = files[k].map((r, i) => Object.assign({ _row: i + 2 }, r));
    const validation = CM.validate(ds); const M = CM.build(ds);
    CT.sample = { ds, M, meta, files, validation, label: `Sample data · ${meta.stores} stores · ${monthName(meta.months[0])} to ${monthName(meta.months[meta.months.length - 1])} · ${nf(meta.orders)} orders` };
    return CT.sample;
  }
  const data = () => CT.src === "own" && CT.own ? CT.own : ensureSample();
  function scopeObj() { const M = data().M; const s = CT.scope; const stores = s.stores ? new Set([...s.stores].filter(x => M.stores.has(x))) : null; const months = s.months ? new Set([...s.months].filter(x => M.months.includes(x))) : null; return { stores: stores && stores.size ? stores : null, months: months && months.size ? months : null, channel: s.channel || "all", target: s.target || 30 }; }
  function results(scn) {
    const key = CT.src + "|" + JSON.stringify(CT.scope, (k, v) => v instanceof Set ? [...v] : v) + "|" + (scn ? JSON.stringify(scn) : "");
    let R = CT.cache.get(key); if (R) return R;
    R = CM.analyze(data().M, scopeObj(), scn || null);
    if (CT.cache.size > 10) CT.cache.delete(CT.cache.keys().next().value);
    CT.cache.set(key, R); return R;
  }
  const liveScn = () => { const s = CM.normScenario(CT.scn); return s && !s.empty ? CT.scn : null; };

  /* ---------- files ---------- */
  async function onFiles(list) {
    const files = [...list]; if (!files.length) return;
    CT.busy = "Reading " + files.map(f => f.name).join(", ") + "…"; render();
    for (const f of files) {
      try {
        if (/\.xlsx$/i.test(f.name)) {
          if (!window.XlsxLite) throw new Error("Excel reader not loaded");
          const sheets = await XlsxLite.read(await f.arrayBuffer());
          for (const sh of sheets) { if (!sh.rows.length) continue; const name = sheets.length > 1 ? `${f.name} › ${sh.name}` : f.name; const type = CM.detectType(sh.name, sh.headers) || CM.detectType(f.name, sh.headers); addFile({ name, type, headers: sh.headers, rows: sh.rows, text: CM.toCSV(sh.rows, sh.headers) }); }
        } else {
          const text = await f.text(); const p = CM.parseCSV(text); const type = CM.detectType(f.name, p.headers);
          addFile({ name: f.name, type, headers: p.headers, rows: p.rows, text });
        }
      } catch (e) { CT.files.push({ name: f.name, type: null, headers: [], rows: [], error: e.message || String(e), map: {} }); }
    }
    CT.busy = false; CT.tab = "data"; render();
  }
  function addFile(f) { f.map = f.type ? CM.autoMap(f.type, f.headers) : {}; const i = CT.files.findIndex(x => x.name === f.name); if (i >= 0) CT.files[i] = f; else CT.files.push(f); }
  const fileReady = f => f.type && !f.error && CM.TEMPLATES[f.type].cols.filter(c => c.req).every(c => f.map[c.k]);
  function useOwnData(quiet) {
    const ds = {}; const bad = [];
    for (const f of CT.files) { if (!fileReady(f)) continue; const r = CM.applyMap(f.type, f.rows, f.map); r.bad.forEach(b => bad.push({ file: f.name, row: b.row, problem: b.problem })); ds[f.type] = (ds[f.type] || []).concat(r.rows); }
    const validation = CM.validate(ds); validation.bad = bad;
    if (bad.length) validation.warnings.unshift({ file: "files", msg: `${bad.length} row(s) could not be parsed and were left out (first: ${bad[0].file} row ${bad[0].row}: ${bad[0].problem}).`, rows: bad.length });
    CT.own = { ds, validation, M: validation.ok ? CM.build(ds) : null, loadedAt: new Date() };
    if (validation.ok) { const M = CT.own.M; CT.own.label = `Your data · ${M.stores.size} store${M.stores.size === 1 ? "" : "s"}${M.months.length ? " · " + monthName(M.months[0]) + (M.months.length > 1 ? " to " + monthName(M.months[M.months.length - 1]) : "") : ""} · ${nf(M.orders.size)} orders`; CT.src = "own"; CT.cache.clear(); CT.scope = { stores: null, months: null, channel: "all", target: CT.scope.target }; if (!quiet) CT.tab = "costs"; persistNow(); }
    else CT.src = "sample";
    if (!quiet) render();
  }
  function download(name, text, mime) { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: mime || "text/csv;charset=utf-8" })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
  function exportCSV(id) { const e = CT.exports.get(id); if (!e) return; download((e.name || id).replace(/[^a-z0-9-]+/gi, "-").toLowerCase() + ".csv", CM.toCSV(e.rows.map(r => Object.fromEntries(e.cols.map(c => [c.l || c.k, c.raw ? c.raw(r) : r[c.k]]))), e.cols.map(c => c.l || c.k))); }
  function exportPNG(svg, name) {
    let s = new XMLSerializer().serializeToString(svg); s = s.replace(/var\((--[a-z0-9-]+)\)/g, (m, v) => css(v) || "#888").replace(/font-family:var\(--mono\)/g, "font-family:ui-monospace,Menlo,monospace");
    const vb = (svg.getAttribute("viewBox") || "0 0 600 300").split(/\s+/).map(Number); const W = vb[2] * 2, H = vb[3] * 2;
    const img = new Image(); img.onload = () => { const c = document.createElement("canvas"); c.width = W; c.height = H; const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H); ctx.drawImage(img, 0, 0, W, H); const a = document.createElement("a"); a.href = c.toDataURL("image/png"); a.download = name + ".png"; a.click(); };
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(s.replace(/<svg /, '<svg xmlns="http://www.w3.org/2000/svg" style="font-family:system-ui,sans-serif;background:#fff" '));
  }

  /* ---------- small render helpers ---------- */
  const tile = (v, label, tip, cls) => `<div class="stat" tabindex="0" ${tip ? tipAttr(tip) : ""}><b class="num ${cls || ""}">${v}</b><span>${label}</span></div>`;
  const flag = (v, kind) => `<span class="flag ${kind || "quiet"}">${esc(v)}</span>`;
  // table with CSV export; cols: {k, l, n (numeric), f (format), w (width), tip (row tip fn)}
  function table(id, cols, rows, opts = {}) {
    CT.exports.set(id, { cols, rows, name: opts.name || id });
    const h = `<div class="ct-tbl" style="${opts.maxh ? "max-height:" + opts.maxh + "px" : ""}"><table class="ops ct"><thead><tr>${cols.map(c => `<th class="${c.n ? "n" : ""}" ${c.w ? `style="width:${c.w}"` : ""}>${c.l || c.k}</th>`).join("")}</tr></thead>
      <tbody>${rows.length ? rows.map(r => `<tr ${opts.tip ? tipAttr(opts.tip(r)) : ""} ${opts.row ? opts.row(r) : ""}>${cols.map(c => `<td class="${c.n ? "n" : ""} ${c.cls ? c.cls(r) : ""}">${c.f ? c.f(r[c.k], r) : esc(r[c.k] == null ? "—" : r[c.k])}</td>`).join("")}</tr>`).join("") : `<tr><td colspan="${cols.length}" class="empty">${esc(opts.empty || "Nothing to show.")}</td></tr>`}</tbody></table></div>`;
    return `<div class="ct-block"><div class="ct-head"><div class="sub">${opts.title || ""}</div><div class="ct-tools">${opts.tools || ""}${rows.length ? `<button class="linkbtn" data-act="csv:${id}" title="Download this table as CSV">⤓ CSV</button>` : ""}</div></div>${opts.note ? `<p class="hint">${opts.note}</p>` : ""}${h}</div>`;
  }
  const chart = (id, title, svg, note) => `<div class="ct-block"><div class="ct-head"><div class="sub">${title}</div><div class="ct-tools"><button class="linkbtn" data-act="png:${id}" title="Download this chart as an image">⤓ PNG</button></div></div><div id="${id}">${svg}</div>${note ? `<p class="hint">${note}</p>` : ""}</div>`;
  const bars = (rows, { k, label, max, color, fmt }) => `<div class="bars">${rows.map(r => `<div class="bar" ${r.tip ? tipAttr(r.tip) : ""} tabindex="0"><span class="name">${esc(label(r))}</span><span class="track"><span class="fill" style="display:block;width:${Math.min(100, (k(r) / (max || 1)) * 100)}%;background:${typeof color === "function" ? color(r) : color || "var(--accent)"}"></span></span><span class="val">${fmt(k(r))}</span></div>`).join("")}</div>`;
  const spark = (vals, w = 90, h = 22, color = "var(--accent)") => { const v = vals.filter(x => x != null); if (v.length < 2) return ""; const lo = Math.min(...v), hi = Math.max(...v); const sx = i => 2 + i / (vals.length - 1) * (w - 4), sy = x => hi === lo ? h / 2 : 2 + (1 - (x - lo) / (hi - lo)) * (h - 4); return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" style="vertical-align:middle"><polyline fill="none" stroke="${color}" stroke-width="1.5" points="${vals.map((x, i) => x == null ? "" : sx(i).toFixed(1) + "," + sy(x).toFixed(1)).filter(Boolean).join(" ")}"></polyline></svg>`; };
  const sel = (name, options, value, attrs = "") => `<select data-set="${name}" ${attrs}>${options.map(o => `<option value="${esc(o[0])}" ${String(o[0]) === String(value) ? "selected" : ""}>${esc(o[1])}</option>`).join("")}</select>`;
  const compOptions = M => [...M.comps.values()].filter(c => c.fam !== "packaging").sort((a, b) => a.station.localeCompare(b.station) || a.name.localeCompare(b.name)).map(c => [c.id, `${c.name} · ${c.station}`]);
  const itemOptions = (M, pred) => [...M.items.values()].filter(i => i.active && (!pred || pred(i))).sort((a, b) => a.line.localeCompare(b.line) || a.name.localeCompare(b.name)).map(i => [i.id, `${i.name} · ${i.line}`]);
  const partsTip = (x, M) => `<b>${esc(x.name)}</b> <span class="tt-k">${esc(x.line)}</span>` + ttRows(x.parts.map(p => [`<i class="dot" style="background:var(--f-${p.fam === "packaging" || p.fam === "other" ? "sweet" : p.fam});margin-right:5px"></i>${esc(p.name)}${p.portions !== 1 ? ` <span class="tt-k">×${p.portions}</span>` : ""}`, $(p.cost)])) + ttRows([["<b>Food cost</b>", `<b>${$(x.food)}</b>`], ["Packaging dine-in / digital", `${$(x.pkgIn)} / ${$(x.pkgDig)}`], ["Price", $(x.price)], ["Food cost %", pf(x.fc)], ["Contribution", $(x.cm)]]);
  const srcTag = () => CT.src === "own" ? '<div class="tt-hint">Your data</div>' : '<div class="tt-hint">Sample data (synthetic)</div>';

  /* ---------- shell ---------- */
  function render() {
    const box = dEl("cost-out"); if (!box) return;
    if (!CT.ready) { box.innerHTML = `<p class="hint">Preparing the sample dataset…</p>`; return; }
    const D = data(); const M = D.M;
    const own = CT.own && CT.own.M;
    box.innerHTML = `
      <div class="ct-banner ${CT.src === "own" ? "own" : "sample"}" id="ct-banner" role="status">
        <span class="ct-dot" aria-hidden="true"></span>
        <b>${CT.src === "own" ? "YOUR DATA" : "SAMPLE DATA"}</b>
        <span>${esc(D.label)}${CT.src === "sample" ? ". Every number is synthetic." : ""}${window.__offline ? " · Offline build: no external requests." : ""}</span>
        <span class="ct-banner-tools">
          ${CT.src === "own" ? `<button class="linkbtn" data-act="src:sample">Switch to sample</button>` : own ? `<button class="linkbtn" data-act="src:own">Switch to my data</button>` : `<button class="linkbtn" data-act="tab:data">Load my data</button>`}
          ${CT.files.length || own ? `<button class="linkbtn" data-act="clear">Clear all data</button>` : ""}
        </span>
      </div>
      <div class="ct-bar">
        <div class="controls seg" role="tablist" aria-label="Cost & sales tool">${[["data", "Data"], ["costs", "Costs"], ["sales", "Sales & mix"], ["scenarios", "Scenarios"], ["ops", "Operations"], ["recon", "Reconcile"]].map(([k, l]) => `<button class="chip" role="tab" data-act="tab:${k}" aria-pressed="${CT.tab === k}">${l}</button>`).join("")}</div>
        ${CT.tab !== "data" ? scopeBar(M) : ""}
      </div>
      <div id="ct-tab">${CT.busy ? `<p class="hint">${esc(CT.busy)}</p>` : tabBody(M)}</div>`;
    wireInputs(box);
  }
  function scopeBar(M) {
    const s = CT.scope; const stores = [...M.stores.values()]; const months = M.months;
    return `<div class="ct-scope">
      ${stores.length > 1 ? `<span class="label">Stores</span>${stores.map(st => `<button class="chip" data-act="store:${esc(st.id)}" aria-pressed="${!s.stores || s.stores.has(st.id)}">${esc(st.name)}</button>`).join("")}` : ""}
      ${months.length > 1 ? `<span class="label">Months</span>${months.map(m => `<button class="chip" data-act="month:${m}" aria-pressed="${!s.months || s.months.has(m)}">${monthName(m)}</button>`).join("")}` : ""}
      ${M.channels.length > 1 ? `<span class="label">Channel</span>${sel("channel", [["all", "All channels"]].concat(M.channels.map(c => [c, CH_LABEL[c]])), s.channel)}` : ""}
      <span class="label">Target food cost</span><input type="number" data-set="target" value="${s.target}" min="10" max="60" step="0.5" style="width:62px"><span class="label">%</span>
    </div>`;
  }
  function tabBody(M) {
    try {
      if (CT.tab === "data") return tabData();
      const R = results(CT.tab === "scenarios" ? null : null);
      if (CT.tab === "costs") return tabCosts(R, M);
      if (CT.tab === "sales") return tabSales(R, M);
      if (CT.tab === "scenarios") return tabScenarios(R, M);
      if (CT.tab === "ops") return tabOps(R, M);
      if (CT.tab === "recon") return tabRecon(R, M);
    } catch (e) { console.error(e); return `<p class="empty">Something went wrong rendering this tab: ${esc(e.message)}</p>`; }
    return "";
  }

  /* ---------- Data tab ---------- */
  function tabData() {
    const T = CM.TEMPLATES; const own = CT.own; const V = own && own.validation;
    const need = t => T[t].need === "required" ? flag("required", "warn") : T[t].need === "optional" ? flag("optional") : flag(T[t].need);
    const fileRow = (f, i) => { const ready = fileReady(f); const t = f.type && T[f.type]; const missing = t ? t.cols.filter(c => c.req && !f.map[c.k]).map(c => c.k) : [];
      return `<div class="ct-file ${f.error ? "bad" : ready ? "ok" : "warn"}">
        <div class="ct-file-head"><b>${esc(f.name)}</b><span class="hint">${f.error ? esc(f.error) : `${nf(f.rows.length)} rows · ${f.headers.length} columns`}</span>
          <span class="ct-file-tools">${sel("ftype:" + i, [["", "— choose a file type —"]].concat(CM.TYPES.map(k => [k, T[k].label])), f.type || "")}<button class="linkbtn" data-act="map:${i}">${f.showMap ? "Hide mapping" : "Column mapping"}</button><button class="linkbtn" data-act="rmfile:${i}" aria-label="Remove ${esc(f.name)}">✕</button></span></div>
        ${f.type && !f.error ? (ready ? `<span class="flag ok">Ready${f.type ? " · " + esc(T[f.type].label) : ""}</span>` : `<span class="flag warn">Map the required column${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}</span>`) : f.error ? "" : `<span class="flag warn">Pick what this file is</span>`}
        ${f.showMap && f.type ? `<div class="ct-map">${T[f.type].cols.map(c => `<label><span>${c.k}${c.req ? ' <b style="color:var(--warn)">*</b>' : ""}</span>${sel(`map:${i}:${c.k}`, [["", "— not in file —"]].concat(f.headers.map(h => [h, h])), f.map[c.k] || "")}</label>`).join("")}<p class="hint">Columns are matched by name; fix any that are wrong. <code>*</code> = required. Header names are only remembered if “keep my data on this device” is on.</p></div>` : ""}
      </div>`; };
    const vList = (list, kind) => list.length ? `<ul class="ct-vlist ${kind}">${list.map(x => `<li><b>${esc(x.file)}</b> ${esc(x.msg)}</li>`).join("")}</ul>` : "";
    const canUse = CT.files.some(fileReady);
    return `<div class="ct-grid">
      <div class="ct-col">
        <h3>Load your data</h3>
        <p class="hint">CSV, TSV or Excel (.xlsx, one file type per sheet). Files are read and computed <b>in this tab only</b>: nothing is uploaded, the page makes no network requests with your data, and nothing is kept after the tab closes unless you opt in below.</p>
        <label class="ct-drop" id="ct-drop"><input type="file" id="ct-file" multiple accept=".csv,.tsv,.txt,.xlsx" hidden><span><b>Drop files here</b> or click to choose</span><span class="hint">components, items, recipes, sales, modifiers, stores, packaging, waste, actuals, inventory</span></label>
        <div class="ct-opts">
          <label class="ct-check"><input type="checkbox" data-set="persist" ${CT.persist ? "checked" : ""}> Keep my data on this device (browser storage, this computer only). Off by default: data clears when the tab closes.</label>
          ${CT.files.length || (CT.own) ? `<button class="linkbtn" data-act="clear">Clear all data</button>` : ""}
        </div>
        <h3 style="margin-top:8px">What to load</h3>
        <div class="ct-templates">${CM.TYPES.map(t => `<div class="ct-tpl"><div><b>${esc(T[t].label)}</b> ${need(t)}</div><span class="hint">${esc(T[t].desc)}</span><span class="ct-tpl-tools"><button class="linkbtn" data-act="tpl:${t}">⤓ Blank template</button><button class="linkbtn" data-act="sample:${t}">⤓ Sample file</button><button class="linkbtn" data-act="dict:${t}">Columns</button></span></div>`).join("")}</div>
        <p class="hint">Minimum to see costs: components, items and recipes. Add sales (and modifiers for build-your-own) for the sales, scenario and operations views, and actuals for the reconciliation test. The full data dictionary is in <code>docs/data-dictionary.md</code>; the sample files follow it exactly.</p>
      </div>
      <div class="ct-col">
        <h3>Loaded files ${CT.files.length ? `<span class="hint">${CT.files.length}</span>` : ""}</h3>
        ${CT.files.length ? CT.files.map(fileRow).join("") : `<p class="empty">No files yet. The tool is showing the built-in sample dataset.</p>`}
        ${CT.files.length ? `<div class="ct-actions"><button class="tour-next" data-act="use" ${canUse ? "" : "disabled"}>Use this data</button><span class="hint">Checks every file, reports problems, then switches the whole tool to your data.</span></div>` : ""}
        ${V ? `<h3 style="margin-top:12px">Checks ${!V.ok ? flag("fix before use", "bad") : V.errors.length ? flag(`usable · ${V.errors.length} error${V.errors.length === 1 ? "" : "s"} reported`, "warn") : flag("data usable", "ok")}</h3>
          ${V.errors.length ? `<div class="sub" style="margin:4px 0">Errors · ${V.errors.length}</div>` + vList(V.errors, "bad") : `<p class="hint">No errors.</p>`}
          ${V.warnings.length ? `<div class="sub" style="margin:8px 0 4px">Warnings · ${V.warnings.length}</div>` + vList(V.warnings, "warn") : ""}
          ${V.info.length ? `<div class="sub" style="margin:8px 0 4px">Notes</div>` + vList(V.info, "info") : ""}
          ${own.M ? `<p class="hint" style="margin-top:8px">Loaded: ${own.M.comps.size} components, ${own.M.items.size} items, ${nf(own.M.sales.length)} sales lines, ${nf(own.M.orders.size)} orders, ${own.M.stores.size} stores, ${own.M.months.length} months.</p>` : ""}` : ""}
        <h3 style="margin-top:14px">How this stays private</h3>
        <ul class="ct-notes">
          <li>Parsing and every calculation run in your browser. There is no server, no upload and no analytics.</li>
          <li>The page's content-security policy blocks every network connection (<code>connect-src 'none'</code>); the hosted version only fetches the D3 library and fonts, and the offline build fetches nothing at all.</li>
          <li>Storage is off unless you tick “keep my data on this device”; “Clear all data” wipes it, including saved scenarios and column mappings.</li>
          <li>The full source, the list of external requests and the review notes are in <code>docs/security-review.md</code>.</li>
        </ul>
      </div>
    </div>`;
  }

  /* ---------- Costs tab ---------- */
  function tabCosts(R, M) {
    const t = R.scope.target; const items = R.itemList.filter(x => !x.byo && !x.removed);
    const meals = items.filter(x => !x.addon && x.parts.length), addons = items.filter(x => x.addon && x.parts.length);
    const over = meals.filter(x => x.fc != null && x.fc > t).sort((a, b) => b.fc - a.fc);
    const q = CT.ui.itemQ.toLowerCase(); const sortK = CT.ui.itemSort;
    const list = items.filter(x => !q || x.name.toLowerCase().includes(q) || x.line.toLowerCase().includes(q)).sort(sortK === "fc" ? (a, b) => (b.fc || 0) - (a.fc || 0) : sortK === "cm" ? (a, b) => (b.cm || 0) - (a.cm || 0) : sortK === "lo" ? (a, b) => (a.cm || 0) - (b.cm || 0) : (a, b) => a.line.localeCompare(b.line) || a.name.localeCompare(b.name));
    const pkgShare = R.totals.rev ? R.totals.pkg / R.totals.rev * 100 : null;
    const kpis = `<div class="ops-tiles">
      ${tile(pf(meals.length ? d3.mean(meals, x => x.fc) : null), "avg food cost, meals at menu price", `<b>Average food cost at menu price</b>` + ttRows([["Meals", pf(meals.length ? d3.mean(meals, x => x.fc) : null)], ["Add-ons", pf(addons.length ? d3.mean(addons, x => x.fc) : null)], ["Mix-weighted (sold)", pf(R.totals.fc)]]) + srcTag())}
      ${tile($(meals.length ? d3.median(meals, x => x.cm) : null), "median contribution per meal", `<b>Contribution = price − food cost</b>` + ttRows([["Meals (median)", $(meals.length ? d3.median(meals, x => x.cm) : null)], ["Add-ons (median)", $(addons.length ? d3.median(addons, x => x.cm) : null)]]) + srcTag())}
      ${tile(over.length, `meals over the ${t}% target`, `<b>Over target</b>` + ttList(over.map(x => `${esc(x.name)} <span class="tt-k">${pf(x.fc)}</span>`), 10) + srcTag(), over.length ? "pc-hi" : "")}
      ${tile(M.hasPackaging ? pf(pkgShare) : "—", "packaging & paper, share of sales", M.hasPackaging ? `<b>Packaging</b>` + ttRows([["Dine-in bowl", $(M.pkg("Bowls", "in_store"))], ["Digital bowl", $(M.pkg("Bowls", "app"))], ["Total in scope", $0(R.totals.pkg)]]) : "<b>No packaging file loaded</b><div class='tt-k'>Load packaging.csv to split paper cost by dine-in and digital</div>")}
      ${tile(M.costDates.length ? M.costDates.length + 1 : 1, "cost versions", `<b>Cost versions</b>` + ttRows([["Effective dates", M.costDates.length ? M.costDates.join(", ") : "none (one version)"], ["Costed at", R.refDate]]))}
    </div>`;
    const itemsT = table("items-cost", [
      { k: "name", l: "Item", f: (v, r) => `<b style="font-weight:600">${esc(v)}</b>${r.isNew ? ' <span class="zp">new</span>' : ""}` }, { k: "line", l: "Line", f: v => `<span style="color:var(--muted)">${esc(v)}</span>` },
      { k: "price", l: "Price", n: 1, f: $ }, { k: "food", l: "Food cost", n: 1, f: $ }, { k: "fc", l: "Food cost %", n: 1, f: pf, cls: r => r.fc > t && !r.addon ? "pc-hi" : "" }, { k: "cm", l: "Contribution", n: 1, f: $ }, { k: "priceFor", l: `Price for ${t}%`, n: 1, f: $ },
      { k: "pkgIn", l: "Paper dine-in", n: 1, f: $ }, { k: "pkgDig", l: "Paper digital", n: 1, f: $ }, { k: "parts", l: "Components", n: 1, f: v => v.length, raw: r => r.parts.length },
      { k: "parts", l: "Cost mix", f: (v, r) => `<span class="cbar">${v.map(p => `<i style="width:${r.food ? p.cost / r.food * 100 : 0}%;background:var(--f-${p.fam === "packaging" || p.fam === "other" ? "sweet" : p.fam})"></i>`).join("")}</span>`, raw: r => r.parts.map(p => `${p.name}×${p.portions}=${p.cost.toFixed(3)}`).join("; ") },
    ], list, { title: `Item by item · costed at ${R.refDate}${R.scope.stores.length === 1 ? " · " + esc((M.stores.get(R.scope.stores[0]) || { name: "" }).name) : ""}`, name: "item-costs", maxh: 420, tip: r => partsTip(r, M) + '<div class="tt-hint">Click for the full build-up</div>', row: r => `data-act="item:${esc(r.id)}" style="cursor:pointer"`,
      tools: `<input type="search" data-set="itemQ" value="${esc(CT.ui.itemQ)}" placeholder="Filter items" style="width:130px"><div class="controls">${[["fc", "Highest food cost"], ["lo", "Lowest contribution"], ["cm", "Highest contribution"], ["line", "By line"]].map(([k, l]) => `<button class="chip" data-act="isort:${k}" aria-pressed="${sortK === k}">${l}</button>`).join("")}</div>` });
    const upT = table("upcharges", [
      { k: "name", l: "Component", f: (v, r) => `<b style="font-weight:600">${esc(v)}</b> <span class="hint">${esc(r.station)}</span>` }, { k: "upcharge", l: "Up-charge", n: 1, f: $ }, { k: "cost", l: "Portion cost", n: 1, f: $ },
      { k: "incremental", l: "Incremental cost", n: 1, f: $ }, { k: "margin", l: "Margin per add", n: 1, f: $, cls: r => r.margin < 0 ? "pc-hi" : "" }, { k: "marginPct", l: "Margin %", n: 1, f: pf }, { k: "breakEven", l: "Break-even cost", n: 1, f: $ },
      { k: "picks", l: "Picks", n: 1, f: nf }, { k: "perStoreWeek", l: "Per store-week", n: 1, f: n1 }, { k: "marginTotal", l: "Margin in scope", n: 1, f: $0 },
    ], R.upcharges, { title: "Up-charge coverage · paid add-ons against what they cost", name: "upcharge-coverage", note: `A premium main replaces an included one, so its incremental cost is its portion cost minus the average included main (${$(R.includedMain)}). Toppings such as avocado are pure adds. Break-even is the portion cost at which the margin reaches zero.`, tip: r => `<b>${esc(r.name)}</b>` + ttRows([["Up-charge", $(r.upcharge)], ["Portion cost", $(r.cost)], [r.baseMain != null ? "Included main it replaces" : "Pure add", r.baseMain != null ? $(r.baseMain) : "—"], ["Margin per add", $(r.margin)], ["Picks in scope", nf(r.picks)]]) + srcTag() });
    const hist = R.history.snapshots.length ? R.history.snapshots.map(s => `<div class="ct-block"><div class="sub">Costs effective ${s.date} · ${s.components.length} component${s.components.length === 1 ? "" : "s"} changed, ${s.items.length} item${s.items.length === 1 ? "" : "s"} moved</div>
        <div class="ops-two"><div>${bars(s.components.slice(0, 8).map(c => ({ ...c, tip: `<b>${esc(c.name)}</b>` + ttRows([["Before", $(c.before)], ["After", $(c.after)], ["Change", c.pct == null ? "—" : sgn(c.pct, v => v.toFixed(1) + "%")]]) })), { k: c => Math.abs(c.after - c.before), label: c => `${c.name} ${sgn(c.pct, v => v.toFixed(0) + "%")}`, max: d3.max(s.components, c => Math.abs(c.after - c.before)), color: c => c.after > c.before ? "var(--warn)" : "var(--teal)", fmt: v => $(v) })}</div>
        ${table("history-" + s.date, [{ k: "name", l: "Item" }, { k: "line", l: "Line" }, { k: "before", l: "Cost before", n: 1, f: $ }, { k: "after", l: "After", n: 1, f: $ }, { k: "delta", l: "Change", n: 1, f: v => sgn(v, $), cls: r => r.delta > 0 ? "pc-hi" : "" }, { k: "fcAfter", l: "Food cost % after", n: 1, f: (v, r) => `${pf(r.fcBefore)} → ${pf(v)}` }, { k: "driver", l: "Driven by" }], s.items, { name: "cost-history-" + s.date, maxh: 260 })}</div></div>`).join("")
      : `<p class="hint">${esc(R.history.note || "")}</p>`;
    const nut = R.hasNutrition ? table("nutrition", [{ k: "name", l: "Item" }, { k: "line", l: "Line" }, { k: "calc", l: "Calories from portions", n: 1, f: nf }, { k: "menu", l: "Menu calories", n: 1, f: nf }, { k: "delta", l: "Difference", n: 1, f: v => v == null ? "—" : sgn(v, x => nf(x)), cls: r => r.delta != null && Math.abs(r.delta) > 80 ? "pc-hi" : "" }, { k: "sodium", l: "Sodium mg", n: 1, f: nf }, { k: "missing", l: "Components without data", n: 1 }], R.nutrition.slice().sort((a, b) => Math.abs(b.delta || 0) - Math.abs(a.delta || 0)), { title: "Nutrition from the same portions · calories computed from the recipe against the printed menu", name: "nutrition-check", maxh: 300, note: "Large differences usually mean the curated recipe uses smaller portions than the station components, or the nutrition guide and the recipe disagree. Needs calories per portion in components.csv." }) : "";
    return `${kpis}
      <div class="controls seg" style="margin-top:4px">${[["items", "Items"], ["upcharges", "Up-charges"], ["byo", "Cost a build"], ["history", "Cost history"], ["nutrition", "Nutrition check"]].map(([k, l]) => `<button class="chip" data-act="ctab:${k}" aria-pressed="${CT.ui.costTab === k}">${l}</button>`).join("")}</div>
      ${CT.ui.costTab === "items" ? itemsT + `<p class="hint">Food cost is components × portions at the cost in force on the reference date, after yield. Packaging is shown separately and included in the mix-weighted figures on the Sales tab. Prices are the store's menu price before up-charges.</p>` : ""}
      ${CT.ui.costTab === "upcharges" ? upT : ""}
      ${CT.ui.costTab === "byo" ? byoCalc(R, M) : ""}
      ${CT.ui.costTab === "history" ? hist : ""}
      ${CT.ui.costTab === "nutrition" ? (nut || `<p class="hint">No calories per portion in the components file, so there is nothing to reconcile. Add a <code>calories</code> column to components.csv and <code>menu_calories</code> to items.csv.</p>`) : ""}`;
  }
  // cost any build-your-own order from its modifiers (C7)
  function byoCalc(R, M) {
    const parts = CT.ui.byoCalc; const line = CT.ui.byoLine || [...M.byoByLine.keys()][0] || "Bowls"; const byoId = M.byoByLine.get(line);
    const base = byoId ? M.itemPrice(byoId, R.refStore) : 0; const c = CM.costOf(M, parts, R.refStore, R.refDate, liveScn());
    const ups = c.parts.reduce((a, p) => a + p.upcharge * p.portions, 0); const price = base + ups; const pkgIn = M.pkg(line, "in_store"), pkgDig = M.pkg(line, "app");
    return `<div class="ops-two">
      <div class="ct-editor">
        <div class="sub" style="margin-top:0">Build an order</div>
        <div class="ct-row">${sel("byoLine", M.lines.filter(l => M.byoByLine.has(l)).map(l => [l, l]).concat(M.byoByLine.size ? [] : [[line, line]]), line)}<span class="hint">base ${$(base)}</span></div>
        <div class="ct-row">${sel("byoPick", [["", "— add a component —"]].concat(compOptions(M)), "")}<input type="number" data-set="byoQty" value="${CT.ui.byoQty || 1}" step="0.25" min="0.25" style="width:64px" aria-label="Portions"><button class="linkbtn" data-act="byoAdd">Add</button></div>
        <div class="ct-list">${parts.map((p, i) => `<div><span>${esc(M.comps.get(p.cid).name)} <span class="hint">×${p.portions}${M.comps.get(p.cid).upcharge ? " · +" + $(M.comps.get(p.cid).upcharge) : ""}</span></span><button class="linkbtn" data-act="byoRm:${i}" aria-label="Remove">✕</button></div>`).join("") || `<p class="hint">Pick components to cost an order, including doubles (×2), half-and-half mains (×0.5) and the free quarter pita (×0.25).</p>`}</div>
        ${parts.length ? `<button class="linkbtn" data-act="byoClear">Clear</button>` : ""}
      </div>
      <div><div class="ops-tiles">
        ${tile($(c.food), "food cost of this build")}${tile($(price), `price: base + ${$(ups)} up-charges`)}${tile(pf(price ? c.food / price * 100 : null), "food cost %", null, price && c.food / price * 100 > R.scope.target ? "pc-hi" : "")}${tile($(price - c.food - pkgIn), "contribution dine-in")}${tile($(price - c.food - pkgDig), "contribution digital")}
      </div>
      ${c.parts.length ? table("byo-build", [{ k: "name", l: "Component" }, { k: "station", l: "Station" }, { k: "portions", l: "Portions", n: 1 }, { k: "unit", l: "Portion cost", n: 1, f: $ }, { k: "cost", l: "Cost", n: 1, f: $ }, { k: "upcharge", l: "Up-charge", n: 1, f: v => v ? $(v) : "—" }], c.parts, { name: "build-cost" }) : ""}
      <p class="hint">Costs the order exactly as the modifiers file would: every component picked, times its portions, at the cost in force. The same engine prices every build-your-own line in the sales data.</p></div>
    </div>`;
  }

  /* ---------- Sales tab ---------- */
  function tabSales(R, M) {
    if (!R.hasSales) return `<p class="empty">No sales in this scope. Load a sales file (and modifiers for build-your-own orders), or widen the store and month filters.</p>`;
    const T = R.totals; const t = R.scope.target;
    const byoShare = T.meals ? R.byo.orders / T.meals : 0;
    const kpis = `<div class="ops-tiles">
      ${tile($k(T.rev), "net sales in scope", `<b>Sales</b>` + ttRows([["Orders", nf(T.orders)], ["Units", nf(T.units)], ["Meals", nf(T.meals)], ["Average order", $(T.aov)]]) + srcTag())}
      ${tile(pf(T.fc), "mix-weighted food cost", `<b>Theoretical food cost</b><div class="tt-k">Cost of what sold ÷ what it sold for</div>` + ttRows([["Food", $0(T.cogs)], ["Packaging & paper", $0(T.pkg)], ["Food + paper", pf(T.fcAll)]]) + srcTag(), T.fc > t ? "pc-hi" : "")}
      ${tile($k(T.gp), "gross profit after food & paper", `<b>Gross profit</b>` + ttRows([["Sales", $0(T.rev)], ["Food", "−" + $0(T.cogs)], ["Paper", "−" + $0(T.pkg)]]) + srcTag())}
      ${tile(pf(byoShare * 100, 0), "of meals are build-your-own", `<b>Build-your-own</b>` + ttRows([["Orders", nf(R.byo.orders)], ["Avg components", n1(R.byo.avgComponents)], ["Distinct builds", nf(R.byo.distinctBuilds)]]) + srcTag())}
      ${tile($(T.aov), "average order", `<b>Average order value</b>` + ttRows(R.byChannel.map(c => [CH_LABEL[c.channel], $(c.aov)])) + srcTag())}
    </div>`;
    // food cost by store × month
    const months = R.byMonth.map(m => m.month);
    const smRows = R.byStore.map(s => { const row = { store: s.name, fc: s.fc, rev: s.rev, orders: s.orders }; months.forEach(m => { const a = R.byStoreMonth.get(s.store + "|" + m); row[m] = a ? a.fc : null; }); return row; });
    const smT = table("fc-store-month", [{ k: "store", l: "Store", f: v => `<b style="font-weight:600">${esc(v)}</b>` }].concat(months.map(m => ({ k: m, l: monthName(m), n: 1, f: v => pf(v), cls: r => r[m] > t ? "pc-hi" : "" }))).concat([{ k: "fc", l: "All months", n: 1, f: pf, cls: r => r.fc > t ? "pc-hi" : "" }, { k: "rev", l: "Sales", n: 1, f: $k }, { k: "orders", l: "Orders", n: 1, f: nf }]), smRows, { title: "Theoretical food cost % · by store and month", name: "food-cost-by-store-month" });
    const lineT = table("fc-line", [{ k: "line", l: "Menu line" }, { k: "units", l: "Units", n: 1, f: nf }, { k: "rev", l: "Sales", n: 1, f: $k }, { k: "fc", l: "Food cost %", n: 1, f: pf, cls: r => r.fc > t ? "pc-hi" : "" }, { k: "fcAll", l: "With paper", n: 1, f: pf }, { k: "gp", l: "Gross profit", n: 1, f: $k }], R.byLine.slice().sort((a, b) => b.rev - a.rev), { title: "By menu line", name: "food-cost-by-line" });
    // menu engineering
    const meals = R.itemList.filter(x => !x.addon && !x.byo && x.units > 0);
    const W = 600, H = 280, L = 44, Rm = 12, Tm = 14, B = 30;
    const xMax = Math.max(1, d3.max(meals, x => x.units) * 1.05), yLo = Math.min(0, d3.min(meals, x => x.cmUnit) || 0), yHi = Math.max(1, (d3.max(meals, x => x.cmUnit) || 1) * 1.1);
    const sx = v => L + v / xMax * (W - L - Rm), sy = v => Tm + (1 - (v - yLo) / (yHi - yLo)) * (H - Tm - B);
    const me = R.me.meals;
    const scatter = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block" role="img" aria-label="Menu engineering matrix">
      <rect x="${sx(me.pop)}" y="${Tm}" width="${Math.max(0, W - Rm - sx(me.pop))}" height="${Math.max(0, sy(me.cm) - Tm)}" fill="var(--teal-soft)" opacity=".7"></rect>
      ${d3.ticks(yLo, yHi, 5).map(v => `<line x1="${L}" x2="${W - Rm}" y1="${sy(v)}" y2="${sy(v)}" stroke="var(--line)"></line><text x="${L - 6}" y="${sy(v) + 4}" text-anchor="end" font-size="11" style="fill:var(--muted);font-family:var(--mono)">$${v}</text>`).join("")}
      ${d3.ticks(0, xMax, 5).map(v => `<text x="${sx(v)}" y="${H - 10}" text-anchor="middle" font-size="11" style="fill:var(--muted);font-family:var(--mono)">${nf(v)}</text>`).join("")}
      <line x1="${sx(me.pop)}" x2="${sx(me.pop)}" y1="${Tm}" y2="${H - B}" stroke="var(--ink)" stroke-dasharray="4 4" opacity=".5"></line><line x1="${L}" x2="${W - Rm}" y1="${sy(me.cm)}" y2="${sy(me.cm)}" stroke="var(--ink)" stroke-dasharray="4 4" opacity=".5"></line>
      <text x="${W - Rm - 6}" y="${Tm + 14}" text-anchor="end" font-size="12" font-weight="650" style="fill:var(--teal)">Stars</text><text x="${L + 6}" y="${Tm + 14}" font-size="12" font-weight="650" style="fill:var(--f-sweet)">Puzzles</text><text x="${W - Rm - 6}" y="${H - B - 8}" text-anchor="end" font-size="12" font-weight="650" style="fill:var(--warn)">Plowhorses</text><text x="${L + 6}" y="${H - B - 8}" font-size="12" font-weight="650" style="fill:var(--muted)">Dogs</text>
      ${meals.map(x => `<circle cx="${sx(x.units).toFixed(1)}" cy="${sy(x.cmUnit).toFixed(1)}" r="5.5" fill="${QCOL[x.quadrant]}" fill-opacity=".85" stroke="var(--surface)" ${tipAttr(`<b>${esc(x.name)}</b> <span class="tt-k">${esc(x.line)}</span>` + ttRows([["Units", nf(x.units)], ["Avg paid", $(x.avgPrice)], ["Contribution / unit", $(x.cmUnit)], ["Food cost %", pf(x.fcSold)], ["Quadrant", x.quadrant], ["Reading", x.read]]) + srcTag())}></circle>`).join("")}
    </svg>`;
    const qCount = Object.fromEntries(Object.keys(QCOL).map(k => [k, meals.filter(x => x.quadrant === k)]));
    const meT = table("menu-engineering", [{ k: "name", l: "Item", f: v => `<b style="font-weight:600">${esc(v)}</b>` }, { k: "line", l: "Line" }, { k: "units", l: "Units", n: 1, f: nf }, { k: "share", l: "Mix", n: 1, f: v => pf(v * 100) }, { k: "avgPrice", l: "Avg paid", n: 1, f: $ }, { k: "unitCost", l: "Cost", n: 1, f: $ }, { k: "fcSold", l: "Food cost %", n: 1, f: pf, cls: r => r.fcSold > t ? "pc-hi" : "" }, { k: "cmUnit", l: "Contribution", n: 1, f: $ }, { k: "cmTotal", l: "Total contribution", n: 1, f: $k }, { k: "quadrant", l: "Quadrant", f: v => v ? `<span class="flag" style="background:${QCOL[v]}22;color:${QCOL[v]}">${v}</span>` : "—" }, { k: "read", l: "Reading" }],
      R.itemList.filter(x => x.units > 0).sort(CT.ui.salesSort === "units" ? (a, b) => b.units - a.units : CT.ui.salesSort === "cm" ? (a, b) => b.cmTotal - a.cmTotal : (a, b) => (b.fcSold || 0) - (a.fcSold || 0)), { title: "Every item sold · popularity and contribution", name: "menu-engineering", maxh: 380, tools: `<div class="controls">${[["units", "Most sold"], ["cm", "Most contribution"], ["fc", "Highest food cost"]].map(([k, l]) => `<button class="chip" data-act="ssort:${k}" aria-pressed="${CT.ui.salesSort === k}">${l}</button>`).join("")}</div>` });
    // build-your-own
    const byo = R.byo; const stations = [...new Set(byo.picks.map(p => p.station))];
    const pickBars = stations.map(st => { const ps = byo.picks.filter(p => p.station === st).slice(0, 8); const max = ps.length ? ps[0].byoPicks : 1; return `<div><div class="sub" style="margin:0 0 4px">${esc(st)} <span class="hint">${n1((byo.byStation.find(s => s.station === st) || { avgPerOrder: 0 }).avgPerOrder)} per order</span></div>${bars(ps.map(p => ({ ...p, tip: `<b>${esc(p.name)}</b>` + ttRows([["Picked in", pf(p.rate * 100) + " of builds"], ["Builds", nf(p.byoPicks)], ["Up-charge", p.upcharge ? $(p.upcharge) : "included"], ["Portion cost", $(p.cost)], ["Curated items using it", p.curated]]) + srcTag() })), { k: p => p.byoPicks, label: p => p.name, max, color: p => `var(--f-${p.fam === "other" || p.fam === "packaging" ? "sweet" : p.fam})`, fmt: v => pf(v / (byo.orders || 1) * 100, 0) })}</div>`; }).join("");
    const buildsT = table("top-builds", [{ k: "n", l: "Orders", n: 1, f: nf }, { k: "label", l: "Build", f: (v, r) => `<span style="font-size:12.5px">${esc(v)}</span>` }, { k: "avgPrice", l: "Avg paid", n: 1, f: $ }, { k: "unitCost", l: "Cost", n: 1, f: $ }, { k: "fc", l: "Food cost %", n: 1, f: pf, cls: r => r.fc > t ? "pc-hi" : "" }, { k: "nearest", l: "Nearest curated item", f: (v, r) => v ? `${esc(v.name)} <span class="hint">${pf(r.sim * 100, 0)} alike</span>` : "—", raw: r => r.nearest ? r.nearest.name : "" }], byo.builds.slice(0, 20), { title: `Most common full builds · ${nf(byo.distinctBuilds)} distinct builds in ${nf(byo.orders)} build-your-own orders`, name: "top-builds", maxh: 360 });
    const offT = table("off-menu", [{ k: "n", l: "Orders", n: 1, f: nf }, { k: "perStoreWeek", l: "Per store-week", n: 1, f: n1 }, { k: "label", l: "Build guests make themselves", f: v => `<span style="font-size:12.5px">${esc(v)}</span>` }, { k: "avgPrice", l: "Avg paid", n: 1, f: $ }, { k: "unitCost", l: "Cost", n: 1, f: $ }, { k: "fc", l: "Food cost %", n: 1, f: pf }, { k: "priceFor", l: `Price for ${t}%`, n: 1, f: $ }, { k: "nearest", l: "Closest on menu", f: (v, r) => v ? `${esc(v.name)} <span class="hint">${pf(r.sim * 100, 0)}</span>` : "—", raw: r => r.nearest ? r.nearest.name : "" }], byo.offMenu, { title: "Combinations not on the menu · frequent builds no curated item offers (less than 80% alike)", name: "off-menu-candidates", maxh: 360, note: "Candidates for new curated items: guests already order them, the components are already on the line, and the cost is known." });
    const canT = table("cannibalization", [{ k: "name", l: "Curated item" }, { k: "line", l: "Line" }, { k: "units", l: "Units sold", n: 1, f: nf }, { k: "lookalikes", l: "Look-alike builds", n: 1, f: nf }, { k: "ratio", l: "Overlap", n: 1, f: v => pf(v * 100, 0) }, { k: "read", l: "Reading" }], byo.cannibal, { title: "Cannibalization check · does each curated item replace a near-identical build-your-own order?", name: "cannibalization", maxh: 320, note: "Look-alike builds share at least 75% of their components with the curated recipe. A high overlap means the item mostly gives a name to what guests already build; a low one means it brings demand the line was not getting." });
    // attach rates
    const AL = R.attach.lines; const chs = ["all"].concat(M.channels); const ach = CT.ui.attachCh || "all";
    const heat = css("--heat");
    const attT = `<div class="ct-block"><div class="ct-head"><div class="sub">Add-on attach rates · share of orders with this meal that also hold a side, drink or dessert</div><div class="ct-tools"><div class="controls">${chs.map(c => `<button class="chip" data-act="ach:${c}" aria-pressed="${ach === c}">${c === "all" ? "All channels" : CH_LABEL[c]}</button>`).join("")}</div><button class="linkbtn" data-act="csv:attach">⤓ CSV</button></div></div>
      <div class="scroll"><table class="heat"><thead><tr><th>Meal</th><th>Orders</th>${AL.map(l => `<th>${esc(l)}</th>`).join("")}<th>Any add-on</th></tr></thead><tbody>${R.attach.meals.slice(0, 16).map(a => { const src = ach === "all" ? { n: a.n, rates: a.rates } : (a.byChannel[ach] || { n: 0, rates: {} }); return `<tr><th>${esc(a.name)}</th><td style="font-family:var(--mono);font-size:11.5px">${nf(src.n)}</td>${AL.map(l => { const v = src.rates[l] || 0; return `<td ${tipAttr(`<b>${esc(a.name)} + ${esc(l)}</b>` + ttRows([["Orders with both", pf(v * 100)], ["Orders with the meal", nf(src.n)]]) + `<div class="tt-k" style="margin-top:4px">Most attached</div>` + ttList(a.top.map(x => `${esc(x.name)} <span class="tt-k">${pf(x.rate * 100, 0)}</span>`), 5) + srcTag())} style="background:rgba(${heat},${(0.06 + v * 1.6).toFixed(2)});color:${v > 0.4 ? "#fff" : "var(--ink)"}">${pf(v * 100, 0)}</td>`; }).join("")}<td style="font-family:var(--mono);font-size:11.5px">${ach === "all" ? pf(a.anyRate * 100, 0) : "—"}</td></tr>`; }).join("")}</tbody></table></div></div>`;
    CT.exports.set("attach", { name: "attach-rates", cols: [{ k: "name", l: "Meal" }, { k: "n", l: "Orders" }].concat(AL.map(l => ({ k: l, l }))).concat([{ k: "anyRate", l: "Any add-on" }]), rows: R.attach.meals.map(a => Object.assign({ name: a.name, n: a.n, anyRate: a.anyRate }, Object.fromEntries(AL.map(l => [l, a.rates[l]])))) });
    // channel, daypart, dow
    const chT = table("channels", [{ k: "channel", l: "Channel", f: v => CH_LABEL[v] }, { k: "orders", l: "Orders", n: 1, f: nf }, { k: "rev", l: "Sales", n: 1, f: $k }, { k: "aov", l: "Avg order", n: 1, f: $ }, { k: "fc", l: "Food cost %", n: 1, f: pf }, { k: "pkg", l: "Paper", n: 1, f: $k }, { k: "fcAll", l: "With paper", n: 1, f: pf }], R.byChannel, { title: "Channel split", name: "channel-split" });
    const cpT = R.channelPrices.length ? table("channel-prices", [{ k: "name", l: "Item" }].concat(M.channels.map(c => ({ k: c, l: CH_LABEL[c], n: 1, f: (v, r) => v == null ? "—" : $(v) + (c !== "in_store" && r.in_store ? ` <span class="hint">${sgn((v - r.in_store) / r.in_store * 100, x => x.toFixed(0) + "%")}</span>` : "") }))), R.channelPrices.slice(0, 40), { title: "Price differences by channel · average paid per unit", name: "channel-prices", maxh: 260 }) : "";
    const dpT = R.byDaypart.length > 1 ? table("daypart", [{ k: "daypart", l: "Daypart", f: cap }, { k: "orders", l: "Orders", n: 1, f: nf }, { k: "rev", l: "Sales", n: 1, f: $k }, { k: "fc", l: "Food cost %", n: 1, f: pf }, { k: "aov", l: "Avg order", n: 1, f: $ }], R.byDaypart, { title: "Daypart", name: "daypart" }) : `<p class="hint">No time column in sales, so dayparts are off.</p>`;
    const dowT = table("dow", [{ k: "dow", l: "Day" }, { k: "orders", l: "Orders", n: 1, f: nf }, { k: "rev", l: "Sales", n: 1, f: $k }, { k: "fc", l: "Food cost %", n: 1, f: pf }, { k: "aov", l: "Avg order", n: 1, f: $ }], R.byDow, { title: "Day of week", name: "day-of-week" });
    const drT = table("drivers", [{ k: "name", l: "Item" }, { k: "line", l: "Line" }, { k: "n", l: "Orders", n: 1, f: nf }, { k: "aovWith", l: "Order value with it", n: 1, f: $ }, { k: "aovWithout", l: "Without it", n: 1, f: $ }, { k: "lift", l: "Lift", n: 1, f: v => sgn(v, $), cls: r => r.lift < 0 ? "pc-hi" : "" }], R.drivers.slice(0, 15), { title: "Spend per order · items whose orders are larger than the rest", name: "order-drivers", maxh: 300, note: "Correlation, not cause: a salmon bowl sits in bigger orders partly because it costs more. Compare items of a similar price." });
    return `${kpis}
      <div class="controls seg" style="margin-top:4px">${[["mix", "Food cost by store"], ["me", "Menu engineering"], ["byo", "Build-your-own"], ["attach", "Attach & orders"], ["channel", "Channel & daypart"]].map(([k, l]) => `<button class="chip" data-act="stab:${k}" aria-pressed="${(CT.ui.salesTab || "mix") === k}">${l}</button>`).join("")}</div>
      ${(CT.ui.salesTab || "mix") === "mix" ? smT + lineT + `<p class="hint">Theoretical food cost = cost of every unit sold (recipes for curated items, modifiers for build-your-own, at the cost in force on the day) ÷ net sales. Books will sit above this by the waste and over-portioning gap; the Reconcile tab measures it.</p>` : ""}
      ${CT.ui.salesTab === "me" ? `<div class="ops-two"><div>${chart("me-chart", "Menu engineering · popularity × contribution per item (curated meals)", scatter, `Popular = at least 70% of an equal share of meal units (${nf(me.pop)}); profitable = contribution above the sales-weighted average (${$(me.cm)}). Kasavana & Smith's standard reading.`)}<div class="swatch-legend">${Object.entries(QCOL).map(([k, c]) => `<span><i class="dot" style="background:${c}"></i>${k}s ${qCount[k].length}</span>`).join("")}</div></div>${meT}</div>` : ""}
      ${CT.ui.salesTab === "byo" ? (byo.orders ? `<div class="ops-tiles">${tile(nf(byo.orders), "build-your-own orders")}${tile(n1(byo.avgComponents), "components per order")}${tile(nf(byo.distinctBuilds), "distinct builds")}${tile(pf(byo.builds.length ? byo.builds[0].n / byo.orders * 100 : null), "share of the single most common build")}</div><div class="ct-block"><div class="sub">Pick rates · share of build-your-own orders that include each component</div><div class="ct-pick-grid">${pickBars}</div></div>${buildsT}${offT}${canT}` : `<p class="empty">No build-your-own orders with modifiers in scope. Load modifiers.csv to see pick rates, builds and candidates.</p>`) : ""}
      ${CT.ui.salesTab === "attach" ? attT + drT : ""}
      ${CT.ui.salesTab === "channel" ? chT + cpT + `<div class="ops-two">${dpT}${dowT}</div>` : ""}`;
  }

  /* ---------- Scenarios tab ---------- */
  function tabScenarios(R0, M) {
    const S = CT.scn; const scn = liveScn(); const R = scn ? results(scn) : R0;
    const t = R0.scope.target; const compsOpt = compOptions(M); const itemsOpt = itemOptions(M, i => !i.byo); const allItemsOpt = itemOptions(M);
    const name = cid => (M.comps.get(cid) || { name: cid }).name, iname = iid => (R.items.get(iid) || M.items.get(iid) || { name: iid }).name;
    const chip = (label, act) => `<span class="ct-chip">${label}<button class="linkbtn" data-act="${act}" aria-label="Remove">✕</button></span>`;
    const section = (key, title, body, count) => `<details class="ct-sec" ${CT.ui.open === key || count ? "open" : ""}><summary>${title}${count ? ` <span class="zp">${count}</span>` : ""}</summary><div class="ct-sec-body">${body}</div></details>`;
    const ups = [...M.comps.values()].filter(c => c.upcharge > 0 || S.upcharges[c.id] != null);
    const NI = CT.ui.newItem; const niCost = CM.costOf(M, NI.recipe, R0.refStore, R0.refDate, scn); const niPrice = +NI.price || 0; const cu = R0.crossUtil(NI.recipe);
    const editor = `<div class="ct-editor">
      <div class="ct-row"><input type="text" data-set="scnName" value="${esc(S.name)}" placeholder="Scenario name" style="flex:1"><button class="linkbtn" data-act="scnSave">Save</button><button class="linkbtn" data-act="scnReset">Reset</button></div>
      ${section("cost", "Commodity cost changes", `<div class="ct-row">${sel("costPick", [["", "— component —"]].concat(compsOpt), CT.ui.costPick || "")}<input type="number" data-set="costVal" value="${CT.ui.costVal == null ? 15 : CT.ui.costVal}" step="1" style="width:70px" aria-label="Change">${sel("costMode", [["pct", "% change"], ["abs", "$ per portion"]], CT.ui.costMode || "pct")}<button class="linkbtn" data-act="costAdd">Add</button></div><div class="ct-chips">${Object.entries(S.costPct).map(([c, v]) => chip(`${esc(name(c))} ${sgn(v, x => x + "%")}`, `costRm:${c}`)).join("")}${Object.entries(S.costAbs).map(([c, v]) => chip(`${esc(name(c))} → ${$(v)}`, `costRmAbs:${c}`)).join("")}</div>`, Object.keys(S.costPct).length + Object.keys(S.costAbs).length)}
      ${section("price", "Repricing", `<div class="ct-row">${sel("pricePick", [["", "— item —"]].concat(allItemsOpt), CT.ui.pricePick || "")}<input type="number" data-set="priceVal" value="${CT.ui.priceVal == null ? "" : CT.ui.priceVal}" step="0.05" style="width:80px" placeholder="new $" aria-label="New price"><button class="linkbtn" data-act="priceAdd">Add</button></div><div class="ct-chips">${Object.entries(S.prices).map(([i, v]) => chip(`${esc(iname(i))} ${$(M.itemPrice(i, R0.refStore))} → ${$(v)}`, `priceRm:${i}`)).join("")}</div>
        <div class="ct-row"><label class="hint">Demand response (elasticity)</label><input type="range" data-set="elasticity" min="-2" max="0" step="0.1" value="${S.elasticity}" style="width:120px"><output>${S.elasticity}</output></div><p class="hint">Units change by elasticity × price change: at −0.8, a 10% price rise loses 8% of units. Fast-casual estimates run −0.5 to −1.5; set 0 to see the price effect alone.</p>`, Object.keys(S.prices).length)}
      ${section("up", "Up-charge changes", `<div class="ct-row">${sel("upPick", [["", "— component —"]].concat(ups.map(c => [c.id, `${c.name} (now ${$(c.upcharge)})`])).concat([["__any", "Other component…"]]), CT.ui.upPick || "")}${CT.ui.upPick === "__any" ? sel("upPick2", [["", "— component —"]].concat(compsOpt), CT.ui.upPick2 || "") : ""}<input type="number" data-set="upVal" value="${CT.ui.upVal == null ? "" : CT.ui.upVal}" step="0.05" style="width:80px" placeholder="new $" aria-label="New up-charge"><button class="linkbtn" data-act="upAdd">Add</button></div><div class="ct-chips">${Object.entries(S.upcharges).map(([c, v]) => chip(`${esc(name(c))} ${$(M.comps.get(c).upcharge)} → ${$(v)}`, `upRm:${c}`)).join("")}</div>`, Object.keys(S.upcharges).length)}
      ${section("remove", "Remove items", `<div class="ct-row">${sel("rmPick", [["", "— item —"]].concat(itemsOpt), CT.ui.rmPick || "")}<button class="linkbtn" data-act="rmAdd">Remove</button></div><div class="ct-chips">${S.remove.map(i => chip(esc(iname(i)), `rmRm:${i}`)).join("")}</div>
        <div class="ct-row"><label class="hint">Share of its volume that moves to other items on the line</label><input type="range" data-set="retention" min="0" max="1" step="0.05" value="${S.retention}" style="width:120px"><output>${Math.round(S.retention * 100)}%</output></div>`, S.remove.length)}
      ${section("swap", "Swap a component", `<div class="ct-row">${sel("swapFrom", [["", "— replace —"]].concat(compsOpt), CT.ui.swapFrom || "")}<span class="hint">with</span>${sel("swapTo", [["", "— component —"]].concat(compsOpt), CT.ui.swapTo || "")}<button class="linkbtn" data-act="swapAdd">Add</button></div><div class="ct-chips">${S.swaps.map((s, i) => chip(`${esc(name(s.from))} → ${esc(name(s.to))}`, `swapRm:${i}`)).join("")}</div><p class="hint">Applies to every recipe and every build-your-own order that used it, keeping the portions.</p>`, S.swaps.length)}
      ${section("new", "New item or limited-time offer", `<div class="ct-row"><input type="text" data-set="niName" value="${esc(NI.name)}" placeholder="Item name" style="flex:1">${sel("niLine", M.lines.filter(l => !M.addonLines.has(l)).map(l => [l, l]), NI.line)}<input type="number" data-set="niPrice" value="${NI.price}" step="0.05" style="width:80px" aria-label="Price"></div>
        <div class="ct-row">${sel("niPick", [["", "— add a component —"]].concat(compsOpt), "")}<input type="number" data-set="niQty" value="${CT.ui.niQty || 1}" step="0.25" min="0.25" style="width:64px" aria-label="Portions"><button class="linkbtn" data-act="niAdd">Add</button></div>
        <div class="ct-list">${NI.recipe.map((p, i) => `<div><span>${esc(name(p.cid))} <span class="hint">×${p.portions} · ${$(niCost.parts[i] ? niCost.parts[i].cost : 0)}</span></span><button class="linkbtn" data-act="niRm:${i}" aria-label="Remove">✕</button></div>`).join("") || `<p class="hint">Assemble it from existing components, or add a new component on the Data tab first.</p>`}</div>
        <div class="ct-mini">${tile($(niCost.food), "food cost")}${tile(pf(niPrice ? niCost.food / niPrice * 100 : null), "food cost % at " + $(niPrice), null, niPrice && niCost.food / niPrice * 100 > t ? "pc-hi" : "")}${tile($(CM.priceFor(niCost.food, t)), `price for ${t}%`)}${tile(cu.score == null ? "—" : pf(cu.score * 100, 0), "cross-utilization", `<b>Components already at volume</b>` + ttRows([["At volume", `${cu.atVolume} of ${cu.components}`], ["New prep load", cu.newLoad.length ? cu.newLoad.join(", ") : "none"]]))}</div>
        <div class="ct-row"><label class="hint">Expected units per store-week</label><input type="number" data-set="niUnits" value="${NI.units}" min="0" style="width:70px"><label class="hint">pulled from the line</label><input type="number" data-set="niCannibal" value="${NI.cannibal}" min="0" max="100" style="width:60px"><span class="hint">%</span><label class="hint">LTO weeks</label><input type="number" data-set="niWeeks" value="${NI.weeks}" min="1" style="width:60px" placeholder="all"></div>
        <div class="ct-row"><button class="linkbtn" data-act="niAddItem" ${NI.recipe.length && NI.name ? "" : "disabled"}>Add to scenario</button><span class="hint">Volume beyond the pulled share is new demand. An LTO runs for the weeks given, then stops.</span></div>
        <div class="ct-chips">${S.newItems.map((n, i) => chip(`${esc(n.name)} · ${$(n.price)} · ${n.unitsPerStoreWeek}/store-week${n.weeks ? " · " + n.weeks + " wk" : ""}`, `niRmItem:${i}`)).join("")}</div>`, S.newItems.length)}
      ${section("unavail", "Supply disruption", `<div class="ct-row">${sel("unPick", [["", "— component unavailable —"]].concat(compsOpt), CT.ui.unPick || "")}<button class="linkbtn" data-act="unAdd">Add</button></div><div class="ct-chips">${S.unavailable.map(c => chip(esc(name(c)), `unRm:${c}`)).join("")}</div>`, S.unavailable.length)}
    </div>`;
    // results
    const d = (a, b) => a - b; const T0 = R0.totals, T1 = R.totals;
    const kpi = (label, v0, v1, f, inv) => { const dv = v1 - v0; const good = inv ? dv < 0 : dv > 0; return tile(`${f(v1)}`, `${label} <span class="${Math.abs(dv) < 1e-9 ? "hint" : good ? "ct-up" : "ct-down"}">${f === pf ? pts(dv) : sgn(dv, f)}</span>`, `<b>${label}</b>` + ttRows([["Base", f(v0)], ["Scenario", f(v1)]])); };
    const resHead = scn ? `<div class="ops-tiles">${kpi("Net sales", T0.rev, T1.rev, $k)}${kpi("Food cost", T0.cogs, T1.cogs, $k, true)}${kpi("Food cost %", T0.fc, T1.fc, pf, true)}${kpi("Gross profit", T0.gp, T1.gp, $k)}${kpi("Units", T0.units, T1.units, nf)}</div>` : `<p class="hint">Add a change on the left to see its effect on every item, the up-charges and the mix-weighted food cost. The base is the current scope${R0.hasSales ? "" : " (no sales loaded, so volumes are not available)"}.</p>`;
    const rows = scn ? [...R.items.values()].map(x => { const b = R0.items.get(x.id); return { id: x.id, name: x.name + (x.isNew ? " (new)" : "") + (x.removed ? " (removed)" : ""), line: x.line, units0: b ? b.units : 0, units1: x.removed ? 0 : x.units, price0: b ? b.price : null, price1: x.price, food0: b ? b.food : null, food1: x.food, fc0: b ? b.fc : null, fc1: x.fc, gp0: b ? b.rev - b.cogs : 0, gp1: x.removed ? 0 : x.rev - x.cogs }; }).map(r => Object.assign(r, { dgp: r.gp1 - r.gp0, dfc: r.fc1 != null && r.fc0 != null ? r.fc1 - r.fc0 : null })).filter(r => Math.abs(r.dgp) > 0.5 || (r.dfc != null && Math.abs(r.dfc) > 0.05) || Math.abs(r.units1 - r.units0) > 0.5).sort((a, b) => Math.abs(b.dgp) - Math.abs(a.dgp)) : [];
    const itemT = scn ? table("scenario-items", [{ k: "name", l: "Item" }, { k: "line", l: "Line" }, { k: "price1", l: "Price", n: 1, f: (v, r) => r.price0 != null && Math.abs(r.price0 - v) > 0.001 ? `${$(r.price0)} → ${$(v)}` : $(v) }, { k: "food1", l: "Food cost", n: 1, f: (v, r) => r.food0 != null && Math.abs(r.food0 - v) > 0.001 ? `${$(r.food0)} → ${$(v)}` : $(v) }, { k: "fc1", l: "Food cost %", n: 1, f: (v, r) => `${pf(v)} <span class="hint">${pts(r.dfc)}</span>`, cls: r => r.fc1 > t ? "pc-hi" : "" }, { k: "units1", l: "Units", n: 1, f: (v, r) => `${nf(v)} <span class="hint">${sgn(v - r.units0, nf)}</span>` }, { k: "dgp", l: "Gross profit change", n: 1, f: v => sgn(v, $0), cls: r => r.dgp < 0 ? "pc-hi" : "" }], rows, { title: `Affected items · ${rows.length}`, name: "scenario-items", maxh: 380 }) : "";
    const upT = scn && R.upcharges.length ? table("scenario-up", [{ k: "name", l: "Up-charged component" }, { k: "upcharge", l: "Up-charge", n: 1, f: $ }, { k: "incremental", l: "Incremental cost", n: 1, f: $ }, { k: "margin", l: "Margin per add", n: 1, f: (v, r) => { const b = R0.upcharges.find(u => u.cid === r.cid); return b && Math.abs(b.margin - v) > 0.001 ? `${$(b.margin)} → ${$(v)}` : $(v); }, cls: r => r.margin < 0 ? "pc-hi" : "" }, { k: "picks", l: "Picks", n: 1, f: nf }, { k: "marginTotal", l: "Margin in scope", n: 1, f: $0 }], R.upcharges, { title: "Up-charges after the change", name: "scenario-upcharges" }) : "";
    const disT = R.disruption ? R.disruption.map(dd => `<div class="ct-block"><div class="sub">If ${esc(dd.name)} is unavailable</div><div class="ops-tiles">${tile($k(dd.revAtRisk), "sales touching it")}${tile(pf(dd.share * 100), "share of sales in scope")}${tile(dd.items.length, "curated items using it")}${tile(nf(dd.byoOrders), "build-your-own orders picking it")}</div>${table("disruption-" + dd.cid, [{ k: "name", l: "Curated item" }, { k: "units", l: "Units", n: 1, f: nf }, { k: "rev", l: "Sales", n: 1, f: $k }, { k: "share", l: "Share of sales", n: 1, f: v => pf(v * 100) }], dd.items, { name: "disruption-" + dd.cid })}</div>`).join("") : "";
    const ltoT = scn && S.newItems.length ? `<div class="ct-block"><div class="sub">New items in this scenario</div>${table("scenario-new", [{ k: "name", l: "Item" }, { k: "price", l: "Price", n: 1, f: $ }, { k: "food", l: "Food cost", n: 1, f: $ }, { k: "fc", l: "Food cost %", n: 1, f: pf }, { k: "units", l: "Projected units", n: 1, f: nf }, { k: "weeks", l: "Weeks", n: 1, f: v => n1(v) }, { k: "cannibal", l: "Pulled from line", n: 1, f: v => pf(v * 100, 0) }, { k: "rev", l: "Sales", n: 1, f: $k }, { k: "gp", l: "Gross profit", n: 1, f: $k }], S.newItems.map(n => { const x = R.items.get(n.id); return x ? { name: x.name, price: x.price, food: x.food, fc: x.fc, units: x.units, weeks: x.weeks, cannibal: x.cannibal, rev: x.rev, gp: x.rev - x.cogs } : null; }).filter(Boolean), { name: "scenario-new-items" })}</div>` : "";
    // saved and compare
    const savedT = CT.saved.length ? `<div class="ct-block"><div class="ct-head"><div class="sub">Saved scenarios · tick up to three to compare</div><div class="ct-tools">${CT.compare.size ? `<button class="linkbtn" data-act="cmpCsv">⤓ Comparison CSV</button><button class="linkbtn" data-act="cmpJson">⤓ Scenarios JSON</button>` : ""}</div></div>
      <div class="ct-saved">${CT.saved.map((s, i) => `<label class="ct-chip"><input type="checkbox" data-set="cmp:${i}" ${CT.compare.has(i) ? "checked" : ""}> ${esc(s.name)}<button class="linkbtn" data-act="scnLoad:${i}">Open</button><button class="linkbtn" data-act="scnDel:${i}" aria-label="Delete">✕</button></label>`).join("")}</div>
      ${CT.compare.size ? compareTable(R0) : ""}</div>` : "";
    const ladderT = table("ladder", [{ k: "name", l: "Item" }, { k: "line", l: "Line" }, { k: "price", l: "Price", n: 1, f: $ }, { k: "formula", l: "Base + up-charges", n: 1, f: (v, r) => `${$(v)} <span class="hint">${$(r.base)}${r.ups.map(u => " + " + $(u.up)).join("")}</span>` }, { k: "gap", l: "Gap", n: 1, f: v => sgn(v, $), cls: r => Math.abs(r.gap) >= 0.05 ? "pc-hi" : "" }, { k: "flag", l: "Reading", f: (v, r) => flag(v, v === "On the ladder" ? "ok" : "warn") + (r.overlap ? ` <span class="hint">same formula as ${esc(r.overlap.join(", "))}</span>` : "") }], R.ladder, { title: "Price ladder check · each curated item against the build-your-own base plus its up-charges", name: "price-ladder", maxh: 320, note: "A curated item below the ladder is cheaper than building it yourself; above it carries a premium. Items with the same formula but different prices overlap." });
    return `<div class="ct-grid scn"><div>${editor}${savedT}</div><div>${resHead}${itemT}${ltoT}${upT}${disT}${ladderT}</div></div>`;
  }
  function compareTable(R0) {
    const cols = [{ name: "Base", R: R0 }].concat([...CT.compare].slice(0, 3).map(i => CT.saved[i]).filter(Boolean).map(s => ({ name: s.name, R: results(s.scn) })));
    const rows = [["Net sales", r => $k(r.totals.rev)], ["Food cost", r => $k(r.totals.cogs)], ["Food cost %", r => pf(r.totals.fc)], ["With paper", r => pf(r.totals.fcAll)], ["Gross profit", r => $k(r.totals.gp)], ["Units", r => nf(r.totals.units)], ["Meals over target", r => r.itemList.filter(x => !x.addon && !x.byo && x.fc > r.scope.target).length], ["Up-charges with negative margin", r => r.upcharges.filter(u => u.margin < 0).length]];
    CT.exports.set("compare", { name: "scenario-comparison", cols: [{ k: "metric", l: "Metric" }].concat(cols.map((c, i) => ({ k: "c" + i, l: c.name }))), rows: rows.map(([l, f]) => Object.assign({ metric: l }, Object.fromEntries(cols.map((c, i) => ["c" + i, f(c.R)])))) });
    return `<div class="scroll"><table class="mini gtable"><thead><tr><th></th>${cols.map(c => `<th class="n">${esc(c.name)}</th>`).join("")}</tr></thead><tbody>${rows.map(([l, f]) => `<tr><td>${l}</td>${cols.map(c => `<td class="n">${f(c.R)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  }

  /* ---------- Operations tab ---------- */
  function tabOps(R, M) {
    const t = R.scope.target; const O = R.ops;
    const storeT = table("stores", [{ k: "name", l: "Store", f: (v, r) => `<b style="font-weight:600">${esc(v)}</b> <span class="hint">${esc(r.region)}</span>` }, { k: "orders", l: "Orders", n: 1, f: nf }, { k: "rev", l: "Sales", n: 1, f: $k }, { k: "aov", l: "Avg order", n: 1, f: $ }, { k: "fc", l: "Food cost %", n: 1, f: pf, cls: r => r.fc > t ? "pc-hi" : "" }, { k: "fcAll", l: "With paper", n: 1, f: pf }, { k: "gp", l: "Gross profit", n: 1, f: $k }, { k: "trend", l: "Food cost by month", f: (v, r) => { const s = O.trend.stores.find(x => x.store === r.store); return s ? spark(s.points) : ""; }, raw: r => { const s = O.trend.stores.find(x => x.store === r.store); return s ? s.points.map(p => p == null ? "" : p.toFixed(1)).join(" | ") : ""; } }], R.byStore, { title: "Stores side by side", name: "stores" });
    const regT = O.regional.items.length ? table("regional-items", [{ k: "name", l: "Item" }, { k: "line", l: "Line" }, { k: "units", l: "Units", n: 1, f: nf }, { k: "stores", l: "Sold at", f: v => esc(v.join(", ")), raw: r => r.stores.join("; ") }], O.regional.items, { title: "Regional items · sold at some stores only", name: "regional-items", maxh: 220 }) : "";
    const priceT = O.regional.prices.length ? table("store-prices", [{ k: "name", l: "Item" }, { k: "line", l: "Line" }, { k: "base", l: "Default price", n: 1, f: $ }, { k: "stores", l: "Store prices", f: v => v.map(s => `${esc(s.name)} ${$(s.price)}`).join(" · "), raw: r => r.stores.map(s => `${s.name}: ${s.price}`).join("; ") }], O.regional.prices, { title: "Regional pricing · items with a store-specific price", name: "store-prices", maxh: 260 }) : "";
    const prepT = table("prep-load", [{ k: "name", l: "Item", f: (v, r) => `<b style="font-weight:600">${esc(v)}</b>${r.isNew ? ' <span class="zp">new</span>' : ""}` }, { k: "line", l: "Line" }, { k: "components", l: "Components", n: 1 }, { k: "stations", l: "Stations", n: 1 }, { k: "steps", l: "Prep steps", n: 1, f: nf }, { k: "crossUtil", l: "Cross-utilization", n: 1, f: v => pf(v * 100, 0) }, { k: "exclusive", l: "Only this item needs", f: v => v.length ? esc(v.join(", ")) : "—", raw: r => r.exclusive.join("; ") }, { k: "units", l: "Units", n: 1, f: nf }], O.prep, { title: "Prep load per item · what each item makes the line carry", name: "prep-load", maxh: 380, note: "Prep steps add up each component's prep_steps (default 1). Cross-utilization is the share of an item's components that are already used at volume elsewhere (on 2+ curated items, or picked at least 20 portions per store-week on the line). “Only this item needs” lists components nothing else moves: the prep that disappears if the item does." });
    const cuItem = CT.ui.crossItem ? R.items.get(CT.ui.crossItem) : null; const cu = cuItem ? R.crossUtil(cuItem.parts.map(p => ({ cid: p.cid, portions: p.portions }))) : null;
    const cuBox = `<div class="ct-block"><div class="sub">Cross-utilization check · any item or candidate</div><div class="ct-row">${sel("crossItem", [["", "— pick an item —"]].concat([...R.items.values()].filter(x => x.parts.length).map(x => [x.id, x.name + (x.isNew ? " (new)" : "")])), CT.ui.crossItem)}</div>${cu ? `<div class="ops-tiles">${tile(pf(cu.score * 100, 0), "of its components already run at volume")}${tile(cu.atVolume + " of " + cu.components, "components at volume")}${tile(cu.newLoad.length, "new prep items", cu.newLoad.length ? `<b>New prep</b>` + ttList(cu.newLoad.map(esc)) : "")}</div>` : `<p class="hint">Candidates built on the Scenarios tab show up here too.</p>`}</div>`;
    const wasteRows = O.waste.filter(w => w.wasteCost > 0 || (!O.hasWaste && w.perishable)).sort((a, b) => b.wasteCost - a.wasteCost || b.perStoreWeek - a.perStoreWeek);
    const wasteT = table("waste", [{ k: "name", l: "Component" }, { k: "station", l: "Station" }, { k: "perishable", l: "Perishable", f: v => v ? "yes" : v === false ? "no" : "—" }, { k: "usage", l: "Theoretical use", n: 1, f: nf }, { k: "wasteQty", l: "Wasted portions", n: 1, f: nf }, { k: "wastePct", l: "Waste %", n: 1, f: pf, cls: r => r.wastePct > 10 ? "pc-hi" : "" }, { k: "wasteCost", l: "Waste cost", n: 1, f: $0 }, { k: "wastePerWeek", l: "Per week", n: 1, f: $0 }, { k: "reasons", l: "Reasons", f: v => v.length ? v.slice(0, 3).map(([k, n]) => `${esc(k)} ${nf(n)}`).join(", ") : "—", raw: r => r.reasons.map(([k, n]) => k + ":" + n).join("; ") }], wasteRows, { title: O.hasWaste ? `Waste exposure · ${$0(O.wasteTotal)} logged in scope, ${pf(O.wastePctCogs)} of theoretical food cost` : "Waste exposure · perishable components (no waste log loaded)", name: "waste-exposure", maxh: 380, note: O.hasWaste ? "Waste cost = logged portions × portion cost at the time. Waste % is wasted ÷ (used + wasted)." : "Load waste.csv (store, date, component, portions) to replace the flat waste assumption with what the line actually throws out." });
    const lowT = table("low-movers", [{ k: "name", l: "Component" }, { k: "station", l: "Station" }, { k: "rate", l: "Pick rate", n: 1, f: v => pf(v * 100) }, { k: "perStoreWeek", l: "Portions per store-week", n: 1, f: n1 }, { k: "wasteCost", l: "Waste cost", n: 1, f: v => O.hasWaste ? $0(v) : "—" }, { k: "wastePct", l: "Waste %", n: 1, f: v => O.hasWaste ? pf(v) : "—" }], O.lowMovers, { title: "Low movers · station components under a 3% pick rate that no curated item uses", name: "low-movers", note: "Carrying cost shows when a waste log is loaded. These are the first candidates to cut, or to feature in a curated item." });
    const tvaT = O.hasInventory ? table("theoretical-actual", [{ k: "name", l: "Component" }, { k: "station", l: "Station" }, { k: "theoretical", l: "Theoretical use", n: 1, f: nf }, { k: "actual", l: "Actual use", n: 1, f: nf }, { k: "variance", l: "Variance", n: 1, f: v => sgn(v, nf) }, { k: "variancePct", l: "Variance %", n: 1, f: v => pf(v), cls: r => r.variancePct > 10 ? "pc-hi" : "" }, { k: "varianceCost", l: "At cost", n: 1, f: v => sgn(v, $0) }, { k: "read", l: "Reading" }], O.tva, { title: "Theoretical vs actual usage · portions implied by sales against inventory counts", name: "theoretical-vs-actual", maxh: 360, note: "Actual = beginning count + purchases − ending count. Over 10% above theoretical points at over-portioning or unlogged waste." }) : `<p class="hint">Load inventory.csv (begin, purchases, end per store, month and component) to compare usage implied by sales with what was actually used.</p>`;
    const trendT = O.trend.items.length ? table("trend", [{ k: "name", l: "Item" }, { k: "line", l: "Line" }, { k: "cmFirst", l: `Contribution ${monthName(O.trend.months[0])}`, n: 1, f: $ }, { k: "cmLast", l: monthName(O.trend.months[O.trend.months.length - 1]), n: 1, f: $ }, { k: "cmDelta", l: "Change", n: 1, f: v => sgn(v, $), cls: r => r.slipping ? "pc-hi" : "" }, { k: "fcDelta", l: "Food cost %", n: 1, f: (v, r) => `${pf(r.fcFirst)} → ${pf(r.fcLast)}` }, { k: "unitsLast", l: "Units", n: 1, f: (v, r) => `${nf(r.unitsFirst)} → ${nf(v)}` }, { k: "slipping", l: "", f: v => v ? flag("slipping", "warn") : "" }], O.trend.items, { title: `Trend · margin per item, first month against last (${O.trend.items.filter(x => x.slipping).length} slipping)`, name: "margin-trend", maxh: 360, note: "Slipping = contribution down more than 10¢ or food cost up more than 2 points. Cost versions and price changes both show here." }) : `<p class="hint">Trend needs at least two months in scope.</p>`;
    return `<div class="controls seg">${[["stores", "Stores & regions"], ["prep", "Prep load"], ["waste", "Waste & low movers"], ["tva", "Theoretical vs actual"], ["trend", "Trend"]].map(([k, l]) => `<button class="chip" data-act="otab:${k}" aria-pressed="${(CT.ui.opsTab || "stores") === k}">${l}</button>`).join("")}</div>
      ${(CT.ui.opsTab || "stores") === "stores" ? storeT + regT + priceT : ""}
      ${CT.ui.opsTab === "prep" ? prepT + cuBox : ""}
      ${CT.ui.opsTab === "waste" ? wasteT + lowT : ""}
      ${CT.ui.opsTab === "tva" ? tvaT : ""}
      ${CT.ui.opsTab === "trend" ? trendT : ""}`;
  }

  /* ---------- Reconcile tab ---------- */
  function tabRecon(R, M) {
    const rc = R.reconcile; const RC = CM.RECON;
    const tests = CM.selfTest(); const pass = tests.filter(x => x.ok).length;
    const verdictTile = tile(rc.overall || "—", `overall · ${rc.pass || 0} of ${rc.judged || 0} store-months pass`, null, rc.overall === "Pass" ? "" : rc.overall === "Fail" ? "pc-hi" : "");
    const rows = rc.rows || [];
    const tbl = table("reconcile", [{ k: "name", l: "Store" }, { k: "month", l: "Month", f: v => monthName(v) }, { k: "rev", l: "Sales (file)", n: 1, f: $0 }, { k: "books", l: "Sales (books)", n: 1, f: $0 }, { k: "coverage", l: "Costed", n: 1, f: v => v == null ? "—" : pf(v * 100) }, { k: "theo", l: "Theoretical %", n: 1, f: pf }, { k: "theoW", l: "+ logged waste", n: 1, f: pf }, { k: "actual", l: "Books %", n: 1, f: pf }, { k: "gap", l: "Gap", n: 1, f: pts, cls: r => r.verdict === "Fail" ? "pc-hi" : "" }, { k: "verdict", l: "Verdict", f: v => flag(v, VERDICT[v]) }, { k: "note", l: "Why", f: v => `<span class="hint">${esc(v || "")}</span>` }], rows, { title: "Theoretical food cost against the books · by store and month", name: "reconciliation", empty: rc.note || "Load actuals.csv (store, month, food cost from the P&L) to run the test." });
    return `<div class="ops-tiles">${verdictTile}${tile(pf(R.totals.fc), "theoretical food cost in scope")}${tile(pf(R.coverage * 100), "of sales costed", `<b>Coverage</b><div class="tt-k">Sales lines with a recipe or modifiers. Below ${RC.coverage * 100}% the test is not assessable.</div>`)}${tile(`${pass}/${tests.length}`, "hand-calculated test cases pass", `<b>Self-test</b>` + ttList(tests.map(x => `${x.ok ? "✓" : "✗"} ${esc(x.name)}`), 20), pass === tests.length ? "" : "pc-hi")}</div>
      ${tbl}
      <div class="ops-two">
        <div class="ct-block"><div class="sub">What counts as a pass · defined before the test</div>
          <ul class="ct-notes">
            <li><b>Coverage first.</b> At least ${RC.coverage * 100}% of the month's net sales must be costed (every item has a recipe, every build-your-own line has its modifiers). Otherwise the result is “not assessable”, not a fail.</li>
            <li><b>Sales must agree.</b> The sales file and the books must be within ${RC.salesTol * 100}% of each other for the month; if not, fix the extract before judging cost.</li>
            <li><b>Pass:</b> books food cost % is ${RC.pass[0]} to ${RC.pass[1]} points above theoretical. The books include waste, over-portioning and shrink; theoretical does not, so a small positive gap is the expected result.</li>
            <li><b>Review:</b> gap between ${RC.review[0]} and ${RC.pass[0]}, or between ${RC.pass[1]} and ${RC.review[1]} points. Check the waste log, portioning and whether purchases were cut off at month end.</li>
            <li><b>Fail:</b> theoretical above the books by more than 1 point (recipes, portions or costs are overstated) or the books more than ${RC.review[1]} points above theoretical (something is missing from costs or recipes, or there is a real usage problem).</li>
            <li>With a waste log loaded, “+ logged waste” shows how much of the gap the log already explains.</li>
          </ul></div>
        <div class="ct-block"><div class="sub">Method, in one paragraph</div>
          <p class="hint">Every sales line is costed from its recipe (curated items) or its modifiers (build-your-own) at the component cost in force on that day, after yield: portion cost = case cost ÷ (case size × yield) × portion size. Theoretical food cost % = that cost ÷ net sales. Packaging is tracked separately. Up-charge margins compare a premium main with the average included main. Scenarios re-run the same engine with changed costs, prices, recipes or volumes. Formulas and assumptions are written up in <code>docs/methodology.md</code>; the hand-calculated cases above are in <code>tests/costmodel.test.js</code> and run after every change.</p>
          <p class="hint">${CT.src === "sample" ? "The sample books were generated 6–7.5% above theoretical, so eight store-months pass by design and one (Clarendon, September) was made to fail, to show what a fail looks like." : "Your actuals file drives this table."}</p>
        </div>
      </div>`;
  }

  /* ---------- wiring ---------- */
  function setUI(k, v) { CT.ui[k] = v; }
  function act(a, el) {
    const [cmd, ...rest] = a.split(":"); const arg = rest.join(":"); const M = data().M;
    const rerender = () => render();
    switch (cmd) {
      case "tab": CT.tab = arg; return rerender();
      case "src": CT.src = arg; CT.cache.clear(); CT.scope = { stores: null, months: null, channel: "all", target: CT.scope.target }; return rerender();
      case "clear": if (confirm("Remove every loaded file, saved scenario and column mapping from this browser and go back to the sample data?")) clearAll(); return;
      case "store": { const all = [...M.stores.keys()]; const s = CT.scope.stores ? new Set(CT.scope.stores) : new Set(all); if (s.has(arg)) { if (s.size > 1) s.delete(arg); } else s.add(arg); CT.scope.stores = s.size === all.length ? null : s; return rerender(); }
      case "month": { const all = M.months; const s = CT.scope.months ? new Set(CT.scope.months) : new Set(all); if (s.has(arg)) { if (s.size > 1) s.delete(arg); } else s.add(arg); CT.scope.months = s.size === all.length ? null : s; return rerender(); }
      case "tpl": return download(CM.TEMPLATES[arg].file, CM.templateCSV(arg));
      case "sample": { const S = ensureSample(); const rows = S.files[arg] || []; return download("sample-" + CM.TEMPLATES[arg].file, CM.toCSV(rows, CM.TEMPLATES[arg].cols.map(c => c.k))); }
      case "dict": return showDict(arg);
      case "map": { const f = CT.files[+arg]; if (f) f.showMap = !f.showMap; return rerender(); }
      case "rmfile": CT.files.splice(+arg, 1); return rerender();
      case "use": return useOwnData();
      case "csv": return exportCSV(arg);
      case "png": { const svg = document.querySelector("#" + arg + " svg"); if (svg) exportPNG(svg, arg); return; }
      case "item": { const x = results(liveScn()).items.get(arg); if (x) showItem(x, M); return; }
      case "isort": setUI("itemSort", arg); return rerender();
      case "ssort": setUI("salesSort", arg); return rerender();
      case "ctab": setUI("costTab", arg); return rerender();
      case "stab": setUI("salesTab", arg); return rerender();
      case "otab": setUI("opsTab", arg); return rerender();
      case "ach": setUI("attachCh", arg); return rerender();
      case "byoAdd": { const cid = CT.ui.byoPick; if (cid && M.comps.has(cid)) { CT.ui.byoCalc.push({ cid, portions: +CT.ui.byoQty || 1 }); CT.ui.byoPick = ""; } return rerender(); }
      case "byoRm": CT.ui.byoCalc.splice(+arg, 1); return rerender();
      case "byoClear": CT.ui.byoCalc = []; return rerender();
      // scenario editor
      case "scnReset": CT.scn = blankScn(); return rerender();
      case "scnSave": { const name = CT.scn.name.trim() || "Scenario " + (CT.saved.length + 1); CT.scn.name = name; const i = CT.saved.findIndex(s => s.name === name); const rec = { name, scn: JSON.parse(JSON.stringify(CT.scn)), savedAt: new Date().toISOString() }; if (i >= 0) CT.saved[i] = rec; else CT.saved.push(rec); persistNow(); return rerender(); }
      case "scnLoad": CT.scn = JSON.parse(JSON.stringify(CT.saved[+arg].scn)); return rerender();
      case "scnDel": CT.saved.splice(+arg, 1); CT.compare.clear(); persistNow(); return rerender();
      case "cmpCsv": return exportCSV("compare");
      case "cmpJson": return download("scenarios.json", JSON.stringify([...CT.compare].map(i => CT.saved[i]).filter(Boolean), null, 2), "application/json");
      case "costAdd": { const c = CT.ui.costPick; if (!c) return; const v = +CT.ui.costVal; if (!Number.isFinite(v)) return; if ((CT.ui.costMode || "pct") === "pct") { CT.scn.costPct[c] = v; delete CT.scn.costAbs[c]; } else { CT.scn.costAbs[c] = v; delete CT.scn.costPct[c]; } CT.ui.open = "cost"; return rerender(); }
      case "costRm": delete CT.scn.costPct[arg]; return rerender();
      case "costRmAbs": delete CT.scn.costAbs[arg]; return rerender();
      case "priceAdd": { const i = CT.ui.pricePick; const v = +CT.ui.priceVal; if (!i || !(v > 0)) return; CT.scn.prices[i] = v; CT.ui.open = "price"; return rerender(); }
      case "priceRm": delete CT.scn.prices[arg]; return rerender();
      case "upAdd": { const c = CT.ui.upPick === "__any" ? CT.ui.upPick2 : CT.ui.upPick; const v = +CT.ui.upVal; if (!c || !(v >= 0)) return; CT.scn.upcharges[c] = v; CT.ui.open = "up"; return rerender(); }
      case "upRm": delete CT.scn.upcharges[arg]; return rerender();
      case "rmAdd": { const i = CT.ui.rmPick; if (i && !CT.scn.remove.includes(i)) CT.scn.remove.push(i); CT.ui.open = "remove"; return rerender(); }
      case "rmRm": CT.scn.remove = CT.scn.remove.filter(x => x !== arg); return rerender();
      case "swapAdd": { const f = CT.ui.swapFrom, t = CT.ui.swapTo; if (f && t && f !== t) CT.scn.swaps.push({ from: f, to: t }); CT.ui.open = "swap"; return rerender(); }
      case "swapRm": CT.scn.swaps.splice(+arg, 1); return rerender();
      case "niAdd": { const c = CT.ui.niPick; if (c && M.comps.has(c)) CT.ui.newItem.recipe.push({ cid: c, portions: +CT.ui.niQty || 1 }); CT.ui.niPick = ""; CT.ui.open = "new"; return rerender(); }
      case "niRm": CT.ui.newItem.recipe.splice(+arg, 1); return rerender();
      case "niAddItem": { const n = CT.ui.newItem; const id = "new-" + CM.slug(n.name) + "-" + (CT.scn.newItems.length + 1); CT.scn.newItems.push({ id, name: n.name, line: n.line, price: +n.price, recipe: n.recipe.map(p => ({ ...p })), unitsPerStoreWeek: +n.units || 0, cannibal: Math.min(1, Math.max(0, (+n.cannibal || 0) / 100)), weeks: n.weeks ? +n.weeks : null }); CT.ui.newItem = { name: "", line: n.line, price: n.price, recipe: [], units: n.units, cannibal: n.cannibal, weeks: n.weeks }; CT.ui.open = "new"; return rerender(); }
      case "niRmItem": CT.scn.newItems.splice(+arg, 1); return rerender();
      case "unAdd": { const c = CT.ui.unPick; if (c && !CT.scn.unavailable.includes(c)) CT.scn.unavailable.push(c); CT.ui.open = "unavail"; return rerender(); }
      case "unRm": CT.scn.unavailable = CT.scn.unavailable.filter(x => x !== arg); return rerender();
    }
  }
  function onSet(name, value, el) {
    const [k, a, b] = name.split(":");
    const rerender = () => render();
    switch (k) {
      case "channel": CT.scope.channel = value; return rerender();
      case "target": { const v = +value; if (v >= 5 && v <= 80) { CT.scope.target = v; CT.cache.clear(); rerender(); } return; }
      case "persist": CT.persist = !!el.checked; try { localStorage.setItem("cv-ct-persist", CT.persist ? "1" : "0"); } catch (e) {} if (CT.persist) persistNow(); else idb.clear(); return rerender();
      case "ftype": { const f = CT.files[+a]; if (f) { f.type = value || null; f.map = f.type ? CM.autoMap(f.type, f.headers) : {}; } return rerender(); }
      case "map": { const f = CT.files[+a]; if (f) f.map[b] = value || null; return rerender(); }
      case "itemQ": CT.ui.itemQ = value; return rerender();
      case "cmp": { if (el.checked) { if (CT.compare.size >= 3) { el.checked = false; return; } CT.compare.add(+a); } else CT.compare.delete(+a); return rerender(); }
      case "scnName": CT.scn.name = value; return;
      case "elasticity": CT.scn.elasticity = +value; el.nextElementSibling && (el.nextElementSibling.textContent = value); return rerenderSoon();
      case "retention": CT.scn.retention = +value; el.nextElementSibling && (el.nextElementSibling.textContent = Math.round(value * 100) + "%"); return rerenderSoon();
      case "niName": CT.ui.newItem.name = value; return rerenderSoon();
      case "niLine": CT.ui.newItem.line = value; return rerender();
      case "niPrice": CT.ui.newItem.price = value; return rerenderSoon();
      case "niUnits": CT.ui.newItem.units = value; return;
      case "niCannibal": CT.ui.newItem.cannibal = value; return;
      case "niWeeks": CT.ui.newItem.weeks = value; return;
      case "byoLine": CT.ui.byoLine = value; return rerender();
      case "crossItem": CT.ui.crossItem = value; return rerender();
      default: CT.ui[k] = value; return;
    }
  }
  let timer = null; function rerenderSoon() { clearTimeout(timer); timer = setTimeout(render, 350); }
  function wireInputs(box) {
    const drop = box.querySelector("#ct-drop"), file = box.querySelector("#ct-file");
    if (file) file.onchange = () => { onFiles(file.files); file.value = ""; };
    if (drop) { ["dragenter", "dragover"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("over"); })); ["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("over"); })); drop.addEventListener("drop", e => onFiles(e.dataTransfer.files)); }
  }
  function showDict(type) {
    const t = CM.TEMPLATES[type];
    const html = `<p class="hint">${esc(t.desc)}</p><div class="scroll"><table class="mini"><thead><tr><th>Column</th><th>Required</th><th>Type</th><th>Meaning</th><th>Example</th></tr></thead><tbody>${t.cols.map(c => `<tr><td><code>${c.k}</code></td><td>${c.req ? "yes" : ""}</td><td>${c.type}${c.unit ? " · " + c.unit : ""}</td><td style="color:var(--muted)">${esc(c.desc)}</td><td style="font-family:var(--mono);font-size:11.5px">${esc(c.ex || "")}</td></tr>`).join("")}</tbody></table></div><p class="hint" style="margin-top:8px">Also recognised header names: ${t.cols.filter(c => c.aliases.length).map(c => `<b>${c.k}</b> (${c.aliases.slice(0, 5).join(", ")})`).join("; ")}.</p>`;
    openDrawer({ type: "ct", title: t.label + " · columns", html });
  }
  function showItem(x, M) {
    const html = `<div class="ops-tiles">${tile($(x.price), "price")}${tile($(x.food), "food cost")}${tile(pf(x.fc), "food cost %")}${tile($(x.cm), "contribution")}${tile($(x.priceFor), "price for " + CT.scope.target + "%")}</div>
      ${table("item-" + x.id, [{ k: "name", l: "Component" }, { k: "station", l: "Station" }, { k: "portions", l: "Portions", n: 1 }, { k: "unit", l: "Portion cost", n: 1, f: $ }, { k: "cost", l: "Cost", n: 1, f: $ }, { k: "cost", l: "Share", n: 1, f: v => pf(x.food ? v / x.food * 100 : null, 0) }], x.parts, { name: "item-" + x.id })}
      ${x.units ? `<div class="ops-tiles" style="margin-top:10px">${tile(nf(x.units), "units in scope")}${tile($(x.avgPrice), "avg paid")}${tile(pf(x.fcSold), "food cost % as sold")}${tile($k(x.rev - x.cogs), "contribution in scope")}${x.quadrant ? tile(x.quadrant, x.read) : ""}</div>` : ""}
      <p class="hint" style="margin-top:8px">Packaging: ${$(x.pkgIn)} dine-in, ${$(x.pkgDig)} digital. Costed at ${results().refDate}.</p>`;
    openDrawer({ type: "ct", title: x.name, html });
  }

  /* ---------- init ---------- */
  function init() {
    if (window.__ctInited) return; window.__ctInited = true;
    const box = dEl("cost-out"); if (!box) return;
    box.addEventListener("click", e => { const el = e.target.closest("[data-act]"); if (!el || el.disabled || !box.contains(el)) return; if (el.tagName === "TR" && e.target.closest("button, select, input, a")) return; e.preventDefault(); act(el.dataset.act, el); });
    box.addEventListener("keydown", e => { if ((e.key === "Enter" || e.key === " ") && e.target.matches("tr[data-act]")) { e.preventDefault(); act(e.target.dataset.act, e.target); } });
    box.addEventListener("change", e => { const el = e.target.closest("[data-set]"); if (el && el.tagName !== "INPUT" || el && el.type === "checkbox") onSet(el.dataset.set, el.value, el); });
    box.addEventListener("input", e => { const el = e.target.closest("[data-set]"); if (el && el.tagName === "INPUT" && el.type !== "checkbox") onSet(el.dataset.set, el.value, el); });
    render();
    const boot = () => { if (CT.ready) return; try { ensureSample(); } catch (e) { console.error(e); dEl("cost-out").innerHTML = `<p class="empty">Could not build the sample dataset: ${esc(e.message)}</p>`; return; } CT.ready = true; restore().then(render, render); };
    const sec = document.querySelector('.view[data-view="costs"]');
    if (sec && !sec.hidden) setTimeout(boot, 30); else { new MutationObserver(() => { if (!sec.hidden) setTimeout(boot, 30); }).observe(sec, { attributes: true, attributeFilter: ["hidden"] }); setTimeout(boot, 2500); }
  }
  window.ctInit = init; window.CT = CT;
  init();
})();
