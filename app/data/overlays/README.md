# Public-data overlays

These files add public context to the synthetic Junction dataset. Each file is a separate overlay with its own key.
They never change a source row or an imported transaction value. The source stays at the pinned upstream revision
`fbdecdedf1a1f49dd641c2e6b9f2b62d0dc0cc8f` of `hackjunction/Junction-2026-S-pankki`.

**Important: the transactions are synthetic.** A business, area or rate in these files did not take part in any
transaction. Show the `label` text with any name or value that comes from these files.

| File | Rows | Key | Source | Licence |
|---|---:|---|---|---|
| `merchants.csv` | 515 | `merchant_id` | OpenStreetMap, Wikidata, `greggles/mcc-codes` | **ODbL 1.0** (see below) |
| `merchant_ids.csv` | 515 | `merchant_id` | The pinned transactions CSV (ID, MCC, category only) | Same terms as the dataset |
| `postal_areas.csv` | 290 | `postal_code` | Statistics Finland, Paavo | CC BY 4.0 |
| `mortgage_market_rates.csv` | 16 | `month`, `series` | Bank of Finland open data | Free reuse with acknowledgement of the source |

## Regenerate

From `app/`:

```sh
python3 scripts/build-overlays.py all             # fetch once, then build all three overlays
python3 scripts/build-overlays.py all --offline   # build again from the cache only
```

- Python standard library only. No new dependencies.
- The merchant step reads `work/transactions.csv` if it is present and checks its SHA-256
  (`49b3265d…1e63`). Then it writes `merchant_ids.csv` again. If the CSV is missing, it uses the committed
  `merchant_ids.csv`.
- The postal step downloads `tx_customers_junction.csv` from the pinned revision to `work/` and checks its
  SHA-256 (`c2511f4f…8cb3`).
- Raw responses are cached under the ignored `work/overlay-cache/` with their retrieval time. A re-run uses the
  cache and gives byte-identical files. Delete the cache to fetch new data. New OSM data gives different names.
- Never commit `work/`.

## Time zone

The source `tx_timestamp` (`DDMONYY:HH:MM:SS`) has no time zone. Koti assumes **Europe/Helsinki local time**.
This is an assumption. The dataset does not state it.

## `merchants.csv`

One real name for each of the 515 merchant IDs. Columns:

| Column | Meaning |
|---|---|
| `merchant_id` | Key. Exists in the source. |
| `display_name` | OSM `name` tag (with `branch` or `addr:street`, see below), or the Wikidata English label for airlines. |
| `brand` | OSM `brand` tag (blank if none). For airlines, the airline name. |
| `venue_type` | Kind of venue, chosen from the MCC (for example `cafe`, `supermarket`, `fuel_station`). |
| `source_mcc_code`, `source_category` | Copied from the source, for validation. |
| `mcc_description` | `edited_description` from `greggles/mcc-codes` at commit `df792275`. |
| `municipality`, `postal_code`, `lat`, `lon` | Where the venue is (OSM). `postal_code` is the OSM `addr:postcode` tag, blank if none. |
| `osm_type`, `osm_id` | The OSM element, for example `node` and `123`. See `https://www.openstreetmap.org/node/123`. |
| `brand_wikidata` | OSM `brand:wikidata` tag, or the Wikidata item of the airline. |
| `name_source`, `licence`, `retrieved_at` | Where the name comes from, the licence of that source and the data date. |
| `label` | Text to show with the name. |

How names are chosen:

- **Area:** named OSM venues in Helsinki, Espoo and Vantaa (one Overpass query for each municipality).
- **Type:** each MCC has a list of OSM tags that fit it (for example 5814 → `amenity=cafe`, 5411 →
  `shop=supermarket`, 7523 → multi-storey or underground parking). A later tier fills a shortfall only
  (for example 7996 uses theme parks first, then trampoline parks and arcades).
- **Chains:** for supermarkets (5411), fuel (5541, 5542), pharmacies (5912), electronics (5732), DIY (5200)
  and car rental (7512), venues with an OSM `brand` tag come first.
- **Fair mix:** the order inside a tier is a SHA-256 hash with a fixed seed, so every venue has the same chance.
  The brand cap is 25% of the IDs in a venue pool, rounded up to a whole venue.
- **No duplicates:** no OSM element and no display name is used twice.
- **Branch names:** OSM often has only the chain in `name` (for example 55 supermarkets are just "S-market") and
  the branch in the `branch` tag. The display name is `name` + `branch` ("S-market Haukilahti"). If the name repeats
  and there is no branch, the OSM street is added ("Lidl, Töölöntullinkatu"). `name_source` tells which tags were used.
- **Public health:** public health stations, hospitals and city dental clinics are left out of 8011, 8021 and
  8099, because they are not businesses.
- **Sensitive venues:** LGBTQ-specific venues, adult venues and mental-health or therapy services are left out of
  every MCC. A synthetic purchase there could suggest private facts about a persona.
- **Airlines (4511):** OSM has no airline offices in the area. The names come from Wikidata (CC0): first airlines
  with a hub at Helsinki Airport, then current members of Star Alliance, Oneworld or SkyTeam. Cargo airlines are
  left out.
