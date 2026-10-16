-- Razorpay payment preparation is coordinated with a short-lived claim on the order row instead of a
-- lock held for the whole gateway call (which kept a database connection busy for up to 15 s per order).
-- One request claims, calls Razorpay without holding a connection, then saves the gateway order id;
-- others wait and reuse it. A claim older than 30 s (longer than the 15 s gateway timeout) is from a
-- request that died and can be taken over. Server-only columns: no client grants.
alter table public.orders add column if not exists payment_prep_token uuid;
alter table public.orders add column if not exists payment_prep_at timestamptz;
