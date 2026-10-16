/* A small .xlsx reader with no dependencies: unzips with the browser's DecompressionStream, parses the sheet XML with DOMParser.
   Reads values only (shared strings, inline strings, numbers, booleans, dates by number format). Formulas come back as their cached value.
   Each sheet becomes { name, headers, rows } in the same shape as CostModel.parseCSV. Browser only. */
(function (root) {
  "use strict";
  const td = new TextDecoder("utf-8");
  function u16(b, o) { return b[o] | (b[o + 1] << 8); }
  function u32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16)) + b[o + 3] * 16777216; }
  async function inflate(bytes, method) {
    if (method === 0) return bytes;
    if (method !== 8) throw new Error("Unsupported zip compression method " + method);
    if (typeof DecompressionStream === "undefined") throw new Error("This browser cannot unzip .xlsx files; save the sheet as CSV instead.");
    const ds = new DecompressionStream("deflate-raw");
    const stream = new Blob([bytes]).stream().pipeThrough(ds);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  async function unzip(buf) {
    const b = new Uint8Array(buf); const n = b.length; const files = new Map();
    let eocd = -1; for (let i = n - 22; i >= Math.max(0, n - 70000); i--) if (b[i] === 0x50 && b[i + 1] === 0x4b && b[i + 2] === 0x05 && b[i + 3] === 0x06) { eocd = i; break; }
    if (eocd < 0) throw new Error("Not a zip (.xlsx) file");
    const count = u16(b, eocd + 10); let off = u32(b, eocd + 16);
    for (let k = 0; k < count; k++) {
      if (u32(b, off) !== 0x02014b50) break;
      const method = u16(b, off + 10), csize = u32(b, off + 20), nameLen = u16(b, off + 28), extraLen = u16(b, off + 30), commentLen = u16(b, off + 32), local = u32(b, off + 42);
      const name = td.decode(b.subarray(off + 46, off + 46 + nameLen));
      const lnameLen = u16(b, local + 26), lextraLen = u16(b, local + 28); const start = local + 30 + lnameLen + lextraLen;
      files.set(name, { method, data: b.subarray(start, start + csize) });
      off += 46 + nameLen + extraLen + commentLen;
    }
    return { async text(name) { const f = files.get(name); if (!f) return null; return td.decode(await inflate(f.data, f.method)); }, has: name => files.has(name), names: [...files.keys()] };
  }
  const colIndex = ref => { let c = 0; for (const ch of ref) { if (ch >= "A" && ch <= "Z") c = c * 26 + (ch.charCodeAt(0) - 64); else break; } return c - 1; };
  const parseXml = s => new DOMParser().parseFromString(s, "application/xml");
  const DATE_FMT = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);
  const serialToISO = v => { const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000); return d.toISOString().slice(0, 10); };
  const serialToTime = v => { const mins = Math.round((v % 1) * 1440); const h = Math.floor(mins / 60), m = mins % 60; return (h < 10 ? "0" : "") + h + ":" + (m < 10 ? "0" : "") + m; };
  async function read(buf) {
    const z = await unzip(buf);
    const wbXml = await z.text("xl/workbook.xml"); if (!wbXml) throw new Error("No workbook found in this file");
    const wb = parseXml(wbXml); const relsXml = await z.text("xl/_rels/workbook.xml.rels"); const rels = new Map();
    if (relsXml) for (const r of parseXml(relsXml).getElementsByTagName("Relationship")) rels.set(r.getAttribute("Id"), r.getAttribute("Target"));
    const shared = []; const ssXml = await z.text("xl/sharedStrings.xml");
    if (ssXml) for (const si of parseXml(ssXml).getElementsByTagName("si")) { let t = ""; for (const tn of si.getElementsByTagName("t")) t += tn.textContent; shared.push(t); }
    const dateStyle = []; const stXml = await z.text("xl/styles.xml");
    if (stXml) { const st = parseXml(stXml); const custom = new Set(); for (const nf of st.getElementsByTagName("numFmt")) { const code = (nf.getAttribute("formatCode") || "").replace(/\[[^\]]*\]/g, "").replace(/"[^"]*"/g, ""); if (/[dmyh]/i.test(code) && !/[#0]/.test(code)) custom.add(+nf.getAttribute("numFmtId")); } const xfs = st.getElementsByTagName("cellXfs")[0]; if (xfs) for (const xf of xfs.getElementsByTagName("xf")) { const id = +(xf.getAttribute("numFmtId") || 0); dateStyle.push(DATE_FMT.has(id) || custom.has(id)); } }
    const sheets = [];
    for (const sh of wb.getElementsByTagName("sheet")) {
      const name = sh.getAttribute("name"); const rid = sh.getAttribute("r:id") || sh.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
      let target = rels.get(rid) || ""; if (!target) continue; target = target.replace(/^\/?xl\//, "").replace(/^\//, ""); const path = target.startsWith("worksheets/") ? "xl/" + target : "xl/" + target;
      const xml = await z.text(path); if (!xml) continue;
      const doc = parseXml(xml); const grid = [];
      for (const row of doc.getElementsByTagName("row")) {
        const r = +row.getAttribute("r") - 1; const cells = [];
        for (const c of row.getElementsByTagName("c")) {
          const ref = c.getAttribute("r") || ""; const ci = colIndex(ref); const t = c.getAttribute("t"); const s = +(c.getAttribute("s") || 0);
          const vEl = c.getElementsByTagName("v")[0]; let v = null;
          if (t === "s") { v = shared[+(vEl ? vEl.textContent : 0)] ?? ""; }
          else if (t === "inlineStr") { v = ""; for (const tn of c.getElementsByTagName("t")) v += tn.textContent; }
          else if (t === "b") v = vEl && vEl.textContent === "1";
          else if (t === "str" || t === "e") v = vEl ? vEl.textContent : "";
          else if (vEl) { const n = Number(vEl.textContent); v = Number.isFinite(n) ? (dateStyle[s] ? (n % 1 && n < 1 ? serialToTime(n) : serialToISO(n)) : n) : vEl.textContent; }
          if (v !== null) cells[ci] = v;
        }
        grid[r] = cells;
      }
      const first = grid.findIndex(r => r && r.some(v => v !== null && v !== "")); if (first < 0) continue;
      const headers = (grid[first] || []).map(h => h == null ? "" : String(h).trim()); while (headers.length && headers[headers.length - 1] === "") headers.pop();
      const rows = [];
      for (let i = first + 1; i < grid.length; i++) { const g = grid[i]; if (!g || !g.some(v => v !== null && v !== "")) continue; const o = {}; headers.forEach((h, k) => { if (h) o[h] = g[k] == null ? "" : g[k]; }); rows.push(o); }
      sheets.push({ name, headers: headers.filter(Boolean), rows });
    }
    return sheets;
  }
  root.XlsxLite = { read };
})(typeof self !== "undefined" ? self : this);
