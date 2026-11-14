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
- `app/data/persona.json`: 698 source rows before the 1 September 2026 demo clock.
- `app/work/holdout.json`: 21 September rows, reserved for evaluation and excluded from the runtime artifact.

The importer preserves every original CSV field as a string, adding `id: row-N`, `sourceRow`,
`amountCents` and `balanceCents`. Source row numbers include the header: the first data row is 2.
No merchant names, savings balances, ASP history, household facts or extra accounts are invented.
The JSON is intended for server-only imports; do not serialize all transaction rows into page props.

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

The current prototype engine uses the 12-month salary/saving medians, the highest June–August housing payment, and June–August average daily consumption. The conservative candidates above are preserved for later comparison; they are not all active inputs. See `app/lib/finance.ts` and the in-app calculation assumptions for the implemented model.

## Available fields and limits

Historical categories: Entertainment, Groceries, Health, Home & Tech, Housing, Invest Deposit,
Lifestyle, Restaurants, Salary, Transportation, Travel, Utilities.

Transaction types: `purchase`, `utilities_payment`, `housing_payment`, `salary`, `investment_deposit`.
This persona has no observed investment withdrawals or own-account transfers. Those edge cases
need separate labelled fixtures/tests; they cannot be claimed as observed behavior.

The artifact also contains 12 monthly aggregates, June–August category summaries with evidence IDs,
category/type counts and missing-MCC counts. It contains no other customer's rows, no September
rows, and no September-derived forecast inputs.
