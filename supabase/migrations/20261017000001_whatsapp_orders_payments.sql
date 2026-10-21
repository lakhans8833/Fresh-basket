-- WhatsApp orders saved in the database, UPI (manual verification) and Razorpay Payment Links,
-- and WhatsApp order-update notifications with a send log.
--
-- REVIEW BEFORE PRODUCTION: this changes the orders table (nullable user_id for guest WhatsApp
-- orders, two new payment methods). Existing rows are not modified. Vercel preview builds don't
-- run migrations; this runs only when the change is merged and deployed to production.

-- Orders placed on WhatsApp without an account have no user (tracked by a secret link instead).
alter table public.orders alter column user_id drop not null;
-- Retries of a guest order with the same idempotency key return the same order.
create unique index if not exists orders_guest_idempotency_idx on public.orders (idempotency_key) where user_id is null;

-- Where the order came from: the website checkout or the "Order on WhatsApp" flow.
alter table public.orders add column if not exists channel text not null default 'web';
alter table public.orders drop constraint if exists orders_channel_check;
alter table public.orders add constraint orders_channel_check check (channel in ('web', 'whatsapp'));

-- Payment methods: cash on delivery, Razorpay Checkout, test payments, UPI to the store's UPI ID
-- (verified by staff against the bank statement) and Razorpay Payment Links (verified by webhook).
alter table public.orders drop constraint if exists orders_payment_method_check;
alter table public.orders add constraint orders_payment_method_check
  check (payment_method in ('cod', 'razorpay', 'mock', 'upi', 'razorpay_link'));

-- UPI: the reference (UTR) the customer says they paid with. It is NOT proof of payment —
-- the order stays "payment pending" until staff confirm the money arrived.
alter table public.orders add column if not exists upi_reference text check (upi_reference is null or upi_reference ~ '^[A-Za-z0-9]{6,35}$');
alter table public.orders add column if not exists upi_reference_at timestamptz;

-- Razorpay Payment Link created by the server for this order's exact total.
alter table public.orders add column if not exists razorpay_payment_link_id text unique;
alter table public.orders add column if not exists razorpay_payment_link_url text;

-- Customer agreed to receive order updates on WhatsApp (unticked by default).
alter table public.orders add column if not exists whatsapp_updates boolean not null default false;

-- Manual UPI confirmations are recorded as payments too (one per UTR).
alter table public.payments drop constraint if exists payments_provider_check;
alter table public.payments add constraint payments_provider_check check (provider in ('razorpay', 'mock', 'upi_manual'));

-- Store UPI details (shown to customers at checkout; not secret).
alter table public.store_settings add column if not exists upi_id text check (upi_id is null or upi_id ~ '^[A-Za-z0-9._-]{2,200}@[A-Za-z][A-Za-z0-9.-]{1,63}$');
alter table public.store_settings add column if not exists upi_payee_name text check (upi_payee_name is null or char_length(upi_payee_name) <= 60);
alter table public.store_settings add column if not exists upi_qr_url text check (upi_qr_url is null or char_length(upi_qr_url) <= 500);

-- One row per (order, channel, event): the unique key stops duplicate notifications when a status
-- is saved twice or a webhook is retried. Failed sends can be retried a few times.
create table if not exists public.order_notifications (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders (id) on delete cascade,
  channel text not null default 'whatsapp' check (channel in ('whatsapp')),
  event text not null check (event in ('confirmed', 'packed', 'out_for_delivery', 'delivered')),
  status text not null check (status in ('sending', 'sent', 'failed', 'skipped')),
  recipient text,
  provider_message_id text,
  error text,
  attempts integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, channel, event)
);
create index if not exists order_notifications_order_idx on public.order_notifications (order_id);
-- Server only: no client policies.
alter table public.order_notifications enable row level security;
