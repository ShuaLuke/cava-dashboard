# One decision, end to end

A live question answered on the sample data, step by step, the way it would be answered on CAVA's. The sample is synthetic (see `docs/sample-data.md`), so the numbers illustrate the method, not CAVA.

## The question

Salmon's case cost went up 12% on September 1. The $4.25 up-charge was set before that. **Does the up-charge still cover salmon, and what should we do: raise it, reprice the salmon bowls, or trim the portion?**

## Step 1 · See what the cost change did (Costs → Cost history)

The September snapshot lists the four components that changed and every item they moved:

| Component | Before | After | Change |
|---|---|---|---|
| Glazed Salmon | $3.86 | $4.33 | +12.2% |
| Avocado | $0.65 | $0.59 | −8.1% |
| Harissa Honey Chicken | $0.95 | $0.98 | +3.8% |
| Grilled Chicken | $0.90 | $0.93 | +4.0% |

| Item | Cost before | After | Food cost % | Driven by |
|---|---|---|---|---|
| Greek Goddess Salmon | $5.95 | $6.43 | 37.2% → 40.2% | Glazed Salmon |
| Salmon + Yogurt Dill | $5.77 | $6.24 | 36.0% → 39.0% | Glazed Salmon |
| Pomegranate Glazed Salmon | $5.85 | $6.27 | 31.1% → 33.3% | Glazed Salmon |

Three curated bowls are now well over a 30% target, and the two $16 ones were over it before.

## Step 2 · Check the up-charge (Costs → Up-charges, scope: September)

| | |
|---|---|
| Up-charge | $4.25 |
| Salmon portion cost | $4.33 |
| Average included main it replaces | $0.88 |
| Incremental cost | $3.46 |
| **Margin per add** | **$0.79** |
| Break-even portion cost | $5.13 |
| Picks in September (3 stores) | 1,305 (101 per store-week) |
| Margin in scope | $1,035 |

The up-charge still covers salmon, but barely: a further 18% cost rise would take the margin to zero.

## Step 3 · Compare the options (Scenarios, scope: September, elasticity −0.8)

Each option is one entry in the scenario editor; the results panel shows the change against the September base of $261,335 sales, $182,360 gross profit and 27.08% theoretical food cost.

| Option | How entered | Food cost % | Δ sales | Δ gross profit | Salmon margin per add | Salmon picks |
|---|---|---|---|---|---|---|
| A · Raise the up-charge to $4.75 | Up-charge changes: Glazed Salmon → 4.75 | 26.91% | +$69 | **+$494** | $1.29 | 1,182 (−9%) |
| A' · Same, no demand loss (elasticity 0) | as above, elasticity 0 | 27.01% | +$653 | +$653 | $1.29 | 1,305 |
| B · Raise the up-charge to $5.25 | Up-charge changes: → 5.25 | 26.75% | +$15 | +$864 | $1.79 | 1,059 (−19%) |
| C · Reprice the three salmon bowls +$0.50 | Repricing: 16.00 → 16.50 ×2, 18.85 → 19.35 | 27.04% | −$260 | −$69 | $0.79 | 1,305 |
| D · Trim the portion to 3.5 oz | Cost change: Glazed Salmon −12.5% | 26.57% | $0 | **+$1,324** | $1.33 | 1,305 |

Reading it:

- **C fails.** The curated salmon bowls are Plowhorses (popular, thin margin) and the price elasticity eats the gain; it also leaves the up-charge, where most salmon is sold, untouched. Build-your-own salmon picks (1,305) outnumber the three curated bowls (1,140 units) in September.
- **A is safe.** Even with a 9% drop in picks, September gross profit improves. One side effect: the Price ladder table now shows the three curated salmon bowls $0.50 **below** build-your-own (base + $4.75 = $16.50 against a $16.00 price), so A on its own makes the curated bowls the cheaper way to get salmon. A together with C (reprice the bowls +$0.50) keeps the ladder straight and still gains +$424 in gross profit on −$190 sales.
- **B earns more** but on a 19% pick loss, which is a bigger bet on the elasticity assumption than A.
- **D earns the most** with no guest-facing change, if culinary agrees a 3.5 oz portion is acceptable. It is a portion decision, not a pricing one, so it needs the nutrition check (Costs → Nutrition check) and a plate test.

Save each as a named scenario, tick them, and the comparison table puts A, B and D side by side for the meeting; "⤓ Comparison CSV" exports it.

## Step 4 · What would make this real

On CAVA's data the same four steps run unchanged. Three things would sharpen the answer:

1. Actual salmon pick elasticity from a past up-charge change (replace the −0.8 assumption).
2. The waste log and inventory counts for salmon (Operations → Theoretical vs actual), since an over-portioned 4 oz is a cost problem that no up-charge fixes.
3. The reconciliation test passing for the month, so the base numbers are trusted.

## A second example · a six-week limited-time offer

Scenarios → New item or limited-time offer: "Steak Harissa Crunch" (grilled steak, harissa, half Crazy Feta, saffron rice, fire-roasted corn, pickled onions, pita crisps, hot harissa vinaigrette) at $15.95, 80 units per store-week, 70% pulled from existing bowls, 6 weeks.

| | |
|---|---|
| Food cost | $4.10 (25.7% at $15.95; $13.66 would hit 30%) |
| Cross-utilization | 8 of 8 components already at volume; no new prep |
| Projected units (3 stores × 6 weeks) | 1,440 |
| Sales / gross profit from the item | $22,968 / $17,068 |
| Net effect after cannibalization | +$8,261 sales, +$6,264 gross profit over the quarter; food cost 26.79% → 26.74% |

Operations → Prep load then shows the item next to the existing bowls (8 components, 5 stations, 17 prep steps, nothing exclusive), and Sales → Build-your-own → Combinations not on the menu shows whether guests already build something like it: the second most common off-menu build (steak, Crazy Feta, avocado, corn, pickled onions, feta, skhug on power greens and brown rice; 1,336 orders, 34 per store-week, $18.60 average paid, 28.5% food cost) is a stronger candidate than this one, because the demand is already there.
