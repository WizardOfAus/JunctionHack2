# Source data audit

Reproduced on 14 November 2026 with Python's standard library and integer euro cents.
The importer parses money with `Decimal` and rounds derived cent values half-up.

## Reproduction and provenance

From `app/`, download the actual Git LFS payload into the ignored `work/` directory:

```sh
mkdir -p work
curl -L --fail 'https://media.githubusercontent.com/media/hackjunction/Junction-2026-S-pankki/fbdecdedf1a1f49dd641c2e6b9f2b62d0dc0cc8f/tx_junction_transactions.csv' -o work/transactions.csv
python3 scripts/import-data.py
```

- Upstream revision: `fbdecdedf1a1f49dd641c2e6b9f2b62d0dc0cc8f`.
- Full payload SHA-256: `49b3265d8e44e751de305a074dcffcda732bb79aa1e07b46fcca774ce76f1e63`.
- 3,626,755 transaction rows; 5,100 customers; 1 October 2024–30 September 2026.
- Exactly one account per customer; zero sequential balance reconciliation errors across the full file.
- Main synthetic customer: `CUST04859`; account: `ACC004859`.
- `app/data/persona.json`: 719 source rows through the current 30 September 2026 cutoff; 698 belong to the original September backtest.
- September’s 21 rows are now in the runtime artifact; the explicit backtest excludes them from forecast inputs. There is no separate holdout file.

The importer preserves every original CSV field as a string, adding `id: row-N`, `sourceRow`,
`amountCents` and `balanceCents`. Source row numbers include the header: the first data row is 2.
No merchant names, savings balances, ASP history, household facts or extra accounts are invented.
The JSON is intended for server-only imports; do not serialize all transaction rows into page props.

### Git LFS verification repeated on 14 November 2026

The pinned upstream Git object contains `oid sha256:49b3265d8e44e751de305a074dcffcda732bb79aa1e07b46fcca774ce76f1e63` and `size 362796501`. The downloaded file was independently rehashed and its byte size checked: both match exactly. Its first line is the CSV header (`customer_id,bank_account_id,...`), not the `version https://git-lfs.github.com/spec/v1` pointer line. The existing importer also rejects a file without the expected CSV header before writing artifacts.

The original September backtest subset was rechecked: 698 rows, only CUST04859, latest date 31 August 2026. This verifies use of the actual source payload, while the runtime intentionally uses only one customer's history. Additional personas require separate extraction, audits and a server-scoped catalogue; they are not enabled by the current app.

## Supabase copy (updated 15 November 2026)

The bundled audited artifacts remain the default runtime source. PR #18 adds an explicit `KOTI_DATA_SOURCE=supabase` option through the same allowlisted resolver. The seed generator copies all eight personas (4,607 transactions), catalogue/application metadata, clocks, insights and overlays. See [provider, seeding and verification instructions](../supabase/README.md).

The hosted project originally held only the reference customer. The full seed must be loaded before enabling the remote provider; this integration does not mutate the hosted database. Remote rows must match the pinned revision, clock, account and audited artifact. Missing or changed rows fail closed. Development processing still starts from the pinned GitHub/LFS source.

## Demo clock (updated 14 November 2026)

The team moved the demo clock to **1 October 2026** with history through **30 September 2026**, the end of the dataset. `app/data/demo-clock.json` is the single source for the app, importer and agent. `persona.json` now holds 719 CUST04859 rows through 26 September 2026 (the last recorded row). The importer audits two clocks from the same rows:

| Measure | Current clock (history to 30 Sep) | Backtest clock (history to 31 Aug) |
|---|---:|---:|
| Closing balance | €7,417.39 | €6,059.33 |
| Median monthly salary (12 months) | €2,700.99 | €2,700.99 |
| Median monthly surplus before saving | €583.38 | €583.38 |
| Median monthly saving outflows | €246.33 | €246.33 |
| Mean monthly restaurants (last 3 months) | €77.30 (Jul–Sep) | €114.32 (Jun–Aug) |
| 20% restaurant reduction | €15.46 | €22.86 |
| Recognised taxi, last month | €0.00 (Sep) | €50.47 (Aug) |

