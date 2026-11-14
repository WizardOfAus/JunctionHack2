#!/usr/bin/env python3
"""Build Koti's public-data overlay files with the Python standard library only.

Run from app/:
    python3 scripts/build-overlays.py all            # build the three overlays
    python3 scripts/build-overlays.py merchants      # app/data/overlays/merchants.csv
    python3 scripts/build-overlays.py postal-areas   # app/data/overlays/postal_areas.csv
    python3 scripts/build-overlays.py rates          # app/data/overlays/mortgage_market_rates.csv
Add --offline to use only the cached raw responses under work/overlay-cache/.

The overlays never change source rows. They are keyed by merchant_id, postal code or month.
Raw API responses are cached under the ignored work/ directory, so a re-run gives the same files.
Selection is deterministic: candidates are ordered by a SHA-256 hash with a fixed seed.
"""
import argparse
import csv
import hashlib
import io
import json
import math
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

USER_AGENT = "koti-demo-overlay-builder/1.0 (+https://github.com/WizardOfAus/JunctionHack2)"
REVISION = "fbdecdedf1a1f49dd641c2e6b9f2b62d0dc0cc8f"
UPSTREAM = f"https://media.githubusercontent.com/media/hackjunction/Junction-2026-S-pankki/{REVISION}"
TRANSACTIONS_SHA256 = "49b3265d8e44e751de305a074dcffcda732bb79aa1e07b46fcca774ce76f1e63"
CUSTOMERS_URL = f"https://raw.githubusercontent.com/hackjunction/Junction-2026-S-pankki/{REVISION}/tx_customers_junction.csv"
CUSTOMERS_SHA256 = "c2511f4f04f825f561d0c37ee4c64c83cdcd358b27b23c1b311f87a951bc8cb3"

OUT = Path("data/overlays")
CACHE = Path("work/overlay-cache")
SEED = "koti-merchant-overlay-v1"


# ---------------------------------------------------------------- shared helpers

def fetch(name, url, *, data=None, headers=None, offline=False, pause=0.0):
    """Return (body_text, retrieved_at). Cache the raw body and its retrieval time."""
    body_path, meta_path = CACHE / name, CACHE / (name + ".meta.json")
    if body_path.exists() and meta_path.exists():
        return body_path.read_text(encoding="utf-8"), json.loads(meta_path.read_text())["retrieved_at"]
    if offline:
        raise SystemExit(f"--offline: no cached response {body_path}. Run once without --offline.")
    request = urllib.request.Request(url, data=data, headers={"User-Agent": USER_AGENT, **(headers or {})})
    for attempt in range(5):
        try:
            with urllib.request.urlopen(request, timeout=900) as response:
                raw = response.read()
            break
        except urllib.error.HTTPError as error:
            if error.code in (429, 502, 503, 504) and attempt < 4:
                wait = 30 * (attempt + 1)
                print(f"  HTTP {error.code} for {name}; wait {wait} s", file=sys.stderr)
                time.sleep(wait)
                continue
            raise SystemExit(f"HTTP {error.code} for {url}: {error.read()[:500]!r}")
    if raw[:2] == b"\x1f\x8b":
        import gzip
        raw = gzip.decompress(raw)
    text = raw.decode("utf-8")
    retrieved_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    CACHE.mkdir(parents=True, exist_ok=True)
    body_path.write_text(text, encoding="utf-8")
    meta_path.write_text(json.dumps({"url": url, "retrieved_at": retrieved_at,
                                     "request_body": data.decode("utf-8") if data else None}, indent=2) + "\n")
    if pause:
        time.sleep(pause)
    return text, retrieved_at


def sha256_file(path):
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def write_csv(path, columns, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=columns, lineterminator="\n")
    writer.writeheader()
    for row in rows:
        writer.writerow({column: row.get(column, "") for column in columns})
    path.write_text(buffer.getvalue(), encoding="utf-8")
    print(f"wrote {path} ({len(rows)} rows)")


def hash_order(*parts):
    return hashlib.sha256("|".join((SEED,) + parts).encode("utf-8")).hexdigest()


# ---------------------------------------------------------------- merchants

