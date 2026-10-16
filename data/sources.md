# Menu sources

All data read on Oct 16, 2026 from CAVA's own site. No aggregators.

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
