# Supabase demo data

The demo data is accessible in the Supabase project at <https://ighxaiiqgtpsgioqwamp.supabase.co> (project ref `ighxaiiqgtpsgioqwamp`). It is a copy of the committed demo data in `app/data`. The app still reads the files in `app/data`; it does not read Supabase yet.

## Which source to use

- **To look at or query the demo data:** use the Supabase project.
- **To process the data for development:** do not use the Supabase copy. Use the source dataset on GitHub, [hackjunction/Junction-2026-S-pankki](https://github.com/hackjunction/Junction-2026-S-pankki), at the pinned revision `fbdecdedf1a1f49dd641c2e6b9f2b62d0dc0cc8f`. Follow [the data audit](../docs/data-audit.md) to download the real Git LFS payload, check it and run the importers. The importers write `app/data`. Then make the seed again (see below) so that Supabase agrees with `app/data`.

Supabase holds one audited customer and the aggregate insight tables. It does not hold the full source, so new personas, audits, EDA and importer changes must start from the GitHub source.

| Table | Source | Rows |
| --- | --- | --- |
| `demo_clocks` | `app/data/demo-clock.json` | 2 (`current`, `backtest`) |
| `personas` | `app/data/persona.json` (provenance and statistics) | 1 (`CUST04859`) |
| `transactions` | `app/data/persona.json` transactions | 719 |
| `insight_datasets`, `insight_rows` | `app/data/insights/*.csv` | 8 datasets, 111 rows |

Transactions keep the original source text (`tx_amount_eur`, `tx_timestamp`, …) and the integer cent values (`amount_cents`, `balance_cents`). Insight rows are JSON objects. Numeric cells are JSON numbers. Blank CSV headers are named `metric` (first column) or `quantile` (`benchmarks_by_age`).

Row level security is on for all tables, with no policies. The publishable/anon key cannot read them. Use the secret (service role) key on the server only, so customer scope stays server-controlled. Do not commit keys.

The full 3.6 million-row source dataset (`agent/data/koti.db`) is not in Supabase. It is larger than the free plan's 500 MB database limit.

## Update the data

From the repository root, with the Supabase CLI logged in and linked to the project:

```sh
node supabase/scripts/build-seed.mjs        # writes supabase/seed.sql (ignored by Git)
supabase db query --linked -f supabase/migrations/20261114120000_koti_demo_data.sql
supabase db query --linked -f supabase/seed.sql
```

The migration uses `create table if not exists`. The seed deletes and inserts all demo rows in one transaction, so you can run it again after `app/data` changes.