MUNICIPALITIES = ("Espoo", "Helsinki", "Vantaa")
MCC_URL = "https://raw.githubusercontent.com/greggles/mcc-codes/df792275c567946119a8903d36dbd33e44a248bf/mcc_codes.csv"
OVERPASS_URL = "https://overpass-api.de/api/interpreter"
WIKIDATA_URL = "https://query.wikidata.org/sparql"
ID_LIST = OUT / "merchant_ids.csv"
MERCHANT_LABEL = ("Real name from public data, assigned to this synthetic merchant ID for the Koti demo. "
                  "The transactions are synthetic. This business or place did not take part in them.")
GROUP_CATEGORY = {"GRO": "Groceries", "RES": "Restaurants", "TRN": "Transportation", "ENT": "Entertainment",
                  "HEA": "Health", "HMT": "Home & Tech", "LIF": "Lifestyle", "TRV": "Travel"}

# Selector name -> (venue_type, {OSM key: allowed values}). All conditions must match.
SELECTORS = {
    "supermarket": ("supermarket", {"shop": {"supermarket"}}),
    "convenience": ("convenience_store", {"shop": {"convenience"}}),
    "deli": ("delicatessen", {"shop": {"deli"}}),
    "health_food": ("health_food_shop", {"shop": {"health_food"}}),
    "butcher": ("butcher", {"shop": {"butcher"}}),
    "seafood": ("fish_shop", {"shop": {"seafood"}}),
    "cheese": ("cheese_shop", {"shop": {"cheese", "dairy"}}),
    "restaurant": ("restaurant", {"amenity": {"restaurant"}}),
    "bar": ("bar", {"amenity": {"bar", "pub"}}),
    "cafe": ("cafe", {"amenity": {"cafe"}}),
    "fuel": ("fuel_station", {"amenity": {"fuel"}}),
    "parking_garage": ("parking_garage", {"amenity": {"parking"}, "parking": {"multi-storey", "underground"}}),
    "metro": ("metro_station", {"railway": {"station"}, "station": {"subway"}}),
    "train": ("train_station", {"railway": {"station"}}),
    "taxi": ("taxi_rank", {"amenity": {"taxi"}}),
    "theatre": ("theatre", {"amenity": {"theatre"}}),
    "event_venue": ("event_venue", {"amenity": {"events_venue", "arts_centre", "music_venue", "concert_hall"}}),
    "cinema": ("cinema", {"amenity": {"cinema"}}),
    "museum": ("museum_or_gallery", {"tourism": {"museum", "gallery"}}),
    "zoo": ("zoo_or_aquarium", {"tourism": {"zoo", "aquarium"}}),
    "theme_park": ("amusement_park", {"tourism": {"theme_park"}}),
    "recreation": ("recreation_venue", {"leisure": {"bowling_alley", "escape_game", "amusement_arcade",
                                                    "trampoline_park", "water_park", "miniature_golf"}}),
    "sauna": ("public_sauna", {"leisure": {"sauna"}}),
    "public_bath": ("public_bath", {"amenity": {"public_bath"}}),
    "pharmacy": ("pharmacy", {"amenity": {"pharmacy"}}),
    "doctors": ("medical_clinic", {"amenity": {"doctors", "clinic"}}),
    "dentist": ("dental_clinic", {"amenity": {"dentist"}}),
    "health_practitioner": ("health_practitioner", {"healthcare": {
        "physiotherapist", "psychotherapist", "podiatrist", "laboratory", "optometrist", "audiologist",
        "speech_therapist", "occupational_therapist"}}),
    "diy": ("home_improvement_store", {"shop": {"doityourself"}}),
    "hardware": ("hardware_store", {"shop": {"hardware"}}),
    "electronics": ("electronics_store", {"shop": {"electronics"}}),
    "furniture": ("furniture_store", {"shop": {"furniture"}}),
    "computer": ("computer_or_games_store", {"shop": {"computer", "video_games"}}),
    "mobile_phone": ("mobile_phone_shop", {"shop": {"mobile_phone"}}),
    "sports": ("sports_shop", {"shop": {"sports", "outdoor"}}),
    "bicycle": ("bicycle_shop", {"shop": {"bicycle"}}),
    "clothes": ("clothes_shop", {"shop": {"clothes"}}),
    "books": ("bookshop", {"shop": {"books"}}),
    "toys": ("toy_or_hobby_shop", {"shop": {"toys", "games", "model", "craft"}}),
    "gift": ("gift_or_variety_shop", {"shop": {"gift", "variety_store", "general"}}),
    "travel_agency": ("travel_agency", {"shop": {"travel_agency"}}),
    "travel_office": ("travel_agency", {"office": {"travel_agent"}}),
    "hotel": ("hotel", {"tourism": {"hotel"}}),
    "car_rental": ("car_rental", {"amenity": {"car_rental"}}),
}

