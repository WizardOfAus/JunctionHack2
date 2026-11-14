# Supabase demo data

Supabase is an optional runtime copy of the pinned synthetic artifacts in `app/data`. The canonical local review stays usable without credentials or network access.

## Choose a data source

`KOTI_DATA_SOURCE=bundled` is the default. Merely setting Supabase credentials does not switch providers. To opt in, configure ignored server-only `app/.dev.vars`:

```sh
KOTI_DATA_SOURCE=supabase
SUPABASE_URL=https://ighxaiiqgtpsgioqwamp.supabase.co
SUPABASE_PUBLISHABLE_KEY=<publishable key>
# SUPABASE_SECRET_KEY may be used instead, only on the server.
```

Restart the server after changing providers or reseeding. Never commit credentials or put secret keys in browser code. No hosted preview is published by this integration.

The workspace and all finance, transaction and coach requests use `lib/server-data.ts` through the same allowlisted persona resolver. Browser requests still send catalogue keys, never raw customer identifiers. Unknown keys fail with 400 before any network request. In Supabase mode, missing configuration, unavailable data, an unseeded persona, wrong customer/account, stale clock/revision, missing or changed rows produce 503. There is no silent fallback to another customer or the bundled provider. Failed loads can retry; successful loads cache separately per persona for the process lifetime.

The remote copy is checked against the committed audited artifact before use. Both providers produce identical source rows and finance inputs. Bundled transactions remain in the server build to support the default mode and parity checks; no raw persona transaction artifact is imported into client code. Catalogue/application metadata and the demo clock remain versioned server artifacts. The SQL seed also stores the metadata in `personas.provenance` for inspection.

## Seed coverage

The generator now includes all eight catalogue personas and 4,607 transactions. It copies original values, integer cents, source rows, the catalogue and application records, plus the existing insights/overlays. It validates customer/account ownership, row counts and history cutoff before writing SQL.

| Table | Generated contents |
| --- | --- |
| `demo_clocks` | Current and backtest clocks |
| `personas` | Eight allowlisted customers; catalogue/application metadata in provenance |
| `transactions` | 4,607 audited source rows |
| `csv_datasets`, `csv_rows` | Existing aggregate insights and public overlays |

The original PR reported that the hosted project contained only the reference customer's 719 transactions. **This integration generates the complete seed but does not apply it to the hosted database. Load and verify the eight-persona seed before enabling Supabase for team review.** The full 3.6-million-row upstream source is not part of this runtime copy.

## Generate and inspect

From the repository root:

```sh
node supabase/scripts/build-seed.mjs
```

This writes ignored `supabase/seed.sql` and reports counts. Generation does not contact Supabase. The seed replaces the named demo tables inside one transaction; inspect its destination and contents before applying it through your established database workflow. The migration files are idempotent SQL; the original project was provisioned using direct SQL, so do not assume Supabase migration-history records are populated.

RLS is enabled. The public-read migration permits `anon` and `authenticated` SELECT on these synthetic demo tables and revokes mutation privileges. Anyone with the publishable key can read this public synthetic data; never add private customer data to these tables. This change does not apply migrations or expand hosted permissions.

## Verify

`npm test` in `app/` checks provider selection, all-eight-persona transport and finance parity, cache isolation, retry/failure behavior, stale/mixed data rejection and seed coverage. These tests need no network. A separate live reference-parity test runs only when Supabase environment variables are supplied; absence is reported as a skip.

After reseeding and configuring an isolated Supabase preview, run:

```sh
cd app
npm run test:api -- http://127.0.0.1:<preview-port>
```

That API suite checks all eight personas, scoped evidence, unknown IDs, shared coach context and readiness outputs. Keep `KOTI_DATA_SOURCE=bundled` on the canonical5174 review until the remote eight-persona check passes.

## Source and licences

Development processing uses the pinned [Junction source](https://github.com/hackjunction/Junction-2026-S-pankki/tree/fbdecdedf1a1f49dd641c2e6b9f2b62d0dc0cc8f), not the Supabase copy. See [data audit](../docs/data-audit.md) for LFS/import steps. Rebuild and reseed after changing audited artifacts.

CSV codes/IDs and leading-zero postal codes stay text. Numeric cells become numbers; blanks become null. Overlay labels, sources and licences are preserved; see [overlay provenance](../app/data/overlays/README.md), including ODbL attribution for merchants.
