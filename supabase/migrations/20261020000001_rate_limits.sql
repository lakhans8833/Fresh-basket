-- Shared rate-limit counters. On Vercel every server instance has its own memory, so an in-memory
-- limit can be bypassed by requests that land on different instances. Keys are stored hashed
-- (they can contain a phone number or IP). Only the server's database connection uses this table:
-- RLS is on with no policies, so the public API (anon / signed-in users) can't read or write it.
create table if not exists public.rate_limits (
  key_hash text primary key,
  hits integer not null,
  reset_at timestamptz not null
);
alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;
create index if not exists rate_limits_reset_at_idx on public.rate_limits (reset_at);