# MCC -> pool (venues shared by MCCs in one pool), chain preference, ordered tiers of selectors.
# For chain types, venues with an OSM brand tag come first. Later tiers fill a shortfall only.
SPEC = {
    "4111": ("transit_station", False, [["metro", "train"]]),
    "4121": ("taxi", False, [["taxi"]]),
    "4511": ("airline", False, []),  # Wikidata, see airline_candidates()
    "4722": ("travel_agency", False, [["travel_agency", "travel_office"]]),
    "5200": ("diy", True, [["diy"], ["hardware"]]),
    "5251": ("diy", False, [["hardware"], ["diy"]]),
    "5411": ("supermarket", True, [["supermarket"]]),
    "5422": ("meat_fish", False, [["butcher", "seafood"], ["deli"]]),
    "5451": ("dairy", False, [["cheese"], ["deli"]]),
    "5499": ("food_shop", False, [["convenience", "deli", "health_food"]]),
    "5541": ("fuel", True, [["fuel"]]),
    "5542": ("fuel", True, [["fuel"]]),
    "5651": ("clothes", False, [["clothes"]]),
    "5691": ("clothes", False, [["clothes"]]),
    "5712": ("furniture", False, [["furniture"]]),
    "5732": ("electronics", True, [["electronics"]]),
    "5734": ("computer", False, [["computer"], ["mobile_phone", "electronics"]]),
    "5812": ("restaurant", False, [["restaurant"]]),
    "5813": ("bar", False, [["bar"]]),
    "5814": ("cafe", False, [["cafe"]]),
    "5912": ("pharmacy", True, [["pharmacy"]]),
    "5941": ("sports", False, [["sports", "bicycle"]]),
    "5942": ("books", False, [["books"]]),
    "5945": ("toys", False, [["toys"]]),
    "5999": ("gift", False, [["gift"]]),
    "7011": ("hotel", False, [["hotel"]]),
    "7512": ("car_rental", True, [["car_rental"]]),
    "7523": ("parking", False, [["parking_garage"]]),
    "7832": ("cinema", False, [["cinema"]]),
    "7922": ("theatre", False, [["theatre"], ["event_venue"]]),
    "7991": ("attraction", False, [["museum", "zoo"]]),
    "7996": ("amusement", False, [["theme_park"], ["recreation"]]),
    "7999": ("recreation", False, [["recreation", "sauna", "public_bath"]]),
    "8011": ("medical", False, [["doctors"]]),
    "8021": ("dental", False, [["dentist"]]),
    "8099": ("health_practitioner", False, [["health_practitioner"]]),
}
# No brand gets more than this share of the IDs in one pool, so no company dominates a type.
BRAND_CAP_SHARE = 0.25
# Public health services are not businesses. Leave them out of the health MCCs.
PUBLIC_HEALTH = re.compile(r"terveysasema|hälsostation|hammashoitola|tandklinik|kaupun|\bstad\b|\bHUS\b|"
                           r"hyvinvointialue|välfärdsområde|sairaala|sjukhus|neuvola|rådgivning", re.I)
HEALTH_MCCS = {"8011", "8021", "8099"}
# A synthetic purchase at some venues could suggest private facts about a persona (sexuality, mental health).
# Leave these venues out of every MCC.
SENSITIVE_NAME = re.compile(r"\bgay\b|\blgbt|\bsex|erot|strip|psyk|psykiatr|psychiatr|psychother|\bKKT\b|"
                            r"terapia|therapy|mielenterve", re.I)
