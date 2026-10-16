# Security review package

For CAVA's security team: what the page is, what it loads, what it stores, and how to verify each claim.

## What it is

One static HTML file. No server-side code, no accounts, no database, no analytics. Everything the Cost & sales tool does with a loaded file happens in the browser tab: parsing, validation, calculation, charts and exports. Closing the tab discards everything unless the user has ticked "keep my data on this device".

Two builds come from the same source:

| Build | File | External requests |
|---|---|---|
| Hosted (GitHub Pages) | `index.html` | D3 v7.8.5 from cdnjs.cloudflare.com (with a subresource-integrity hash), Geist and Geist Mono font CSS from fonts.googleapis.com and the font files from fonts.gstatic.com |
| Offline | `dist/offline/index.html` | **None.** D3 and the fonts are embedded. Works from a file share or a USB stick with no internet. |

Neither build sends any request that carries loaded data. The hosted build's three requests are made on page load, before any file is read, and are the same for every visitor.

## Every network request, by build

Hosted `index.html`:

1. `GET https://cdnjs.cloudflare.com/ajax/libs/d3/7.8.5/d3.min.js` — script tag with `integrity="sha384-…"` (`vendor/manifest.json` has the hash; the browser refuses the file if it does not match).
2. `GET https://fonts.googleapis.com/css2?family=Geist…` — stylesheet.
3. `GET https://fonts.gstatic.com/…woff2` — two font files referenced by that stylesheet.

Offline `dist/offline/index.html`: none. `scripts/build.py --offline` fails if any `src=` or `href=` in the output points at the web.

How to verify: open the page with the browser's developer tools on the Network tab, load the sample files from the Data tab, use every tab and export, and watch the request list. It stays at three (hosted) or zero (offline). `performance.getEntriesByType("resource")` in the console shows the same.

## Content-security policy

Both builds carry a CSP `<meta>` tag that the browser enforces:

```
hosted:  default-src 'none'; script-src 'unsafe-inline' https://cdnjs.cloudflare.com; style-src 'unsafe-inline' https://fonts.googleapis.com;
         font-src https://fonts.gstatic.com; img-src data: blob:; connect-src 'none'; form-action 'none'; base-uri 'none'
offline: default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; font-src data:; img-src data: blob:;
         connect-src 'none'; form-action 'none'; base-uri 'none'
```

`connect-src 'none'` means `fetch`, `XMLHttpRequest`, WebSocket, beacons and EventSource are all blocked by the browser itself, so even a bug could not send data out. `form-action 'none'` blocks form posts. `'unsafe-inline'` is required because the whole application is one inline script; there is no eval and no dynamically loaded code. If CAVA self-hosts, the same policy can be sent as an HTTP header (recommended, since a header also allows `frame-ancestors`).

## Third-party code

- **D3 v7.8.5** (BSD-3, data-visualization library), 279,633 bytes. SHA-256 in `vendor/manifest.json`; the hosted build pins it with SRI, the offline build inlines the same bytes. It is used for scales, ticks, summary statistics and the chord diagram on the menu views. It makes no network requests.
- **Fonts**: Geist and Geist Mono (OFL), 29 KB and 23 KB variable woff2 files, embedded in the offline build.
- Everything else, including the CSV parser and the .xlsx reader, is in this repository (`src/`). The .xlsx reader uses the browser's built-in `DecompressionStream` and `DOMParser`, not a library.

`scripts/vendor.py` downloads the two third-party pieces and records their hashes; `scripts/build.py` reads them. Rebuilding from source is deterministic.

## Storage

Off by default. The only things written before opt-in are three preference keys in `localStorage`: the last menu view (`cv-view`), whether the tour ran (`cv-tour-done`), chord/matrix sizes (`cv-pairs`), head-to-head picks (`cv-h2h`) and the storage opt-in flag itself (`cv-ct-persist`). None hold loaded data.

With "keep my data on this device" ticked:

- `IndexedDB` database `cv-costtool`, store `kv`, key `files`: the loaded files as text plus their file type and column mapping.
- `localStorage` key `cv-ct-saved`: saved scenarios (names, changed costs and prices, new-item recipes).

Both live in the browser profile on that computer only, under the page's origin, and are never transmitted. "Clear all data" deletes both and returns the tool to the sample dataset; unticking the opt-in deletes the IndexedDB entry. No cookies are set by the page.

## Exports

Downloads (CSV, JSON, PNG, templates, sample files) are built in memory as `Blob`s and saved through a temporary `blob:` URL, which is revoked immediately after. The image export draws the chart onto a `<canvas>` in the page.

## What to review

1. `src/costmodel.js` (engine, ~900 lines), `src/costtool.js` (UI, ~500 lines), `src/sample.js` (synthetic data), `src/xlsx-lite.js` (Excel reader), `src/template.html` (the menu dashboard). No build step transforms them beyond inlining.
2. `scripts/build.py`: how the page is assembled and the CSP strings.
3. `vendor/manifest.json`: the pinned third-party hashes.
4. `tests/costmodel.test.js`: `node --test tests/*.test.js` runs the hand-calculated cases.
5. Rebuild and compare: `python3 scripts/build.py --offline` reproduces `index.html` and `dist/offline/index.html` byte for byte from the same inputs.

## Known limitations

- A CSP in a `<meta>` tag cannot set `frame-ancestors`; if clickjacking matters, serve the file with the policy as an HTTP header, or open it from a local file.
- The page needs a modern browser (2023 or later: Chrome 113+, Edge 113+, Safari 16.4+, Firefox 113+) for `DecompressionStream`, which only the .xlsx reader uses; CSV works everywhere.
- Browser storage is as secure as the user profile. On shared machines, leave the opt-in off.
- The hosted build depends on two CDNs being reachable. The offline build does not.
