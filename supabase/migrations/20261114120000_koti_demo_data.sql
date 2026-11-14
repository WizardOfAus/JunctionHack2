-- Koti demo data: the committed app/data files, as Postgres tables.
-- The JSON and CSV files in app/data stay the source of truth.
-- supabase/scripts/build-seed.mjs makes supabase/seed.sql from them.
--
-- Row level security is on and there are no policies, so the anon and
-- authenticated keys cannot read these tables. Read them on the server only
-- (secret / service role key), so customer scope stays server-controlled.

create table if not exists public.demo_clocks (
  name text primary key check (name in ('current', 'backtest')),
  demo_date date not null,
  history_through date not null,
  data_start date not null,
  check (history_through < demo_date),
  check (data_start <= history_through)
);
comment on table public.demo_clocks is 'From app/data/demo-clock.json. current drives the app; backtest replays 1 September 2026.';

create table if not exists public.personas (
  customer_id text primary key check (customer_id ~ '^CUST[0-9]{5}$'),
  account_id text not null,
  as_of date not null,
  source_revision text not null,
  provenance jsonb not null,
  statistics jsonb not null,
  synthetic boolean not null default true
);
comment on table public.personas is 'From app/data/persona.json (without the transactions array). Synthetic Junction 2026 S-Pankki data.';

create table if not exists public.transactions (
  id text primary key,
  source_row integer not null unique,
  customer_id text not null references public.personas (customer_id) on delete cascade,
  bank_account_id text not null,
  tx_date date not null,
  tx_timestamp text not null,
  category text not null,
  tx_amount_eur text not null,
  balance_after_eur text not null,
  transaction_type text not null,
  merchant_id text,
  mcc_code text,
  amount_cents bigint not null,
  balance_cents bigint not null
);
comment on table public.transactions is 'Original source rows from app/data/persona.json. Text columns keep the source values; *_cents are integer euro cents.';
comment on column public.transactions.source_row is 'Line number in the pinned upstream CSV.';
create index if not exists transactions_customer_date_idx on public.transactions (customer_id, tx_date, source_row);

create table if not exists public.csv_datasets (
  name text primary key,
  folder text not null check (folder in ('insights', 'overlays')),
  source_file text not null unique,
  columns text[] not null
);
comment on table public.csv_datasets is 'One row per CSV in app/data/insights (see docs/data-insights.md) and app/data/overlays (see app/data/overlays/README.md).';

create table if not exists public.csv_rows (
  dataset text not null references public.csv_datasets (name) on delete cascade,
  row_index integer not null,
  data jsonb not null,
  primary key (dataset, row_index)
);
comment on table public.csv_rows is 'CSV rows as JSON objects. Numeric cells are JSON numbers, except *_code, *_id and leading-zero values, which stay text. Blank cells are null. Blank headers are named (metric, quantile). Overlay rows keep their label and licence columns.';
create index if not exists csv_rows_data_idx on public.csv_rows using gin (data jsonb_path_ops);

alter table public.demo_clocks enable row level security;
alter table public.personas enable row level security;
alter table public.transactions enable row level security;
alter table public.csv_datasets enable row level security;
alter table public.csv_rows enable row level security;