SENSITIVE_TAGS = {("healthcare", "psychotherapist"), ("lgbtq", "primary"), ("lgbtq", "only"), ("gay", "yes")}
CLOSED = {"closed", "off"}

MERCHANT_COLUMNS = ["merchant_id", "display_name", "brand", "venue_type", "source_mcc_code", "source_category",
                    "mcc_description", "municipality", "postal_code", "lat", "lon", "osm_type", "osm_id",
                    "brand_wikidata", "name_source", "licence", "retrieved_at", "label"]


def read_merchant_ids(source):
    """Read merchant ID, MCC and category from the full CSV, or from the committed ID list."""
    if source.exists():
        print(f"verify {source} ...")
        if sha256_file(source) != TRANSACTIONS_SHA256:
            raise SystemExit(f"{source} does not match the pinned SHA-256. Download the LFS payload again.")
        seen = defaultdict(set)
        with source.open(encoding="utf-8-sig", newline="") as handle:
            for raw in csv.DictReader(handle):
                if raw["merchant_id"]:
                    seen[raw["merchant_id"]].add((raw["mcc_code"], raw["category"]))
        rows = []
        for merchant_id in sorted(seen):
            if len(seen[merchant_id]) != 1:
                raise SystemExit(f"{merchant_id} has more than one MCC or category: {seen[merchant_id]}")
            mcc, category = next(iter(seen[merchant_id]))
            rows.append({"merchant_id": merchant_id, "mcc_code": mcc, "category": category})
        write_csv(ID_LIST, ["merchant_id", "mcc_code", "category"], rows)
        return rows
    if not ID_LIST.exists():
        raise SystemExit(f"Neither {source} nor {ID_LIST} exists.")
    print(f"{source} is missing; use the committed {ID_LIST}")
    with ID_LIST.open(encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def mcc_descriptions(offline):
    text, _ = fetch("mcc_codes.csv", MCC_URL, offline=offline)
    return {row["mcc"]: row["edited_description"] for row in csv.DictReader(io.StringIO(text))}


def overpass_query(municipality):
    values = defaultdict(set)
    for _, conditions in SELECTORS.values():
        key = next(iter(conditions))  # the first condition is the main OSM key
        values[key] |= conditions[key]
    statements = "".join(f'  nwr["{key}"~"^({"|".join(sorted(v))})$"]["name"](area.a);\n'
                         for key, v in sorted(values.items()))
    return (f'[out:json][timeout:900];\n'
            f'area["boundary"="administrative"]["admin_level"="8"]["name"="{municipality}"]->.a;\n'
            f'(\n{statements});\nout center tags;\n')


def display_name(tags, repeated):
    """OSM often puts only the chain in `name` and the branch in `branch`. Use both, as OSM intends.
    If the name repeats and there is no branch, add the OSM street. Nothing is invented."""
    name = " ".join(tags["name"].split())
    branch = " ".join(tags.get("branch", "").split())
    words = lambda text: set(re.findall(r"\w+", text.casefold()))
    if branch and not words(branch) <= words(name):
        return f"{name} {branch}", "OpenStreetMap name and branch tags"
    street = " ".join(tags.get("addr:street", "").split())
    if name.casefold() in repeated and street:
        return f"{name}, {street}", "OpenStreetMap name and addr:street tags"
    return name, "OpenStreetMap name tag"


def osm_venues(offline):
    venues = []
    for municipality in MUNICIPALITIES:
        query = overpass_query(municipality)
        name = f"overpass-{municipality.lower()}-{hashlib.sha256(query.encode()).hexdigest()[:12]}.json"
        text, _ = fetch(name, OVERPASS_URL, data=urllib.parse.urlencode({"data": query}).encode(),
                        offline=offline, pause=10)
        payload = json.loads(text)
        data_date = payload["osm3s"]["timestamp_osm_base"][:10]
        for element in payload["elements"]:
            tags = element.get("tags", {})
            lat = element.get("lat", element.get("center", {}).get("lat"))
            lon = element.get("lon", element.get("center", {}).get("lon"))
            if lat is None or lon is None:
                continue
            venues.append({"key": f"{element['type']}/{element['id']}", "osm_type": element["type"],
                           "osm_id": str(element["id"]), "tags": tags, "municipality": municipality,
                           "lat": f"{lat:.6f}", "lon": f"{lon:.6f}", "retrieved_at": data_date})
        print(f"  OSM {municipality}: {len(payload['elements'])} elements, data as of {data_date}")
    counts = Counter(v["tags"].get("name", "").strip().casefold() for v in venues)
    repeated = {name for name, count in counts.items() if count > 1}
    for venue in venues:
        if venue["tags"].get("name", "").strip():
            venue["name"], venue["name_source"] = display_name(venue["tags"], repeated)
    return venues


AIRLINE_QUERY = """SELECT ?item ?label ?helhub ?alliance WHERE {
  ?item wdt:P31 wd:Q46970; wdt:P229 ?iata.
  FILTER NOT EXISTS { ?item wdt:P576 ?dissolved }
  ?item rdfs:label ?label. FILTER(LANG(?label) = "en")
  OPTIONAL { ?item wdt:P113 ?hub. ?hub wdt:P238 "HEL". BIND(1 AS ?helhub) }
  OPTIONAL { ?item p:P114 ?st. ?st ps:P114 ?a. FILTER NOT EXISTS { ?st pq:P582 ?left }
             ?a rdfs:label ?alliance. FILTER(LANG(?alliance) = "en" && STR(?alliance) IN ("Star Alliance", "Oneworld", "SkyTeam")) }
  FILTER(BOUND(?helhub) || BOUND(?alliance))
}"""


def airline_candidates(offline):
    """Tier 1: airlines with a hub at Helsinki Airport. Tier 2: current members of the three alliances."""
    url = WIKIDATA_URL + "?" + urllib.parse.urlencode({"query": AIRLINE_QUERY, "format": "json"})
    text, retrieved_at = fetch("wikidata-airlines.json", url, headers={"Accept": "application/sparql-results+json"},
                               offline=offline)
    items = {}
    for binding in json.loads(text)["results"]["bindings"]:
        qid = binding["item"]["value"].rsplit("/", 1)[-1]
        label = binding["label"]["value"]
        if "cargo" in label.lower():
            continue
        entry = items.setdefault(qid, {"qid": qid, "label": label, "tier": 1 if "helhub" in binding else 2})
        if "helhub" in binding:
            entry["tier"] = 1
    return [dict(item, retrieved_at=retrieved_at[:10]) for item in items.values()]


def selector_match(tags, selector):
    _, conditions = SELECTORS[selector]
    return all(tags.get(key) in allowed for key, allowed in conditions.items())


def usable(venue, mcc):
    tags = venue["tags"]
    name = tags.get("name", "").strip()
    if len(name) < 2 or tags.get("opening_hours", "").strip().lower() in CLOSED:
        return False
    if tags.get("access") in {"private", "no"}:
        return False
    if mcc in HEALTH_MCCS and PUBLIC_HEALTH.search(name + " " + tags.get("operator", "")):
        return False
    if SENSITIVE_NAME.search(name) or any(tags.get(key) == value for key, value in SENSITIVE_TAGS):
        return False
    return True


def build_merchants(args):
    ids = read_merchant_ids(args.source)
    descriptions = mcc_descriptions(args.offline)
    venues = osm_venues(args.offline)
    airlines = airline_candidates(args.offline)
    by_mcc = defaultdict(list)
    for row in ids:
        by_mcc[row["mcc_code"]].append(row)
    missing = sorted(set(by_mcc) - set(SPEC))
    if missing:
        raise SystemExit(f"No venue rule for MCC {missing}. Add one to SPEC.")
    pool_size = Counter()
    for mcc, rows in by_mcc.items():
        pool_size[SPEC[mcc][0]] += len(rows)
    taken_keys, taken_names, brand_count = set(), set(), Counter()
    output, report = [], []
    for mcc in sorted(by_mcc):
        pool, chain, tiers = SPEC[mcc]
        cap = max(1, math.ceil(pool_size[pool] * BRAND_CAP_SHARE))
        if mcc == "4511":
            ordered = [(item["tier"], hash_order(pool, item["qid"]), item) for item in airlines]
            candidates = [{"key": "wikidata/" + item["qid"], "name": item["label"], "brand": item["label"],
                           "venue_type": "airline", "brand_wikidata": item["qid"], "retrieved_at": item["retrieved_at"],
                           "name_source": "Wikidata English label", "licence": "CC0-1.0"}
                          for _, _, item in sorted(ordered, key=lambda x: x[:2])]
        else:
            candidates = []
            for tier in tiers:
                matched = []
                for venue in venues:
                    selector = next((s for s in tier if selector_match(venue["tags"], s)), None)
                    if selector and usable(venue, mcc):
                        matched.append((selector, venue))
                if chain:  # branded venues first, then the rest
                    matched.sort(key=lambda x: ("brand" not in x[1]["tags"], hash_order(pool, x[1]["key"])))
                else:
                    matched.sort(key=lambda x: hash_order(pool, x[1]["key"]))
                for selector, venue in matched:
                    tags = venue["tags"]
                    candidates.append({**venue, "brand": tags.get("brand", ""),
                                       "venue_type": SELECTORS[selector][0], "brand_wikidata": tags.get("brand:wikidata", ""),
                                       "postal_code": tags.get("addr:postcode", ""),
                                       "licence": "ODbL-1.0"})
        rows = sorted(by_mcc[mcc], key=lambda r: r["merchant_id"])
        position = 0
        for row in rows:
            while position < len(candidates):
                candidate = candidates[position]
                position += 1
                name_key = candidate["name"].casefold()
                brand_key = (pool, candidate["brand"].casefold()) if candidate["brand"] else None
                if candidate["key"] in taken_keys or name_key in taken_names:
                    continue
                if brand_key and brand_count[brand_key] >= cap:
                    continue
                taken_keys.add(candidate["key"])
                taken_names.add(name_key)
                if brand_key:
                    brand_count[brand_key] += 1
                output.append({
                    "merchant_id": row["merchant_id"], "display_name": candidate["name"], "brand": candidate["brand"],
                    "venue_type": candidate["venue_type"], "source_mcc_code": mcc, "source_category": row["category"],
                    "mcc_description": descriptions.get(mcc, ""), "municipality": candidate.get("municipality", ""),
                    "postal_code": candidate.get("postal_code", ""), "lat": candidate.get("lat", ""),
                    "lon": candidate.get("lon", ""), "osm_type": candidate.get("osm_type", ""),
                    "osm_id": candidate.get("osm_id", ""), "brand_wikidata": candidate["brand_wikidata"],
                    "name_source": candidate["name_source"], "licence": candidate["licence"],
                    "retrieved_at": candidate["retrieved_at"], "label": MERCHANT_LABEL})
                break
            else:
                raise SystemExit(f"Not enough venues for MCC {mcc}: {len(rows)} IDs, {len(candidates)} candidates.")
        report.append(f"  {mcc} {pool:<20} IDs {len(rows):>3}  candidates {len(candidates):>5}")
    print("\n".join(report))
    output.sort(key=lambda r: r["merchant_id"])
    write_csv(OUT / "merchants.csv", MERCHANT_COLUMNS, output)


# ---------------------------------------------------------------- postal areas (Statistics Finland Paavo)

PAAVO_EDITION = "2026"
PAAVO_TABLE = "12f7_ja2026"
PAAVO_YEAR = "2024"
PAAVO_BASE = "https://pxdata.stat.fi/PxWeb/api/v1/{lang}/Postinumeroalueittainen_avoin_tieto/" + PAAVO_EDITION + "/" + PAAVO_TABLE + ".px"
PAAVO_FIELDS = {"he_vakiy": "inhabitants", "te_taly": "households", "te_omis_as": "households_owner_occupied",
                "te_vuok_as": "households_rented", "tr_mtu": "household_median_income_eur",
                "tr_ktu": "household_average_income_eur"}
POSTAL_COLUMNS = ["postal_code", "status", "area_name_fi", "area_name_sv", "municipality_fi", "municipality_sv",
                  "inhabitants", "households", "households_owner_occupied", "households_rented",
                  "rented_household_share_percent", "household_median_income_eur", "household_average_income_eur",
                  "confidential_fields", "paavo_edition", "paavo_year", "paavo_table", "source", "licence", "retrieved_at"]
PAAVO_SOURCE = "Statistics Finland, Paavo – Open data by postal code area, table 12f7"
AREA_TEXT = re.compile(r"^(\d{5})\s+(.*?)\s*\(([^()]*)\)\s*$")


def customer_postal_codes(offline):
    path = Path("work/tx_customers_junction.csv")
    if not path.exists():
        if offline:
            raise SystemExit(f"--offline: {path} is missing.")
        request = urllib.request.Request(CUSTOMERS_URL, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(request, timeout=120) as response:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(response.read())
    if sha256_file(path) != CUSTOMERS_SHA256:
        raise SystemExit(f"{path} does not match the pinned SHA-256.")
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return sorted({row["customer_postal_code"] for row in csv.DictReader(handle)})


def paavo_metadata(lang, offline):
    try:
        text, _ = fetch(f"paavo-{PAAVO_TABLE}-meta-{lang}.json", PAAVO_BASE.format(lang=lang), offline=offline, pause=1)
    except SystemExit as error:
        raise SystemExit(f"{error}\nIf the table ID changed (Statistics Finland changed the database on 8 June 2026), "
                         "list the tables at https://pxdata.stat.fi/PxWeb/api/v1/en/Postinumeroalueittainen_avoin_tieto/")
    meta = json.loads(text)
    area = next(v for v in meta["variables"] if v["code"].startswith("postinumeroalue"))
    return area["code"], dict(zip(area["values"], area["valueTexts"]))


def build_postal_areas(args):
    codes = customer_postal_codes(args.offline)
    area_code, names_fi = paavo_metadata("fi", args.offline)
    _, names_sv = paavo_metadata("sv", args.offline)
    known = [code for code in codes if code in names_fi]
    query = {"query": [{"code": area_code, "selection": {"filter": "item", "values": known}},
                       {"code": "timeperiod_y", "selection": {"filter": "item", "values": [PAAVO_YEAR]}},
                       {"code": "contentscode", "selection": {"filter": "item", "values": sorted(PAAVO_FIELDS)}}],
             "response": {"format": "json-stat2"}}
    body = json.dumps(query, sort_keys=True).encode()
    text, retrieved_at = fetch(f"paavo-{PAAVO_TABLE}-{PAAVO_YEAR}-{hashlib.sha256(body).hexdigest()[:12]}.json",
                               PAAVO_BASE.format(lang="en"), data=body,
                               headers={"Content-Type": "application/json"}, offline=args.offline)
    data = json.loads(text)
    dims = data["id"]
    index = {dim: data["dimension"][dim]["category"]["index"] for dim in dims}
    sizes = data["size"]

    def cell(code, field):
        position = 0
        for dim, size in zip(dims, sizes):
            key = {area_code: code, "timeperiod_y": PAAVO_YEAR, "contentscode": field}[dim]
            position = position * size + index[dim][key]
        return data["value"][position]

    rows = []
    for code in codes:
        row = {"postal_code": code, "paavo_edition": PAAVO_EDITION, "paavo_year": PAAVO_YEAR,
               "paavo_table": PAAVO_TABLE, "source": PAAVO_SOURCE, "licence": "CC-BY-4.0",
               "retrieved_at": retrieved_at[:10]}
        if code not in names_fi:
            row["status"] = "not_in_paavo"
            rows.append(row)
            continue
        fi, sv = AREA_TEXT.match(names_fi[code]), AREA_TEXT.match(names_sv[code])
        row.update(status="in_paavo", area_name_fi=fi.group(2), municipality_fi=fi.group(3),
                   area_name_sv=sv.group(2), municipality_sv=sv.group(3))
        hidden = []
        for field, column in PAAVO_FIELDS.items():
            value = cell(code, field)
            if value is None:
                hidden.append(column)
            else:
                row[column] = str(int(value)) if float(value).is_integer() else str(value)
        if row.get("households") and row.get("households_rented") and int(row["households"]) > 0:
            share = int(row["households_rented"]) * 1000 / int(row["households"])
            row["rented_household_share_percent"] = f"{math.floor(share + 0.5) / 10:.1f}"
        row["confidential_fields"] = ";".join(hidden)
        rows.append(row)
    write_csv(OUT / "postal_areas.csv", POSTAL_COLUMNS, rows)
    print(f"  in Paavo: {sum(r['status'] == 'in_paavo' for r in rows)}, not in Paavo: "
          f"{sum(r['status'] == 'not_in_paavo' for r in rows)}")


# ---------------------------------------------------------------- mortgage market rates (Bank of Finland)

BOF_API = "https://api.boffsaopendata.fi/v4/observations/"
RATE_MONTHS = [f"2026M{m}" for m in range(1, 9)]  # January to August 2026. The demo clock is 1 September 2026.
RATE_SERIES = [
    ("new_housing_loans_average_rate", "MFI_PUBL", "M.A.1.B.A20.A.A.U6.2251.ZZ.Z01.H.A.0.A.0.A.0",
     "Annualised agreed rate, new drawdowns of housing loans to Finnish households, MFIs excl. Bank of Finland, "
     "all currencies"),
    ("new_housing_loans_interest_margin", "MFI_PUBL", "M.B.4.B.A22.A.A.Z5.2250.ZZ.Z01.H.A.0.A.0.A.0",
     "Interest margin, new drawdowns, housing loans to households and non-profit institutions serving households, "
     "credit institutions, all currencies (official title: Monthly, Credit institutions, Interest margin, New drawdown, "
     "Other loans, Maturities total, Maturities total, World not allocated (geographically), Households and "
     "non-profit institutions serving households, Industries total, All currencies combined, Housing loans)"),
]
RATE_LICENCE = "Bank of Finland Open Data: free to reuse with acknowledgement of the source"
RATE_ATTRIBUTION = "Source: Bank of Finland"
RATE_LABEL = "Public monthly average for Finland. Not the rate of any loan in the dataset."
RATE_COLUMNS = ["month", "series", "series_code", "dataset", "series_title", "value_percent", "source_url",
                "licence", "attribution", "retrieved_at", "label"]


def build_rates(args):
    rows = []
    for series, dataset, code, title in RATE_SERIES:
        url = BOF_API + dataset + "?" + urllib.parse.urlencode(
            {"seriesName": code, "startPeriod": "2026-01-01", "endPeriod": "2026-08-31", "pageSize": 100})
        text, retrieved_at = fetch(f"bof-{dataset}-{code}.json", url, offline=args.offline, pause=1)
        items = json.loads(text)["items"]
        observations = {o["periodCode"]: o["value"] for item in items for o in item["observations"]}
        for period in RATE_MONTHS:
            value = observations.get(period)
            if value is None:
                print(f"  {series}: no value for {period}; left out")
                continue
            year, month = period.split("M")
            rows.append({"month": f"{year}-{int(month):02d}", "series": series, "series_code": code, "dataset": dataset,
                         "series_title": title, "value_percent": repr(float(value)), "source_url": url,
                         "licence": RATE_LICENCE, "attribution": RATE_ATTRIBUTION,
                         "retrieved_at": retrieved_at[:10], "label": RATE_LABEL})
    rows.sort(key=lambda r: (r["series"], r["month"]))
    write_csv(OUT / "mortgage_market_rates.csv", RATE_COLUMNS, rows)


# ---------------------------------------------------------------- entry point

def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("target", choices=["all", "merchants", "postal-areas", "rates"])
    parser.add_argument("--source", type=Path, default=Path("work/transactions.csv"),
                        help="full transactions CSV (optional; without it the committed merchant ID list is used)")
    parser.add_argument("--offline", action="store_true", help="use only cached responses under work/overlay-cache/")
    args = parser.parse_args()
    if args.target in ("all", "merchants"):
        build_merchants(args)
    if args.target in ("all", "postal-areas"):
        build_postal_areas(args)
    if args.target in ("all", "rates"):
        build_rates(args)


if __name__ == "__main__":
    main()