The current figures were reproduced independently with DuckDB from the raw CSV. The backtest column is the original audit below and must keep reproducing exactly. `npm run evaluate:holdout` now runs the backtest: it forecasts from history through 31 August and compares with the recorded September balances (mean absolute daily balance error €742.79, no protected-floor breaches). There is no separate `work/holdout.json` any more.

The sections below describe the original 1 September audit, which is now the backtest.

## Demo personas

`app/data/personas/catalogue.json` allowlists eight personas by stable key (`reference` = CUST04859 is the default). The importer extracts each persona's rows through the current clock into `app/data/personas/<id>.json` (`reference` keeps `app/data/persona.json`), and writes `records.json` with:
- the recorded age and postcode;
- the Paavo area name from `data/overlays/postal_areas.csv`;
- the mortgage application record, where one exists.

Rows keep every original field, as described above. Mortgage events after the clock's last history day are dropped at import, and the backtest clock hides events after 31 August at runtime (`lib/personas/view.ts`).

The importer also needs the three small upstream files in `app/work/upstream/`:

```sh
mkdir -p work/upstream && for f in tx_customers_junction.csv mtg_negotiation_history.csv mtg_tx_customer_link_and_final_mtg_infio.csv; do
  curl -fL "https://raw.githubusercontent.com/hackjunction/Junction-2026-S-pankki/fbdecdedf1a1f49dd641c2e6b9f2b62d0dc0cc8f/$f" -o "work/upstream/$f"; done
```

Requests name a persona with an optional top-level `personaId`; unknown keys return 400 and never fall back. Mortgage data is shown as an **application record**. The required-income figure is a dataset calculation (a 6%, 25-year annuity payment divided by 0.35), not a lending rule or an approval prediction.

## Acceptance targets

All seven targets from the build brief reproduce exactly at cent precision.

| Measure | Calculation | Result |
|---|---|---:|
| Closing balance | Last history row, 31 August 2026 | €6,059.33 |
| Median monthly salary | Monthly `salary` totals, September 2025–August 2026 | €2,700.99 |
| Median monthly surplus before saving | Monthly net cash flow plus investment deposit outflows, same 12 months | €583.38 |
| Median monthly saving outflows | Monthly `investment_deposit` outflows, same 12 months | €246.33 |
| Mean monthly restaurant spending | €342.95 total in June–August divided by 3 | €114.32 |
| Modelled 20% restaurant reduction | €342.95 / 3 × 20%, rounded once | €22.86 |
| Recognised taxi spending | August rows with MCC 4121 | €50.47 |

The taxi evidence is source row `3471042`, 18 August 2026. Both August transport rows have an MCC;
five transportation rows across the full pre-September history lack an MCC. Unknown MCC does not
establish zero taxi spending in another period.

The median is taken after aggregating each complete calendar month, including zero category totals.
Savings outflows are investment deposits. Their destination and resulting asset balance are unknown;
they are not verified ASP deposits. These descriptive statistics are not safe-to-save advice.

## History-derived forecast inputs

The following inputs are conservative assumptions available without accessing September. They require
user confirmation and are not verified bill schedules. The JSON stores them in
`statistics.conservativeForecastInputs` with their stated basis.

| Input | Proposed amount | Timing assumption | Evidence basis |
|---|---:|---|---|
| Salary | €2,528.38 | 15th of month | Minimum June–August salary; all historical salaries fall on day 15 |
| Housing | €1,118.41 | 2nd of month | Maximum June–August housing; earliest recent payment date |
| Utilities | €171.47/month | Reserve at horizon start, or dated user-confirmed bills | Maximum June–August monthly total; irregular payment dates |
| Groceries | €421.15/month | Daily living-cost accrual | Maximum June–August monthly total |
| Transportation | €163.02/month | Daily living-cost accrual | Maximum June–August monthly total; conservatively protected pending correction |
| Health | €42.99/month | Daily living-cost accrual | Maximum June–August monthly total; June has zero recorded health rows |
| Existing saving outflow | €258.45 | 20th of month | Maximum June–August saving outflow; all historical deposits fall on day 20 |

