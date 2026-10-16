# One decision, end to end

A live question answered on the sample data in the Cost & sales tool, the way it would be answered on an operator's own data. The sample is synthetic (see `docs/sample-data.md`), so the numbers illustrate the method, not any real chain. Time to answer: about three minutes, no documentation needed.

## The question

Salmon's case cost went up 12% on September 1. The $4.25 up-charge was set before that. **Should we raise the salmon up-charge?**

## Home → the flag

Home opens on what needs attention in the latest month. The second card reads: *Up-charges covering their cost · Glazed Salmon earns $0.79 on a $4.25 up-charge.* Hovering the $0.79 shows the formula (up-charge − incremental cost), the values (portion cost $4.33, included main it replaces $0.88) and the source file. Click **Test a new up-charge →**.

## Price change simulation

The flow opens on step 2 with Glazed Salmon already selected, base period September, costs as of September 30.

**Step 2 · Set the new price.** Type 4.75 (or click +$0.50). The row updates:

| | Before | After |
|---|---|---|
| Margin per add | $0.79 | $1.29 |
| Picks kept | 1,305 | 1,182 (−9%) |
| Margin on this up-charge, September | $1,035 | $1,529 |

The reading says: *Raising Glazed Salmon to $4.75 lifts margin per add to $1.29 and, with 9% fewer picks assumed, margin on the up-charge rises +$494 in Sep 2026.* The 9% rests on the demand assumption shown in the amber bar at the top (elasticity −0.8: a 10% price rise loses 8% of volume); drag it to 0 to see the no-volume-loss case (+$653), or to −1.5 for a pessimistic one. Picks and margin figures are marked amber because they depend on it; margin per add is not, because it is arithmetic on the data.

Across the menu in September: net sales +$69, food cost 27.1% → 26.9%, gross profit +$494.

**Step 3 · Check the ladder.** The reading warns: *3 curated items now sit below build-your-own: Greek Goddess Salmon ($16.00 vs $16.50 to build it), Pomegranate Glazed Salmon ($18.85 vs $19.35), Salmon + Yogurt Dill ($16.00 vs $16.50).* Raising the up-charge alone makes the curated salmon bowls the cheaper way to get salmon. Click **Reprice them to the ladder**: the three bowls get +$0.50 and the reading turns green. With the demand assumption applied to those bowls too, the combined change comes to +$424 gross profit on −$190 sales.

**Step 4 · Compare & export.** Name it "Salmon +0.50 with ladder" and save. Click *Start another*, pick Glazed Salmon again, try $5.25 (+$864 on a 19% pick loss), save it. The comparison table shows Base and both options: sales, gross profit, food cost %, units, items below the ladder, salmon margin per add and salmon picks. *Open the summary* gives a one-page write-up with the assumption stated, to print or save as a PDF; the CSV button exports the comparison.

## The answer

Raise it to $4.75 and move the three curated salmon bowls with it. $5.25 earns more only if a 19% drop in salmon picks is believable; at −0.8 elasticity the $4.75 option is the safer gain. A fourth option sits outside pricing: Menu change → Portion change → Greek Goddess Salmon → salmon 0.875 portions (3.5 oz) saves more than any up-charge change with no guest-facing price move, if culinary accepts the portion.

## What would make this real

1. Actual salmon pick elasticity from a past up-charge change, replacing the −0.8 assumption.
2. The waste log and inventory counts for salmon (Explore → Operations → Theoretical vs actual): an over-portioned 4 oz is a cost problem no up-charge fixes.
3. The reconciliation test passing for the month (Home shows the latest verdict), so the base numbers are trusted.

## A second example · from a build guests already order

Home's last card: *Best new-item candidate · 60/store-week.* Click **New item ideas →**. The top candidate is the build guests make most that no curated item matches: super greens, saffron rice, hummus, tzatziki, grilled chicken, pickled onions, tomato + onion, cucumber, feta, Greek vinaigrette and the free quarter pita, ordered 2,348 times in the quarter (59.6 per store-week), 26.9% food cost at the $11.90 guests already pay, every component already at volume, and only 62% alike to Chicken + Rice. The "why" lists each of those reasons; hovering any figure shows its formula.

**Evaluate as a new item →** opens Menu change at step 3 with the recipe, a $11.90 price and 60 units per store-week filled in: $3.22 food cost, 27.1%. Step 4 shows the ripple with the assumptions flagged (60 units per store-week, 70% pulled from other bowls): gross profit +$2,782 over the quarter, 11 components on 7 stations, nothing new to prep, 12 items change. Save it, compare it with a limited-time offer version (6 weeks), export.
