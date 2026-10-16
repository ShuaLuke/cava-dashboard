# Delivery and long-term support

How the Cost & sales tool would be delivered to CAVA and kept running. This is a one-person project today; the proposal below is written so CAVA can see exactly what that means and what would change it. Items are tagged as in the asks list (L1–L7). Terms marked *to agree* are proposals, not commitments, until CAVA and the author sign them.

## L1 · Maintenance plan (Should)

**Who fixes what.** The author maintains the code: bugs, browser changes, menu-structure changes that need code. CAVA owns its data files and the decisions made with them.

**How fast** (*to agree*):

| Severity | Example | Response | Fix |
|---|---|---|---|
| Blocking | the page will not load, a file that validates cannot be used, a wrong formula | same business day | within 2 business days, as a new build |
| Degraded | a view fails on some data, an export is wrong | 2 business days | next build, within 2 weeks |
| Cosmetic / request | layout, wording, a new column | acknowledged in a week | scheduled |

Every fix ships as a rebuilt `dist/offline/index.html` with the version and date in the file, a changelog entry, and the test suite green (`node --test tests/*.test.js`). CAVA's security team can diff the source between versions; the build is reproducible.

**If the author is unavailable.** The whole tool is plain HTML and JavaScript with no build dependencies beyond Python 3 and Node (for tests). The engine is documented formula by formula (`docs/methodology.md`), the inputs are documented column by column (`docs/data-dictionary.md`), and the hand-calculated test cases pin the behaviour. Any web developer can pick it up; a two-hour handover session is included in the pilot. The repository, docs and build scripts are the handover. A named backup maintainer (an individual or a CAVA engineer who has done the handover) is *to agree* before the tool is relied on.

**What is not covered**: CAVA's exports, networks, machines and data correctness; features beyond the agreed asks list; support for browsers older than 2023.

## L2 · Menu update process (Should)

No code changes are needed for menu, price or cost changes. The tool reads whatever is in the files:

- **New item**: a row in `items.csv` and its rows in `recipes.csv`. New components: a row in `components.csv`. Load the files; the tool rejects anything unmapped and says exactly what.
- **Price change**: a new `price` in `items.csv` (or a store row for a regional price). Costs: a new row with `effective_date`, which also builds the cost history automatically.
- **Regional menus**: `store_id` on item and component rows; regional items simply sell at some stores and not others.
- **Monthly refresh**: export the new month's sales and modifiers, add the actuals row, load alongside the previous months (same-type files concatenate), re-run Reconcile.

What does need code: a new *kind* of input (a column type that does not exist), a new analysis, or a change to the component model itself (for example a second build-your-own base price per line). These go through the maintenance plan.

Suggested rhythm: monthly refresh by CAVA's analyst (an hour), quarterly check-in with the author, menu re-read when the public menu changes.

## L3 · Exports (Should) — built

Every table in the tool has a "⤓ CSV" button (Excel opens it directly); the menu-engineering chart has "⤓ PNG" for decks; scenario comparisons export as CSV and the scenario definitions as JSON, so a decision pack can be rebuilt later. Templates and the sample files download from the Data tab. Everything is generated in the browser.

## L4 · Ownership and licensing (Should) — *to agree*

Proposal:

- The dashboard and tool as published are the author's work, offered to CAVA under the MIT licence: CAVA may use, copy, modify and self-host them without restriction and without owing anything.
- CAVA-specific changes made for the pilot (column mappings for CAVA's systems, CAVA-only views) are delivered under the same licence; CAVA may keep, modify or discard them.
- CAVA's data, files, scenarios and every result produced from them belong to CAVA and are never shared, including as examples.
- The author keeps the right to use the generic tool (with the synthetic sample) in a portfolio and for other clients; nothing that identifies CAVA's numbers, costs or menu decisions is used that way.
- CAVA may modify anything itself. Modifications CAVA makes are CAVA's; if CAVA wants them maintained by the author, they come back through the maintenance plan.
- Brand names and menu-item names remain CAVA's trademarks; the tool uses them to describe CAVA's menu.

Pilot pricing, if any, is a separate conversation; nothing above depends on it.

## L5 · Automated feeds (Nice)

Path from manual uploads to scheduled exports, still processed on CAVA's side:

1. **Now**: manual drop of exports, monthly.
2. **Next**: a scheduled export job in CAVA's systems writes the same CSV files to a folder; the tool is opened with "keep my data on this device" and the files re-dropped. No change to the tool.
3. **Then**: a self-hosted copy (D9) that reads the files from an internal URL on load, behind CAVA's sign-in, with the content-security policy's `connect-src` opened to that one internal host only. This is the only step that changes the tool's network posture, and it stays inside CAVA's network.

Nothing in any step sends data outside CAVA.

## L6 · Role-based views (Nice)

The tool already groups by decision: Costs (culinary and finance), Sales & mix (marketing and finance), Scenarios (menu and finance), Operations (operations), Reconcile (finance). A role switch would hide tabs and simplify tiles per audience: culinary (costs, nutrition, prep load, builder), finance (mix, reconcile, scenarios), operations (stores, waste, theoretical vs actual, low movers). It is a presentation change on top of the same engine, about a week of work, best done after the pilot shows which views each team actually uses.

## L7 · Accessibility and mobile (Nice)

Today: keyboard navigation and focus styles on every control, tooltips readable by keyboard, tables as real `<table>` elements, labels on inputs, and a layout that works at phone width (the tabs, filters and tiles stack; tables scroll sideways). Not yet done: a full screen-reader pass (ARIA live regions for recomputed results, descriptions for the charts) and touch-sized controls for in-store tablets. Estimate: a week, after the pilot.

## Deliverables checklist for the pilot

- [ ] `dist/offline/index.html` (the tool, no external requests) and the hosted link
- [ ] `docs/security-review.md`, full source, `vendor/manifest.json`
- [ ] `docs/data-dictionary.md` and `data/templates/`
- [ ] `docs/methodology.md`, `docs/reconciliation-test.md`, `tests/`
- [ ] `docs/walkthrough.md` on the sample; the same on CAVA's data after the reconciliation passes
- [ ] Handover session; this document signed with the *to agree* items settled