Utilities must not be counted both as a horizon-start reserve and dated bills. Daily accrual must
preserve integer-cent monthly totals. An income delay must shift the forecast payment date; it must
not increase starting cash. Add a separately declared emergency/irregular-expense floor and any
user-confirmed obligations. The first October housing commitment falls inside a 35-day forecast
starting 1 September, so the projection must include it. Flex spending and optional saving share
one pool of capacity above the floor.

The original September prototype engine used the 12-month salary/saving medians, the highest June–August housing payment, and June–August average daily consumption. The current engine derives these windows from the shared clock. The conservative candidates above are preserved for later comparison; they are not all active inputs. See `app/lib/finance.ts` and the in-app calculation assumptions for the implemented model.

## Available fields and limits

Historical categories: Entertainment, Groceries, Health, Home & Tech, Housing, Invest Deposit,
Lifestyle, Restaurants, Salary, Transportation, Travel, Utilities.

Transaction types: `purchase`, `utilities_payment`, `housing_payment`, `salary`, `investment_deposit`.
This persona has no observed investment withdrawals or own-account transfers. Those edge cases
need separate labelled fixtures/tests; they cannot be claimed as observed behavior.

The artifact also contains 12 monthly aggregates, June–August category summaries with evidence IDs,
category/type counts and missing-MCC counts. It contains no other customer's rows, no September
rows, and no September-derived forecast inputs.

## Time zone of the source timestamps

`tx_timestamp` has the format `DDMONYY:HH:MM:SS` (for example `03OCT24:09:04:04`). It has no time zone.
Koti assumes **Europe/Helsinki local time** (EET in winter, EEST in summer). This is an assumption, not a
fact from the dataset. The dataset documentation does not state a time zone. `tx_date` is the booking date.
No parsing code changes because of this note.

## Public-data overlays

Added 14 November 2026. The overlays are separate files under `app/data/overlays/`. They never change a
source row, the importer output or the audited figures above. Regenerate them from `app/` with
`python3 scripts/build-overlays.py all`. The script uses the Python standard library only. It caches raw
API responses under the ignored `app/work/overlay-cache/`, so `--offline` gives the same files again.
See [the overlay README](../app/data/overlays/README.md) for columns, licences and attribution.

| File | Key | Source | Licence |
|---|---|---|---|
| `merchants.csv` | `merchant_id` (515) | OpenStreetMap (Overpass API), Wikidata for airlines, MCC descriptions from `greggles/mcc-codes` | ODbL 1.0 for the file; Wikidata rows CC0; MCC list Unlicense |
| `merchant_ids.csv` | `merchant_id` (515) | The pinned transactions CSV: ID, MCC and category only | Same terms as the dataset |
| `postal_areas.csv` | `customer_postal_code` (290) | Statistics Finland Paavo 2026, table 12f7, data year 2024 | CC BY 4.0 |
| `mortgage_market_rates.csv` | month, series (January–August 2026) | Bank of Finland open data, Timeseries API v4, dataset `MFI_PUBL` | Free reuse with acknowledgement of the source |

Limits:

- **Merchant names are labels only.** Each merchant ID is shared by 90 to 5,074 customers, has no location,
  and its amounts and times follow the category. A real name on an ID does not make a synthetic row a
  purchase at that business. Every row carries this label. The names are not wired into the app yet.
- **95 of the 290 customer postal codes are not Paavo postal areas** (for example `00006`, `00642`). They
  are kept with status `not_in_paavo` and no values. Paavo hides values for small areas; these are blank
  and listed in `confidential_fields`.
- **Market rates are national monthly averages.** They are not the rate of any loan in the dataset.
  The Euribor is not included: the Bank of Finland publishes it under EMMI terms that restrict
  redistribution. The margin series in the API differs from the margin in Bank of Finland press releases,
  which comes from the Positive Credit Register.
