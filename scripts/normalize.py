"""Turn data/items_raw.tsv (+ data/station.tsv) into data/items.json and data/station.json.

Usage (from the project root):
    python3 scripts/normalize.py data/items_raw.tsv data/items.json

Each menu ingredient line is mapped to a canonical component and a category by the first matching
rule in RULES. Rule order matters (e.g. "red pepper hummus" before "hummus", "pita crisps" before "pita").
The script exits with an error listing anything unmapped.
"""
import csv, json, re, itertools, collections, sys, pathlib

# (regex on lowercased raw ingredient, canonical name, category). First match wins. None = drop.
RULES = [
    # greens
    (r"power greens", "Power Greens", "Greens"),
    (r"super ?greens", "Super Greens", "Greens"),
    (r"arugula", "Arugula", "Greens"),
    (r"spinach", "Baby spinach", "Greens"),
    (r"romaine", "Romaine", "Greens"),
    # grains & legumes
    (r"brown rice", "Brown rice", "Grains & legumes"),
    (r"basmati|^rice$|\brice\b", "Saffron basmati rice", "Grains & legumes"),
    (r"lentil", "Black lentils", "Grains & legumes"),
    # mains (before dips/dressings so "harissa honey chicken" isn't harissa)
    (r"harissa honey chicken", "Harissa honey chicken", "Chicken"),
    (r"chicken", "Grilled chicken", "Chicken"),
    (r"steak", "Grilled steak", "Steak & lamb"),
    (r"lamb meatball", "Spicy lamb meatballs", "Steak & lamb"),
    (r"braised lamb", "Braised lamb", "Steak & lamb"),
    (r"salmon", "Glazed salmon", "Seafood"),
    (r"falafel", "Falafel", "Plant-based mains"),
    (r"roasted vegg|roasted vegetables", "Roasted vegetables", "Plant-based mains"),
    # dressings (before dips: "harissa vinaigrette" isn't the harissa dip; "yogurt dill" isn't tzatziki)
    (r"greek goddess", "Greek goddess dressing", "Dressings"),
    (r"greek vinaigrette", "Greek vinaigrette", "Dressings"),
    (r"harissa vinaigrette|hot harissa", "Hot harissa vinaigrette", "Dressings"),
    (r"yogurt dill", "Yogurt dill dressing", "Dressings"),
    (r"lemon herb tahini", "Lemon herb tahini", "Dressings"),
    (r"skhug", "Skhug", "Dressings"),
    (r"garlic dressing", "Garlic dressing", "Dressings"),
    (r"balsamic date", "Balsamic date vinaigrette", "Dressings"),
    # pita & chips (before "harissa" and "pita")
    (r"pita crisps", "Pita crisps", "Pita & chips"),
    (r"pita chips", "Pita chips", "Pita & chips"),
    (r"\bpita\b", "Pita", "Pita & chips"),
    # dips & spreads
    (r"red pepper hummus", "Red pepper hummus", "Dips & spreads"),
    (r"hummus", "Hummus", "Dips & spreads"),
    (r"crazy feta", "Crazy Feta", "Dips & spreads"),
    (r"tzatziki", "Tzatziki", "Dips & spreads"),
    (r"roasted eggplant", "Roasted eggplant dip", "Dips & spreads"),
    (r"harissa", "Harissa", "Dips & spreads"),
    # toppings
    (r"tomato \+ cucumber|tomato and cucumber", "Tomato + cucumber", "Fresh vegetables"),
    (r"tomato \+ onion|tomato and onion", "Tomato + onion", "Fresh vegetables"),
    (r"cucumber", "Cucumber", "Fresh vegetables"),
    (r"fiery broccoli|broccoli", "Fiery broccoli", "Fresh vegetables"),
    (r"corn", "Fire-roasted corn", "Fresh vegetables"),
    (r"cabbage slaw|slaw", "Sumac cabbage slaw", "Fresh vegetables"),
    (r"pickled onion", "Pickled onions", "Pickled & brined"),
    (r"pickle", "Salt-brined pickles", "Pickled & brined"),
    (r"olive", "Kalamata olives", "Pickled & brined"),
    (r"feta", "Crumbled feta", "Feta & avocado"),
    (r"avocado", "Avocado", "Feta & avocado"),
    # drinks
    (r"apple juice", "Apple juice", "Kids drinks"),
    (r"chocolate milk", "Chocolate milk", "Kids drinks"),
    (r"\bmilk\b", "Milk", "Kids drinks"),
    (r"pomegranate", "Pomegranate", "Fruit & botanicals"),
    (r"apple", "Apple", "Fruit & botanicals"),
    (r"blueberr", "Blueberry", "Fruit & botanicals"),
    (r"lavender", "Lavender", "Fruit & botanicals"),
    (r"mint", "Mint", "Fruit & botanicals"),
    (r"lime", "Lime", "Fruit & botanicals"),
    (r"lemon", "Lemon", "Fruit & botanicals"),
    (r"green tea", "Jasmine green tea", "Tea, soda & water"),
    (r"black tea|\btea\b", "Black tea", "Tea, soda & water"),
    (r"soda", "Fountain soda", "Tea, soda & water"),
    (r"sparkling water", "Sparkling water", "Tea, soda & water"),
    (r"still water|^water$", "Still water", "Tea, soda & water"),
    # desserts & pantry
    (r"chocolate", "Chocolate", "Desserts & pantry"),
    (r"\boats?\b", "Oats", "Desserts & pantry"),
    (r"blondie", "Blondie", "Desserts & pantry"),
    (r"brownie", "Brownie", "Desserts & pantry"),
    (r"honey", "Honey", "Desserts & pantry"),
    (r"ginger", "Ginger", "Desserts & pantry"),
    (r"apricot", "Dried apricot", "Desserts & pantry"),
    (r"cayenne", "Cayenne", "Spices & seasonings"),
    (r"spices?", "Spice blend", "Spices & seasonings"),
    (r"^salt$", "Salt", "Spices & seasonings"),
]

