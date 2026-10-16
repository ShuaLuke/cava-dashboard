# Menu sources

All data read on Oct 16, 2026 from each chain's own site, in the desktop app's browser. No aggregators.

# CAVA

## cava.com/menu (Dupont Circle store selected)
- URL: https://cava.com/menu. The public menu shows calories only; prices appear after choosing a pickup store in the "Order" modal. Store used: **Dupont, 1222 Connecticut Avenue NW, Washington DC 20036**. CAVA prices vary by location.
- Read in the desktop app's browser (the site is behind a Cloudflare challenge, so curl gets a 403).
- Sections and counts: Featured (2, both also under Bowls), Build Your Own (4: Greens + Grains Bowl, Grains Bowl, Salad Bowl, Pita, all $11.75), Bowls (10), Pitas (3), Sides (9), Kids Meal (1, build-your-own, $7.45), Drinks (14), Desserts (4). Total items recorded: **40** (build-your-own entries and the kids meal are not items; see below).
- Judgment calls: Greek Goddess Steak Salad and Greek Salad are filed under section "Salads" (no grain base); the other bowls under "Bowls". Sides split into "Pita & chips" and "Dips & spreads". Drinks split into "House-made juices & teas", "Bottled & fountain" and "Kids drinks". Ingredient lines for sides, drinks and desserts come from the menu descriptions (e.g. "Chickpeas puréed with tahini, lemon juice, fresh garlic, salt" is recorded as the hummus dip, not as five components). Plain "rice" (Salmon + Yogurt Dill, Falafel Crunch) is mapped to saffron basmati rice. "Half falafel, half roasted veggies" counts as both mains.

## cava.com/builder/byo-greens-grains-bowl (the build-your-own line)
- URL: https://cava.com/builder/byo-greens-grains-bowl, read with the Dupont store selected. Lists every station component with its up-charge and calories: Greens (5), Grains (3), Dips + Spreads (6), Mains (8), Toppings (13), Dressings (8), plus Sides, Desserts and Drinks as add-ons.
- Up-charges: Glazed Salmon +$4.25, Braised Lamb +$3.85, Grilled Steak +$3.70, Avocado +$2.85, Spicy Lamb Meatballs +$2.45, Harissa Honey Chicken +$1.65. Everything else is included in the $11.75 base. A free quarter side pita is offered with a bowl.
- Builder calories for greens differ slightly from the nutrition guide (e.g. Power Greens 20 vs 30); `data/station.tsv` uses the nutrition guide.

## Nutrition and Allergen Guide (PDF)
- URL: https://assets.ctfassets.net/kugm9fp9ib18/Ki4gri5pvT2rtPcjBQPjR/c78bed9be8448e2ab700f440f6faa83e/KT6_26_AN_ANGUIDE_RETAIL_T_MKTAN11724.pdf, linked from https://cava.com/nutrition. Text extracted with pypdf.
- Used for per-portion nutrition of every station component (calories, fat, saturated fat, cholesterol, sodium, carbs, fiber, sugar, protein) in `data/station.tsv`. The allergen and vegan/vegetarian marks are drawn as symbols and did not survive text extraction; vegetarian is derived from the mains instead.
- The guide lists "Whisked! Apricot Honey (DMV)", confirming the Apricot Honey Cookie is a DC-area item.

## Excluded
Build-your-own bowls, pitas and the kids meal (no fixed ingredients; covered by the station catalog), catering, grocery products.


# Sweetgreen (read Oct 16, 2026) — 49 items
- https://order.sweetgreen.com/farragut-square/menu with the **Farragut Square, 888 17th St NW** store selected (the search for Washington, DC listed Farragut Square first; Sweetgreen has no Dupont Circle store in that list). Prices and calories per item from this page. Lines recorded: Bowls & plates (13: Featured, Bowls, Warm plates), Salads (7), Wraps (4), Kids meals (3), Sides & sweets (9), Bottled drinks (13).
- https://www.sweetgreen.com/menu (public menu) for the Sweets and Drinks sections, which the store menu page doesn't render: ingredients and calories only, **no price** (blank). Kids juices are priced on the store menu.
- Judgment calls: "Molly's Chicken Salad" is one component (Chicken salad). "Umami rice"/"white rice" → White rice. "Miso glazed salmon" merges with CAVA's "Glazed salmon". "Caesar" and "caesar dressing" → Caesar dressing. Hummus + Focaccia (public menu) is not on the store menu and was skipped. "Create your own" is build-your-own and excluded.

# Chipotle (read Oct 16, 2026) — 42 items
- https://www.chipotle.com/ online ordering with the **1300 Connecticut Ave NW Ste 103 (Dupont Circle)** store selected for pickup; prices appear only after a store is chosen. Featured items (6, incl. the Salish Matter kids meal) from the home "Featured" carousel; the High Protein menu (8) from /order/build/high-protein-menu; chips, dips and single sides from the Burrito Bowl builder's add-on list; drinks from /order/build/drinks (range-priced fountain and agua fresca items use the small size, $3.20).
- Regular burritos, bowls, tacos, quesadillas and salads are build-your-own (price by protein: chicken/sofritas/veggie $9.80, carnitas $10.55, pollo asado $10.40, steak/barbacoa $11.80 at this store) and are not items. The kids-meal builder page did not render. Large chip combos and chili-lime salsa combos were skipped as duplicates of the regular size.
- Judgment calls: Chipotle "chicken"/"double chicken"/"adobo chicken" → Adobo chicken; "steak" → Grilled steak (merges with CAVA's); "lettuce"/"romaine lettuce" → Romaine; "cheese"/"Monterey Jack cheese" → Shredded cheese; a burrito's or quesadilla's tortilla is recorded as "flour tortilla" even where the menu line doesn't list it. Fountain Drink has no single calorie figure (blank).

# Line names
Line names must be unique across brands because the dashboard keys on them: Chipotle's lines are "Burrito bowls", "Burritos & tacos", "Chips & sides", "Fountain & bottled" and "Kid's meal"; Sweetgreen's drinks line is "Bottled drinks" and its kids line "Kids meals".
