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

    # ---- competitors (Sweetgreen, Chipotle). Brand-specific preparations stay distinct; generic produce merges. ----
    # greens
    (r"kale", "Shredded kale", "Greens"),
    (r"spring mix", "Spring mix", "Greens"),
    (r"supergreens lettuce", "Supergreens mix", "Greens"),
    (r"lettuce", "Romaine", "Greens"),
    # grains & legumes
    (r"wild rice", "Wild rice", "Grains & legumes"),
    (r"umami rice|white rice", "White rice", "Grains & legumes"),
    (r"quinoa", "Golden quinoa", "Grains & legumes"),
    (r"black beans", "Black beans", "Grains & legumes"),
    (r"pinto beans", "Pinto beans", "Grains & legumes"),
    (r"^(seasoned )?chickpeas$", "Chickpeas", "Grains & legumes"),
    (r"puffed millet|crispy organic brown rice", "Puffed grains", "Desserts & pantry"),
    # mains
    (r"chicken salad", "Chicken salad", "Chicken"),
    (r"blackened chicken", "Blackened chicken", "Chicken"),
    (r"roasted chicken", "Roasted chicken", "Chicken"),
    (r"pollo asado", "Pollo asado", "Chicken"),
    (r"adobo chicken|double chicken|half chicken", "Adobo chicken", "Chicken"),
    (r"garlic steak", "Garlic steak", "Beef, pork & lamb"),
    (r"half steak|^steak$", "Grilled steak", "Beef, pork & lamb"),
    (r"barbacoa", "Barbacoa", "Beef, pork & lamb"),
    (r"carnitas", "Carnitas", "Beef, pork & lamb"),
    (r"bacon", "Bacon", "Beef, pork & lamb"),
    (r"tuna", "Albacore tuna", "Seafood"),
    (r"tofu", "Roasted tofu", "Plant-based mains"),
    (r"sofritas", "Sofritas", "Plant-based mains"),
    (r"portobello", "Portobello mix", "Plant-based mains"),
    # dips, salsas & spreads
    (r"guacamole|^guac$", "Guacamole", "Dips & spreads"),
    (r"queso blanco", "Queso blanco", "Dips & spreads"),
    (r"fresh tomato salsa", "Fresh tomato salsa", "Salsas"),
    (r"chili-corn salsa|corn salsa", "Corn salsa", "Salsas"),
    (r"tomatillo-green", "Tomatillo-green chili salsa", "Salsas"),
    (r"tomatillo-red", "Tomatillo-red chili salsa", "Salsas"),
    # dressings & sauces
    (r"balsamic vinaigrette", "Balsamic vinaigrette", "Dressings"),
    (r"caesar", "Caesar dressing", "Dressings"),
    (r"green goddess ranch", "Green goddess ranch", "Dressings"),
    (r"jalape[nñ]o ranch", "Charred jalapeño ranch", "Dressings"),
    (r"pesto vinaigrette", "Pesto vinaigrette", "Dressings"),
    (r"hot honey mustard", "Hot honey mustard", "Dressings"),
    (r"miso sesame ginger", "Miso sesame ginger", "Dressings"),
    (r"spicy cashew", "Spicy cashew dressing", "Dressings"),
    (r"citrus sesame", "Citrus sesame vinaigrette", "Dressings"),
    (r"lime cilantro jalape", "Lime cilantro jalapeño", "Dressings"),
    (r"garlic aioli", "Garlic aioli", "Dressings"),
    (r"hot sauce", "Hot sauce", "Dressings"),
    (r"cilantro lime sauce", "Cilantro lime sauce", "Dressings"),
    # toppings: vegetables & fruit
    (r"tomatoes", "Tomatoes", "Fresh vegetables"),
    (r"carrot", "Carrots", "Fresh vegetables"),
    (r"napa cabbage slaw", "Napa cabbage slaw", "Fresh vegetables"),
    (r"shredded cabbage", "Shredded cabbage", "Fresh vegetables"),
    (r"spicy broccoli", "Spicy broccoli", "Fresh vegetables"),
    (r"sweet potato", "Roasted sweet potatoes", "Fresh vegetables"),
    (r"brussels", "Maple glazed brussels", "Fresh vegetables"),
    (r"fajita veggies", "Fajita veggies", "Fresh vegetables"),
    (r"^apples$", "Apples", "Fresh vegetables"),
    (r"cilantro", "Cilantro", "Fresh vegetables"),
    (r"basil", "Basil", "Fresh vegetables"),
    # toppings: cheese & dairy
    (r"goat cheese", "Goat cheese", "Cheese, dairy & avocado"),
    (r"parmesan crisps|parm crisps", "Parmesan crisps", "Crunch & nuts"),
    (r"parmesan|parm cheese", "Parmesan", "Cheese, dairy & avocado"),
    (r"white cheddar", "White cheddar", "Cheese, dairy & avocado"),
    (r"monterey jack|^cheese$|, cheese\)", "Shredded cheese", "Cheese, dairy & avocado"),
    (r"sour cream", "Sour cream", "Cheese, dairy & avocado"),
    # toppings: crunch & nuts
    (r"breadcrumbs", "Garlic breadcrumbs", "Crunch & nuts"),
    (r"crispy onions", "Crispy onions", "Crunch & nuts"),
    (r"crispy rice", "Crispy rice", "Crunch & nuts"),
    (r"sesame crunch|nori sesame", "Sesame crunch", "Crunch & nuts"),
    (r"crispy noodles", "Crispy noodles", "Crunch & nuts"),
    (r"almonds", "Roasted almonds", "Crunch & nuts"),
    (r"caraway", "Caraway seeds", "Spices & seasonings"),
    (r"chili lime seasoning", "Chili lime seasoning", "Spices & seasonings"),
    # breads & chips
    (r"tortilla chips|kid.s chips|side of chips", "Tortilla chips", "Breads & chips"),
    (r"tortilla", "Flour tortilla", "Breads & chips"),
    (r"focaccia", "Rosemary focaccia", "Breads & chips"),
    # sweets
    (r"cashews", "Cashews", "Desserts & pantry"),
    (r"sea salt", "Salt", "Spices & seasonings"),
    (r"caramel", "Honey", "Desserts & pantry"),
    # drinks
    (r"watermelon", "Watermelon", "Fruit & botanicals"),
    (r"mandarin|tangerine|^orange$", "Orange", "Fruit & botanicals"),
    (r"berries|raspberry", "Mixed berries", "Fruit & botanicals"),
    (r"strawberry", "Strawberry", "Fruit & botanicals"),
    (r"grapefruit", "Grapefruit", "Fruit & botanicals"),
    (r"passionfruit", "Passion fruit", "Fruit & botanicals"),
    (r"hibiscus", "Hibiscus", "Fruit & botanicals"),
    (r"yaupon|clover tea", "Herbal tea", "Tea, soda & water"),
    (r"maple syrup", "Maple syrup", "Desserts & pantry"),
    (r"apple cider", "Apple", "Fruit & botanicals"),
    (r"kombucha", "Kombucha", "Tea, soda & water"),
    (r"prebiotic", "Prebiotic soda", "Tea, soda & water"),
    (r"\bcola\b", "Cola", "Tea, soda & water"),
    (r"lemon-lime soda|mango soda|guava soda", "Fruit soda", "Tea, soda & water"),
    (r"fountain soda or iced tea", "Fountain soda", "Tea, soda & water"),
    (r"^pickles?( spear)?$|pickle spear", "Pickles", "Pickled & brined"),
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
    (r"steak", "Grilled steak", "Beef, pork & lamb"),
    (r"lamb meatball", "Spicy lamb meatballs", "Beef, pork & lamb"),
    (r"braised lamb", "Braised lamb", "Beef, pork & lamb"),
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
    (r"pita crisps", "Pita crisps", "Breads & chips"),
    (r"pita chips", "Pita chips", "Breads & chips"),
    (r"\bpita\b", "Pita", "Breads & chips"),
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
    (r"pickle", "Pickles", "Pickled & brined"),
    (r"olive", "Kalamata olives", "Pickled & brined"),
    (r"feta", "Crumbled feta", "Cheese, dairy & avocado"),
    (r"avocado", "Avocado", "Cheese, dairy & avocado"),
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

SMALL_LINE = re.compile(r"side|drink|dessert|sweet|chips|bottled|fountain", re.I)  # add-ons: not a composed meal
MEAT_CATS = {"Chicken", "Beef, pork & lamb", "Seafood"}       # anything else counts as vegetarian

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
            "small": bool(SMALL_LINE.search(row["line"])),
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
