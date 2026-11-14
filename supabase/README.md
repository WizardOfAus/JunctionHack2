# Supabase demo data

The demo data is accessible in the Supabase project at <https://ighxaiiqgtpsgioqwamp.supabase.co> (project ref `ighxaiiqgtpsgioqwamp`). It is a copy of the committed demo data in `app/data`. The app server reads the demo persona and its transactions from Supabase (see [App runtime](#app-runtime)).

## App runtime

`app/lib/server-data.ts` loads persona `CUST04859` and its transactions from the `personas` and `transactions` tables through the Supabase REST API, with the publishable key. The finance page, `/api/finance`, `/api/transactions` and `/api/coach` all use it. The server sets the customer; the browser never chooses it. The browser receives calculated results and scoped rows from the API only, as before. The build no longer includes `persona.json`.

Set these server variables. For local development, put them in `app/.dev.vars` (Git ignores it):

```sh
SUPABASE_URL=https://ighxaiiqgtpsgioqwamp.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...   # Supabase dashboard > Project Settings > API Keys > Publishable key
```

A hosted preview needs the same two values as server variables. The server uses `SUPABASE_SECRET_KEY` instead if you set it; never put a secret key in browser code or commit it. The app does not send either key to the browser: only the server calls Supabase.

- The server loads the data once per server process. Restart the dev server after you load a new seed.
- If the variables are missing or Supabase does not respond, the API routes return HTTP 503 and the page shows "The demo data is not available". The server log tells you the cause.
- The demo clock (`app/data/demo-clock.json`) is configuration, not customer data. The app and the agent still read it from the file. The `demo_clocks` table is a copy.
- Unit tests and `app/scripts/evaluate-holdout.mjs` still read `app/data/persona.json`, so `npm test` needs no network. `app/tests/supabase-data.test.mjs` also compares the live Supabase data with `persona.json` when the two variables are set:

  ```sh
  cd app && (set -a; . ./.dev.vars; set +a; node --test tests/supabase-data.test.mjs)
  ```

## Which source to use

- **To look at or query the demo data, and for the app runtime:** use the Supabase project.
- **To process the data for development:** do not use the Supabase copy. Use the source dataset on GitHub, [hackjunction/Junction-2026-S-pankki](https://github.com/hackjunction/Junction-2026-S-pankki), at the pinned revision `fbdecdedf1a1f49dd641c2e6b9f2b62d0dc0cc8f`. Follow [the data audit](../docs/data-audit.md) to download the real Git LFS payload, check it and run the importers. The importers and `app/scripts/build-overlays.py` write `app/data`. Then make the seed again (see below) so that Supabase agrees with `app/data`.

Supabase holds one audited customer, the aggregate insight tables and the public-data overlays. It does not hold the full source, so new personas, audits, EDA and importer changes must start from the GitHub source.

| Table | Source | Rows |
| --- | --- | --- |
| `demo_clocks` | `app/data/demo-clock.json` | 2 (`current`, `backtest`) |
| `personas` | `app/data/persona.json` (provenance and statistics) | 1 (`CUST04859`) |
| `transactions` | `app/data/persona.json` transactions | 719 |
| `csv_datasets`, `csv_rows` | `app/data/insights/*.csv` | 8 datasets, 111 rows |
| `csv_datasets`, `csv_rows` | `app/data/overlays/*.csv` | 4 datasets, 1,336 rows |

Transactions keep the original source text (`tx_amount_eur`, `tx_timestamp`, …) and the integer cent values (`amount_cents`, `balance_cents`). CSV rows are JSON objects in `csv_rows.data`; `csv_datasets.folder` is `insights` or `overlays`. Numeric cells are JSON numbers. Columns named `*_code` or `*_id`, and values with a leading zero (postal codes such as `00100`), stay text. Blank cells are `null`. Blank CSV headers are named `metric` (first column) or `quantile` (`benchmarks_by_age`).

The overlay rows are public data assigned to synthetic IDs. They keep their `label`, `licence` and source columns. Follow [the overlay README](../app/data/overlays/README.md) for the licence terms (`merchants.csv` is ODbL 1.0) and show the `label` text with any name or value from them.

Row level security is on for all tables. `20261114180000_koti_demo_data_public_read.sql` adds one read-only policy per table for the `anon` and `authenticated` roles, so the publishable key can read the demo data. The key cannot insert, update or delete: those privileges are revoked and there are no write policies. This is acceptable because the data is synthetic and its source is public on GitHub. Anyone with the publishable key can read these tables, so do not add real or private data to them. The app still calls Supabase from the server only and chooses the customer there.

The full 3.6 million-row source dataset (`agent/data/koti.db`) is not in Supabase. It is larger than the free plan's 500 MB database limit.

## Update the data

From the repository root, with the Supabase CLI logged in and linked to the project:

```sh
node supabase/scripts/build-seed.mjs        # writes supabase/seed.sql (ignored by Git)
supabase db query --linked -f supabase/migrations/20261114120000_koti_demo_data.sql
supabase db query --linked -f supabase/migrations/20261114180000_koti_demo_data_public_read.sql
supabase db query --linked -f supabase/seed.sql
```

The migration uses `create table if not exists`. The seed deletes and inserts all demo rows in one transaction, so you can run it again after `app/data` changes.