SMALL_LINES = {"Sides", "Drinks", "Desserts"}           # add-ons: not a composed meal
MEAT_CATS = {"Chicken", "Steak & lamb", "Seafood"}       # anything else counts as vegetarian

def canon(raw):
    s = raw.strip().lower()
    for pat, name, cat in RULES:
        if re.search(pat, s):
            return name, cat
    return "UNMAPPED:" + raw, "?"

src, dst = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
items = []
with open(src, newline="") as f:
    for row in csv.DictReader(f, delimiter="\t"):
        ings, parts = [], []
        for raw in row["ingredients"].split(";"):
            if not raw.strip():
                continue
            name, cat = canon(raw)
            parts.append([raw.strip(), name or ""])
            if name and name not in [i["name"] for i in ings]:
                ings.append({"name": name, "cat": cat, "raw": raw.strip()})
        price, cal = row["price"].strip(), row["cal"].strip()
        items.append({
            "group": row["group"], "line": row["line"], "section": row["section"], "item": row["item"],
            "price": float(price) if price else None,  # None = menu lists no price
            "cal": int(cal) if cal else None,
            "small": row["line"] in SMALL_LINES,
            "veg": not any(i["cat"] in MEAT_CATS for i in ings),
            "ings": ings, "parts": parts,
        })

unm = [i["raw"] for d in items for i in d["ings"] if i["name"].startswith("UNMAPPED")]
if unm:
    print("UNMAPPED:", unm); sys.exit(1)
json.dump(items, open(dst, "w"), ensure_ascii=False, indent=0)

# the build-your-own station: every component on the line, its up-charge and nutrition, joined to the canonical name
station = []
with open(src.parent / "station.tsv", newline="") as f:
    for row in csv.DictReader(f, delimiter="\t"):
        name, cat = canon(row["component"])
        if name.startswith("UNMAPPED"):
            print("UNMAPPED station component:", row["component"]); sys.exit(1)
        station.append({"station": row["station"], "component": row["component"], "canon": name, "cat": cat,
                        "upcharge": float(row["upcharge"]), **{k: float(row[k]) for k in ["cal", "fat", "sat_fat", "chol", "sodium", "carb", "fiber", "sugar", "protein"]}})
json.dump(station, open(src.parent / "station.json", "w"), ensure_ascii=False, indent=0)

cnt = collections.Counter(i["name"] for d in items for i in d["ings"])
pairs = collections.Counter()
for d in items:
    for a, b in itertools.combinations(sorted(i["name"] for i in d["ings"]), 2):
        pairs[(a, b)] += 1
used = {i["name"] for d in items for i in d["ings"]}
print(len(items), "items,", len(cnt), "components,", len(station), "station components,", sum(1 for s in station if s["canon"] not in used), "not in any curated item")
print("top components:", cnt.most_common(12))
print("top pairs:", pairs.most_common(10))
print("unused on the line:", [s["component"] for s in station if s["canon"] not in used])
