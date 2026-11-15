-- Things a person asked Pesä (the Koti coach) to remember, keyed by browser ownership and the demo persona.
-- Only the app server writes here, with SUPABASE_SECRET_KEY. Row level security is on and
-- there are no policies for anon or authenticated, so the publishable key cannot read or write.
create table if not exists public.pesa_memories (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  persona_id text not null check (persona_id ~ '^[a-z-]{1,40}$'),
  text text not null check (char_length(text) between 1 and 200),
  created_at timestamptz not null default now()
);
-- Existing unscoped demo rows, if any, remain inaccessible to scoped queries.
alter table public.pesa_memories add column if not exists owner_id uuid;
create index if not exists pesa_memories_owner_persona on public.pesa_memories (owner_id, persona_id, created_at);
alter table public.pesa_memories enable row level security;
revoke all on public.pesa_memories from anon, authenticated;