- **Transit (4111) and taxis (4121):** OSM has no taxi company offices in the area. These IDs get the names of
  real stations and taxi ranks. These are places, not companies.

Limits:

- **A name is a label only.** Each merchant ID is shared by 90 to 5,074 customers. It has no location. Its
  amounts and times follow the category, not the shop (the largest café purchase is €11,104.70). So a name
  says nothing true about that business, its prices or its customers.
- OSM and Wikidata can be out of date. A venue can be closed now.

### Licence and attribution: ODbL 1.0

`merchants.csv` contains names, IDs and coordinates from OpenStreetMap. So it is a derivative database of
OpenStreetMap and is available under the
[Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/).
If you share or change this file, you must keep it under ODbL 1.0 and keep this attribution.

Attribution: **© [OpenStreetMap contributors](https://www.openstreetmap.org/copyright)**. Data from the
[Overpass API](https://overpass-api.de/).

Other sources in this file:

- [Wikidata](https://www.wikidata.org/) (CC0 1.0): airline names and IDs, and the meaning of `brand_wikidata`.
- [greggles/mcc-codes](https://github.com/greggles/mcc-codes) (Unlicense): MCC descriptions.

## `merchant_ids.csv`

The 515 merchant IDs with their MCC and category, read from the full transactions CSV. It contains no customer
data. Tests use it because the full CSV is not in CI.

## `postal_areas.csv`

One row for each distinct `customer_postal_code` in `tx_customers_junction.csv` (290 codes, kept as strings).

- Source: Statistics Finland, Paavo – Open data by postal code area, 2026 edition, table `12f7_ja2026`
  ("All data groups"), postal code areas as at 1 January 2026, **data year 2024** (the latest year in the table).
  PxWeb API: `https://pxdata.stat.fi/PxWeb/api/v1/en/Postinumeroalueittainen_avoin_tieto/2026/12f7_ja2026.px`.
- `status`: `in_paavo` (195 codes) or `not_in_paavo` (95 codes, for example `00006` or `00642`). A code that is
  not a Paavo postal area keeps its row with no values. Nothing is guessed.
- Values: `inhabitants` (`he_vakiy`), `households` (`te_taly`), `households_owner_occupied` (`te_omis_as`),
  `households_rented` (`te_vuok_as`), `household_median_income_eur` (`tr_mtu`) and `household_average_income_eur`
  (`tr_ktu`). Incomes are annual disposable money income of households, in euros of the data year.
- `rented_household_share_percent` is calculated by this script: `households_rented / households × 100`, one
  decimal. It is not a Statistics Finland figure.
- Statistics Finland hides values for small areas. Those values are blank and named in `confidential_fields`.

Attribution: **Source: Statistics Finland, Paavo – Open data by postal code area 2026.** Licence:
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) (see the
[Statistics Finland terms of use](https://stat.fi/en/about-us/get-to-know-statistics-finland/legislation/terms-of-use)).
This file changes the data: it selects areas and columns and adds one calculated share.

## `mortgage_market_rates.csv`

Monthly values for Finland, January to August 2026 only. This is the original, limited rate snapshot; the app now uses the shared 1 October clock. No later month
is included.

| `series` | Bank of Finland series (`MFI_PUBL`) |
|---|---|
| `new_housing_loans_average_rate` | `M.A.1.B.A20.A.A.U6.2251.ZZ.Z01.H.A.0.A.0.A.0`: annualised agreed rate on new drawdowns of housing loans to households. It agrees with the rate in Bank of Finland press releases (2.84% for January 2026). |
| `new_housing_loans_interest_margin` | `M.B.4.B.A22.A.A.Z5.2250.ZZ.Z01.H.A.0.A.0.A.0`: interest margin on new drawdowns of housing loans to households, credit institutions. **This is not the same figure as the margin in press releases** (0.52% for January 2026). The press releases use the Positive Credit Register. |

- `value_percent` is the API value without rounding.
- Not included: **the 12-month Euribor.** The Bank of Finland shows Euribor rates under the terms of the European
  Money Markets Institute (EMMI). These terms forbid copying or redistributing the data for commercial reasons
  without an EMMI licence. So this file does not contain it.
- `label`: "Public monthly average for Finland. Not the rate of any loan in the dataset."

Attribution: **Source: Bank of Finland.** Licence: the
[Bank of Finland Open Data Service](https://www.suomenpankki.fi/en/bank-of-finland/contacts/open-data-service/)
says the datasets are "freely available and reusable subject to acknowledgement of the original source".
This is not stated as CC BY 4.0. API: `https://api.boffsaopendata.fi/v4/observations/MFI_PUBL`.

### Observation time versus retrieval time

These overlays are descriptive demo labels and public context, not inputs to the audited cash forecast. Merchant metadata was retrieved in November 2026, after the October demo clock. It must not be presented as evidence known at that simulation date or used in the September backtest. A statistical observation month is not its release date: before adding newer rates to an as-of simulation, verify when they were publicly available. The January–August snapshot is retained without inventing September values.
