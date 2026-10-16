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
  const pts = v => v == null ? "—" : Math.abs(v) < 0.05 ? "0.0 pts" : (v > 0 ? "+" : "−") + Math.abs(v).toFixed(1) + " pts";
  const monthName = m => { const [y, mo] = m.split("-"); return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][+mo - 1] + " " + y; };
  const CH_LABEL = { in_store: "In store", app: "App", web: "Web", delivery: "Delivery", catering: "Catering", other: "Other" };
  const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;
  const QCOL = { Star: "var(--teal)", Plowhorse: "var(--f-grain)", Puzzle: "var(--f-sweet)", Dog: "var(--muted)" };
  const VERDICT = { Pass: "ok", Review: "warn", Fail: "bad", "Not assessable": "quiet", "No sales": "quiet" };

  const blankScn = () => ({ name: "", costPct: {}, costAbs: {}, prices: {}, upcharges: {}, remove: [], swaps: [], newItems: [], unavailable: [], elasticity: -0.8, retention: 0.8 });
  const CT = { tab: "costs", src: "sample", sample: null, own: null, files: [], scope: { stores: null, months: null, channel: "all", target: 30 }, scn: blankScn(), saved: [], compare: new Set(), persist: false, cache: new Map(), exports: new Map(), ready: false, busy: false,
    ui: { itemSort: "fc", itemQ: "", buildQ: "", newItem: { name: "", line: "Bowls", price: 14.25, recipe: [], units: 60, cannibal: 70, weeks: "" }, byoCalc: [], crossItem: "", salesSort: "units", opsStore: null, costTab: "items" },
    job: "home", flow: { review: { month: null, stores: null, step: 1 }, price: { step: 1, ups: {}, prices: {}, elasticity: -0.8, base: "last", q: "", name: "", options: [] }, menu: { step: 1, type: null, def: null, name: "", options: [] }, ideas: { open: null } } };
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
    CT.files = []; CT.own = null; CT.src = "sample"; CT.saved = []; CT.compare.clear(); CT.scn = blankScn(); CT.cache.clear(); CT.scope = { stores: null, months: null, channel: "all", target: 30 }; resetFlows();
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
  // results for any scope (months/stores arrays), independent of the Explore scope bar
  function resultsFor(sc, scn) {
    const M = data().M; const months = sc.months ? sc.months.filter(m => M.months.includes(m)) : null; const stores = sc.stores ? [...sc.stores].filter(x => M.stores.has(x)) : null;
    const key = "F|" + CT.src + "|" + JSON.stringify({ months, stores, ch: sc.channel || "all", t: CT.scope.target, asOf: sc.costAsOf || null }) + "|" + (scn ? JSON.stringify(scn) : "");
    let R = CT.cache.get(key); if (R) return R;
    R = CM.analyze(M, { stores: stores && stores.length ? new Set(stores) : null, months: months && months.length ? new Set(months) : null, channel: sc.channel || "all", target: CT.scope.target, costAsOf: sc.costAsOf }, scn || null);
    if (CT.cache.size > 24) CT.cache.delete(CT.cache.keys().next().value);
    CT.cache.set(key, R); return R;
  }
  function decomposeFor(stores, a, b) { const key = "D|" + CT.src + "|" + JSON.stringify({ stores: stores ? [...stores] : null, a, b, t: CT.scope.target }); let d = CT.cache.get(key); if (d) return d; d = CM.decompose(data().M, stores && stores.size ? stores : null, a, b, CT.scope.target); CT.cache.set(key, d); return d; }

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
    CT.busy = false; CT.job = "data"; render();
  }
  function addFile(f) { f.map = f.type ? CM.autoMap(f.type, f.headers) : {}; const i = CT.files.findIndex(x => x.name === f.name); if (i >= 0) CT.files[i] = f; else CT.files.push(f); }
  const fileReady = f => f.type && !f.error && CM.TEMPLATES[f.type].cols.filter(c => c.req).every(c => f.map[c.k]);
  function useOwnData(quiet) {
    const ds = {}; const bad = [];
    for (const f of CT.files) { if (!fileReady(f)) continue; const r = CM.applyMap(f.type, f.rows, f.map); r.bad.forEach(b => bad.push({ file: f.name, row: b.row, problem: b.problem })); ds[f.type] = (ds[f.type] || []).concat(r.rows); }
    const validation = CM.validate(ds); validation.bad = bad;
    if (bad.length) validation.warnings.unshift({ file: "files", msg: `${bad.length} row(s) could not be parsed and were left out (first: ${bad[0].file} row ${bad[0].row}: ${bad[0].problem}).`, rows: bad.length });
    CT.own = { ds, validation, M: validation.ok ? CM.build(ds) : null, loadedAt: new Date() };
    if (validation.ok) { const M = CT.own.M; CT.own.label = `Your data · ${M.stores.size} store${M.stores.size === 1 ? "" : "s"}${M.months.length ? " · " + monthName(M.months[0]) + (M.months.length > 1 ? " to " + monthName(M.months[M.months.length - 1]) : "") : ""} · ${nf(M.orders.size)} orders`; CT.src = "own"; CT.cache.clear(); CT.scope = { stores: null, months: null, channel: "all", target: CT.scope.target }; resetFlows(); if (!quiet) CT.job = "home"; persistNow(); }
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

  /* ---------- shell: jobs first, Explore keeps every view ---------- */
  const JOBS = [["home", "Home"], ["advise", "What to do"], ["review", "Monthly review"], ["menu", "Menu change"], ["price", "Price change"], ["ideas", "New item ideas"], ["explore", "Explore"], ["data", "Data"]];
  function resetFlows() { CT.flow = { review: { month: null, stores: null, step: 1 }, price: { step: 1, ups: {}, prices: {}, elasticity: -0.8, base: "last", q: "", name: "", options: [] }, menu: { step: 1, type: null, def: null, name: "", options: [] }, ideas: { open: null }, advise: advBlank() }; }
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
          ${CT.src === "own" ? `<button class="linkbtn" data-act="src:sample">Switch to sample</button>` : own ? `<button class="linkbtn" data-act="src:own">Switch to my data</button>` : `<button class="linkbtn" data-act="job:data">Load my data</button>`}
          ${CT.files.length || own ? `<button class="linkbtn" data-act="clear">Clear all data</button>` : ""}
        </span>
      </div>
      <nav class="ct-jobs" aria-label="Cost & sales jobs">${JOBS.map(([k, l]) => `<button class="ct-job ${CT.job === k ? "on" : ""}" data-act="job:${k}" aria-current="${CT.job === k ? "page" : "false"}">${l}</button>`).join("")}</nav>
      ${CT.job === "explore" ? `<div class="ct-bar"><div class="controls seg" role="tablist" aria-label="Explore views">${[["costs", "Costs"], ["sales", "Sales & mix"], ["scenarios", "Scenarios"], ["ops", "Operations"], ["recon", "Reconcile"]].map(([k, l]) => `<button class="chip" role="tab" data-act="tab:${k}" aria-pressed="${CT.tab === k}">${l}</button>`).join("")}</div>${scopeBar(M)}</div>` : ""}
      <div id="ct-tab">${CT.busy ? `<p class="hint">${esc(CT.busy)}</p>` : jobBody(M)}</div>`;
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
  function jobBody(M) {
    try {
      if (CT.job === "data") return tabData();
      if (CT.job === "home") return jobHome(M);
      if (CT.job === "review") return jobReview(M);
      if (CT.job === "price") return jobPrice(M);
      if (CT.job === "menu") return jobMenu(M);
      if (CT.job === "ideas") return jobIdeas(M);
      if (CT.job === "advise") return jobAdvise(M);
      const R = results(null);
      if (CT.tab === "costs") return tabCosts(R, M);
      if (CT.tab === "sales") return tabSales(R, M);
      if (CT.tab === "scenarios") return tabScenarios(R, M);
      if (CT.tab === "ops") return tabOps(R, M);
      if (CT.tab === "recon") return tabRecon(R, M);
    } catch (e) { console.error(e); return `<p class="empty">Something went wrong rendering this view: ${esc(e.message)}</p>`; }
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

  /* ---------- JOBS ---------- */
  /* --- explanation layer: every figure can say where it comes from, and assumptions are flagged --- */
  const SRC = { cost: "components.csv (case cost ÷ usable per case × portion) + recipes.csv / modifiers.csv", sales: "sales.csv", mods: "modifiers.csv", items: "items.csv", act: "actuals.csv", waste: "waste.csv", inv: "inventory.csv" };
  // X(value, {l: label, f: formula, v: [[name, value]], src, asm}) → a hoverable figure
  const X = (val, o) => `<span class="x${o.asm ? " x-asm" : ""}" tabindex="0" ${tipAttr(`<b>${esc(o.l || "")}</b>${o.f ? `<div class="x-f">${esc(o.f)}</div>` : ""}${o.v ? ttRows(o.v.map(([k, v]) => [esc(k), v])) : ""}${o.src ? `<div class="tt-k" style="margin-top:4px">From: ${esc(o.src)}</div>` : ""}${o.asm ? `<div class="x-note">Assumption: ${esc(o.asm)}</div>` : `<div class="tt-hint">Data, not an assumption</div>`}`)}>${val}</span>`;
  const reading = (html, kind) => `<p class="reading ${kind || ""}">${html}</p>`;
  const asmBadge = what => `<span class="asm-badge" tabindex="0" ${tipAttr(`<b>Assumption</b><div class="tt-k">${esc(what)}</div>`)}>assumption</span>`;
  const stepper = (steps, cur, prefix) => `<ol class="steps">${steps.map((st, i) => `<li class="${i + 1 === cur ? "cur" : i + 1 < cur ? "done" : ""}"><button data-act="${prefix}:step:${i + 1}"><span>${i + 1}</span>${esc(st)}</button></li>`).join("")}</ol>`;
  const stepNav = (prefix, cur, n, next) => `<div class="step-nav">${cur > 1 ? `<button class="linkbtn" data-act="${prefix}:step:${cur - 1}">← Back</button>` : ""}${cur < n ? `<button class="tour-next" data-act="${prefix}:step:${cur + 1}">${next || "Next"} →</button>` : ""}</div>`;
  const jobHead = (title, lede) => `<div class="job-head"><h2>${title}</h2><p class="hint">${lede}</p></div>`;
  const delta = (v, f, inv) => v == null || Math.abs(v) < 1e-9 ? `<span class="hint">no change</span>` : `<span class="${(inv ? v < 0 : v > 0) ? "ct-up" : "ct-down"}">${f === pf ? pts(v) : sgn(v, f)}</span>`;
  const lastMonths = (M, n) => M.months.slice(-n);
  const storeName = (M, id) => (M.stores.get(id) || { name: id }).name;
  const monthsLabel = ms => ms.length === 1 ? monthName(ms[0]) : ms.length ? `${monthName(ms[0])} to ${monthName(ms[ms.length - 1])}` : "all data";
  const fmtList = (arr, max) => arr.length <= max ? arr.join(", ") : arr.slice(0, max).join(", ") + ` and ${arr.length - max} more`;
  // one-page summary: shown in the drawer, printed (or saved as PDF) from there
  function printSummary() { const el = dEl("ct-print"); if (!el || !el.innerHTML) return; window.print(); }
  function showSummary(title, html) {
    let el = dEl("ct-print"); if (!el) { el = document.createElement("div"); el.id = "ct-print"; document.body.appendChild(el); }
    const stamp = `${D_LABEL()} · ${new Date().toISOString().slice(0, 10)}`;
    el.innerHTML = `<div class="sum"><h1>${esc(title)}</h1><div class="sum-meta">${esc(stamp)}</div>${html}</div>`;
    openDrawer({ type: "ct", title, html: `<div class="sum-tools"><button class="tour-next" data-act="print:sum">Print / save as PDF</button><span class="hint">${esc(stamp)}</span></div><div class="sum">${html}</div>` });
  }
  const D_LABEL = () => CT.src === "own" ? "Your data" : "Sample data (synthetic)";
  const sumTable = (cols, rows) => `<table class="sum-t"><thead><tr>${cols.map(c => `<th>${c}</th>`).join("")}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(v => `<td>${v}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  function go(arg) {
    const [job, ...rest] = arg.split(":"); const a = rest.join(":");
    if (job === "price") { const f = CT.flow.price; if (rest[0] === "up" && rest[1]) { const c = data().M.comps.get(rest[1]); if (c) { f.ups[rest[1]] = c.upcharge; f.step = 2; } } else if (rest[0] === "item" && rest[1]) { const p = data().M.itemPrice(rest[1], null); if (p != null) { f.prices[rest[1]] = p; f.step = 2; } } else f.step = 1; CT.job = "price"; }
    else if (job === "review") { CT.flow.review.step = +rest[0] || 1; CT.job = "review"; }
    else if (job === "menu") { CT.job = "menu"; if (rest[0]) { CT.flow.menu.type = rest[0]; CT.flow.menu.def = mcBlank(rest[0]); CT.flow.menu.step = 2; } }
    else if (job === "ideas") CT.job = "ideas";
    else if (job === "advise") { const f = CT.flow.advise; if (rest[0] === "cost" && rest[1]) { f.type = "cost"; f.cid = rest[1]; f.pct = +rest[2] || 15; } else if (rest[0] === "general") f.type = "general"; f.pick = null; f.step = rest[0] ? 2 : 1; if (!advTrigger(data().M)) f.step = 1; CT.job = "advise"; }
    else if (job === "explore") { CT.job = "explore"; CT.tab = rest[0] || "costs"; if (rest[1]) { if (CT.tab === "costs") CT.ui.costTab = rest[1]; if (CT.tab === "sales") CT.ui.salesTab = rest[1]; if (CT.tab === "ops") CT.ui.opsTab = rest[1]; } }
    else CT.job = job;
    render(); const main = dEl("main"); if (main) main.scrollTop = 0;
  }

  /* ---------- Home: what needs attention ---------- */
  function jobHome(M) {
    const t = CT.scope.target; const last = M.months[M.months.length - 1], prev = M.months[M.months.length - 2];
    if (!M.sales.length) return jobHead("Home", "No sales loaded yet, so there is nothing to flag.") + `<div class="job-cards">${jobCards(M)}</div>` + reading(`Load sales (and modifiers) on the <button class="linkbtn" data-act="job:data">Data</button> tab, or switch to the sample to see every job working.`);
    const Rl = resultsFor({ months: [last] }), Rp = prev ? resultsFor({ months: [prev] }) : null, Ra = resultsFor({});
    const over = Rl.byStore.filter(s => s.fc > t), stores = Rl.byStore.slice().sort((a, b) => b.fc - a.fc);
    const thin = Rl.upcharges.filter(u => u.margin < 0 || u.margin < 0.25 * u.upcharge).sort((a, b) => a.margin - b.margin);
    const slip = Ra.ops.trend.items.filter(x => x.slipping);
    const rec = Rl.reconcile.rows.filter(r => r.month === last); const recBad = rec.filter(r => r.verdict === "Fail" || r.verdict === "Review");
    const sug = CM.suggest(M, Ra, t).slice(0, 1)[0];
    let best = null; try { const key = "H|" + CT.src + "|" + last + "|" + t; best = CT.cache.get(key); if (!best) { best = CM.recommend(M, { months: new Set([last]), target: t }, { type: "general" }, { verify: false }); CT.cache.set(key, best); } } catch (e) { console.error(e); }
    const top = best && best.candidates[0];
    const fcX = X(pf(Rl.totals.fc), { l: `Theoretical food cost · ${monthName(last)}`, f: "food cost of everything sold ÷ net sales", v: [["Food cost", $0(Rl.totals.cogs)], ["Net sales", $0(Rl.totals.rev)], ["Target", pf(t, 0)]], src: SRC.cost + " + " + SRC.sales });
    const card = (cls, title, big, text, link, label) => `<div class="flag-card ${cls}"><div class="fc-head">${title}</div><div class="fc-big">${big}</div><div class="fc-text">${text}</div><button class="card-link" data-act="${link}">${label} →</button></div>`;
    const cards = [
      card(over.length ? "warn" : "ok", `Food cost vs ${pf(t, 0)} target · ${monthName(last)}`, fcX, over.length ? `${over.length} of ${Rl.byStore.length} stores over target: ${esc(fmtList(over.map(s => `${s.name} ${pf(s.fc)}`), 3))}.` : `Every store under target${Rp ? `; ${pts(Rl.totals.fc - Rp.totals.fc)} vs ${monthName(prev)}` : ""}.`, "go:review:1", "Monthly review"),
      card(thin.length ? "warn" : "ok", "Up-charges covering their cost", thin.length ? esc(thin[0].name) : "All covered", thin.length ? `${esc(thin[0].name)} earns ${X($(thin[0].margin), { l: "Margin per add", f: "up-charge − incremental cost", v: [["Up-charge", $(thin[0].upcharge)], ["Portion cost", $(thin[0].cost)], [thin[0].baseMain != null ? "Included main it replaces" : "Pure add", thin[0].baseMain != null ? $(thin[0].baseMain) : "—"]], src: SRC.cost })} on a ${$(thin[0].upcharge)} up-charge${thin.length > 1 ? `; ${thin.length - 1} more under 25% margin` : ""}.` : `Every up-charge keeps at least 25% of what the guest pays.`, thin.length ? `go:price:up:${esc(thin[0].cid)}` : "go:price", thin.length ? "Test a new up-charge" : "Price change"),
      card(slip.length ? "warn" : "ok", "Items whose margin slipped", slip.length, Ra.ops.trend.months.length < 2 ? "Needs two months of sales." : slip.length ? `Contribution per unit down since ${monthName(Ra.ops.trend.months[0])}: ${esc(fmtList(slip.map(x => x.name), 3))}.` : "No item lost more than 10¢ of contribution.", "go:review:3", "See where to look"),
      card(!rec.length ? "quiet" : recBad.length ? "bad" : "ok", `Reconciliation · ${monthName(last)}`, !rec.length ? "No books" : recBad.length ? recBad[0].verdict : "Pass", !rec.length ? "Load actuals.csv to check theoretical food cost against the books." : recBad.length ? `${esc(fmtList(recBad.map(r => `${r.name} (${r.verdict}, ${pts(r.gap)})`), 2))}; ${rec.length - recBad.length} of ${rec.length} pass.` : `All ${rec.length} store-months pass: the books sit ${pts(d3.mean(rec, r => r.gap))} above theoretical, inside the 0–3 point band.`, "go:explore:recon", "Reconcile"),
      card(top ? "idea" : "quiet", "Best move right now", top ? sgn(top.dGp, $0) : "—", top ? `${esc(top.label)} · ${top.confidence === "data" ? "arithmetic on the data" : esc(top.assumes || "rests on the demand assumption")}${top.culinary ? "; needs culinary sign-off" : ""}.` : "Nothing improves on today under the default rules.", "go:advise:general", "What to do"),
      card("idea", "Best new-item candidate", sug ? `${sug.perStoreWeek.toFixed(0)}/store-week` : "—", sug ? `${esc(sug.mains.join(" + ") || "A build")} guests already order ${sug.perStoreWeek.toFixed(0)} times per store-week, ${pf(sug.fc)} food cost at ${$(sug.avgPrice)}; nothing on the menu is more than ${Math.round(sug.sim * 100)}% alike.` : "Needs build-your-own modifiers to find builds guests make themselves.", "go:ideas", "New item ideas"),
    ];
    return jobHead("Home", `What needs attention in ${monthName(last)}, and where to go next. Hover any figure for the formula, the values and the source file; amber means an assumption.`) + `<div class="flag-cards">${cards.join("")}</div>
      <div class="sub">Start a job</div><div class="job-cards">${jobCards(M)}</div>
      ${reading(`<b>In a hurry?</b> To answer “should we raise the salmon up-charge?”: Home → the up-charge card → set a new up-charge and a demand assumption → check the ladder → compare. About three minutes.`)}`;
  }
  const jobCards = M => [["advise", "What to do", "Describe a cost change, a shortage, a new product or a planned price; get the best moves and a plan."], ["review", "Monthly review", "Where food cost landed, what moved it, which stores and items to look at, one-page summary."], ["menu", "Evaluate a menu change", "New item, LTO, portion change, swap or removal: cost, margin, ripple across the menu and prep."], ["price", "Price change simulation", "New prices or up-charges, volume impact under a stated demand assumption, ladder check, compare options."], ["ideas", "Suggest new menu items", "Builds guests already order, components you already stock, margin at a target price."]].map(([k, l, d]) => `<button class="job-card" data-act="go:${k}"><b>${l}</b><span>${d}</span></button>`).join("");

  /* ---------- Monthly review ---------- */
  function rvAct(arg) { const [k, v] = arg.split(":"); const f = CT.flow.review; if (k === "step") f.step = +v; if (k === "store") { const all = [...data().M.stores.keys()]; const s = f.stores ? new Set(f.stores) : new Set(all); if (s.has(v)) { if (s.size > 1) s.delete(v); } else s.add(v); f.stores = s.size === all.length ? null : s; } if (k === "summary") rvSummary(); render(); }
  function rvSet(k, v) { if (k === "month") { CT.flow.review.month = v; render(); } }
  function rvScope(M) { const f = CT.flow.review; const month = f.month && M.months.includes(f.month) ? f.month : M.months[M.months.length - 1]; const i = M.months.indexOf(month); return { month, prev: i > 0 ? M.months[i - 1] : null, stores: f.stores, R: resultsFor({ months: [month], stores: f.stores ? [...f.stores] : null }), Rp: i > 0 ? resultsFor({ months: [M.months[i - 1]], stores: f.stores ? [...f.stores] : null }) : null, Ra: resultsFor({ stores: f.stores ? [...f.stores] : null }) };
  }
  function jobReview(M) {
    if (!M.sales.length) return jobHead("Monthly review", "Needs sales.") + reading("Load a sales file on the Data tab.");
    const f = CT.flow.review; const S = rvScope(M); const { month, prev, R, Rp, Ra } = S; const t = CT.scope.target;
    const head = jobHead("Monthly review", "Where food cost landed, what moved it, and where to look. Four steps; export a one-page summary at the end.") + `<div class="ct-scope">${sel("rv:month", M.months.map(m => [m, monthName(m)]), month)}${[...M.stores.values()].length > 1 ? `<span class="label">Stores</span>${[...M.stores.values()].map(st => `<button class="chip" data-act="rv:store:${esc(st.id)}" aria-pressed="${!f.stores || f.stores.has(st.id)}">${esc(st.name)}</button>`).join("")}` : ""}</div>` + stepper(["Where food cost landed", "What moved it", "Where to look", "Summary"], f.step, "rv");
    let body = "";
    if (f.step === 1) {
      const rec = R.reconcile.rows.filter(r => r.month === month); const verdicts = rec.map(r => r.verdict);
      const vsT = R.totals.fc - t, vsP = Rp ? R.totals.fc - Rp.totals.fc : null;
      body = `<div class="ops-tiles">
        ${tile(X(pf(R.totals.fc), { l: "Theoretical food cost", f: "food cost of everything sold ÷ net sales", v: [["Food cost", $0(R.totals.cogs)], ["Net sales", $0(R.totals.rev)]], src: SRC.cost + " + " + SRC.sales }), `food cost, ${monthName(month)} ${delta(vsT, pf, true)} vs target`)}
        ${tile(Rp ? delta(vsP, pf, true) : "—", `vs ${prev ? monthName(prev) : "previous month"}`)}
        ${tile(X(pf(R.totals.fcAll), { l: "Food + paper", f: "(food cost + packaging) ÷ net sales", v: [["Packaging", $0(R.totals.pkg)]], src: "packaging.csv" }), "with packaging")}
        ${tile(X($k(R.totals.gp), { l: "Gross profit", f: "net sales − food cost − packaging", v: [["Net sales", $0(R.totals.rev)], ["Food", $0(R.totals.cogs)], ["Paper", $0(R.totals.pkg)]], src: SRC.sales }), "gross profit after food & paper")}
        ${tile(rec.length ? (verdicts.every(v => v === "Pass") ? "Pass" : verdicts.includes("Fail") ? "Fail" : "Review") : "—", rec.length ? `books vs theoretical, ${rec.length} store${rec.length === 1 ? "" : "s"}` : "no actuals for this month", null, rec.length && verdicts.includes("Fail") ? "pc-hi" : "")}
      </div>
      ${reading(`Food cost landed at <b>${pf(R.totals.fc)}</b> in ${monthName(month)}, ${Math.abs(vsT) < 0.05 ? "on" : vsT > 0 ? `<b>${pts(vsT)}</b> above` : `${pts(-vsT).replace("+", "")} below`} the ${pf(t, 0)} target${Rp ? ` and ${Math.abs(vsP) < 0.05 ? "level with" : (vsP > 0 ? "up " : "down ") + Math.abs(vsP).toFixed(1) + " points from"} ${monthName(prev)}` : ""}.${rec.length ? ` The books ${verdicts.every(v => v === "Pass") ? "agree" : "do not fully agree"}: ${esc(fmtList(rec.map(r => `${r.name} ${r.verdict.toLowerCase()} (${pts(r.gap)})`), 3))}.` : ""}`, vsT > 0 ? "warn" : "ok")}
      ${table("rv-stores", [{ k: "name", l: "Store", f: v => `<b style="font-weight:600">${esc(v)}</b>` }, { k: "fc", l: `Food cost ${monthName(month)}`, n: 1, f: (v, r) => X(pf(v), { l: r.name, f: "food cost ÷ net sales", v: [["Food cost", $0(r.cogs)], ["Net sales", $0(r.rev)]], src: SRC.cost }), cls: r => r.fc > t ? "pc-hi" : "" }, { k: "prevFc", l: prev ? monthName(prev) : "Previous", n: 1, f: pf }, { k: "d", l: "Change", n: 1, f: v => delta(v, pf, true) }, { k: "vsT", l: "vs target", n: 1, f: v => delta(v, pf, true) }, { k: "gp", l: "Gross profit", n: 1, f: $k }, { k: "verdict", l: "Books", f: v => v ? flag(v, VERDICT[v]) : "—" }],
        R.byStore.map(s => { const p = Rp && Rp.byStore.find(x => x.store === s.store); const r = rec.find(x => x.store === s.store); return { name: s.name, fc: s.fc, cogs: s.cogs, rev: s.rev, prevFc: p ? p.fc : null, d: p ? s.fc - p.fc : null, vsT: s.fc - t, gp: s.gp, verdict: r ? r.verdict : null }; }).sort((a, b) => b.fc - a.fc), { title: "By store", name: "review-stores" })}
      ${stepNav("rv", 1, 4, "What moved it")}`;
    } else if (f.step === 2) {
      if (!prev) body = reading(`${monthName(month)} is the first month in the data, so there is nothing to compare it with. Pick a later month above.`) + stepNav("rv", 2, 4, "Where to look");
      else {
        const d = decomposeFor(f.stores, prev, month);
        const ce = d.costEffect, me = d.mixEffect;
        body = `<div class="ops-tiles">
          ${tile(delta(d.total, pf, true), `change, ${monthName(prev)} → ${monthName(month)}`)}
          ${tile(X(pts(ce), { l: "Cost changes", f: `${monthName(prev)}'s sales re-costed at ${monthName(month)}'s component costs, minus ${monthName(prev)}'s food cost`, v: [[`${monthName(prev)} at its own costs`, pf(d.fcA)], [`${monthName(prev)} at ${monthName(month)} costs`, pf(d.fcA2)]], src: "components.csv effective dates" }), "from component cost changes", null, ce > 0.05 ? "pc-hi" : "")}
          ${tile(X(pts(me), { l: "Mix and prices", f: `${monthName(month)}'s food cost minus ${monthName(prev)}'s sales at ${monthName(month)} costs`, v: [[`${monthName(month)}`, pf(d.fcB)], [`${monthName(prev)} at ${monthName(month)} costs`, pf(d.fcA2)]], src: SRC.sales }), "from what sold and what it sold for", null, me > 0.05 ? "pc-hi" : "")}
        </div>
        ${reading(`Food cost moved <b>${pts(d.total)}</b>: <b>${pts(ce)}</b> from component costs${d.components.length ? ` (${esc(fmtList(d.components.slice(0, 3).map(c => `${c.name} ${sgn(c.pct, v => v.toFixed(0) + "%")}`), 3))})` : " (no cost changed)"} and <b>${pts(me)}</b> from the mix and prices${Math.abs(d.mixB.premiumShare - d.mixA.premiumShare) > 0.005 ? ` (premium mains on ${pf(d.mixB.premiumShare * 100, 0)} of builds, was ${pf(d.mixA.premiumShare * 100, 0)})` : ""}. The two parts add up to the total exactly.`, d.total > 0.05 ? "warn" : "ok")}
        <div class="ops-two">
          ${table("rv-comps", [{ k: "name", l: "Component" }, { k: "before", l: monthName(prev), n: 1, f: $ }, { k: "after", l: monthName(month), n: 1, f: $ }, { k: "pct", l: "Change", n: 1, f: v => sgn(v, x => x.toFixed(1) + "%") }, { k: "dollars", l: `$ at ${monthName(month)} usage`, n: 1, f: v => sgn(v, $0) }, { k: "pts", l: "Points of food cost", n: 1, f: v => pts(v), cls: r => r.pts > 0.05 ? "pc-hi" : "" }], d.components, { title: "Component costs that changed", name: "review-cost-changes", empty: "No component cost changed between the two months." })}
          <div>${table("rv-mix", [{ k: "m", l: "Mix indicator" }, { k: "a", l: monthName(prev), n: 1 }, { k: "b", l: monthName(month), n: 1 }], [["Build-your-own share of meals", pf(d.mixA.byoShare * 100, 0), pf(d.mixB.byoShare * 100, 0)], ["Builds with a premium main", pf(d.mixA.premiumShare * 100, 0), pf(d.mixB.premiumShare * 100, 0)], ["Add-ons, share of units", pf(d.mixA.addonShare * 100, 0), pf(d.mixB.addonShare * 100, 0)], ["Average paid per unit", $(d.mixA.avgPaid), $(d.mixB.avgPaid)], ["Average order", $(d.mixA.aov), $(d.mixB.aov)]].map(([m, a, b]) => ({ m, a, b })), { title: "What sold", name: "review-mix" })}</div>
        </div>
        ${table("rv-items", [{ k: "name", l: "Item" }, { k: "line", l: "Line" }, { k: "pts", l: "Points of the change", n: 1, f: (v, r) => X(pts(v), { l: r.name, f: "its food cost ÷ all sales, this month minus last", v: [[`Share of sales ${monthName(prev)} → ${monthName(month)}`, `${pf(r.shareA * 100)} → ${pf(r.shareB * 100)}`], ["Food cost %", `${pf(r.fcA)} → ${pf(r.fcB)}`]], src: SRC.cost + " + " + SRC.sales }), cls: r => r.pts > 0.05 ? "pc-hi" : "" }, { k: "fcB", l: "Food cost %", n: 1, f: (v, r) => `${pf(r.fcA)} → ${pf(v)}` }, { k: "unitsB", l: "Units", n: 1, f: (v, r) => `${nf(r.unitsA)} → ${nf(v)}` }], d.items.slice(0, 12), { title: "Items that moved it most · their points add up to the total change", name: "review-item-movers" })}
        ${stepNav("rv", 2, 4, "Where to look")}`;
      }
    } else if (f.step === 3) {
      const overItems = R.itemList.filter(x => !x.addon && !x.byo && x.units > 0 && x.fcSold > t).sort((a, b) => b.rev - a.rev);
      const slip = Ra.ops.trend.items.filter(x => x.slipping);
      const thin = R.upcharges.filter(u => u.margin < 0.25 * u.upcharge).sort((a, b) => a.margin - b.margin);
      const waste = R.ops.hasWaste ? R.ops.waste.filter(w => w.wasteCost > 0).sort((a, b) => b.wasteCost - a.wasteCost).slice(0, 5) : [];
      const tva = R.ops.hasInventory ? R.ops.tva.filter(x => x.variancePct > 10).slice(0, 5) : [];
      const li = (h, link, label) => `<div class="look"><div>${h}</div><button class="card-link" data-act="${link}">${label} →</button></div>`;
      body = reading(`The lists below are ranked by money at stake. Each opens the view that explains it.`) + `<div class="looks">
        ${li(`<b>Stores</b> · ${esc(fmtList(R.byStore.slice().sort((a, b) => b.fc - a.fc).map(s => `${s.name} ${pf(s.fc)}${s.fc > t ? " (over)" : ""}`), 3))}`, "go:explore:ops:stores", "Stores side by side")}
        ${li(`<b>${overItems.length} meal${overItems.length === 1 ? "" : "s"} over the ${pf(t, 0)} target</b>${overItems.length ? ` · ${esc(fmtList(overItems.map(x => `${x.name} ${pf(x.fcSold)}`), 3))}` : ""}`, "go:explore:costs:items", "Item costs")}
        ${li(`<b>${slip.length} item${slip.length === 1 ? "" : "s"} losing margin</b>${slip.length ? ` · ${esc(fmtList(slip.map(x => `${x.name} ${sgn(x.cmDelta, $)}`), 3))}` : Ra.ops.trend.months.length < 2 ? " · needs two months" : ""}`, "go:explore:ops:trend", "Trend")}
        ${li(`<b>${thin.length} thin up-charge${thin.length === 1 ? "" : "s"}</b>${thin.length ? ` · ${esc(fmtList(thin.map(u => `${u.name} ${$(u.margin)} on ${$(u.upcharge)}`), 3))}` : " · all keep at least 25% of the up-charge"}`, thin.length ? `go:price:up:${esc(thin[0].cid)}` : "go:price", "Test a price change")}
        ${R.ops.hasWaste ? li(`<b>Waste</b> · ${$0(R.ops.wasteTotal)} logged (${pf(R.ops.wastePctCogs)} of food cost) · ${esc(fmtList(waste.map(w => `${w.name} ${$0(w.wasteCost)}`), 3))}`, "go:explore:ops:waste", "Waste & low movers") : li(`<b>Waste</b> · no waste log loaded`, "job:data", "Load waste.csv")}
        ${R.ops.hasInventory ? li(`<b>Usage above theoretical</b> · ${esc(fmtList(tva.map(x => `${x.name} ${sgn(x.variancePct, v => v.toFixed(0) + "%")}`), 3)) || "nothing over 10%"}`, "go:explore:ops:tva", "Theoretical vs actual") : ""}
      </div>` + stepNav("rv", 3, 4, "Summary");
    } else {
      body = reading(`One page: the headline, the stores, what moved food cost and the list to look at. Print it or save it as a PDF from the panel.`) + `<div class="ct-row"><button class="tour-next" data-act="rv:summary">Open the summary</button><button class="linkbtn" data-act="csv:rv-stores">⤓ Stores CSV</button></div>` + stepNav("rv", 4, 4);
    }
    return head + body;
  }
  function rvSummary() {
    const M = data().M; const S = rvScope(M); const { month, prev, R, Rp } = S; const t = CT.scope.target; const rec = R.reconcile.rows.filter(r => r.month === month);
    const d = prev ? decomposeFor(CT.flow.review.stores, prev, month) : null;
    const overItems = R.itemList.filter(x => !x.addon && !x.byo && x.units > 0 && x.fcSold > t).sort((a, b) => b.rev - a.rev);
    const html = `<p class="sum-lead">Theoretical food cost <b>${pf(R.totals.fc)}</b> (${pf(R.totals.fcAll)} with paper) against a ${pf(t, 0)} target${Rp ? `, ${sgn(R.totals.fc - Rp.totals.fc, v => v.toFixed(1) + " pts")} vs ${monthName(prev)}` : ""}. Net sales ${$0(R.totals.rev)}, gross profit ${$0(R.totals.gp)}.${rec.length ? ` Books: ${rec.map(r => `${r.name} ${r.verdict} (${pts(r.gap)})`).join("; ")}.` : ""}</p>
      <h3>By store</h3>${sumTable(["Store", "Food cost", prev ? monthName(prev) : "Prev", "vs target", "Gross profit", "Books"], R.byStore.map(s => { const p = Rp && Rp.byStore.find(x => x.store === s.store); const r = rec.find(x => x.store === s.store); return [esc(s.name), pf(s.fc), p ? pf(p.fc) : "—", pts(s.fc - t), $0(s.gp), r ? r.verdict : "—"]; }))}
      ${d && d.ok ? `<h3>What moved it</h3><p>${pts(d.total)} in total: ${pts(d.costEffect)} from component costs, ${pts(d.mixEffect)} from mix and prices.</p>${d.components.length ? sumTable(["Component", monthName(prev), monthName(month), "Change", "Points"], d.components.slice(0, 8).map(c => [esc(c.name), $(c.before), $(c.after), sgn(c.pct, v => v.toFixed(1) + "%"), pts(c.pts)])) : ""}${sumTable(["Item", "Points", "Food cost %", "Units"], d.items.slice(0, 8).map(i => [esc(i.name), pts(i.pts), `${pf(i.fcA)} → ${pf(i.fcB)}`, `${nf(i.unitsA)} → ${nf(i.unitsB)}`]))}` : ""}
      <h3>Where to look</h3><ul>${overItems.length ? `<li>${overItems.length} meals over target: ${esc(fmtList(overItems.map(x => `${x.name} ${pf(x.fcSold)}`), 5))}</li>` : "<li>No meal over target.</li>"}${R.upcharges.filter(u => u.margin < 0.25 * u.upcharge).map(u => `<li>${esc(u.name)} up-charge earns ${$(u.margin)} on ${$(u.upcharge)}</li>`).join("")}${R.ops.hasWaste ? `<li>Waste logged ${$0(R.ops.wasteTotal)} (${pf(R.ops.wastePctCogs)} of food cost)</li>` : ""}</ul>
      <p class="sum-foot">Theoretical food cost = cost of every unit sold (recipes for curated items, modifiers for build-your-own, at the cost in force on the day) ÷ net sales. Method: docs/methodology.md.</p>`;
    showSummary(`Monthly review · ${monthName(month)}`, html);
  }

  /* ---------- Price change simulation ---------- */
  function pcScope(M) { const f = CT.flow.price; return f.base === "all" ? {} : { months: lastMonths(M, 1) }; }
  function pcScn() { const f = CT.flow.price; return { name: f.name || "Price change", prices: Object.assign({}, f.prices), upcharges: Object.assign({}, f.ups), elasticity: f.elasticity }; }
  const pcHas = () => Object.keys(CT.flow.price.prices).length + Object.keys(CT.flow.price.ups).length > 0;
  function pcAct(arg) {
    const [k, ...r] = arg.split(":"); const v = r.join(":"); const f = CT.flow.price; const M = data().M;
    if (k === "step") f.step = +v;
    else if (k === "addUp") { const c = M.comps.get(v); if (c) { f.ups[v] = c.upcharge; f.step = 2; } }
    else if (k === "addItem") { const p = M.itemPrice(v, null); if (p != null) { f.prices[v] = p; f.step = 2; } }
    else if (k === "rmUp") delete f.ups[v];
    else if (k === "rmItem") delete f.prices[v];
    else if (k === "bump") { const [kind, id, amt] = r; const d = +amt; if (kind === "up") f.ups[id] = Math.max(0, Math.round((f.ups[id] + d) * 20) / 20); else f.prices[id] = Math.max(0, Math.round((f.prices[id] + d) * 20) / 20); }
    else if (k === "ladderFix") { const R = resultsFor(pcScope(M), pcScn()); R.ladder.filter(l => l.gap < -0.05).forEach(l => { f.prices[l.id] = Math.round((l.price - l.gap) * 20) / 20; }); }
    else if (k === "save") { const name = f.name.trim() || `Option ${f.options.length + 1}`; const i = f.options.findIndex(o => o.name === name); const rec = { name, scn: pcScn() }; if (i >= 0) f.options[i] = rec; else f.options.push(rec); f.name = ""; }
    else if (k === "load") { const o = f.options[+v]; if (o) { f.prices = Object.assign({}, o.scn.prices); f.ups = Object.assign({}, o.scn.upcharges); f.elasticity = o.scn.elasticity; f.name = o.name; } }
    else if (k === "del") f.options.splice(+v, 1);
    else if (k === "clear") { f.prices = {}; f.ups = {}; }
    else if (k === "summary") pcSummary();
    else if (k === "explore") { CT.scn = Object.assign(blankScn(), pcScn()); go("explore:scenarios"); return; }
    render();
  }
  function pcSet(a, b, value, el) {
    const f = CT.flow.price;
    if (a === "q") { f.q = value; return render(); } if (a === "base") { f.base = value; return render(); } if (a === "name") { f.name = value; return; }
    if (a === "el") { f.elasticity = +value; el.nextElementSibling && (el.nextElementSibling.textContent = value); return rerenderSoon(); }
    if (a === "up") { const v = +value; if (v >= 0) f.ups[b] = v; return rerenderSoon(); } if (a === "price") { const v = +value; if (v > 0) f.prices[b] = v; return rerenderSoon(); }
  }
  function jobPrice(M) {
    const f = CT.flow.price; const t = CT.scope.target; const sc = pcScope(M); const R0 = resultsFor(sc); const scn = pcHas() ? pcScn() : null; const R = scn ? resultsFor(sc, scn) : R0;
    const period = sc.months ? monthsLabel(sc.months) : monthsLabel(M.months);
    const head = jobHead("Price change simulation", "Set new prices or up-charges, see margin, food cost and volume under a stated demand assumption, check the ladder still holds, compare options.") + `<div class="ct-scope"><span class="label">Base period</span>${sel("pc:base", [["last", `Latest month (${monthName(M.months[M.months.length - 1] || "")})`], ["all", `All months (${monthsLabel(M.months)})`]], f.base)}<span class="hint">Costs as of ${R0.refDate}.</span></div>` + stepper(["Pick what to change", "Set the new price", "Check the ladder", "Compare & export"], f.step, "pc");
    let body = "";
    if (f.step === 1) {
      const q = f.q.toLowerCase(); const items = R0.itemList.filter(x => !x.byo && (!q || x.name.toLowerCase().includes(q) || x.line.toLowerCase().includes(q))).sort((a, b) => b.units - a.units).slice(0, q ? 40 : 15);
      body = reading(`Up-charges first: they are where most premium components are sold. ${R0.upcharges.length ? `The thinnest margin is <b>${esc(R0.upcharges.slice().sort((a, b) => a.margin - b.margin)[0].name)}</b> at ${$(R0.upcharges.slice().sort((a, b) => a.margin - b.margin)[0].margin)} per add.` : ""} Pick anything to change; you can add more later.`) +
        table("pc-ups", [{ k: "name", l: "Up-charged component", f: (v, r) => `<b style="font-weight:600">${esc(v)}</b> <span class="hint">${esc(r.station)}</span>` }, { k: "upcharge", l: "Up-charge", n: 1, f: $ }, { k: "cost", l: "Portion cost", n: 1, f: $ }, { k: "margin", l: "Margin per add", n: 1, f: (v, r) => X($(v), { l: r.name, f: r.baseMain != null ? "up-charge − (portion cost − included main)" : "up-charge − portion cost", v: [["Up-charge", $(r.upcharge)], ["Portion cost", $(r.cost)], ...(r.baseMain != null ? [["Included main", $(r.baseMain)]] : [])], src: SRC.cost }), cls: r => r.margin < 0.25 * r.upcharge ? "pc-hi" : "" }, { k: "perStoreWeek", l: "Picks per store-week", n: 1, f: n1 }, { k: "cid", l: "", f: (v, r) => f.ups[v] != null ? flag("selected", "ok") : `<button class="linkbtn" data-act="pc:addUp:${esc(v)}">Change</button>`, raw: () => "" }], R0.upcharges.slice().sort((a, b) => a.margin - b.margin), { title: "Up-charges", name: "price-upcharges" }) +
        table("pc-items", [{ k: "name", l: "Item", f: (v, r) => `<b style="font-weight:600">${esc(v)}</b>` }, { k: "line", l: "Line" }, { k: "price", l: "Price", n: 1, f: $ }, { k: "fcSold", l: "Food cost %", n: 1, f: pf, cls: r => r.fcSold > t ? "pc-hi" : "" }, { k: "cmUnit", l: "Contribution", n: 1, f: $ }, { k: "units", l: `Units, ${period}`, n: 1, f: nf }, { k: "quadrant", l: "Quadrant", f: v => v || "—" }, { k: "id", l: "", f: v => f.prices[v] != null ? flag("selected", "ok") : `<button class="linkbtn" data-act="pc:addItem:${esc(v)}">Change</button>`, raw: () => "" }], items, { title: "Items · most sold first", name: "price-items", maxh: 360, tools: `<input type="search" data-set="pc:q" value="${esc(f.q)}" placeholder="Find an item" style="width:150px">` }) +
        (pcHas() ? stepNav("pc", 1, 4, "Set the new price") : "");
    } else if (f.step === 2) {
      if (!pcHas()) body = reading("Nothing selected yet.") + stepNav("pc", 2, 4);
      else {
        const T0 = R0.totals, T1 = R.totals;
        const rows = [];
        for (const [cid, nv] of Object.entries(f.ups)) { const b = R0.upcharges.find(u => u.cid === cid), a = R.upcharges.find(u => u.cid === cid); if (!b || !a) continue; const c = M.comps.get(cid); const pf_ = c.upcharge ? Math.max(0, Math.min(1.5, 1 + f.elasticity * (nv - c.upcharge) / c.upcharge)) : 1;
          rows.push(`<div class="pc-row"><div class="pc-what"><b>${esc(c.name)}</b> up-charge <span class="hint">now ${$(c.upcharge)}</span><button class="linkbtn" data-act="pc:rmUp:${esc(cid)}" aria-label="Remove">✕</button></div>
            <div class="ct-row"><input type="number" data-set="pc:up:${esc(cid)}" value="${nv}" step="0.05" min="0" style="width:84px" aria-label="New up-charge">${[0.25, 0.5, 1].map(d => `<button class="linkbtn" data-act="pc:bump:up:${esc(cid)}:${d}">+$${d.toFixed(2)}</button>`).join("")}<button class="linkbtn" data-act="pc:bump:up:${esc(cid)}:-0.25">−$0.25</button></div>
            <div class="ct-mini">${tile(`${$(b.margin)} → ${X($(a.margin), { l: "Margin per add", f: "new up-charge − incremental cost", v: [["New up-charge", $(nv)], ["Incremental cost", $(a.incremental)]], src: SRC.cost })}`, "margin per add")}${tile(`${nf(b.picks)} → ${X(nf(a.picks), { l: "Picks kept", f: "picks × (1 + elasticity × Δ ÷ old up-charge)", v: [["Picks before", nf(b.picks)], ["Change", sgn(nv - c.upcharge, $)], ["Elasticity", String(f.elasticity)], ["Share kept", pf(pf_ * 100, 0)]], src: SRC.mods, asm: `elasticity ${f.elasticity} (your setting)` })}`, "picks")}${tile(X(sgn(a.marginTotal - b.marginTotal, $0), { l: "Margin on this up-charge", f: "margin per add × picks kept", v: [["Before", $0(b.marginTotal)], ["After", $0(a.marginTotal)]], src: SRC.mods, asm: `elasticity ${f.elasticity}` }), "margin in the period")}</div>
            ${reading(Math.abs(nv - c.upcharge) < 0.001 ? `${esc(c.name)} is still at ${$(c.upcharge)}: type a new up-charge or use the buttons. Margin per add is <b>${$(b.margin)}</b> today.` : `${nv > c.upcharge ? "Raising" : "Lowering"} ${esc(c.name)} to ${$(nv)} ${a.margin >= b.margin ? "lifts" : "cuts"} margin per add to <b>${$(a.margin)}</b>${pf_ < 1 ? ` and, with ${pf((1 - pf_) * 100, 0)} fewer picks assumed, ` : pf_ > 1 ? ` and, with ${pf((pf_ - 1) * 100, 0)} more picks assumed, ` : "; "}margin on the up-charge ${a.marginTotal >= b.marginTotal ? "rises" : "falls"} ${sgn(a.marginTotal - b.marginTotal, $0)} in ${period}.`, Math.abs(nv - c.upcharge) < 0.001 ? "" : a.marginTotal >= b.marginTotal ? "ok" : "warn")}</div>`); }
        for (const [iid, nv] of Object.entries(f.prices)) { const b = R0.items.get(iid), a = R.items.get(iid); if (!b || !a) continue; const old = b.price; const fct = old ? Math.max(0, 1 + f.elasticity * (nv - old) / old) : 1;
          rows.push(`<div class="pc-row"><div class="pc-what"><b>${esc(b.name)}</b> <span class="hint">${esc(b.line)} · now ${$(old)}</span><button class="linkbtn" data-act="pc:rmItem:${esc(iid)}" aria-label="Remove">✕</button></div>
            <div class="ct-row"><input type="number" data-set="pc:price:${esc(iid)}" value="${nv}" step="0.05" min="0" style="width:84px" aria-label="New price">${[0.25, 0.5, 1].map(d => `<button class="linkbtn" data-act="pc:bump:item:${esc(iid)}:${d}">+$${d.toFixed(2)}</button>`).join("")}<button class="linkbtn" data-act="pc:bump:item:${esc(iid)}:-0.25">−$0.25</button></div>
            <div class="ct-mini">${tile(`${pf(b.fc)} → ${X(pf(a.fc), { l: "Food cost % at the new price", f: "food cost ÷ new price", v: [["Food cost", $(a.food)], ["New price", $(nv)]], src: SRC.cost })}`, "food cost %")}${tile(`${nf(b.units)} → ${X(nf(a.units), { l: "Units kept", f: "units × (1 + elasticity × Δprice ÷ old price)", v: [["Units before", nf(b.units)], ["Price change", sgn(nv - old, $)], ["Elasticity", String(f.elasticity)], ["Share kept", pf(fct * 100, 0)]], src: SRC.sales, asm: `elasticity ${f.elasticity} (your setting)` })}`, "units")}${tile(X(sgn(a.rev - a.cogs - (b.rev - b.cogs), $0), { l: "Contribution from this item", f: "(price − food cost) × units kept", v: [["Before", $0(b.rev - b.cogs)], ["After", $0(a.rev - a.cogs)]], src: SRC.sales, asm: `elasticity ${f.elasticity}` }), "contribution in the period")}</div>
            ${reading(Math.abs(nv - old) < 0.001 ? `${esc(b.name)} is still at ${$(old)}: type a new price or use the buttons.` : `${esc(b.name)} at ${$(nv)}: contribution per unit ${$(b.cmUnit)} → <b>${$(a.price - a.food)}</b>, ${pf((1 - fct) * 100, 0)} fewer units assumed, ${a.rev - a.cogs >= b.rev - b.cogs ? "a gain" : "a loss"} of ${sgn(a.rev - a.cogs - (b.rev - b.cogs), $0)} in ${period}.`, Math.abs(nv - old) < 0.001 ? "" : a.rev - a.cogs >= b.rev - b.cogs ? "ok" : "warn")}</div>`); }
        body = `<div class="pc-asm"><b>Demand assumption</b> ${asmBadge("How much volume changes when a price changes. −0.8 means a 10% price rise loses 8% of units or picks; fast-casual estimates run −0.5 to −1.5. Set 0 to see the price effect with no volume loss.")}<input type="range" data-set="pc:el" min="-2" max="0" step="0.1" value="${f.elasticity}" style="width:160px"><output>${f.elasticity}</output><span class="hint">${f.elasticity === 0 ? "no demand response" : `a 10% price rise loses ${Math.round(-f.elasticity * 10)}% of volume`}</span></div>
          ${rows.join("")}
          <div class="ops-tiles">${tile(X(sgn(T1.rev - T0.rev, $k), { l: "Net sales", f: "Σ units kept × new prices", v: [["Before", $0(T0.rev)], ["After", $0(T1.rev)]], src: SRC.sales, asm: `elasticity ${f.elasticity}` }), "net sales")}${tile(`${pf(T0.fc)} → ${X(pf(T1.fc), { l: "Food cost %", f: "food cost ÷ net sales", v: [["Before", pf(T0.fc)], ["After", pf(T1.fc)]], src: SRC.cost })}`, "mix-weighted food cost")}${tile(X(sgn(T1.gp - T0.gp, $k), { l: "Gross profit", f: "net sales − food cost − packaging", v: [["Before", $0(T0.gp)], ["After", $0(T1.gp)]], src: SRC.sales, asm: `elasticity ${f.elasticity}` }), `gross profit, ${period}`)}</div>
          ${stepNav("pc", 2, 4, "Check the ladder")}`;
      }
    } else if (f.step === 3) {
      const base = new Map(R0.ladder.map(l => [l.id, l])); const changed = R.ladder.filter(l => { const b = base.get(l.id); return !b || Math.abs(b.gap - l.gap) > 0.001 || Math.abs(l.gap) >= 0.05; });
      const below = R.ladder.filter(l => l.gap < -0.05); const over = R.itemList.filter(x => !x.addon && !x.byo && x.fc > t && (!R0.items.get(x.id) || R0.items.get(x.id).fc <= t));
      body = reading(below.length ? `<b>${below.length} curated item${below.length === 1 ? "" : "s"} now sit${below.length === 1 ? "s" : ""} below build-your-own</b>: ${esc(fmtList(below.map(l => `${l.name} (${$(l.price)} vs ${$(l.formula)} to build it)`), 3))}. Guests would get the same bowl cheaper by ordering the curated item. Reprice them by the same amount, or accept the gap on purpose.` : changed.length ? `Every curated item still sits on or above its build-your-own formula.` : `This change does not touch the ladder.`, below.length ? "warn" : "ok") +
        (below.length ? `<div class="ct-row"><button class="tour-next" data-act="pc:ladderFix">Reprice them to the ladder</button><span class="hint">adds a price change for each, to base + up-charges</span></div>` : "") +
        table("pc-ladder", [{ k: "name", l: "Item" }, { k: "line", l: "Line" }, { k: "price", l: "Price", n: 1, f: (v, r) => { const b = base.get(r.id); return b && Math.abs(b.price - v) > 0.001 ? `${$(b.price)} → ${$(v)}` : $(v); } }, { k: "formula", l: "Build-your-own formula", n: 1, f: (v, r) => X($(v), { l: "Base + up-charges", f: "build-your-own base price + Σ up-charges of its components", v: [["Base", $(r.base)], ...r.ups.map(u => [u.name, "+" + $(u.up)])], src: SRC.items + " + components.csv upcharge" }) }, { k: "gap", l: "Gap", n: 1, f: v => sgn(v, $), cls: r => r.gap < -0.05 ? "pc-hi" : "" }, { k: "flag", l: "Reading", f: v => flag(v, v === "On the ladder" ? "ok" : v === "Below build-your-own" ? "bad" : "quiet") }], changed.length ? changed : R.ladder, { title: changed.length ? "Items whose place on the ladder changed" : "Price ladder", name: "price-ladder-check" }) +
        (over.length ? reading(`Also: ${esc(fmtList(over.map(x => x.name), 3))} ${over.length === 1 ? "goes" : "go"} over the ${pf(t, 0)} target after this change.`, "warn") : "") + stepNav("pc", 3, 4, "Compare & export");
    } else {
      body = `<div class="ct-row"><input type="text" data-set="pc:name" value="${esc(f.name)}" placeholder="Name this option (e.g. Salmon +$0.50)" style="flex:1"><button class="linkbtn" data-act="pc:save" ${pcHas() ? "" : "disabled"}>Save as option</button><button class="linkbtn" data-act="pc:clear">Start another</button></div>
        ${pcCompare(M, sc, R0)}
        <div class="ct-row"><button class="tour-next" data-act="pc:summary">Open the summary</button><button class="linkbtn" data-act="csv:pc-compare">⤓ Comparison CSV</button><button class="linkbtn" data-act="pc:explore">Open in Explore → Scenarios</button></div>
        ${reading(`Pick the option with the best gross profit whose volume loss you believe, and whose ladder you can live with. Every volume figure rests on the demand assumption; margin per add and food cost % at the new price do not.`)}` + stepNav("pc", 4, 4);
    }
    return head + body;
  }
  function pcCompare(M, sc, R0) {
    const f = CT.flow.price; const t = CT.scope.target;
    const cols = [{ name: "Base", R: R0, scn: null }].concat(pcHas() ? [{ name: f.name.trim() || "Current", R: resultsFor(sc, pcScn()), scn: pcScn() }] : []).concat(f.options.map(o => ({ name: o.name, R: resultsFor(sc, o.scn), scn: o.scn })));
    const upIds = [...new Set(cols.flatMap(c => c.scn ? Object.keys(c.scn.upcharges) : []))];
    const rows = [["Net sales", r => $k(r.totals.rev)], ["Gross profit", r => $k(r.totals.gp)], ["Food cost %", r => pf(r.totals.fc)], ["Units", r => nf(r.totals.units)], ["Items below the ladder", r => r.ladder.filter(l => l.gap < -0.05).length], ["Meals over target", r => r.itemList.filter(x => !x.addon && !x.byo && x.fc > t).length]].concat(upIds.map(cid => [`${M.comps.get(cid).name}: margin per add`, r => { const u = r.upcharges.find(x => x.cid === cid); return u ? $(u.margin) : "—"; }])).concat(upIds.map(cid => [`${M.comps.get(cid).name}: picks`, r => { const u = r.upcharges.find(x => x.cid === cid); return u ? nf(u.picks) : "—"; }]));
    CT.exports.set("pc-compare", { name: "price-options", cols: [{ k: "metric", l: "Metric" }].concat(cols.map((c, i) => ({ k: "c" + i, l: c.name }))), rows: rows.map(([l, fn]) => Object.assign({ metric: l }, Object.fromEntries(cols.map((c, i) => ["c" + i, fn(c.R)])))) });
    return `<div class="ct-block"><div class="sub">Options side by side · ${f.options.length ? `${f.options.length} saved` : "save the current change to keep it here"}</div><div class="scroll"><table class="mini gtable"><thead><tr><th></th>${cols.map((c, i) => `<th class="n">${esc(c.name)}${i > 0 && f.options.some(o => o.name === c.name) ? ` <button class="linkbtn" data-act="pc:load:${f.options.findIndex(o => o.name === c.name)}">open</button><button class="linkbtn" data-act="pc:del:${f.options.findIndex(o => o.name === c.name)}" aria-label="Delete">✕</button>` : ""}</th>`).join("")}</tr></thead><tbody>${rows.map(([l, fn]) => `<tr><td>${esc(l)}</td>${cols.map(c => `<td class="n">${fn(c.R)}</td>`).join("")}</tr>`).join("")}</tbody></table></div><p class="hint">Volume-dependent rows (sales, gross profit, units, picks) assume elasticity ${f.elasticity}; the others are arithmetic on the data.</p></div>`;
  }
  function pcSummary() {
    const M = data().M; const f = CT.flow.price; const sc = pcScope(M); const R0 = resultsFor(sc); const scn = pcHas() ? pcScn() : null; const R = scn ? resultsFor(sc, scn) : R0; const period = sc.months ? monthsLabel(sc.months) : monthsLabel(M.months);
    const changes = Object.entries(f.ups).map(([c, v]) => `${esc(M.comps.get(c).name)} up-charge ${$(M.comps.get(c).upcharge)} → ${$(v)}`).concat(Object.entries(f.prices).map(([i, v]) => `${esc(M.items.get(i).name)} ${$(M.itemPrice(i, null))} → ${$(v)}`));
    const html = `<p class="sum-lead">${changes.length ? changes.join("; ") : "No change"}. Base period ${esc(period)}, demand assumption elasticity ${f.elasticity}.</p>
      ${sumTable(["", "Base", "Scenario"], [["Net sales", $0(R0.totals.rev), $0(R.totals.rev)], ["Gross profit", $0(R0.totals.gp), $0(R.totals.gp)], ["Food cost %", pf(R0.totals.fc), pf(R.totals.fc)], ["Units", nf(R0.totals.units), nf(R.totals.units)]])}
      ${Object.keys(f.ups).length ? `<h3>Up-charges</h3>${sumTable(["Component", "Up-charge", "Margin per add", "Picks", "Margin in period"], Object.keys(f.ups).map(c => { const b = R0.upcharges.find(u => u.cid === c), a = R.upcharges.find(u => u.cid === c); return [esc(M.comps.get(c).name), `${$(b.upcharge)} → ${$(a.upcharge)}`, `${$(b.margin)} → ${$(a.margin)}`, `${nf(b.picks)} → ${nf(a.picks)}`, `${$0(b.marginTotal)} → ${$0(a.marginTotal)}`]; }))}` : ""}
      ${R.ladder.filter(l => l.gap < -0.05).length ? `<h3>Ladder</h3><p>Below build-your-own after the change: ${esc(R.ladder.filter(l => l.gap < -0.05).map(l => `${l.name} (${$(l.price)} vs ${$(l.formula)})`).join("; "))}.</p>` : "<p>Every curated item stays on or above its build-your-own formula.</p>"}
      ${f.options.length ? `<h3>Options</h3>${sumTable(["Option", "Gross profit", "Food cost %", "Units"], f.options.map(o => { const r = resultsFor(sc, o.scn); return [esc(o.name), $0(r.totals.gp), pf(r.totals.fc), nf(r.totals.units)]; }))}` : ""}
      <p class="sum-foot">Units and picks after a change = before × (1 + elasticity × price change ÷ old price). Margin per add = up-charge − (portion cost − included main). Method: docs/methodology.md.</p>`;
    showSummary("Price change · " + (f.name || changes[0] || "summary").replace(/<[^>]+>/g, ""), html);
  }

  /* ---------- Evaluate a menu change ---------- */
  const MC_TYPES = [["new", "New item", "Assemble a candidate from components; cost, margin, prep and what it pulls from the menu."], ["lto", "Limited-time offer", "A new item for a set number of weeks, with its pull from existing items."], ["portion", "Portion change", "Change the portions in an existing item; see cost, margin and nutrition move."], ["swap", "Swap a component", "Replace one component with another everywhere it is used."], ["remove", "Remove an item", "Cut an item; see where its volume goes and what prep disappears."]];
  function mcBlank(type) { return { name: "", line: "Bowls", price: 14.25, recipe: [], units: 60, cannibal: 70, weeks: type === "lto" ? 6 : "", item: "", swapFrom: "", swapTo: "", retention: 80 }; }
  function mcScn() { const f = CT.flow.menu; const d = f.def; if (!d) return null; const t = f.type; const s = { name: f.name || MC_TYPES.find(x => x[0] === t)[1], elasticity: -0.8 };
    if (t === "new" || t === "lto") { if (!d.recipe.length) return null; s.newItems = [{ id: "new-" + (CM.slug(d.name) || "item"), name: d.name || "New item", line: d.line, price: +d.price || 0, recipe: d.recipe.map(p => ({ ...p })), unitsPerStoreWeek: +d.units || 0, cannibal: Math.min(1, Math.max(0, (+d.cannibal || 0) / 100)), weeks: t === "lto" && d.weeks ? +d.weeks : null }]; }
    else if (t === "portion") { if (!d.item || !d.recipe.length) return null; s.recipes = { [d.item]: d.recipe.filter(p => p.portions > 0).map(p => ({ ...p })) }; }
    else if (t === "swap") { if (!d.swapFrom || !d.swapTo || d.swapFrom === d.swapTo) return null; s.swaps = [{ from: d.swapFrom, to: d.swapTo }]; }
    else if (t === "remove") { if (!d.item) return null; s.remove = [d.item]; s.retention = Math.min(1, Math.max(0, (+d.retention || 0) / 100)); }
    return s; }
  function mcAct(arg) {
    const [k, ...r] = arg.split(":"); const v = r.join(":"); const f = CT.flow.menu; const M = data().M;
    if (k === "step") f.step = +v;
    else if (k === "type") { f.type = v; f.def = mcBlank(v); f.step = 2; }
    else if (k === "add") { const c = CT.ui.mcPick; if (c && M.comps.has(c)) f.def.recipe.push({ cid: c, portions: +CT.ui.mcQty || 1 }); CT.ui.mcPick = ""; }
    else if (k === "rm") f.def.recipe.splice(+v, 1);
    else if (k === "pickItem") { const it = M.items.get(v); if (it) { f.def.item = v; f.def.recipe = it.recipe.map(p => ({ ...p })); f.def.name = it.name; } }
    else if (k === "save") { const s = mcScn(); if (!s) return; const name = f.name.trim() || `Option ${f.options.length + 1}`; const i = f.options.findIndex(o => o.name === name); const rec = { name, scn: Object.assign(s, { name }), type: f.type, def: JSON.parse(JSON.stringify(f.def)) }; if (i >= 0) f.options[i] = rec; else f.options.push(rec); f.name = ""; }
    else if (k === "load") { const o = f.options[+v]; if (o) { f.type = o.type; f.def = JSON.parse(JSON.stringify(o.def)); f.name = o.name; f.step = 3; } }
    else if (k === "del") f.options.splice(+v, 1);
    else if (k === "summary") mcSummary();
    else if (k === "explore") { const s = mcScn(); if (s) { CT.scn = Object.assign(blankScn(), s); go("explore:scenarios"); } return; }
    render();
  }
  function mcSet(a, b, value, el) {
    const f = CT.flow.menu; const d = f.def || {};
    if (a === "name") { f.name = value; return; } if (a === "pick") { CT.ui.mcPick = value; return; } if (a === "qty") { CT.ui.mcQty = value; return; }
    if (a === "portions") { const p = d.recipe[+b]; if (p) p.portions = +value; return rerenderSoon(); }
    if (a === "item") { mcAct("pickItem:" + value); return; }
    if (["units", "cannibal", "weeks", "price", "retention", "iname"].includes(a)) { d[a === "iname" ? "name" : a] = value; return rerenderSoon(); }
    if (a === "line" || a === "swapFrom" || a === "swapTo") { d[a] = value; return render(); }
  }
  function jobMenu(M) {
    const f = CT.flow.menu; const t = CT.scope.target; const sc = {}; const R0 = resultsFor(sc); const scn = mcScn(); const R = scn ? resultsFor(sc, scn) : R0; const d = f.def; const period = monthsLabel(M.months);
    const typeLabel = f.type ? MC_TYPES.find(x => x[0] === f.type)[1] : "";
    const head = jobHead("Evaluate a menu change", "Pick the change, define it, see its cost and margin, then the ripple across the menu and the prep line. Compare options and export.") + stepper(["Pick the change", "Define it", "Cost & margin", "Ripple", "Compare & export"], f.step, "mc");
    let body = "";
    if (f.step === 1 || !d) {
      body = `<div class="job-cards">${MC_TYPES.map(([k, l, dsc]) => `<button class="job-card ${f.type === k ? "on" : ""}" data-act="mc:type:${k}"><b>${l}</b><span>${dsc}</span></button>`).join("")}</div>` + reading(`Or start from a build guests already order: <button class="linkbtn" data-act="go:ideas">New item ideas →</button>`);
    } else if (f.step === 2) {
      const compsOpt = compOptions(M); const curated = itemOptions(M, i => !i.byo && i.recipe.length);
      const cost = (f.type === "new" || f.type === "lto" || f.type === "portion") ? CM.costOf(M, d.recipe, R0.refStore, R0.refDate, null) : null;
      if (f.type === "new" || f.type === "lto") body = `<div class="ct-editor">
          <div class="ct-row"><input type="text" data-set="mc:iname" value="${esc(d.name)}" placeholder="Item name" style="flex:1">${sel("mc:line", M.lines.filter(l => !M.addonLines.has(l)).map(l => [l, l]), d.line)}<label class="hint">Price</label><input type="number" data-set="mc:price" value="${d.price}" step="0.05" style="width:80px"></div>
          <div class="ct-row">${sel("mc:pick", [["", "— add a component —"]].concat(compsOpt), CT.ui.mcPick || "")}<input type="number" data-set="mc:qty" value="${CT.ui.mcQty || 1}" step="0.25" min="0.25" style="width:64px" aria-label="Portions"><button class="linkbtn" data-act="mc:add">Add</button></div>
          <div class="ct-list">${d.recipe.map((p, i) => `<div><span>${esc(M.comps.get(p.cid).name)} <span class="hint">×${p.portions} · ${$(cost.parts[i] ? cost.parts[i].cost : 0)}</span></span><button class="linkbtn" data-act="mc:rm:${i}" aria-label="Remove">✕</button></div>`).join("") || `<p class="hint">Add the components. Half a scoop is 0.5, a double is 2.</p>`}</div>
          <div class="ct-row"><label class="hint">Expected units per store-week ${asmBadge("Your forecast. Everything in step 4 that depends on volume scales with it.")}</label><input type="number" data-set="mc:units" value="${d.units}" min="0" style="width:70px"><label class="hint">share pulled from items on the same line ${asmBadge("How much of the new item's volume replaces existing items on its line rather than adding demand. 70% is a common planning figure for a like-for-like item.")}</label><input type="number" data-set="mc:cannibal" value="${d.cannibal}" min="0" max="100" style="width:60px"><span class="hint">%</span>${f.type === "lto" ? `<label class="hint">Weeks on the menu</label><input type="number" data-set="mc:weeks" value="${d.weeks}" min="1" style="width:60px">` : ""}</div>
        </div>` + (d.recipe.length ? stepNav("mc", 2, 5, "Cost & margin") : "");
      else if (f.type === "portion") body = `<div class="ct-editor"><div class="ct-row">${sel("mc:item", [["", "— pick an item —"]].concat(curated), d.item)}</div>
          ${d.item ? `<div class="ct-list">${d.recipe.map((p, i) => { const it = M.items.get(d.item); const orig = it.recipe.find(x => x.cid === p.cid); return `<div><span>${esc(M.comps.get(p.cid).name)} <span class="hint">${esc(M.comps.get(p.cid).station)} · was ×${orig ? orig.portions : "—"} · ${$(cost.parts[i] ? cost.parts[i].cost : 0)}</span></span><input type="number" data-set="mc:portions:${i}" value="${p.portions}" step="0.25" min="0" style="width:64px" aria-label="Portions"></div>`; }).join("")}</div><div class="ct-row">${sel("mc:pick", [["", "— add a component —"]].concat(compsOpt), CT.ui.mcPick || "")}<input type="number" data-set="mc:qty" value="${CT.ui.mcQty || 1}" step="0.25" min="0.25" style="width:64px" aria-label="Portions"><button class="linkbtn" data-act="mc:add">Add</button></div><p class="hint">Set a portion to 0 to drop a component.</p>` : `<p class="hint">Pick a curated item; its recipe appears here with editable portions.</p>`}
        </div>` + (d.item ? stepNav("mc", 2, 5, "Cost & margin") : "");
      else if (f.type === "swap") body = `<div class="ct-editor"><div class="ct-row">${sel("mc:swapFrom", [["", "— replace —"]].concat(compsOpt), d.swapFrom)}<span class="hint">with</span>${sel("mc:swapTo", [["", "— component —"]].concat(compsOpt), d.swapTo)}</div><p class="hint">Every recipe and every build-your-own order that used the first component is costed and counted with the second, portions unchanged.</p></div>` + (d.swapFrom && d.swapTo && d.swapFrom !== d.swapTo ? stepNav("mc", 2, 5, "Cost & margin") : "");
      else body = `<div class="ct-editor"><div class="ct-row">${sel("mc:item", [["", "— pick an item —"]].concat(itemOptions(M, i => !i.byo)), d.item)}</div><div class="ct-row"><label class="hint">Share of its volume that moves to other items on the line ${asmBadge("80% means four in five of its orders become another item on the same line, in proportion to what already sells; the rest is lost.")}</label><input type="number" data-set="mc:retention" value="${d.retention}" min="0" max="100" style="width:60px"><span class="hint">%</span></div></div>` + (d.item ? stepNav("mc", 2, 5, "Cost & margin") : "");
    } else if (f.step === 3) {
      if (!scn) body = reading("The change is not complete yet.") + stepNav("mc", 3, 5);
      else if (f.type === "new" || f.type === "lto") { const n = R.items.get(scn.newItems[0].id); const cu = R0.crossUtil(d.recipe);
        body = `<div class="ops-tiles">${tile(X($(n.food), { l: "Food cost", f: "Σ portions × portion cost (after yield)", v: n.parts.map(p => [`${p.name} ×${p.portions}`, $(p.cost)]), src: SRC.cost }), "food cost per unit")}${tile(X(pf(n.fc), { l: "Food cost %", f: "food cost ÷ price", v: [["Food cost", $(n.food)], ["Price", $(n.price)]], src: SRC.cost }), `food cost % at ${$(n.price)}`, null, n.fc > t ? "pc-hi" : "")}${tile(X($(n.priceFor), { l: `Price for ${pf(t, 0)}`, f: "food cost ÷ target", v: [["Food cost", $(n.food)], ["Target", pf(t, 0)]], src: SRC.cost }), `price for ${pf(t, 0)} food cost`)}${tile($(n.cm), "contribution per unit")}${tile(cu.score == null ? "—" : pf(cu.score * 100, 0), "components already at volume")}</div>
          ${reading(`<b>${esc(n.name)}</b> costs <b>${$(n.food)}</b> to make and sells at ${$(n.price)}: <b>${pf(n.fc)}</b> food cost, ${n.fc <= t ? "under" : "over"} the ${pf(t, 0)} target${n.fc > t ? ` (${$(n.priceFor)} would hit it)` : ""}. ${cu.newLoad.length ? `It needs new prep for ${esc(cu.newLoad.join(", "))}.` : "Every component is already prepped at volume."}`, n.fc <= t ? "ok" : "warn")}
          ${table("mc-parts", [{ k: "name", l: "Component" }, { k: "station", l: "Station" }, { k: "portions", l: "Portions", n: 1 }, { k: "unit", l: "Portion cost", n: 1, f: $ }, { k: "cost", l: "Cost", n: 1, f: $ }, { k: "cost", l: "Share", n: 1, f: v => pf(n.food ? v / n.food * 100 : null, 0) }], n.parts, { name: "new-item-cost" })}` + stepNav("mc", 3, 5, "Ripple"); }
      else if (f.type === "portion") { const a = R.items.get(d.item), b = R0.items.get(d.item); const nut = R.nutrition.find(x => x.id === d.item), nut0 = R0.nutrition.find(x => x.id === d.item);
        body = `<div class="ops-tiles">${tile(`${$(b.food)} → ${X($(a.food), { l: "Food cost after", f: "Σ new portions × portion cost", v: a.parts.map(p => [`${p.name} ×${p.portions}`, $(p.cost)]), src: SRC.cost })}`, "food cost per unit")}${tile(`${pf(b.fc)} → ${pf(a.fc)}`, `food cost % at ${$(a.price)}`, null, a.fc > t ? "pc-hi" : "")}${tile(`${$(b.cm)} → ${$(a.cm)}`, "contribution per unit")}${nut && nut0 && R.hasNutrition ? tile(`${nf(nut0.calc)} → ${nf(nut.calc)}`, `calories from portions (menu says ${nf(nut.menu)})`) : ""}</div>
          ${reading(`${esc(a.name)}: food cost ${$(b.food)} → <b>${$(a.food)}</b> (${sgn(a.food - b.food, $)}), contribution ${$(b.cm)} → <b>${$(a.cm)}</b> per unit${b.units ? `, ${sgn((a.cm - b.cm) * b.units, $0)} on ${nf(b.units)} units in ${period}` : ""}.`, a.food <= b.food ? "ok" : "warn")}
          ${table("mc-portion", [{ k: "name", l: "Component" }, { k: "was", l: "Portions before", n: 1 }, { k: "portions", l: "After", n: 1 }, { k: "cost", l: "Cost after", n: 1, f: $ }], a.parts.map(p => ({ name: p.name, was: (b.parts.find(x => x.cid === p.cid) || { portions: 0 }).portions, portions: p.portions, cost: p.cost })).concat(b.parts.filter(p => !a.parts.some(x => x.cid === p.cid)).map(p => ({ name: p.name, was: p.portions, portions: 0, cost: 0 }))), { name: "portion-change" })}` + stepNav("mc", 3, 5, "Ripple"); }
      else if (f.type === "swap") { const from = M.comps.get(d.swapFrom), to = M.comps.get(d.swapTo); const c0 = M.compCost(d.swapFrom, R0.refStore, R0.refDate), c1 = M.compCost(d.swapTo, R0.refStore, R0.refDate); const hit = [...R0.items.values()].filter(x => x.parts.some(p => p.cid === d.swapFrom)); const pk = R0.byo.picks.find(p => p.cid === d.swapFrom);
        body = `<div class="ops-tiles">${tile(`${$(c0)} → ${$(c1)}`, "portion cost, before → after")}${tile(hit.length, "curated items affected")}${tile(pk ? nf(pk.byoPicks) : 0, `build-your-own orders picking ${esc(from.name)}`)}</div>
          ${reading(`Swapping <b>${esc(from.name)}</b> for <b>${esc(to.name)}</b> changes the portion cost by ${sgn(c1 - c0, $)} everywhere it appears: ${hit.length} curated item${hit.length === 1 ? "" : "s"} and ${pk ? nf(pk.byoPicks) : 0} build-your-own orders in ${period}.`, c1 <= c0 ? "ok" : "warn")}
          ${table("mc-swap", [{ k: "name", l: "Item" }, { k: "line", l: "Line" }, { k: "food0", l: "Food cost before", n: 1, f: $ }, { k: "food1", l: "After", n: 1, f: $ }, { k: "fc1", l: "Food cost %", n: 1, f: (v, r) => `${pf(r.fc0)} → ${pf(v)}`, cls: r => r.fc1 > t ? "pc-hi" : "" }], hit.map(x => { const a = R.items.get(x.id); return { name: x.name, line: x.line, food0: x.food, food1: a.food, fc0: x.fc, fc1: a.fc }; }), { name: "swap-items" })}` + stepNav("mc", 3, 5, "Ripple"); }
      else { const b = R0.items.get(d.item); const pr = R0.ops.prep.find(p => p.id === d.item);
        body = `<div class="ops-tiles">${tile(nf(b.units), `units in ${period}`)}${tile($k(b.rev), "net sales")}${tile($k(b.rev - b.cogs), "contribution")}${tile(b.quadrant || "—", b.read || "")}${tile(pr ? pr.exclusive.length : 0, "components only this item needs")}</div>
          ${reading(`Removing <b>${esc(b.name)}</b> takes out ${$0(b.rev - b.cogs)} of contribution in ${period}; with ${d.retention}% of its volume assumed to move to other ${esc(b.line)} ${asmBadge("retention " + d.retention + "% (your setting)")}, the next step shows what comes back.${pr && pr.exclusive.length ? ` Prep that disappears with it: ${esc(pr.exclusive.join(", "))}.` : ""}`, "warn")}` + stepNav("mc", 3, 5, "Ripple"); }
    } else if (f.step === 4) {
      if (!scn) body = reading("The change is not complete yet.") + stepNav("mc", 4, 5);
      else { const T0 = R0.totals, T1 = R.totals; const rows = [...R.items.values()].map(x => { const b = R0.items.get(x.id); const gp0 = b ? b.rev - b.cogs : 0, gp1 = x.removed ? 0 : x.rev - x.cogs; return { id: x.id, name: x.name + (x.isNew ? " (new)" : "") + (x.removed ? " (removed)" : ""), line: x.line, units0: b ? b.units : 0, units1: x.removed ? 0 : x.units, fc0: b ? b.fc : null, fc1: x.fc, dgp: gp1 - gp0 }; }).filter(r => Math.abs(r.dgp) > 0.5 || Math.abs(r.units1 - r.units0) > 0.5 || (r.fc0 != null && r.fc1 != null && Math.abs(r.fc1 - r.fc0) > 0.05)).sort((a, b) => Math.abs(b.dgp) - Math.abs(a.dgp));
        const asmText = f.type === "new" || f.type === "lto" ? `${d.units} units per store-week, ${d.cannibal}% pulled from the line${f.type === "lto" ? `, ${d.weeks} weeks` : ""}` : f.type === "remove" ? `${d.retention}% of its volume moves to the line` : null;
        const prep = (f.type === "new" || f.type === "lto") ? R.ops.prep.find(p => p.id === scn.newItems[0].id) : null; const cu = prep ? R0.crossUtil(d.recipe) : null;
        body = `<div class="ops-tiles">${tile(X(delta(T1.rev - T0.rev, $k), { l: "Net sales", f: "scenario − base", v: [["Base", $0(T0.rev)], ["Scenario", $0(T1.rev)]], src: SRC.sales, asm: asmText || undefined }), "net sales")}${tile(`${pf(T0.fc)} → ${X(pf(T1.fc), { l: "Mix-weighted food cost", f: "food cost ÷ net sales", v: [["Base", pf(T0.fc)], ["Scenario", pf(T1.fc)]], src: SRC.cost, asm: asmText || undefined })}`, "food cost %")}${tile(X(delta(T1.gp - T0.gp, $k), { l: "Gross profit", f: "scenario − base", v: [["Base", $0(T0.gp)], ["Scenario", $0(T1.gp)]], src: SRC.sales, asm: asmText || undefined }), `gross profit, ${period}`)}${prep ? tile(`${prep.components} · ${prep.stations}`, "components · stations") : ""}${prep ? tile(X(nf(prep.steps), { l: "Prep steps", f: "Σ prep_steps of its components (default 1)", src: "components.csv prep_steps" }), "prep steps") : ""}${cu ? tile(cu.newLoad.length, "new prep items", cu.newLoad.length ? `<b>New prep</b>` + ttList(cu.newLoad.map(esc)) : "") : ""}</div>
          ${reading(`Across the menu, ${T1.gp - T0.gp >= 0 ? "gross profit rises" : "gross profit falls"} <b>${sgn(T1.gp - T0.gp, $0)}</b> in ${period} and food cost moves ${pts(T1.fc - T0.fc)}${asmText ? ` ${asmBadge(asmText)}` : ""}. ${rows.length} item${rows.length === 1 ? "" : "s"} change.${prep ? ` Prep: ${prep.components} components on ${prep.stations} stations${cu.newLoad.length ? `, new load for ${esc(cu.newLoad.join(", "))}` : ", nothing new to prep"}.` : ""}`, T1.gp - T0.gp >= 0 ? "ok" : "warn")}
          ${table("mc-ripple", [{ k: "name", l: "Item" }, { k: "line", l: "Line" }, { k: "units1", l: "Units", n: 1, f: (v, r) => `${nf(r.units0)} → ${nf(v)}` }, { k: "fc1", l: "Food cost %", n: 1, f: (v, r) => r.fc0 != null && Math.abs(r.fc0 - v) > 0.05 ? `${pf(r.fc0)} → ${pf(v)}` : pf(v), cls: r => r.fc1 > t ? "pc-hi" : "" }, { k: "dgp", l: "Gross profit change", n: 1, f: v => sgn(v, $0), cls: r => r.dgp < 0 ? "pc-hi" : "" }], rows, { title: "Affected items", name: "menu-change-ripple", maxh: 360, empty: "No item changes." })}` + stepNav("mc", 4, 5, "Compare & export"); }
    } else {
      const cols = [{ name: "Base", R: R0 }].concat(scn ? [{ name: f.name.trim() || "Current", R }] : []).concat(f.options.map(o => ({ name: o.name, R: resultsFor(sc, o.scn), i: f.options.indexOf(o) })));
      const rows = [["Net sales", r => $k(r.totals.rev)], ["Gross profit", r => $k(r.totals.gp)], ["Food cost %", r => pf(r.totals.fc)], ["Units", r => nf(r.totals.units)], ["Meals over target", r => r.itemList.filter(x => !x.addon && !x.byo && x.fc > t).length], ["Distinct components in use", r => r.ops.prep.reduce((s, p) => s + p.components, 0)]];
      CT.exports.set("mc-compare", { name: "menu-change-options", cols: [{ k: "metric", l: "Metric" }].concat(cols.map((c, i) => ({ k: "c" + i, l: c.name }))), rows: rows.map(([l, fn]) => Object.assign({ metric: l }, Object.fromEntries(cols.map((c, i) => ["c" + i, fn(c.R)])))) });
      body = `<div class="ct-row"><input type="text" data-set="mc:name" value="${esc(f.name)}" placeholder="Name this option" style="flex:1"><button class="linkbtn" data-act="mc:save" ${scn ? "" : "disabled"}>Save as option</button><button class="linkbtn" data-act="mc:step:1">Start another</button></div>
        <div class="ct-block"><div class="sub">Options side by side</div><div class="scroll"><table class="mini gtable"><thead><tr><th></th>${cols.map(c => `<th class="n">${esc(c.name)}${c.i != null ? ` <button class="linkbtn" data-act="mc:load:${c.i}">open</button><button class="linkbtn" data-act="mc:del:${c.i}" aria-label="Delete">✕</button>` : ""}</th>`).join("")}</tr></thead><tbody>${rows.map(([l, fn]) => `<tr><td>${esc(l)}</td>${cols.map(c => `<td class="n">${fn(c.R)}</td>`).join("")}</tr>`).join("")}</tbody></table></div></div>
        <div class="ct-row"><button class="tour-next" data-act="mc:summary" ${scn ? "" : "disabled"}>Open the summary</button><button class="linkbtn" data-act="csv:mc-compare">⤓ Comparison CSV</button><button class="linkbtn" data-act="mc:explore" ${scn ? "" : "disabled"}>Open in Explore → Scenarios</button></div>` + stepNav("mc", 5, 5);
    }
    return head + (f.type && f.step > 1 ? `<p class="hint" style="margin:-6px 0 4px">${esc(typeLabel)}${d && d.name ? ` · ${esc(d.name)}` : ""}</p>` : "") + body;
  }
  function mcSummary() {
    const M = data().M; const f = CT.flow.menu; const scn = mcScn(); if (!scn) return; const R0 = resultsFor({}), R = resultsFor({}, scn); const t = CT.scope.target; const d = f.def; const period = monthsLabel(M.months);
    const what = f.type === "new" || f.type === "lto" ? `${MC_TYPES.find(x => x[0] === f.type)[1]}: ${esc(d.name)} at ${$(+d.price)} (${d.recipe.map(p => esc(M.comps.get(p.cid).name) + (p.portions !== 1 ? " ×" + p.portions : "")).join(", ")}); ${d.units} units per store-week, ${d.cannibal}% pulled from the line${f.type === "lto" ? `, ${d.weeks} weeks` : ""}` : f.type === "portion" ? `Portion change: ${esc(d.name)} → ${d.recipe.map(p => esc(M.comps.get(p.cid).name) + " ×" + p.portions).join(", ")}` : f.type === "swap" ? `Swap ${esc(M.comps.get(d.swapFrom).name)} for ${esc(M.comps.get(d.swapTo).name)}` : `Remove ${esc(M.items.get(d.item).name)}, ${d.retention}% of its volume moving to the line`;
    const n = scn.newItems ? R.items.get(scn.newItems[0].id) : null;
    const html = `<p class="sum-lead">${what}. Base: ${esc(period)}, costs as of ${R0.refDate}.</p>
      ${n ? sumTable(["Food cost", "Price", "Food cost %", `Price for ${pf(t, 0)}`, "Contribution"], [[$(n.food), $(n.price), pf(n.fc), $(n.priceFor), $(n.cm)]]) : ""}
      ${sumTable(["", "Base", "With the change"], [["Net sales", $0(R0.totals.rev), $0(R.totals.rev)], ["Gross profit", $0(R0.totals.gp), $0(R.totals.gp)], ["Food cost %", pf(R0.totals.fc), pf(R.totals.fc)], ["Units", nf(R0.totals.units), nf(R.totals.units)]])}
      ${f.options.length ? `<h3>Options</h3>${sumTable(["Option", "Gross profit", "Food cost %"], f.options.map(o => { const r = resultsFor({}, o.scn); return [esc(o.name), $0(r.totals.gp), pf(r.totals.fc)]; }))}` : ""}
      <p class="sum-foot">Volume figures rest on the stated assumptions (units per store-week, share pulled from the line, retention). Costs and margins per unit are arithmetic on the data. Method: docs/methodology.md.</p>`;
    showSummary("Menu change · " + (d.name || MC_TYPES.find(x => x[0] === f.type)[1]), html);
  }

  /* ---------- Suggest new menu items ---------- */
  function idAct(arg) { const [k, v] = arg.split(":"); const f = CT.flow.ideas; const M = data().M; const list = CM.suggest(M, resultsFor({}), CT.scope.target);
    if (k === "open") f.open = f.open === v ? null : v;
    if (k === "eval") { const s = list.find(x => x.key === v); if (s) { CT.flow.menu.type = "new"; CT.flow.menu.def = Object.assign(mcBlank("new"), { name: (s.mains.length ? s.mains.join(" + ") : "Guest build") + " bowl", line: s.line, price: s.suggestedPrice, recipe: s.recipe.map(p => ({ ...p })), units: Math.max(1, Math.round(s.perStoreWeek)), cannibal: 70 }); CT.flow.menu.step = 3; CT.job = "menu"; } }
    render(); }
  function jobIdeas(M) {
    const R = resultsFor({}); const t = CT.scope.target; const list = CM.suggest(M, R, t).slice(0, 10); const f = CT.flow.ideas;
    if (!R.byo.orders) return jobHead("Suggest new menu items", "Needs build-your-own orders with modifiers.") + reading("Load modifiers.csv so the tool can see the builds guests make themselves.");
    const puzzles = R.itemList.filter(x => x.quadrant === "Puzzle").sort((a, b) => b.cmUnit - a.cmUnit).slice(0, 5);
    return jobHead("Suggest new menu items", "Builds guests already order that no curated item offers, ranked by what they would earn: demand × contribution, favouring components already stocked at volume and builds under the target food cost.") +
      reading(`Scored on ${monthsLabel(M.months)}: ${X("score", { l: "Candidate score", f: "contribution per order × orders per store-week × (0.5 + 0.5 × share of components at volume) × min(1, target ÷ food cost %)", src: SRC.mods + " + " + SRC.cost })} rewards builds that sell often, earn well at the price guests already pay, need no new prep, and sit under the ${pf(t, 0)} target.`) +
      `<div class="ideas">${list.map((s, i) => `<div class="idea ${f.open === s.key ? "open" : ""}"><div class="idea-head"><span class="idea-rank">${i + 1}</span><div class="idea-title"><b>${esc(s.mains.join(" + ") || "Build")}</b> <span class="hint">${esc(s.line)}</span><div class="idea-build">${esc(s.label)}</div></div>
          <div class="idea-nums">${tile(X(s.perStoreWeek.toFixed(0), { l: "Orders per store-week", f: "orders of this exact build ÷ stores ÷ weeks", v: [["Orders", nf(s.n)]], src: SRC.mods }), "per store-week")}${tile(X($(s.suggestedPrice), { l: "Suggested price", f: "average paid for this build, rounded to 5¢", v: [["Average paid", $(s.avgPrice)], ["Price for " + pf(t, 0), $(s.priceFor)]], src: SRC.sales }), "price")}${tile(X(pf(s.fcAtPrice), { l: "Food cost % at that price", f: "build cost ÷ suggested price", v: [["Build cost", $(s.unitCost)]], src: SRC.cost }), "food cost", null, s.fcAtPrice > t ? "pc-hi" : "")}${tile(X($0(s.gpPerStoreWeek), { l: "Contribution per store-week", f: "(price paid − cost) × orders per store-week", src: SRC.sales }), "contribution / store-week")}</div></div>
          <div class="idea-why"><div class="sub" style="margin:0 0 4px">Why</div><ul class="ct-notes">${s.why.map(w => `<li>${esc(w)}</li>`).join("")}</ul></div>
          <div class="ct-row"><button class="tour-next" data-act="id:eval:${esc(s.key)}">Evaluate as a new item →</button><button class="linkbtn" data-act="go:explore:sales:byo">See the builds</button></div></div>`).join("")}</div>
      ${puzzles.length ? `<div class="ct-block"><div class="sub">Also worth a look · profitable items few guests order (Puzzles)</div>${table("ideas-puzzles", [{ k: "name", l: "Item" }, { k: "line", l: "Line" }, { k: "units", l: "Units", n: 1, f: nf }, { k: "cmUnit", l: "Contribution", n: 1, f: $ }, { k: "fcSold", l: "Food cost %", n: 1, f: pf }, { k: "read", l: "Reading" }], puzzles, { name: "puzzles" })}</div>` : ""}`;
  }


  /* ---------- What to do: given a situation, the best course of action ---------- */
  const ADV_TYPES = [["general", "Improve food cost", "Nothing changed; find the best moves on today's menu."], ["cost", "A component cost changed", "A supplier price moved, or is about to."], ["unavailable", "A component is unavailable", "A shortage or a delisting: what replaces it?"], ["newComponent", "A new component is available", "A new product or supplier: where does it fit, and what does it earn?"], ["price", "A price change is planned", "What else should move with it?"]];
  function advBlank() { return { step: 1, type: "general", cid: "", pct: 15, iid: "", upId: "", value: "", comp: { name: "", station: "Mains", cost: "", upcharge: "" }, opts: { elasticity: -0.8, allowPortion: true, allowSwap: true, allowRemove: true, allowNew: true, maxStep: 1 }, pick: null, result: null, base: "last" }; }
  if (!CT.flow.advise) CT.flow.advise = advBlank();
  const advScope = M => CT.flow.advise.base === "all" ? {} : { months: lastMonths(M, 1) };
  function advTrigger(M) { const f = CT.flow.advise; if (f.type === "cost") return f.cid ? { type: "cost", cid: f.cid, pct: +f.pct || 0 } : null; if (f.type === "unavailable") return f.cid ? { type: "unavailable", cid: f.cid } : null; if (f.type === "newComponent") return f.comp.name && +f.comp.cost > 0 ? { type: "newComponent", comp: { name: f.comp.name, station: f.comp.station, cost: +f.comp.cost, upcharge: +f.comp.upcharge || 0 } } : null; if (f.type === "price") { if (f.upId) return +f.value >= 0 && f.value !== "" ? { type: "price", cid: f.upId, value: +f.value } : null; if (f.iid) return +f.value > 0 ? { type: "price", iid: f.iid, value: +f.value } : null; return null; } return { type: "general" }; }
  function advRun(M, pick) {
    const f = CT.flow.advise; const trig = advTrigger(M); if (!trig) return null;
    const sc = Object.assign({ target: CT.scope.target }, advScope(M)); const scope = { stores: null, months: sc.months ? new Set(sc.months) : null, channel: "all", target: CT.scope.target };
    const key = "A|" + CT.src + "|" + JSON.stringify([trig, f.opts, sc, pick ? [...pick] : null]);
    let r = CT.cache.get(key); if (r) return r;
    r = CM.recommend(M, scope, trig, Object.assign({}, f.opts, pick ? { pick } : {})); CT.cache.set(key, r); return r;
  }
  function advAct(arg) { const [k, ...r] = arg.split(":"); const v = r.join(":"); const f = CT.flow.advise; const M = data().M;
    if (k === "step") f.step = +v;
    else if (k === "type") { f.type = v; f.pick = null; }
    else if (k === "run") { f.pick = null; f.result = advRun(M); if (f.result) f.step = 2; }
    else if (k === "toggle") { const r = advRun(M, f.pick); if (!r) return; const set = new Set(f.pick || r.plan.map(p => p.id)); if (set.has(v)) set.delete(v); else set.add(v); f.pick = set; }
    else if (k === "reset") { f.pick = null; }
    else if (k === "explore") { const r = advRun(M, f.pick); if (r) { CT.scn = Object.assign(blankScn(), r.combined, { name: "What to do: " + advLabel(M) }); go("explore:scenarios"); } return; }
    else if (k === "price") { const r = advRun(M, f.pick); if (r) { const p = CT.flow.price; p.prices = Object.assign({}, r.combined.prices); p.ups = Object.assign({}, r.combined.upcharges); p.elasticity = f.opts.elasticity; p.base = f.base; p.step = 2; CT.job = "price"; } }
    else if (k === "menu") { const r = advRun(M, f.pick); const c = r && r.plan.find(p => p.kind === v); if (c) { const m = CT.flow.menu; if (c.kind === "new") { const n = c.scn.newItems[0]; m.type = "new"; m.def = Object.assign(mcBlank("new"), { name: n.name, line: n.line, price: n.price, recipe: n.recipe.map(p => ({ ...p })), units: n.unitsPerStoreWeek, cannibal: Math.round(n.cannibal * 100) }); } else if (c.kind === "portion") { const iid = Object.keys(c.scn.recipes)[0]; m.type = "portion"; m.def = Object.assign(mcBlank("portion"), { item: iid, name: M.items.get(iid).name, recipe: c.scn.recipes[iid].map(p => ({ ...p })) }); } else if (c.kind === "swap" && c.scn.swaps) { m.type = "swap"; m.def = Object.assign(mcBlank("swap"), { swapFrom: c.scn.swaps[0].from, swapTo: c.scn.swaps[0].to }); } else if (c.kind === "remove") { m.type = "remove"; m.def = Object.assign(mcBlank("remove"), { item: c.scn.remove[0], retention: Math.round(c.scn.retention * 100) }); } else return; m.step = 3; CT.job = "menu"; } }
    else if (k === "summary") advSummary();
    render(); }
  function advSet(a, b, value, el) { const f = CT.flow.advise;
    if (a === "cid") f.cid = value; else if (a === "pct") f.pct = value; else if (a === "iid") { f.iid = value; f.upId = ""; const M = data().M; if (value) f.value = M.itemPrice(value, null); } else if (a === "upId") { f.upId = value; f.iid = ""; const M = data().M; if (value) f.value = (M.comps.get(value) || {}).upcharge; } else if (a === "value") f.value = value; else if (a === "base") f.base = value;
    else if (a.startsWith("comp")) f.comp[a.slice(4).toLowerCase()] = value; else if (a === "el") { f.opts.elasticity = +value; el.nextElementSibling && (el.nextElementSibling.textContent = value); return; } else if (a === "maxStep") f.opts.maxStep = +value; else if (a.startsWith("allow")) f.opts[a] = !!el.checked;
    if (["iid", "upId", "base", "cid", "compStation", "maxStep"].includes(a) || a.startsWith("allow")) render(); else rerenderSoon(); }
  function advLabel(M) { const f = CT.flow.advise; const t = advTrigger(M); if (!t) return ""; if (t.type === "cost") return `${M.comps.get(t.cid).name} ${t.pct > 0 ? "+" : ""}${t.pct}%`; if (t.type === "unavailable") return `${M.comps.get(t.cid).name} unavailable`; if (t.type === "newComponent") return `${t.comp.name} available at ${$(t.comp.cost)}`; if (t.type === "price") return t.cid ? `${M.comps.get(t.cid).name} up-charge → ${$(t.value)}` : `${M.items.get(t.iid).name} → ${$(t.value)}`; return "improve food cost"; }
  function jobAdvise(M) {
    const f = CT.flow.advise; const t = CT.scope.target;
    if (!M.sales.length) return jobHead("What to do", "Needs sales.") + reading("Load a sales file (and modifiers) on the Data tab so the advisor can weigh moves by what actually sells.");
    const head = jobHead("What to do", "Describe the situation; the tool tries every move it knows (repricing, up-charges with the ladder, portion trims, swaps, removals, new items from builds guests already order), ranks them by gross profit with the rules applied, and assembles a plan you can edit and hand to the flows.") + stepper(["Describe the situation", "Best moves", "The plan"], f.step, "adv");
    const compsOpt = compOptions(M).filter(([id]) => !M.comps.get(id).transient); const curated = itemOptions(M, i => !i.byo);
    if (f.step === 1) {
      const trig = advTrigger(M);
      const form = f.type === "cost" ? `<div class="ct-row">${sel("adv:cid", [["", "— component —"]].concat(compsOpt), f.cid)}<label class="hint">changes by</label><input type="number" data-set="adv:pct" value="${f.pct}" step="1" style="width:70px"><span class="hint">% (negative for a decrease)</span></div>`
        : f.type === "unavailable" ? `<div class="ct-row">${sel("adv:cid", [["", "— component —"]].concat(compsOpt), f.cid)}</div>`
        : f.type === "newComponent" ? `<div class="ct-row"><input type="text" data-set="adv:compName" value="${esc(f.comp.name)}" placeholder="Name (e.g. Grilled shrimp)" style="flex:1">${sel("adv:compStation", [...new Set([...M.comps.values()].map(c => c.station))].map(s => [s, s]), f.comp.station)}<label class="hint">cost per portion</label><input type="number" data-set="adv:compCost" value="${f.comp.cost}" step="0.05" min="0" style="width:80px" placeholder="$"><label class="hint">up-charge</label><input type="number" data-set="adv:compUpcharge" value="${f.comp.upcharge}" step="0.05" min="0" style="width:80px" placeholder="$0"></div><p class="hint">Joins the model for this session as a component you can swap in or build with. To keep it, add it to components.csv.</p>`
        : f.type === "price" ? `<div class="ct-row">${sel("adv:upId", [["", "— an up-charge —"]].concat([...M.comps.values()].filter(c => c.upcharge > 0).map(c => [c.id, `${c.name} up-charge (${$(c.upcharge)})`])), f.upId)}<span class="hint">or</span>${sel("adv:iid", [["", "— an item —"]].concat(curated), f.iid)}<label class="hint">new</label><input type="number" data-set="adv:value" value="${f.value}" step="0.05" min="0" style="width:84px" placeholder="$"></div>` : `<p class="hint">Looks at items over target, thin up-charges, Dogs and the builds guests already order.</p>`;
      return head + `<div class="adv-cards">${ADV_TYPES.map(([k, l, d]) => `<button class="job-card ${f.type === k ? "on" : ""}" data-act="adv:type:${k}"><b>${l}</b><span>${d}</span></button>`).join("")}</div>
        <div class="adv-form">${form}
          <div class="adv-opts"><span class="label">Base period</span>${sel("adv:base", [["last", `Latest month (${monthName(M.months[M.months.length - 1] || "")})`], ["all", `All months (${monthsLabel(M.months)})`]], f.base)}<span class="label">Demand ${asmBadge("Elasticity: how much volume moves when a price moves. −0.8: a 10% rise loses 8%.")}</span><input type="range" data-set="adv:el" min="-2" max="0" step="0.1" value="${f.opts.elasticity}" style="width:110px"><output>${f.opts.elasticity}</output><span class="label">Max price step</span>${sel("adv:maxStep", [[0.5, "$0.50"], [1, "$1.00"], [1.5, "$1.50"], [2, "$2.00"]], f.opts.maxStep)}
            <label><input type="checkbox" data-set="adv:allowPortion" ${f.opts.allowPortion ? "checked" : ""}> portion trims</label><label><input type="checkbox" data-set="adv:allowSwap" ${f.opts.allowSwap ? "checked" : ""}> swaps</label><label><input type="checkbox" data-set="adv:allowRemove" ${f.opts.allowRemove ? "checked" : ""}> removals</label><label><input type="checkbox" data-set="adv:allowNew" ${f.opts.allowNew ? "checked" : ""}> new items</label></div>
          <div class="ct-row"><button class="tour-next" data-act="adv:run" ${trig ? "" : "disabled"}>Find the best moves →</button><span class="hint">${trig ? esc(advLabel(M)) : "Fill in the situation first."}</span></div>
        </div>`;
    }
    const r = advRun(M, f.pick); if (!r) { f.step = 1; return head + reading("The situation is incomplete; go back a step."); }
    const S = r.situation; const period = r.RT.scope.months.length === 1 ? monthName(r.RT.scope.months[0]) : monthsLabel(r.RT.scope.months);
    const sitTiles = S.kind === "cost" ? `<div class="ops-tiles">${tile(`${$(S.before)} → ${$(S.after)}`, `${esc(S.comps[0].name)} per portion`)}${tile(X(nf(S.usage), { l: "Portions used", f: "Σ portions in recipes and modifiers of everything sold", src: SRC.cost }), `portions in ${period}`)}${tile(`${pf(S.fc0)} → ${pf(S.fc)}`, "food cost %", null, S.fc > t ? "pc-hi" : "")}${tile(X(sgn(S.dGp, $0), { l: "Gross profit effect at current prices", f: "− portions used × cost change", v: [["Portions", nf(S.usage)], ["Change per portion", sgn(S.after - S.before, $)]], src: SRC.cost }), `gross profit, ${period}, if nothing changes`, null, S.dGp < 0 ? "pc-hi" : "")}${tile(S.items.length, "curated items use it")}</div>`
      : S.kind === "unavailable" ? `<div class="ops-tiles">${tile(S.lostItems.length, "curated items can't be made")}${tile(nf(S.picks.byoPicks), "build-your-own orders picked it")}${tile(X(sgn(S.dGp, $0), { l: "If nothing is done", f: "those items come off the menu (with the retention assumption) and the picks pay no up-charge", src: SRC.sales, asm: `retention ${Math.round(r.opts.retention * 100)}%` }), `gross profit, ${period}, doing nothing`, null, "pc-hi")}${tile(`${pf(S.fc0)} → ${pf(S.fc)}`, "food cost %")}</div>`
      : S.kind === "newComponent" ? `<div class="ops-tiles">${tile($(S.cost), `${esc(S.comps[0].name)} per portion`)}${tile($(S.included), "average included main today")}${tile(S.comps[0].upcharge ? $(S.comps[0].upcharge) : "none", "planned up-charge")}</div>`
      : S.kind === "price" ? `<div class="ops-tiles">${tile(`${pf(S.fc0)} → ${pf(S.fc)}`, "food cost % with the planned change")}${tile(X(sgn(S.dGp, $0), { l: "Planned change on its own", f: "scenario − base", src: SRC.sales, asm: `elasticity ${r.opts.elasticity}` }), `gross profit, ${period}`)}${tile(r.RT.ladder.filter(l => l.gap < -0.05).length, "items it leaves below the ladder", null, r.RT.ladder.filter(l => l.gap < -0.05).length ? "pc-hi" : "")}</div>`
      : `<div class="ops-tiles">${tile(pf(S.fc0), "food cost today", null, S.fc0 > t ? "pc-hi" : "")}${tile(r.R0.itemList.filter(x => !x.addon && !x.byo && x.fc > t).length, `meals over the ${pf(t, 0)} target`)}${tile(r.R0.upcharges.filter(u => u.margin < 0.25 * u.upcharge).length, "thin up-charges")}${tile($k(S.gp0), `gross profit, ${period}`)}</div>`;
    const sitRead = S.kind === "cost" ? reading(`<b>${esc(S.comps[0].name)} ${r.trigger.pct > 0 ? "up" : "down"} ${Math.abs(r.trigger.pct)}%</b>: ${$(S.before)} → ${$(S.after)} a portion. At current prices and volumes that is <b>${sgn(S.dGp, $0)}</b> of gross profit in ${period} and food cost ${pf(S.fc0)} → ${pf(S.fc)}. It touches ${S.items.length} curated item${S.items.length === 1 ? "" : "s"}${S.picks ? ` and ${nf(S.picks)} build-your-own picks` : ""}.`, S.dGp < 0 ? "warn" : "ok")
      : S.kind === "unavailable" ? reading(`Without <b>${esc(S.comps[0].name)}</b>, ${S.lostItems.length} curated item${S.lostItems.length === 1 ? "" : "s"} (${esc(fmtList(S.lostItems.map(x => x.name), 4))}) cannot be made and ${nf(S.picks.byoPicks)} build-your-own orders lose their pick. Doing nothing costs <b>${sgn(S.dGp, $0)}</b> in ${period}; the moves below are measured against that.`, "warn")
      : S.kind === "newComponent" ? reading(`<b>${esc(S.comps[0].name)}</b> at ${$(S.cost)} a portion${S.comps[0].upcharge ? ` with a ${$(S.comps[0].upcharge)} up-charge` : ""}, on the ${esc(S.comps[0].station)} station. The moves below are where it earns the most: as a replacement in existing recipes, or as a curated item built from what guests already order on that station.`)
      : S.kind === "price" ? reading(`The planned change alone is worth <b>${sgn(S.dGp, $0)}</b> in ${period}${r.RT.ladder.filter(l => l.gap < -0.05).length ? ` but leaves ${r.RT.ladder.filter(l => l.gap < -0.05).length} curated items below their build-your-own price` : ""}. The moves below are what should go with it.`, r.RT.ladder.filter(l => l.gap < -0.05).length ? "warn" : "ok")
      : reading(`Food cost is <b>${pf(S.fc0)}</b> against a ${pf(t, 0)} target in ${period}. The moves below are ranked by what they add to gross profit, discounted when they break a rule (over target, below the ladder, more than 15% volume at risk) or need culinary sign-off.`);
    const picked = f.pick || new Set(r.plan.map(p => p.id));
    const moveCard = (c, i) => `<div class="move ${picked.has(c.id) ? "in" : ""}"><input type="checkbox" data-act="adv:toggle:${esc(c.id)}" ${picked.has(c.id) ? "checked" : ""} aria-label="Include in the plan"><div><div class="move-title">${i + 1}. ${esc(c.label)}</div><div class="move-meta"><span class="tag ${c.confidence === "data" ? "data" : "asm"}">${c.confidence === "data" ? "data" : "assumption"}</span>${c.culinary ? `<span class="tag cul">culinary sign-off</span>` : ""}${c.overTarget ? flag("still over target", "warn") : ""}${c.volumeLoss > 0.15 ? flag(`${pf(c.volumeLoss * 100, 0)} volume at risk`, "warn") : ""}${c.fixesLadder ? flag("repairs the ladder", "ok") : ""}${c.assumes ? `<span>${esc(c.assumes)}</span>` : ""}</div><ul class="move-why">${c.reasons.filter(Boolean).map(w => `<li>${esc(w)}</li>`).join("")}</ul></div><div class="move-gain">${X(sgn(c.dGp, $0), { l: "Gross profit effect", f: c.kind === "price" ? "units kept × new contribution − units × old contribution" : c.kind === "upcharge" ? "picks kept × (Δ − lost up-charge share) + curated items moved" : c.kind === "portion" ? "units × portions trimmed × portion cost" : c.kind === "swap" ? "portions × (old cost − new cost)" : c.kind === "remove" ? "− its contribution + what moves to the line" : "units × contribution − what it pulls from the line", src: SRC.cost + " + " + SRC.sales, asm: c.assumes || undefined })}<small>${period}</small></div></div>`;
    if (f.step === 2) {
      return head + sitTiles + sitRead + `<div class="ct-head"><div class="sub">Moves, best first · ${r.candidates.length} considered · ticked ones make the plan</div><div class="ct-tools"><button class="linkbtn" data-act="adv:reset">Back to the suggested plan</button></div></div>
        <div class="moves">${r.candidates.map(moveCard).join("") || `<p class="empty">No move improves on ${S.kind === "unavailable" ? "doing nothing" : "today"} under these rules. Loosen the options on step 1 (a bigger price step, swaps, removals).</p>`}</div>
        ${stepNav("adv", 2, 3, "See the plan")}`;
    }
    // step 3: the plan, engine-verified
    const V = r.verified; const plan = r.plan;
    const planRead = !plan.length ? reading(`Nothing is ticked. Go back and include at least one move.`) : reading(`${plan.length === 1 ? "One move" : plan.length + " moves"}: ${esc(fmtList(plan.map(p => p.label.toLowerCase()), 3))}. Together they ${V && V.dGp >= 0 ? "add" : "cost"} <b>${V ? sgn(V.dGp, $0) : sgn(r.planDGp, $0)}</b> of gross profit in ${period} against ${S.kind === "unavailable" ? "doing nothing" : S.kind === "general" ? "today" : "leaving the change unanswered"}${V && S.kind !== "general" && S.kind !== "unavailable" ? ` (${sgn(V.dGp0, $0)} against today, before the ${S.kind === "cost" ? "cost change" : "change"})` : S.kind === "unavailable" && V ? ` (${sgn(V.dGp0, $0)} against today, with ${esc(S.comps[0].name)} still available)` : ""}; food cost lands at <b>${V ? pf(V.fc) : "—"}</b>${V ? `, ${V.over} meal${V.over === 1 ? "" : "s"} over target${V.belowLadder ? ` and ${V.belowLadder} below the ladder` : ""}` : ""}. ${plan.some(p => p.confidence === "assumption") ? "Volume figures rest on the demand assumption; " : ""}${plan.some(p => p.culinary) ? "portion and recipe moves need a plate test." : ""}`, V && V.dGp >= 0 ? "ok" : "warn");
    const tiles = V ? `<div class="ops-tiles">${tile(X(sgn(V.dGp, $0), { l: "Gross profit change", f: "full engine run of the combined plan minus the baseline", v: [["Baseline", $0(r.RT.totals.gp)], ["With the plan", $0(V.gp)], ["Quick estimate (sum of moves)", sgn(r.planDGp, $0)]], src: SRC.cost + " + " + SRC.sales, asm: plan.some(p => p.assumes) ? plan.filter(p => p.assumes).map(p => p.assumes).join("; ") : undefined }), `gross profit, ${period}`, null, V.dGp < 0 ? "pc-hi" : "")}${tile(`${pf(r.RT.totals.fc)} → ${pf(V.fc)}`, "food cost %", null, V.fc > t ? "pc-hi" : "")}${tile(`${V.over0} → ${V.over}`, "meals over target")}${tile(V.belowLadder, "items below the ladder", null, V.belowLadder ? "pc-hi" : "")}${tile($k(V.rev - r.RT.totals.rev), "net sales change")}</div>` : "";
    const handoff = plan.length ? `<div class="ct-row">${plan.some(p => p.kind === "price" || p.kind === "upcharge") ? `<button class="linkbtn" data-act="adv:price">Open prices in Price change</button>` : ""}${["new", "portion", "swap", "remove"].filter(k => plan.some(p => p.kind === k && (k !== "swap" || p.scn.swaps))).map(k => `<button class="linkbtn" data-act="adv:menu:${k}">Open the ${k === "new" ? "new item" : k === "portion" ? "portion change" : k === "swap" ? "swap" : "removal"} in Menu change</button>`).join("")}<button class="linkbtn" data-act="adv:explore">Open the whole plan in Explore → Scenarios</button><button class="tour-next" data-act="adv:summary">Open the summary</button></div>` : "";
    return head + reading(`<b>${esc(advLabel(M))}</b> · ${period}`) + tiles + planRead + `<div class="moves">${plan.map(moveCard).join("")}</div>` + handoff + stepNav("adv", 3, 3);
  }
  function advSummary() {
    const M = data().M; const f = CT.flow.advise; const r = advRun(M, f.pick); if (!r) return; const V = r.verified; const period = r.RT.scope.months.length === 1 ? monthName(r.RT.scope.months[0]) : monthsLabel(r.RT.scope.months);
    const html = `<p class="sum-lead">Situation: ${esc(advLabel(M))}. Base period ${esc(period)}, demand assumption elasticity ${f.opts.elasticity}.</p>
      ${V ? sumTable(["", "Baseline", "With the plan"], [["Gross profit", $0(r.RT.totals.gp), $0(V.gp)], ["Food cost %", pf(r.RT.totals.fc), pf(V.fc)], ["Meals over target", V.over0, V.over], ["Items below the ladder", r.RT.ladder.filter(l => l.gap < -0.05).length, V.belowLadder]]) : ""}
      <h3>The plan</h3><ol>${r.plan.map(p => `<li><b>${esc(p.label)}</b> (${sgn(p.dGp, $0)}; ${p.confidence}${p.culinary ? ", culinary sign-off" : ""})<br><span class="hint">${esc(p.reasons.filter(Boolean).join(" · "))}</span></li>`).join("")}</ol>
      <h3>Other moves considered</h3><ul>${r.candidates.filter(c => !r.plan.includes(c)).slice(0, 8).map(c => `<li>${esc(c.label)} (${sgn(c.dGp, $0)})</li>`).join("") || "<li>none</li>"}</ul>
      <p class="sum-foot">Moves are scored with the same formulas as the scenario engine, then the chosen plan is verified with a full run. Volume effects rest on the demand assumption; cost effects are arithmetic on the data. Method: docs/methodology.md.</p>`;
    showSummary("What to do · " + advLabel(M), html);
  }

  /* ---------- wiring ---------- */
  function setUI(k, v) { CT.ui[k] = v; }
  function act(a, el) {
    const [cmd, ...rest] = a.split(":"); const arg = rest.join(":"); const M = data().M;
    const rerender = () => render();
    switch (cmd) {
      case "tab": CT.job = "explore"; CT.tab = arg; return rerender();
      case "job": CT.job = arg; if (arg === "explore" && !["costs", "sales", "scenarios", "ops", "recon"].includes(CT.tab)) CT.tab = "costs"; return rerender();
      case "go": return go(arg);
      case "rv": return rvAct(arg);
      case "pc": return pcAct(arg);
      case "mc": return mcAct(arg);
      case "id": return idAct(arg);
      case "adv": return advAct(arg);
      case "print": return printSummary(arg);
      case "src": CT.src = arg; CT.cache.clear(); CT.scope = { stores: null, months: null, channel: "all", target: CT.scope.target }; resetFlows(); return rerender();
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
      case "pc": return pcSet(a, b, value, el);
      case "mc": return mcSet(a, b, value, el);
      case "rv": return rvSet(a, value);
      case "adv": return advSet(a, b, value, el);
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
