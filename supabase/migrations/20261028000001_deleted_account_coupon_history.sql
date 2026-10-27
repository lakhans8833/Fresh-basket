-- Deleting an account and signing up again with the same email must not make "first order only"
-- coupons, or coupons limited per customer, usable again. When an account is deleted we keep only a
-- keyed hash of its normalised email (HMAC made by the server — no email address is stored), whether
-- it had ordered, and how many times it used each coupon. Server-only table: RLS on, no client grants.
create table if not exists public.deleted_account_identities (
  identity text primary key check (char_length(identity) = 64),
  had_orders boolean not null default false,
  coupon_uses jsonb not null default '{}'::jsonb,
  deleted_at timestamptz not null default now()
);
alter table public.deleted_account_identities enable row level security;
revoke all on public.deleted_account_identities from anon, authenticated;
